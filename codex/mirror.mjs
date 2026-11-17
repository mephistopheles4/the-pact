// Target rendering only. Owner inputs are supplied by source.mjs, never committed.
export const HOOK_EVENTS = ['PreToolUse', 'PostModelRequest', 'PostToolUse', 'UserPromptSubmit', 'Stop', 'PreCompact', 'SessionStart'];
export function mergeHooks(original, handler, { events = HOOK_EVENTS, matchers = { PreToolUse: 'Bash', SessionStart: '^compact$' } } = {}) {
  const result = structuredClone(original);
  result.hooks ??= {};
  // A stable native marker identifies our registration across Node/window
  // changes without treating someone else's wrapper as adapter-owned.
  const owns = h => handler.statusMessage ? h.statusMessage === handler.statusMessage : h.command === handler.command;
  for (const event of events) {
    const groups = (result.hooks[event] ?? []).flatMap(group => {
      if (!group.hooks?.some(owns)) return [group];
      const hooks = group.hooks.filter(h => !owns(h));
      return hooks.length ? [{ ...group, hooks }] : [];
    });
    groups.push({ ...(matchers[event] ? { matcher: matchers[event] } : {}), hooks: [handler] });
    result.hooks[event] = groups;
  }
  return result;
}
export function patchConfig(text, values) {
  const lines = text.split(/\r?\n/), seen = new Set();
  let table = false;
  const output = lines.map(line => {
    if (/^\s*\[/.test(line)) table = true;
    if (!table && /"""|'''/.test(line)) throw Error('ambiguous top-level multiline config');
    if (table) return line;
    const quoted = line.match(/^\s*(["'])(model|model_auto_compact_token_limit)\1\s*=/);
    if (quoted) throw Error('ambiguous quoted target config key');
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!m || !Object.hasOwn(values, m[1])) return line;
    if (seen.has(m[1])) throw Error('ambiguous duplicate config key');
    seen.add(m[1]); return `${m[1]} = ${JSON.stringify(values[m[1]])}`;
  });
  const added = Object.entries(values).filter(([k]) => !seen.has(k)).map(([k, v]) => `${k} = ${JSON.stringify(v)}`);
  return [...added, ...output].join('\n');
}
export function render(input, { home, sourceCommit, worktreesRoot }) {
  const files = [];
  const add = (path, text) => files.push({ path, text });
  const portable = text => text.replace(/(~|\$HOME)\/\.claude\/commands\/([a-z0-9-]+)\.md\b/g, '$1/.agents/skills/$2/SKILL.md').replaceAll('~/.claude/pact/', '~/.codex/pact/').replaceAll('$HOME/.claude/pact/', '$HOME/.codex/pact/').replace(/(~|\$HOME)\/\.claude\/(skills|commands|agents)\//g, (_path, home, kind) => home + (kind === 'agents' ? '/.codex/agents/' : '/.agents/skills/')).replaceAll('grimoire:eagle-eye', 'eagle-eye');
  const note = `# Codex mirror\n\nThis is the owner's installed Pact mirrored from ${sourceCommit}. Planning and building use GPT-6.1 Sol at the source stage efforts. Native Codex subagents inherit parent permissions; the owner explicitly accepted their weaker isolation. Source tool lists remain procedural restrictions, not mechanical enforcement. A missing required tool is reported, never rebuilt by a security lens. Weekly usage is checked when available; an unavailable reading is stated.\n\nCommands are explicit-only skills: use $make-it-so, $finis, $scry and $scriptorium. Existing permissions still hold. Model/effort entries are preferences applied through supported controls, not a way to switch this chat's model.\n\n`;
  const athanor = 'For projects configured with athanor.json, use the existing Athanor and Node mise shims. A failure inside the Codex sandbox does not establish that host tools are missing: retry through the supported host-access approval with MISE_AUTO_INSTALL=0 before diagnosing installation. The native testing hook reuses the reviewed Athanor guard. It neither changes mise trust nor grants execution permission.\n\n';
  add('.codex/workflows/scriptorium/workflow.md', note + athanor + portable(input.rules).replace('## How Claude helps', '## How the assistant helps').replaceAll('Opus', 'GPT-6.1 Sol').replaceAll('Sonnet', 'GPT-6.1 Sol'));
  add('.codex/pact/review.md', portable(input.review));
  for (const a of input.agents) {
    add(`.codex/agents/${a.name}.toml`, `name = ${JSON.stringify(a.name)}\ndescription = ${JSON.stringify(a.description)}\nmodel = "gpt-6.1-sol"\nmodel_reasoning_effort = ${JSON.stringify(a.effort)}\ndeveloper_instructions = ${JSON.stringify(`Source Claude tools: ${a.tools ?? 'as supplied'}. These are procedural restrictions; native Codex subagents inherit parent permissions.\n\n` + portable(a.body))}\n`);
  }
  for (const c of input.commands) {
    const inventory = c.name === 'scriptorium' ? 'For Codex inventory, commands are the explicit-only skills whose agents/openai.yaml sets allow_implicit_invocation: false; other skills share the same skills folder. Native agent metadata is TOML.\n\n' : '';
    add(`.agents/skills/${c.name}/SKILL.md`, `---\nname: ${c.name}\ndescription: ${JSON.stringify(c.description)}\n---\n\nExplicit owner invocation only.\n\n` + inventory + portable(c.body));
    add(`.agents/skills/${c.name}/agents/openai.yaml`, 'policy:\n  allow_implicit_invocation: false\n');
  }
  for (const r of input.resources) {
    if (r.path.startsWith('.agents/skills/') && r.path.endsWith('.md')) files.push({ path: r.path, text: portable((r.bytes ?? Buffer.from(r.text)).toString()) });
    else files.push(r);
  }
  add('.codex/pact/mirror-source.json', JSON.stringify({ schema: 1, sourceCommit, nativeSubagentIsolation: 'weaker; explicitly accepted by owner', model: 'gpt-6.1-sol', worktreesRoot }, null, 2) + '\n');
  return files;
}
