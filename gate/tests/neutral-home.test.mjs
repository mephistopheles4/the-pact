// The neutral home and a list of harnesses, end to end (spec 0007 S4, S5, S9):
// C2-C4, C17, C18, C30 and C31, with an own harness of the claude-md format in
// a throwaway home. harnesses.test.mjs holds the pure checks on descriptions.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

/** Writes the home's configuration: an install list, the own harness, and any tools. */
function configure(h, list, tools = []) {
  mkdirSync(at(h, '.pact'), { recursive: true });
  writeFileSync(at(h, '.pact/config.json'), `${JSON.stringify({ schema: 1, ...(tools.length ? { tools } : {}), harnesses: { install: list, own: [MINE] } })}\n`);
}

/** Replaces one text in a file of the throwaway repo. */
function edit(root, rel, from, to) {
  const p = join(root, ...rel.split('/'));
  const s = readFileSync(p, 'utf8');
  assert.equal(s.split(from).length, 2, `${rel} holds the plant\'s target once`);
  writeFileSync(p, s.replace(from, () => to));
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
/** Every other change to the rules since the fixture (spec 0007 S6, S7): the neutral phrases, the model roles and the models line. */
const NEUTRAL_RULES = [
  ['## How Claude helps', '## How the agent helps'],
  ["Claude's own\n  permission prompts and classifier blocks still stop you; these rules add no\n  stop of their own.", "Your harness's own\n  permission prompts and blocks still stop you; these rules add no stop of\n  their own."],
  ['| none | Opus, low |', '| none | planning model, low |'],
  ['| Opus, medium | Sonnet, medium |', '| planning model, medium | executor model, medium |'],
  ['| Opus, high | Sonnet, medium |\n', '| planning model, high | executor model, medium |\n\nHere the planning model is `opus`, the executor model `sonnet` and the light model `haiku`.\n'],
  ["and built on Opus at high, with the security pair, `adversarial-lens` and\n`data-lens`, on the spec and the diff. That is the sensitive route. When the\nwork matches that list, or you think it sensitive otherwise, say why in one\nline in your tier proposal and recommend the route; I take it or not. If I\ndidn't take the route, offer the security pair once more at Test when the\nchange matches the list. Beyond that one offer, sensitivity doesn't stop the\nrun. A flag or an offer I haven't answered stays open, in one line, in every\nhand-off and in the result. If you find it later, say so in one line at the\nnext hand-off or result, and keep saying it until I answer.", "and built on the planning model at high, with the security pair,\n`adversarial-lens` and `data-lens`, on the spec and the diff. That is the\nsensitive route. When the work matches that list, or you think it sensitive\notherwise, say why in one line in your tier proposal and recommend the route;\nI take it or not. If I didn't take the route, offer the security pair once\nmore at Test when the change matches the list. Beyond that one offer,\nsensitivity doesn't stop the run. A flag or an offer I haven't answered stays\nopen, in one line, in every hand-off and in the result. If you find it later,\nsay so in one line at the next hand-off or result, and keep saying it until I\nanswer."],
  ['| Plan | in the session, no plan | Opus, medium | Opus, high | Opus, high |', '| Plan | in the session, no plan | planning model, medium | planning model, high | planning model, high |'],
  ['| Design | skipped | Opus, medium | Opus, high | Opus, high |', '| Design | skipped | planning model, medium | planning model, high | planning model, high |'],
  ['| Build | Opus, low | Sonnet, medium | Sonnet, medium | Opus, high |', '| Build | planning model, low | executor model, medium | executor model, medium | planning model, high |'],
  ['| Test | Opus, low | Sonnet, medium | Sonnet, medium | Opus, high |', '| Test | planning model, low | executor model, medium | executor model, medium | planning model, high |'],
  ['| Maintain | in the session, no plan | Opus, medium | Opus, high | Opus, high |', '| Maintain | in the session, no plan | planning model, medium | planning model, high | planning model, high |'],
];
const neutral = text => NEUTRAL_RULES.reduce((s, [from, to]) => {
  assert.equal(s.split(from).length, 2, `the fixture holds ${from} once`);
  return s.replace(from, () => to);
}, text);
/** settings.json as values, its home folder read as <home> and every separator as a slash. */
const settings = (text, h) => JSON.parse(text, (_, v) => (typeof v === 'string' ? (h ? v.replaceAll('\\', '/').replace(h.replaceAll('\\', '/'), '<home>') : v.replaceAll('\\', '/')) : v));

test('C3: the rules, agents, commands and settings written for Claude Code match the fixture but for the paths, the neutral phrases and the model roles', t => {
  const repo = makeRepo(t);
  const h = home(t);
  mkdirSync(at(h, '.pact'));
  writeFileSync(at(h, '.pact/config.json'), CONFIG);
  passed(applyBound(repo, h));
  const rules = lf(read(h, '.claude/CLAUDE.md'));
  assert.equal(rules, neutral(moved(fixture('rules.md'))));
  // S6: today's Quick Build reads as a role.
  assert.match(rules, /^\| \*\*Quick\*\* \|.*\| none \| planning model, low \|$/m);
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
  // C7, C29: an own harness that names no models gets no models line.
  assert.equal(read(h, '.mine/RULES.md'), read(h, '.claude/CLAUDE.md').replace(/\nHere the planning model is [^\n]*\n/, ''));
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

// ------------------------------------------------------------ C5, C8, C9: each harness's own render

test('C5, C8, C9, C29: one apply writes each harness its own render, binds every rules file, and warns on a model named outright', t => {
  const repo = makeRepo(t);
  const h = home(t);
  for (const dir of ['.codex', '.gemini/config', '.pact']) mkdirSync(at(h, dir), { recursive: true });
  writeFileSync(at(h, '.pact/config.json'), '{"schema": 1, "commands": ["finis"], "agents": {"scout": {"model": "my-model"}}, "harnesses": {"install": ["claude", "codex", "antigravity"]}}\n');

  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^WARN: `\.codex\/agents\/scout\.toml` names model `my-model`, which Codex may not have\r?$/m, dry.out);
  assert.doesNotMatch(dry.stdout, /`\.claude\/[^`]*` names model/);
  // Antigravity takes no agent until the pact has its tool names.
  assert.match(dry.stdout, /^WARN: antigravity: the pact does not build Antigravity's agent format yet/m, dry.out);
  passed(applyBound(repo, h));

  const rules = read(h, '.codex/AGENTS.md');
  assert.match(rules, /^Here the planning model is `gpt-6\.2-sol`, the executor model `gpt-6\.2-astra` and the light model `gpt-6\.2-astra`\.$/m);
  assert.doesNotMatch(rules, /\b(?:Opus|Sonnet|Haiku)\b|<!-- pact:(?:if|unless|end -->|models)/);
  assert.match(read(h, '.gemini/AGENTS.md'), /the planning model is `pro`, the executor model `flash`/);
  assert.match(read(h, '.codex/agents/data-lens.toml'), /^model = "gpt-6\.2-sol"$/m);
  assert.ok(!existsSync(at(h, '.gemini/config/agents')));
  assert.match(read(h, '.pact/skills/finis/SKILL.md'), /^---\nname: finis\n[\s\S]*Nothing is outstanding;\s+close this session\./);
  assert.equal(read(h, '.pact/skills/finis/agents/openai.yaml'), 'policy:\n  allow_implicit_invocation: false\n');
  // A command the configuration leaves off is no skill either.
  assert.ok(!existsSync(at(h, '.pact/skills/scry')));
  assert.match(read(h, '.claude/commands/finis.md'), /archive the\s+session/);
  const files = record(h).files;
  for (const [id, path] of [['codex', '.codex/AGENTS.md'], ['codex', '.codex/agents/scout.toml'], ['antigravity', '.gemini/AGENTS.md'], ['pact', '.pact/skills/finis/SKILL.md']]) {
    assert.ok(files.some(f => f.harness === id && f.path === path), `${id} ${path}`);
  }

  // The bound hash covers every harness's rules, so one harness's change alone refuses an old apply.
  const bound = r => /--rendered-hash ([0-9a-f]{64})/.exec(r.stdout)[1];
  const was = bound(install(repo, h));
  edit(repo, 'harnesses/known.json', '"planning": "gpt-6.2-sol"', '"planning": "gpt-7"');
  commitAll(repo);
  assert.notEqual(bound(install(repo, h)), was);
});

test('C6: rules over a harness cap refuse the whole install', t => {
  const repo = makeRepo(t);
  const h = home(t);
  mkdirSync(at(h, '.gemini/config'), { recursive: true });
  edit(repo, 'harnesses/known.json', '"cap": 24000', '"cap": 2000');
  commitAll(repo);
  const r = install(repo, h);
  refused(r, /^REFUSED: the rules for antigravity take \d+ bytes, over its cap of 2000\./m);
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
  // The cleaner on: its deny and ask rules leave with Claude Code, and none of them reads as drift.
  configure(h, ['claude', 'mine'], ['cleaner']);
  passed(applyBound(repo, h));
  const was = record(h);
  assert.ok(was.files.length > 10);
  assert.deepEqual([...new Set(was.entries.map(e => e.key))].sort(), ['autoCompactWindow', 'hooks.PostToolUse', 'hooks.PreCompact', 'hooks.SessionStart', 'hooks.Stop', 'hooks.UserPromptSubmit', 'permissions.ask', 'permissions.defaultMode', 'permissions.deny', 'skipAutoPermissionPrompt']);

  // Auto mode turned off by hand is not drift: the apply sets it again.
  writeFileSync(at(h, '.claude/settings.json'), read(h, '.claude/settings.json').replace('"auto"', '"plan"'));
  passed(applyBound(repo, h));
  assert.equal(JSON.parse(read(h, '.claude/settings.json')).permissions.defaultMode, 'auto');

  configure(h, [], ['cleaner']);
  const dry = install(repo, h);
  passed(dry);
  assert.match(block(dry, 'claude'), /^Drift: 0$/m);
  assert.match(block(dry, 'claude'), /^ {2}- permissions\.defaultMode$/m);
  passed(applyBound(repo, h));
  const now = record(h);
  assert.deepEqual([now.files, now.entries, now.harnesses], [[], [], []]);
  for (const f of was.files) assert.ok(!existsSync(at(h, f.path)), f.path);
  assert.doesNotMatch(read(h, '.claude/settings.json'), /compact-handoff|autoCompactWindow|defaultMode|skipAutoPermissionPrompt|cleaner|worktree/);
  assert.ok(existsSync(at(h, '.pact/config.json')), 'the configuration stays');
});

// Auto mode the owner had set before the install is theirs, and stays when Claude Code is taken out.
test('C31: an overlay key the settings already held is not recorded, and stays', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeFileSync(at(h, '.claude/settings.json'), '{"permissions": {"defaultMode": "auto"}}\n');
  passed(applyBound(repo, h));
  assert.ok(!record(h).entries.some(e => e.key === 'permissions.defaultMode'));
  configure(h, []);
  passed(applyBound(repo, h));
  assert.deepEqual(JSON.parse(read(h, '.claude/settings.json')), { permissions: { defaultMode: 'auto' } });
});

test('C31: an overlay key changed by hand after the install stays when Claude Code is taken out', t => {
  const repo = makeRepo(t);
  const h = home(t);
  passed(applyBound(repo, h));
  writeFileSync(at(h, '.claude/settings.json'), read(h, '.claude/settings.json').replace('"auto"', '"plan"'));
  configure(h, []);
  passed(applyBound(repo, h));
  assert.equal(JSON.parse(read(h, '.claude/settings.json')).permissions.defaultMode, 'plan');
});

test('bad case: a configuration that changes while the install runs refuses', t => {
  const repo = makeRepo(t, root => edit(root, 'gate/install-run.mjs', "  let text = null;\n", "  writeFileSync(live(home, core.CONFIG_REL), '{\"schema\": 1}\\n');\n  let text = null;\n"));
  const h = home(t);
  configure(h, ['claude']);
  refused(install(repo, h), /^REFUSED: the user configuration changed while the install ran/m);
});

test('bad case: an install record that is a link refuses', t => {
  const repo = makeRepo(t);
  const h = home(t);
  mkdirSync(at(h, '.pact'));
  const elsewhere = join(tempDir(t, 'pact-else-'), 'record.json');
  writeFileSync(elsewhere, '{}\n');
  try {
    symlinkSync(elsewhere, at(h, '.pact/install.json'), 'file');
  } catch (e) {
    if (e.code === 'EPERM') return t.skip('this account may not make a link here');
    throw e;
  }
  refused(install(repo, h), /^REFUSED: the user configuration file, or the \.pact folder that holds it, is a link/m);
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
  refused(install(repo, h, { apply: true }), /^REFUSED: --home is inside a git work tree/m);
  assert.deepEqual(readdirSync(h, { recursive: true }).map(String), ['.claude']);
});
