// PACT-105 C24 and C25, Scriptorium's harness section: the rows the page shows,
// what it saves into config.json's harnesses key, what it says each harness
// receives, held to the installer's own renderer, and the page the builder
// writes before any install. The page is not gate code; the installer stays the
// authority.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { EXAMPLE_BUILDER_REL, PAGE_REL, buildPage, machineData } from '../../builder/build.mjs';
import { renderHarnesses } from '../harness-render.mjs';
import { chooseHarnesses, configHarnesses, parseKnown, resolveHarnesses } from '../harnesses.mjs';
import { RENDER, REPO } from './text.mjs';
import { tempDir, writeTree } from './tree.mjs';

const PAGE = readFileSync(join(REPO, PAGE_REL), 'utf8');
const KNOWN = parseKnown(readFileSync(join(REPO, 'harnesses', 'known.json'), 'utf8'));
const scriptOf = page => [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
const plain = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/** The page's own functions, run with no document; what they return is cloned into this realm. */
function logic(page = PAGE) {
  const names = ['PACT', 'initialState', 'buildFiles', 'keepFolderKeys', 'harnessList', 'setHarnessIn', 'setHarnessModel', 'addHarness', 'removeHarness', 'receives', 'problems'];
  const got = vm.runInContext(`${scriptOf(page)}\n;({ ${names.join(', ')} });`, vm.createContext({ TextEncoder }));
  // A state stays the page realm's object, so each setter changes it in place.
  return Object.fromEntries(Object.entries(got).map(([k, v]) => [k, typeof v !== 'function' ? plain(v) : k === 'initialState' ? v : (...a) => plain(v(...a))]));
}
const L = logic();
const configOf = state => JSON.parse(L.buildFiles(state)[0].text);

/** Resolve the harnesses a config.json's text describes, as the installer does, every one of them installed. */
function installed(configText, home) {
  const { own } = configHarnesses(configText);
  return resolveHarnesses({ known: KNOWN, own, home, platform: process.platform, inWorkTree: null });
}

const OWN = { id: 'mine', name: 'My harness', detect: '~/.mine', rules: { path: '~/.mine/RULES.md', cap: 100000 }, agents: { dir: '~/.mine/agents', format: 'codex-toml' }, skills: { dir: '~/.mine/skills' }, models: { planning: 'big', executor: 'mid' }, capabilities: ['subagents'] };

// ------------------------------------------------------------ C24: the rows

test('C24: with no look at the machine, the page lists each known harness with its own three models, the default ones in the install list', () => {
  const rows = L.harnessList(L.initialState());
  assert.deepEqual(rows.map(r => [r.id, r.in, r.detected]), KNOWN.map(h => [h.id, h.defaultInstall !== false, null]));
  for (const h of KNOWN) assert.deepEqual(rows.find(r => r.id === h.id).models, { planning: h.models.planning, executor: h.models.executor, light: h.models.light ?? '' }, h.id);
});

test('C24: taking a harness out writes the install list, and putting it back writes the whole list', () => {
  const s = L.initialState();
  L.setHarnessIn(s, 'codex', false);
  assert.deepEqual(configOf(s).harnesses, { install: ['claude', 'antigravity'] });
  L.setHarnessIn(s, 'codex', true);
  assert.deepEqual(configOf(s).harnesses, { install: ['claude', 'codex', 'antigravity'] });
});

test('C24: each of a harness\'s three models saves as an own entry holding only models, which the installer takes as an override', t => {
  const s = L.initialState();
  L.setHarnessModel(s, 'codex', 'planning', 'plan-x');
  L.setHarnessModel(s, 'codex', 'executor', 'exec-x');
  L.setHarnessModel(s, 'codex', 'light', 'light-x');
  const text = L.buildFiles(s)[0].text;
  assert.deepEqual(JSON.parse(text).harnesses, { own: [{ id: 'codex', models: { planning: 'plan-x', executor: 'exec-x', light: 'light-x' } }] });
  const codex = installed(text, tempDir(t)).find(h => h.id === 'codex');
  assert.deepEqual([codex.models, codex.overrides], [{ planning: 'plan-x', executor: 'exec-x', light: 'light-x' }, ['models']]);
  L.setHarnessModel(s, 'codex', 'light', '');
  assert.deepEqual(configOf(s).harnesses.own[0].models, { planning: 'plan-x', executor: 'exec-x' }, 'an empty light model is left out');
});

test('C24: a model set back to the harness\'s own leaves nothing to save', () => {
  const s = L.initialState();
  L.setHarnessModel(s, 'claude', 'planning', 'fable');
  L.setHarnessModel(s, 'claude', 'planning', 'opus');
  assert.equal(Object.hasOwn(configOf(s), 'harnesses'), false);
});

for (const [name, role, value] of [['an empty planning model', 'planning', ''], ['a model of two words', 'executor', 'two words']]) {
  test(`bad harness model: ${name} is a problem that stops a save`, () => {
    const s = L.initialState();
    L.setHarnessModel(s, 'codex', role, value);
    assert.ok(L.problems(s).some(p => p.level === 'error' && p.where === 'codex'));
  });
}

test('C24: an own harness added on the page is listed, saves as the installer reads it, and removes again', t => {
  const s = L.initialState();
  assert.equal(L.addHarness(s, OWN), null);
  const row = L.harnessList(s).find(r => r.id === 'mine');
  assert.deepEqual([row.name, row.own, row.in], ['My harness', true, true]);
  const text = L.buildFiles(s)[0].text;
  assert.deepEqual(JSON.parse(text).harnesses, { install: ['claude', 'codex', 'antigravity', 'mine'], own: [OWN] });
  assert.equal(installed(text, tempDir(t)).find(h => h.id === 'mine').rules.path, '.mine/RULES.md');
  L.removeHarness(s, 'mine');
  assert.equal(Object.hasOwn(configOf(s), 'harnesses'), false, 'an added harness removed again leaves nothing to save');
});

for (const [name, change, says] of [
  ['a known id', { id: 'codex' }, /already/],
  ['a reserved id', { id: 'pact' }, /id/],
  ['an id with a capital', { id: 'Mine' }, /id/],
  ['a path inside ~/.pact', { rules: { path: '~/.pact/RULES.md' } }, /\.pact/],
]) {
  test(`bad own harness: ${name} is refused by the page`, () => {
    const s = L.initialState();
    assert.match(L.addHarness(s, { ...OWN, ...change }) ?? '', says);
    assert.equal(Object.hasOwn(configOf(s), 'harnesses'), false);
  });
}

const EXISTING = JSON.stringify({ schema: 1, harnesses: { install: ['claude', 'codex', 'old'], own: [{ id: 'old', name: 'Old', detect: '~/.old', rules: { path: '~/.old/R.md' } }, { id: 'codex', rules: { path: '~/.codex/OTHER.md' }, models: { planning: 'P0', executor: 'E0' } }] } });

test('C24: a save keeps the folder\'s harnesses when the page changed none', () => {
  const s = L.initialState();
  const kept = L.keepFolderKeys(L.buildFiles(s), EXISTING, s.harnesses);
  assert.deepEqual(JSON.parse(kept.files[0].text).harnesses, JSON.parse(EXISTING).harnesses);
});

test('C24: a save keeps the folder’s agent settings the page did not change, field by field', () => {
  const existing = JSON.stringify({ schema: 1, agents: { scout: { model: 'my-model', effort: 'high' }, 'data-lens': { effort: 'low' } } });
  const s = L.initialState();
  const untouched = L.keepFolderKeys(L.buildFiles(s), existing, s.harnesses);
  assert.deepEqual(JSON.parse(untouched.files[0].text).agents, JSON.parse(existing).agents);
  s.agents.scout.effort = 'low';
  const changed = L.keepFolderKeys(L.buildFiles(s), existing, s.harnesses);
  assert.deepEqual(JSON.parse(changed.files[0].text).agents, { scout: { model: 'my-model', effort: 'low' }, 'data-lens': { effort: 'low' } });
});

test('C24: a save applies only what the page changed over the folder\'s harnesses', () => {
  const s = L.initialState();
  L.setHarnessIn(s, 'codex', false);
  L.setHarnessModel(s, 'codex', 'planning', 'plan-x');
  const kept = L.keepFolderKeys(L.buildFiles(s), EXISTING, s.harnesses);
  const got = JSON.parse(kept.files[0].text).harnesses;
  // The folder's list keeps what the page never showed and gains nothing untouched; its own model stays.
  assert.deepEqual(got.install, ['claude', 'old']);
  assert.deepEqual(got.own, [JSON.parse(EXISTING).harnesses.own[0], { id: 'codex', rules: { path: '~/.codex/OTHER.md' }, models: { planning: 'plan-x', executor: 'E0' } }]);
});

// ------------------------------------------------------------ C24: what each harness receives

/** The renderer's own output for the page's saved files: the configured rules and agents, then the harness renderer. */
function installerRenders(t, state) {
  const home = tempDir(t, 'pact-harness-home-');
  const out = tempDir(t, 'pact-harness-out-');
  const files = L.buildFiles(state);
  writeTree(join(home, '.pact'), Object.fromEntries(files.filter(f => !f.agent).map(f => [f.path, f.text])));
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [RENDER, join(REPO, 'claude', 'CLAUDE.md'), out, home], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const texts = dir => new Map(readdirSync(join(REPO, 'claude', dir)).filter(f => f.endsWith('.md')).sort().map(f => [f.slice(0, -3), readFileSync(join(REPO, 'claude', dir, f), 'utf8')]));
  const agents = texts('agents');
  for (const name of agents.keys()) {
    const made = join(out, `agent-${name}.md`);
    try {
      agents.set(name, readFileSync(made, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  const harnesses = installed(files[0].text, home);
  const { files: rendered } = renderHarnesses({ rules: readFileSync(join(out, 'CLAUDE.md'), 'utf8'), agents, commands: texts('commands'), harnesses });
  return { harnesses, rendered, listed: new Set([...(JSON.parse(files[0].text).commands ?? []), 'scriptorium']) };
}

/** The installer's renders for one harness, keyed by where the page says each file goes. */
function expected({ harnesses, rendered, listed }, id) {
  const h = harnesses.find(x => x.id === id);
  const want = {};
  for (const [rel, text] of rendered) {
    let m;
    if (rel === `rendered/${id}/rules.md`) want[`~/${h.rules.path}`] = text.replace(/^\*\*Configuration in effect\.\*\*[^\n]*\nValues set:[^\n]*(\nAgents set:[^\n]*)?$/m, '**Configuration in effect.** [The install names your configuration here.]');
    else if ((m = new RegExp(`^rendered/${id}/agents/(.+)$`).exec(rel))) want[`~/${h.agents.dir}/${m[1]}`] = text;
    else if ((m = new RegExp(`^rendered/${id}/commands/(.+)\\.md$`).exec(rel))) {
      if (listed.has(m[1])) want[`~/${h.commands.dir}/${m[1]}.md`] = text;
    } else if (h.skills && (m = /^rendered\/skills\/([^/]+)\/(.+)$/.exec(rel))) {
      if (listed.has(m[1])) want[`~/.pact/skills/${m[1]}/${m[2]}`] = text;
    }
  }
  return want;
}

const shownFiles = (state, id) => {
  const got = L.receives(state, id);
  assert.equal(got.refusal, null);
  return Object.fromEntries(got.files.map(f => [f.path, f.text]));
};

const SHOWN_STATES = [
  ['a page with nothing changed', () => {}],
  ['edited parts, limits, tools, commands, an agent, an override and an own harness', s => {
    s.parts.moves[0].text = 'I sense the work my own way.';
    s.parts.tiers[0].build = 'Opus, low';
    s.usage = 80;
    s.session = 60;
    s.tools = ['poster', 'cleaner'];
    s.commands = ['make-it-so', 'finis'];
    s.agents.scout.model = 'planning';
    s.agents['data-lens'].effort = 'max';
    L.setHarnessModel(s, 'codex', 'planning', 'plan-x');
    assert.equal(L.addHarness(s, OWN), null);
  }],
  ['both usage limits off or unset, and one tool', s => {
    s.usage = false;
    s.tools = ['cleaner'];
  }],
];

for (const [name, edit] of SHOWN_STATES) {
  test(`C24: what the page shows each harness receiving is what the installer's renderer writes: ${name}`, t => {
    const s = L.initialState();
    edit(s);
    const real = installerRenders(t, s);
    for (const h of real.harnesses) {
      const want = expected(real, h.id);
      assert.ok(want[`~/${h.rules.path}`], `${h.id} has rules`);
      assert.deepEqual(shownFiles(s, h.id), want, h.id);
    }
  });
}

test('C24: rules over a harness\'s cap show the installer\'s refusal in place of the files', () => {
  const s = L.initialState();
  assert.equal(L.addHarness(s, { ...OWN, rules: { path: '~/.mine/RULES.md', cap: 100 } }), null);
  const got = L.receives(s, 'mine');
  assert.match(got.refusal, /over its cap of 100/);
  assert.deepEqual(got.files, []);
});

test('C24: an agent the page gives its own file shows as left to that file in Claude Code, and as the pact\'s elsewhere', () => {
  const s = L.initialState();
  s.own.scout = '---\nname: scout\ndescription: Mine.\ntools: Read\nmodel: opus\neffort: low\n---\n\nMy own scout.\n';
  const claude = L.receives(s, 'claude').files.find(f => f.path === '~/.claude/agents/scout.md');
  assert.deepEqual([claude.yours, /My own scout\./.test(claude.text)], [true, true]);
  const codex = L.receives(s, 'codex').files.find(f => f.path === '~/.codex/agents/scout.toml');
  assert.deepEqual([codex.yours, /My own scout\./.test(codex.text)], [false, false]);
});

// ------------------------------------------------------------ C24 and C25: the page the builder writes on a machine

/** A home holding `files`, and a run of the clone's builder with it as the home folder. */
function machine(t, files) {
  const home = join(tempDir(t, 'pact-machine-'), 'user-home');
  mkdirSync(home, { recursive: true });
  writeTree(home, files);
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.CLAUDE_CONFIG_DIR;
  Object.assign(env, { HOME: home, USERPROFILE: home });
  const cli = args => spawnSync(process.execPath, [join(REPO, 'builder', 'build.mjs'), ...args], { encoding: 'utf8', env, cwd: dirname(home) });
  return { home, cli };
}

/** Every path under `dir`, files with their text. */
function tree(dir, base = dir, out = {}) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      out[`${relative(base, p).replaceAll('\\', '/')}/`] = null;
      tree(p, base, out);
    } else out[relative(base, p).replaceAll('\\', '/')] = readFileSync(p, 'utf8');
  }
  return out;
}

const CONFIG = JSON.stringify({ schema: 1, commands: ['finis'], tools: ['cleaner'], harnesses: { own: [OWN, { id: 'codex', models: { planning: 'plan-x', executor: 'exec-x' } }] } });
const MACHINE_FILES = {
  '.claude/keep': '',
  '.codex/keep': '',
  '.mine/keep': '',
  '.pact/config.json': CONFIG,
};
const EXAMPLE = join(REPO, EXAMPLE_BUILDER_REL);

test('C25: with no install, the builder writes the page to ~/.pact/scriptorium.html and changes nothing else', t => {
  const m = machine(t, { '.claude/keep': '', '.codex/AGENTS.md': 'mine\n' });
  const before = tree(m.home);
  const r = m.cli(['--builder', EXAMPLE]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const after = tree(m.home);
  assert.deepEqual(Object.keys(after).filter(k => !Object.hasOwn(before, k)).sort(), ['.pact/', '.pact/scriptorium.html']);
  assert.deepEqual(Object.fromEntries(Object.keys(before).map(k => [k, after[k]])), before);
  assert.ok(r.stdout.includes(`WROTE ${join(m.home, '.pact', 'scriptorium.html')}`), r.stdout);
});

test('C24: the page at its fixed path lists the harnesses the dry run would see, with the config\'s models, commands and tools', t => {
  const m = machine(t, MACHINE_FILES);
  const r = m.cli(['--builder', EXAMPLE]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const P = logic(readFileSync(join(m.home, '.pact', 'scriptorium.html'), 'utf8'));
  const rows = P.harnessList(P.initialState());
  const want = chooseHarnesses({ harnesses: installed(CONFIG, m.home), install: null, detected: new Set(['claude', 'codex', 'mine']), recorded: [] }).rows;
  assert.deepEqual(rows.map(x => [x.id, x.in, x.detected]), want.map(x => [x.id, x.in, x.detected]));
  assert.equal(rows.find(x => x.id === 'codex').models.planning, 'plan-x');
  const s = P.initialState();
  const claude = P.receives(s, 'claude').files.map(f => f.path);
  assert.deepEqual(claude.filter(p => p.includes('/commands/')), ['~/.claude/commands/finis.md', '~/.claude/commands/scriptorium.md']);
  assert.match(P.receives(s, 'claude').files[0].text, /Remove worktrees only through the cleaner/);
});

test('C24: a harness the record lists stays in the page\'s rows after its folder is gone', t => {
  // The record is read as the installer reads it: keys in any case, and no harnesses key for none.
  const record = key => JSON.stringify({ commit: 'abc', files: [], ...(key ? { [key]: [{ id: 'codex' }] } : {}) });
  const m = machine(t, { '.claude/keep': '', '.pact/install.json': record('Harnesses') });
  assert.deepEqual(machineData(m.home).data.rows, [{ id: 'claude', in: true, detected: true }, { id: 'codex', in: true, detected: false }]);
  assert.deepEqual(machineData(machine(t, { '.claude/keep': '', '.pact/install.json': record(null) }).home).findings, []);
});

for (const [name, files, says] of [
  ['a config.json that is not JSON', { '.pact/config.json': '{' }, /config\.json/],
  ['an own harness the installer refuses', { '.pact/config.json': JSON.stringify({ schema: 1, harnesses: { own: [{ ...OWN, rules: { path: '/etc/x.md' } }] } }) }, /harness-path/],
  ['a record that is not JSON', { '.pact/install.json': 'x' }, /install\.json/],
]) {
  test(`bad machine file: ${name} is a finding, and the page is still written with the known harnesses`, t => {
    const m = machine(t, { '.claude/keep': '', ...files });
    const r = m.cli(['--builder', EXAMPLE]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(r.stdout.split('\n').some(l => l.startsWith('FINDING harnesses') && says.test(l)), r.stdout);
    assert.ok(!r.stdout.includes('/etc/x.md'), 'no path from the file is printed');
    const P = logic(readFileSync(join(m.home, '.pact', 'scriptorium.html'), 'utf8'));
    assert.deepEqual(P.harnessList(P.initialState()).map(x => x.id), ['claude']);
  });
}

test('a page written with --out, and the committed page, read nothing from the machine', t => {
  const m = machine(t, MACHINE_FILES);
  const out = join(tempDir(t, 'pact-out-'), 'page.html');
  const r = m.cli(['--builder', EXAMPLE, '--out', out]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const text = readFileSync(out, 'utf8');
  assert.equal(logic(text).PACT.machine, null);
  assert.ok(!text.includes('My harness'));
  assert.equal(L.PACT.machine, null);
});

// The page's renderer is the installer's file, copied in at each build.
test('bad case: the installer\'s harness renderer changed makes the committed page out of date', t => {
  const root = tempDir(t, 'pact-render-root-');
  for (const d of ['claude', 'examples', 'familiars', 'gate', 'harnesses', 'builder', join('docs', 'brand')]) cpSync(join(REPO, d), join(root, d), { recursive: true, filter: s => !s.includes(join('gate', 'tests')) });
  assert.equal(buildPage(root, PAGE), PAGE, 'control');
  const p = join(root, 'gate', 'harness-render.mjs');
  const was = readFileSync(p, 'utf8');
  writeFileSync(p, was.replace('allow_implicit_invocation: false', 'allow_implicit_invocation: true'));
  assert.notEqual(buildPage(root, PAGE), PAGE);
});
