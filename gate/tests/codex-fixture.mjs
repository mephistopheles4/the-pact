import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from './tree.mjs';
import { CLEANER_DENY, CLEANER_ASK } from '../install-core.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const sha = b => createHash('sha256').update(b).digest('hex');
export function codexFixture(t) {
  const root = tempDir(t, 'pact-codex-fixture-'), home = join(root, 'home'), code = join(root, 'code'), bin = join(root, 'bin');
  const source = join(home, '.claude'), managed = [];
  const put = (rel, bytes, recorded = false) => {
    const path = join(source, rel); mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, bytes);
    if (recorded) managed.push({ path: rel, sha256: sha(Buffer.from(bytes)) });
  };
  mkdirSync(join(home, '.codex/visualizations'), { recursive: true }); mkdirSync(code); mkdirSync(bin);
  cpSync(join(repo, 'codex'), join(code, 'codex'), { recursive: true });
  const env = { ...process.env, HOME: home, USERPROFILE: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, 'no-global'), GIT_AUTHOR_NAME: 'fixture', GIT_COMMITTER_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
  delete env.NODE_OPTIONS;
  for (const k of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|CONFIG_PARAMETERS|CONFIG_COUNT)$/i.test(k)) delete env[k];
  const git = args => { const r = spawnSync('git', args, { cwd: code, env, encoding: 'utf8', windowsHide: true }); if (r.status !== 0) throw Error(r.stderr); return r.stdout.trim(); };
  git(['init', '-qb', 'main']); git(['remote', 'add', 'origin', 'https://github.com/mephistopheles4/the-pact.git']);
  put('CLAUDE.md', '# Customized pact\nOpus, low; Sonnet, high\nKeep every guard.\n## Workflow\n`fixture-a`: used; `grimoire:eagle-eye`: offered\n', true);
  put('pact/review.md', 'Read ~/.claude/pact/private/\n', true);
  for (const name of ['adversarial-lens', 'behaviour-lens', 'conventions-lens', 'data-lens', 'executability-lens', 'integrity-lens', 'reader-lens', 'scout', 'unstated-lens']) put(`agents/${name}.md`, readFileSync(join(repo, `claude/agents/${name}.md`)), true);
  for (const name of ['finis', 'make-it-so', 'scry', 'scriptorium']) put(`commands/${name}.md`, readFileSync(join(repo, `claude/commands/${name}.md`)), true);
  for (const name of ['poster', 'cleaner']) put(`pact/tools/${name}.mjs`, readFileSync(join(repo, `claude/tools/${name}.mjs`)), true);
  put('pact/config.json', JSON.stringify({ schema: 1, tools: ['poster', 'cleaner'] })); mkdirSync(join(source, 'pact/blocks'));
  put('settings.json', JSON.stringify({ hooks: {}, permissions: { deny: CLEANER_DENY, ask: CLEANER_ASK }, autoCompactWindow: 400000 }));
  const plugin = join(source, 'plugins/cache/fixture/1');
  put('plugins/installed_plugins.json', JSON.stringify({ plugins: { 'grimoire@mephistopheles4': [{ installPath: plugin }] } }));
  for (const name of ['fixture-a', 'fixture-helper', 'eagle-eye']) {
    const rel = name === 'eagle-eye' ? 'plugins/cache/fixture/1/skills/eagle-eye' : `skills/${name}`;
    put(`${rel}/SKILL.md`, `---\nname: ${name}\ndescription: Fixture skill\n---\nKeep this skill.\n${name === 'fixture-a' ? 'Read skills/fixture-helper/SKILL.md and ../../references/definition-of-done.md.\n' : ''}`);
  }
  put('references/definition-of-done.md', 'Fixture shared requirement.\n');
  // Real CLI, fixture-only GitHub transport: Node executes this local `api` script.
  writeFileSync(join(code, 'api'), `const head=process.env.FIXTURE_HEAD; const base={head_sha:head,path:'.github/workflows/gate.yml',head_repository:{full_name:'mephistopheles4/the-pact'},status:'completed',conclusion:'success'}; const checks=['gate','gate-windows'].map((name,i)=>({name,head_sha:head,conclusion:'success',app:{slug:'github-actions'},details_url:'https://github.com/mephistopheles4/the-pact/actions/runs/123/job/'+i})); console.log(JSON.stringify(process.argv[2].includes('check-runs')?{check_runs:checks}:base));\n`);
  copyFileSync(process.execPath, join(bin, process.platform === 'win32' ? 'gh.exe' : 'gh'));
  for (const key of Object.keys(env)) if (/^path$/i.test(key)) delete env[key];
  env.PATH = bin + delimiter + process.env.PATH;
  git(['add', '.']); git(['commit', '-qm', 'fixture adapter']);
  const head = git(['rev-parse', 'HEAD']); env.FIXTURE_HEAD = head;
  put('.pact-install.json', JSON.stringify({ commit: head, files: managed }));
  return { root, home, code, source, env, put, cli: args => spawnSync(process.execPath, [join(code, 'codex/install.mjs'), ...args], { cwd: code, env, encoding: 'utf8', windowsHide: true, timeout: 30000 }) };
}
