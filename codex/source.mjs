// Read owner inputs only. This module never writes a source or a live target.
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { digest } from './transaction.mjs';
import { render, mergeHooks, patchConfig } from './mirror.mjs';
import { portCleaner } from './cleaner-port.mjs';
import { plainPath } from './review-path.mjs';

export function workflowSkills(rules) {
  const section = rules.split('## Workflow')[1]?.split('\n## ')[0] ?? '';
  return [...new Set([...section.matchAll(/`([^`]+)`:\s*(?:used|offered)/g)].map(m => m[1]))];
}
export function snapshot(home, codeRoot, nodePath) {
  const source = join(home, '.claude'), pins = {}, resources = [], captured = new Map(), warnings = [];
  function read(file) {
    const full = plainPath(file);
    if (lstatSync(full).isSymbolicLink()) throw Error('source link requires review');
    const bytes = readFileSync(full); pins[full] = digest(bytes); captured.set(full, bytes); return bytes;
  }
  const json = p => JSON.parse(read(p));
  const record = json(join(source, '.pact-install.json'));
  if (!/^[a-f0-9]{40}$/.test(record.commit)) throw Error('source install record invalid');
  for (const f of record.files) {
    if (!/^(CLAUDE\.md|agents\/|commands\/|pact\/(builder\/|hooks\/|review\.md|tools\/))/.test(f.path) || f.path.includes('\\') || f.path.split('/').some(x => x === '..')) throw Error('source record path refused');
    const bytes = read(join(source, f.path));
    if (digest(bytes) !== f.sha256) throw Error('installed source drift; owner review required');
    if (f.path.startsWith('pact/builder/')) resources.push({ path: '.codex/' + f.path, bytes });
  }
  const settings = json(join(source, 'settings.json'));
  for (const groups of Object.values(settings.hooks ?? {})) for (const group of groups) for (const handler of group.hooks ?? []) {
    const invocation = [handler.command, ...(handler.args ?? [])].join(' ');
    if (!/compact-handoff\.mjs|orca-agent-hook\.exe|[\\/]\.orca[\\/]agent-hooks[\\/]/.test(invocation)) throw Error('custom Claude hook requires an explicit target mapping');
  }
  const config = json(join(source, 'pact/config.json'));
  if (JSON.stringify([...(config.tools ?? [])].sort()) !== JSON.stringify(['cleaner', 'poster'])) throw Error('this scoped mirror requires the reviewed poster and cleaner configuration');
  const raw = ['git worktree remove *', 'git * worktree remove *', 'git branch -d *', 'git * branch -d *', 'git branch -D *', 'git * branch -D *', 'git branch --delete *', 'git * branch --delete *', 'claude rm *'];
  const denies = ['Bash', 'PowerShell'].flatMap(shell => raw.map(p => `${shell}(${p})`));
  const asks = ['Bash', 'PowerShell'].map(shell => `${shell}(*cleaner.mjs*remove*--override*)`);
  if (JSON.stringify([...(settings.permissions?.deny ?? [])].sort()) !== JSON.stringify(denies.sort()) || JSON.stringify([...(settings.permissions?.ask ?? [])].sort()) !== JSON.stringify(asks.sort())) throw Error('permission inventory changed; mapping requires review');
  resources.push({ path: '.codex/pact/config.json', bytes: captured.get(resolve(join(source, 'pact/config.json'))) });
  function tree(root, target) {
    for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['.git', 'node_modules'].includes(entry.name)) throw Error('unexpected development directory in skill resources');
      if (entry.isSymbolicLink()) throw Error('source resource link requires review');
      const p = join(root, entry.name), dest = `${target}/${entry.name}`;
      if (entry.isDirectory()) tree(p, dest); else resources.push({ path: dest, bytes: read(p) });
    }
  }
  tree(join(source, 'pact/blocks'), '.codex/pact/blocks');
  const builder = join(source, 'pact/builder.json');
  if (existsSync(builder)) resources.push({ path: '.codex/pact/builder.json', bytes: read(builder) });
  const plugin = json(join(source, 'plugins/installed_plugins.json')).plugins['grimoire@mephistopheles4']?.[0];
  if (!plugin?.installPath) throw Error('installed eagle-eye plugin not found');
  const rules = read(join(source, 'CLAUDE.md')).toString(), review = read(join(source, 'pact/review.md')).toString();
  const direct = workflowSkills(rules), queue = [...direct], seen = new Set();
  if (!direct.length) throw Error('no workflow skills found in installed rules');
  let sharedChecked = false;
  for (let index = 0; index < queue.length; index++) {
    const selected = queue[index], name = selected.replace(/^grimoire:/, '');
    if (!/^[a-z0-9-]+$/.test(name)) throw Error('unsupported workflow skill namespace');
    if (seen.has(name)) continue; seen.add(name);
    const installed = selected === 'grimoire:eagle-eye' ? join(plugin.installPath, 'skills/eagle-eye') : join(source, 'skills', name);
    // Skill roots may be deliberate local links shared by Claude and Codex. Pin their
    // resolved roots, then refuse links inside the captured resource tree.
    const root = realpathSync(installed);
    if (/^[\\/]{2}/.test(root)) throw Error('network skill root refused');
    pins['skill-root:' + name] = digest(root);
    tree(root, '.agents/skills/' + name);
    const skillText = read(join(root, 'SKILL.md')).toString();
    for (const match of skillText.matchAll(/skills\/([a-z0-9-]+)\/SKILL\.md/g)) queue.push(match[1]);
    const frontmatter = skillText.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    for (const match of frontmatter.matchAll(/^\s*skill:\s*["']?([a-z0-9-]+)/gm)) queue.push(match[1]);
    if (!sharedChecked && skillText.includes('../../references/definition-of-done.md')) {
      sharedChecked = true;
      const shared = resolve(root, '../../references/definition-of-done.md');
      if (existsSync(shared)) resources.push({ path: '.agents/references/definition-of-done.md', bytes: read(shared) });
      else warnings.push('The source skills already reference a missing shared Definition of Done file; this mirror preserves the source and reports the missing reference.');
    }
  }
  const front = file => {
    const text = read(file).toString(), m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!m) throw Error('source frontmatter changed');
    const get = key => m[1].match(new RegExp('^' + key + ': (.*)$', 'm'))?.[1]?.trim();
    return { name: get('name') ?? basename(file, '.md'), description: get('description'), tools: get('tools'), effort: get('effort'), body: m[2] };
  };
  const agents = readdirSync(join(source, 'agents')).filter(n => n.endsWith('.md')).sort().map(n => front(join(source, 'agents', n)));
  if (agents.length !== 9 || agents.some(a => !['low', 'medium', 'high'].includes(a.effort))) throw Error('source lens roster changed');
  const commands = ['finis', 'make-it-so', 'scry', 'scriptorium'].map(n => front(join(source, 'commands', n + '.md')));
  const native = file => read(join(codeRoot, 'codex', file));
  resources.push({ path: '.codex/pact/tools/poster.mjs', bytes: read(join(source, 'pact/tools/poster.mjs')) });
  resources.push({ path: '.codex/pact/tools/cleaner.mjs', text: portCleaner(read(join(source, 'pact/tools/cleaner.mjs')).toString()) });
  resources.push({ path: '.codex/pact/tools/cleaner-sessions.mjs', bytes: native('cleaner-sessions.mjs') });
  resources.push({ path: '.codex/pact/hooks/codex-handoff.mjs', bytes: native('hooks.mjs') });
  const athanorAdapter = native('athanor-hook.mjs').toString();
  const guardImport = "from '../.claude/hooks/athanor-guard.mjs'";
  if (athanorAdapter.split(guardImport).length !== 2) throw Error('Athanor adapter import changed; review required');
  resources.push({ path: '.codex/pact/hooks/athanor-hook.mjs', text: athanorAdapter.replace(guardImport, "from './athanor-guard.source.mjs'") });
  resources.push({ path: '.codex/pact/hooks/athanor-guard.source.mjs', bytes: read(join(codeRoot, '.claude/hooks/athanor-guard.mjs')) });
  const codexHooks = join(home, '.codex/hooks.json');
  const existingHooks = existsSync(codexHooks) ? JSON.parse(readFileSync(plainPath(codexHooks))) : { hooks: {} };
  const hookFile = join(home, '.codex/pact/hooks/codex-handoff.mjs').replaceAll('\\', '/');
  const handler = { type: 'command', command: `"${nodePath.replaceAll('\\', '/')}" "${hookFile}" ${settings.autoCompactWindow ?? 400000}`, timeout: 10 };
  const merged = mergeHooks(existingHooks, handler);
  const athanorHook = join(home, '.codex/pact/hooks/athanor-hook.mjs').replaceAll('\\', '/');
  const athanorHandler = { type: 'command', command: `"${nodePath.replaceAll('\\', '/')}" "${athanorHook}"`, timeout: 15 };
  if (!merged.hooks.PreToolUse.some(g => g.hooks?.some(h => h.command === athanorHandler.command))) merged.hooks.PreToolUse.push({ matcher: 'Bash|PowerShell|exec_command', hooks: [athanorHandler] });
  resources.push({ path: '.codex/hooks.json', text: JSON.stringify(merged, null, 2) + '\n' });
  const configPath = join(home, '.codex/config.toml');
  const originalConfig = existsSync(configPath) ? readFileSync(plainPath(configPath), 'utf8') : '';
  resources.push({ path: '.codex/config.toml', text: patchConfig(originalConfig, { model: 'gpt-6.1-sol', model_auto_compact_token_limit: settings.autoCompactWindow ?? 400000 }) });
  const guidancePath = join(home, '.codex/AGENTS.md');
  let guidance = existsSync(guidancePath) ? readFileSync(plainPath(guidancePath), 'utf8') : '';
  if (!guidance.includes('/workflows/scriptorium/workflow.md')) guidance += '\nBefore engineering work, read and follow ~/.codex/workflows/scriptorium/workflow.md.\n';
  resources.push({ path: '.codex/AGENTS.md', text: guidance });
  const files = render({ rules, review, agents, commands, resources }, { home, sourceCommit: record.commit });
  // Accident check only. Raw settings and credentials are never an output file.
  const secrets = Object.entries(settings.env ?? {}).filter(([k, v]) => /secret|token|key|password/i.test(k) && typeof v === 'string' && v.length > 8).map(([, v]) => v);
  if (files.some(f => secrets.some(s => (f.bytes ?? Buffer.from(f.text)).includes(Buffer.from(s))))) throw Error('secret-bearing output refused');
  return { files, pins, sourceCommit: record.commit, skillCount: direct.length, supportingSkills: seen.size - direct.length, warnings };
}
