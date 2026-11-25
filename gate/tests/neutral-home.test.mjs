// The neutral home and a list of harnesses, end to end (spec 0007 S4, S5, S9):
// C2-C4, C17, C18, C30 and C31, with an own harness of the claude-md format in
// a throwaway home. harnesses.test.mjs holds the pure checks on descriptions.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { applyBound, commitAll, git, home, install, makeRepo, passed, refused } from './install-harness.mjs';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const MINE = Object.freeze({
  id: 'mine',
  name: 'Mine',
  detect: '~/.mine',
  rules: { path: '~/.mine/RULES.md' },
  agents: { dir: '~/.mine/agents', format: 'claude-md' },
  hooks: { file: '~/.mine/hooks.json', format: 'claude' },
});

const at = (h, rel) => join(h, ...rel.split('/'));
const read = (h, rel) => readFileSync(at(h, rel), 'utf8');
const record = h => JSON.parse(read(h, '.pact/install.json'));

/** Writes the home's configuration: an install list, and the own harness. */
function configure(h, list) {
  mkdirSync(at(h, '.pact'), { recursive: true });
  writeFileSync(at(h, '.pact/config.json'), `${JSON.stringify({ schema: 1, harnesses: { install: list, own: [MINE] } })}\n`);
}

/** The dry run's block for one harness: its heading's lines up to the next heading. */
function block(r, id) {
  const lines = r.stdout.split(/\r?\n/);
  const from = lines.findIndex(l => l.startsWith(`== ${id} (`));
  assert.ok(from >= 0, r.out);
  const to = lines.findIndex((l, i) => i > from && l.startsWith('== '));
  return lines.slice(from, to < 0 ? lines.length : to).join('\n');
}

// ------------------------------------------------------------ C3: Claude Code's bytes

// gate/tests/fixtures/claude-bytes/ holds what the installer at commit 5132999, before the neutral home, wrote
// into an empty Claude home with every command and the poster and cleaner on. Its home
// path reads <home>, and the settings are settings.merged.json: a settings.json is ignored by git.
const FIXTURE = join(REPO, 'gate', 'tests', 'fixtures', 'claude-bytes');
const CONFIG = '{"schema": 1, "commands": ["make-it-so", "finis", "scry"], "tools": ["poster", "cleaner"]}\n';
/** The one change since the fixture: the pact's folder moved (named once in words), and its hand-offs folder was renamed. */
const moved = text => text.replaceAll('.claude/pact/handoff/', '.pact/handoffs/').replaceAll('.claude/pact/', '.pact/').replaceAll('in my Claude folder beside', 'in `~/.pact` beside');
const lf = text => text.replaceAll('\r\n', '\n');
const fixture = rel => lf(readFileSync(join(FIXTURE, ...rel.split('/')), 'utf8'));
/** settings.json as values, its home folder read as <home> and every separator as a slash. */
const settings = (text, h) => JSON.parse(text, (_, v) => (typeof v === 'string' ? (h ? v.replaceAll('\\', '/').replace(h.replaceAll('\\', '/'), '<home>') : v.replaceAll('\\', '/')) : v));

test('C3: the rules, agents, commands and settings written for Claude Code match the fixture but for the paths', t => {
  const repo = makeRepo(t);
  const h = home(t);
  mkdirSync(at(h, '.pact'));
  writeFileSync(at(h, '.pact/config.json'), CONFIG);
  passed(applyBound(repo, h));
  assert.equal(lf(read(h, '.claude/CLAUDE.md')), moved(fixture('rules.md')));
  for (const dir of ['agents', 'commands']) {
    const want = readdirSync(join(FIXTURE, dir)).sort();
    assert.deepEqual(readdirSync(at(h, `.claude/${dir}`)).sort(), want);
    for (const f of want) assert.equal(lf(read(h, `.claude/${dir}/${f}`)), moved(fixture(`${dir}/${f}`)), `${dir}/${f}`);
  }
  const want = settings(fixture('settings.merged.json'));
  assert.deepEqual(settings(read(h, '.claude/settings.json'), h), JSON.parse(moved(JSON.stringify(want))));
});

// ------------------------------------------------------------ C17, C2, C4: one apply, every harness

test('C17: one apply writes every harness in the list, records and backs up each file by harness, and reports drift per harness', t => {
  const repo = makeRepo(t);
  const h = home(t);
  mkdirSync(at(h, '.codex'));
  configure(h, ['claude', 'mine']);

  const dry = install(repo, h);
  passed(dry);
  // C2: each detected known harness and each own one is listed, in or out.
  assert.match(dry.stdout, /^ {2}claude \(Claude Code\): in\r?$/m, dry.out);
  assert.match(dry.stdout, /^ {2}codex \(Codex\): out\r?$/m, dry.out);
  assert.match(dry.stdout, /^ {2}mine \(Mine\): in, not found\r?$/m, dry.out);
  // C4: an own harness with hooks.
  assert.match(dry.stdout, /^guards unverified for mine: /m, dry.out);
  assert.match(block(dry, 'mine'), /^ {2}\.mine\/RULES\.md$/m);

  passed(applyBound(repo, h));
  assert.equal(read(h, '.mine/RULES.md'), read(h, '.claude/CLAUDE.md'));
  const files = record(h).files;
  for (const [id, path] of [['claude', '.claude/CLAUDE.md'], ['claude', '.claude/agents/scout.md'], ['mine', '.mine/RULES.md'], ['mine', '.mine/agents/scout.md'], ['pact', '.pact/review.md']]) {
    assert.ok(files.some(f => f.harness === id && f.path === path), `${id} ${path}`);
  }

  // A changed source replaces the file in both harnesses, each copied first.
  const scout = join(repo, 'claude', 'agents', 'scout.md');
  writeFileSync(scout, `${readFileSync(scout, 'utf8')}\nOne more line.\n`);
  commitAll(repo);
  const old = read(h, '.mine/agents/scout.md');
  const before = new Set(readdirSync(at(h, '.pact/backups')));
  passed(applyBound(repo, h));
  const [name] = readdirSync(at(h, '.pact/backups')).filter(n => !before.has(n));
  const manifest = JSON.parse(read(h, `.pact/backups/${name}/manifest.json`));
  for (const [id, path] of [['claude', '.claude/agents/scout.md'], ['mine', '.mine/agents/scout.md']]) {
    assert.ok(manifest.entries.some(e => e.harness === id && e.path === path && e.was === 'file'), `${id} ${path}`);
  }
  assert.equal(read(h, `.pact/backups/${name}/.mine/agents/scout.md`), old);

  writeFileSync(at(h, '.mine/RULES.md'), 'edited\n');
  writeFileSync(at(h, '.claude/CLAUDE.md'), 'edited\n');
  // A settings entry the install recorded, changed by hand, is that harness's drift too.
  writeFileSync(at(h, '.claude/settings.json'), read(h, '.claude/settings.json').replace('"autoCompactWindow": 400000', '"autoCompactWindow": 500000'));
  const drift = install(repo, h);
  assert.match(block(drift, 'mine'), /^Drift: 1\n {2}\.mine\/RULES\.md \(changed since the install\)$/m);
  assert.match(block(drift, 'claude'), /^Drift: 2\n {2}\.claude\/CLAUDE\.md \(changed since the install\)\n {2}\.claude\/settings\.json autoCompactWindow \(the pact's entry changed since the install\)$/m);
});

// ------------------------------------------------------------ C18: what is not the record's, and a harness taken out

test('C18: an unrecorded rules file refuses, an unrecorded agent stays yours, and a harness dropped from the list loses its recorded files', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, ['claude', 'mine']);
  mkdirSync(at(h, '.mine/agents'), { recursive: true });
  writeFileSync(at(h, '.mine/RULES.md'), 'my own rules\n');
  writeFileSync(at(h, '.mine/agents/scout.md'), 'my own scout\n');

  const no = applyBound(repo, h);
  refused(no, /^REFUSED: .*\.mine\/RULES\.md already exists and the install record does not list it/m);
  assert.equal(read(h, '.mine/RULES.md'), 'my own rules\n');
  assert.ok(!existsSync(at(h, '.claude/CLAUDE.md')) && !existsSync(at(h, '.pact/install.json')), no.out);

  rmSync(at(h, '.mine/RULES.md'));
  const yes = applyBound(repo, h);
  passed(yes);
  assert.match(block(yes, 'mine'), /^Yours, left as is: 1\n {2}\.mine\/agents\/scout\.md$/m);
  assert.equal(read(h, '.mine/agents/scout.md'), 'my own scout\n');
  assert.ok(existsSync(at(h, '.mine/agents/data-lens.md')));

  configure(h, ['claude']);
  passed(applyBound(repo, h));
  assert.ok(!existsSync(at(h, '.mine/RULES.md')) && !existsSync(at(h, '.mine/agents/data-lens.md')));
  assert.equal(read(h, '.mine/agents/scout.md'), 'my own scout\n');
  assert.ok(existsSync(at(h, '.claude/CLAUDE.md')));
  assert.deepEqual(record(h).files.filter(f => f.harness === 'mine'), []);
});

// ------------------------------------------------------------ C31: an empty install list

test('C31: after an apply with an empty install list the record lists nothing and every recorded target is gone', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, ['claude', 'mine']);
  passed(applyBound(repo, h));
  const was = record(h);
  assert.ok(was.files.length > 10);
  assert.deepEqual([...new Set(was.entries.map(e => e.key))].sort(), ['autoCompactWindow', 'hooks.PostToolUse', 'hooks.PreCompact', 'hooks.SessionStart', 'hooks.Stop', 'hooks.UserPromptSubmit']);

  configure(h, []);
  passed(applyBound(repo, h));
  const now = record(h);
  assert.deepEqual([now.files, now.entries, now.harnesses], [[], [], []]);
  for (const f of was.files) assert.ok(!existsSync(at(h, f.path)), f.path);
  assert.doesNotMatch(read(h, '.claude/settings.json'), /compact-handoff|autoCompactWindow/);
  assert.ok(existsSync(at(h, '.pact/config.json')), 'the configuration stays');
});

// ------------------------------------------------------------ the known harnesses come from the commit

test('bad case: a commit without harnesses/known.json refuses', t => {
  const repo = makeRepo(t, root => rmSync(join(root, 'harnesses', 'known.json')));
  refused(install(repo, home(t)), /^REFUSED: the commit holds no harnesses\/known\.json/m);
});

// ------------------------------------------------------------ C30

test('C30: --home inside a git work tree refuses, and writes nothing', t => {
  const repo = makeRepo(t);
  const tree = tempDir(t, 'pact-tree-');
  git(tree, 'init', '-q');
  const h = join(tree, 'home');
  mkdirSync(join(h, '.claude'), { recursive: true });
  refused(install(repo, h), /^REFUSED: --home is inside a git work tree/m);
  assert.deepEqual(readdirSync(h, { recursive: true }).map(String), ['.claude']);
});
