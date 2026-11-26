// PACT-105 C24 and C25, Scriptorium's harness section: the rows the page shows,
// what it saves into config.json's harnesses key, what it says each harness
// receives, held to the installer's own renderer, and the page the builder
// writes before any install. The page is not gate code; the installer stays the
// authority. PACT-111 C9 and C10 are named above their tests.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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
  const names = ['PACT', 'initialState', 'buildFiles', 'keepFolderKeys', 'harnessList', 'setHarnessIn', 'setHarnessModel', 'addHarness', 'removeHarness', 'receives', 'problems', 'touchedAgents', 'startState', 'changesOf', 'builderWith', 'setAgentModel', 'setTierEffort', 'dropTierKey', 'agentTable', 'tierTable', 'across', 'acrossTable', 'knownModels'];
  const got = vm.runInContext(`${scriptOf(page)}\n;({ ${names.join(', ')} });`, vm.createContext({ TextEncoder }));
  // A state stays the page realm's object, so each setter changes it in place.
  return Object.fromEntries(Object.entries(got).map(([k, v]) => [k, typeof v !== 'function' ? plain(v) : k === 'initialState' || k === 'startState' ? v : (...a) => plain(v(...a))]));
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
  const changed = L.keepFolderKeys(L.buildFiles(s), existing, s.harnesses, L.touchedAgents(s));
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

test('C24: the page at its fixed path starts each agent at the folder’s setting, and one set back to the pact’s own leaves the save', t => {
  const config = JSON.stringify({ schema: 1, agents: { scout: { model: 'my-model', effort: 'high' }, 'data-lens': { effort: 'low' } } });
  const m = machine(t, { '.claude/keep': '', '.pact/config.json': config });
  const r = m.cli(['--builder', EXAMPLE]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const P = logic(readFileSync(join(m.home, '.pact', 'scriptorium.html'), 'utf8'));
  const s = P.initialState();
  assert.deepEqual(plain(s.agents.scout), { model: 'my-model', effort: 'high' });
  const saved = () => P.keepFolderKeys(P.buildFiles(s), config, s.harnesses, P.touchedAgents(s));
  const agents = () => JSON.parse(saved().files[0].text).agents;
  assert.deepEqual(agents(), JSON.parse(config).agents);
  const { model, effort } = P.PACT.agents.find(a => a.name === 'scout');
  Object.assign(s.agents.scout, { model, effort });
  assert.deepEqual(agents(), { 'data-lens': { effort: 'low' } });
  // What the page shows each harness receives follows the same save.
  assert.match(P.receives(s, 'claude').files.find(f => f.path.endsWith('/scout.md')).text, /^model: haiku$/m);
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

// ------------------------------------------------------------ spec 0008 C9: one harness's agent models and tier efforts

/** The lines of `after` that differ from `before`, per file: { path: [new lines] }. */
function changedLines(before, after) {
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
  return Object.fromEntries([...after].filter(([p, text]) => text !== before.get(p)).map(([p, text]) => {
    const was = before.get(p).split('\n');
    const now = text.split('\n');
    assert.equal(now.length, was.length, p);
    return [p, now.filter((l, i) => l !== was[i])];
  }));
}
const tierId = (state, name) => state.parts.tiers.find(x => x.name === name).id;
const cellOf = (state, agent, id) => L.agentTable(state).rows.find(r => r.agent === agent).cells.find(c => c.id === id);
const tierOf = (state, id, name) => L.tierTable(state).find(x => x.id === id).rows.find(r => r.name === name);
const own = state => configOf(state).harnesses?.own;

// PACT-111 C9.
test('0008 C9: one agent’s model and one tier’s effort for one harness write only that harness’s own entry, and nothing else renders differently', t => {
  const s = L.initialState();
  // The rules' configuration notice holds the configuration's fingerprint, which any change moves.
  const renders = () => new Map([...installerRenders(t, s).rendered].map(([path, text]) => [path, text.replace(/^\*\*Configuration in effect\.\*\*.*$/m, '')]));
  const before = renders();
  assert.equal(L.setAgentModel(s, 'codex', 'data-lens', 'big-model'), null);
  L.setTierEffort(s, 'codex', tierId(s, 'Standard'), 'plan', 'low');
  // The known build effort stays with the key, which replaces the known one whole.
  assert.deepEqual(configOf(s).harnesses, { own: [{ id: 'codex', agentModels: { 'data-lens': 'big-model' }, tierEfforts: { standard: { build: 'medium', plan: 'low' } } }] });
  const changed = changedLines(before, renders());
  assert.deepEqual(Object.keys(changed).sort(), ['rendered/codex/agents/data-lens.toml', 'rendered/codex/rules.md']);
  assert.deepEqual(changed['rendered/codex/agents/data-lens.toml'], ['model = "big-model"']);
  assert.equal(changed['rendered/codex/rules.md'].length, 2, 'the tiers row and the workflow’s Plan row');
  for (const line of changed['rendered/codex/rules.md']) assert.match(line, /planning model, low/);
});

// PACT-111 C9.
test('0008 C9: the cells show what the install would write, and choosing the default or the table removes only that key', () => {
  const s = L.startState();
  const lens = () => cellOf(s, 'data-lens', 'antigravity');
  assert.deepEqual([lens().model, lens().dropped, lens().fallback, lens().own], ['pro', true, 'pro', null]);
  assert.deepEqual([cellOf(s, 'scout', 'claude').model, cellOf(s, 'scout', 'claude').effort], ['haiku', 'medium']);
  assert.equal(L.addHarness(s, { ...OWN, agentModels: { '*': 'every' } }), null);
  L.setAgentModel(s, 'mine', 'scout', 'one');
  assert.deepEqual([cellOf(s, 'scout', 'mine').model, cellOf(s, 'scout', 'mine').fallback], ['one', 'every']);
  L.removeHarness(s, 'mine');
  const std = () => tierOf(s, 'codex', 'Standard');
  assert.deepEqual([std().build.effective, std().build.own, std().build.table], ['medium', 'medium', 'high']);
  assert.deepEqual([std().plan.effective, std().plan.own], ['medium', null]);
  L.setAgentModel(s, 'antigravity', 'data-lens', 'flash');
  L.setAgentModel(s, 'antigravity', 'scout', 'pro');
  assert.deepEqual([lens().model, lens().own, lens().fallback], ['flash', 'flash', 'pro']);
  L.setAgentModel(s, 'antigravity', 'data-lens', null);
  assert.deepEqual(own(s), [{ id: 'antigravity', agentModels: { scout: 'pro' } }]);
  L.setTierEffort(s, 'codex', tierId(s, 'Standard'), 'build', null);
  assert.deepEqual([own(s)[1], std().build.effective, std().build.own], [{ id: 'codex', tierEfforts: { standard: null } }, 'high', null]);
});

// PACT-111 C9.
test('0008 C9: over a folder’s own entry, a change writes its one key and “as the default says” removes only that key', () => {
  const existing = JSON.stringify({ schema: 1, harnesses: { own: [{ id: 'codex', agentModels: { scout: 'a', 'data-lens': 'b' }, tierEfforts: { quick: { plan: 'high' }, standard: { plan: 'low' } } }] } });
  const s = L.initialState();
  L.setAgentModel(s, 'codex', 'reader-lens', 'c');
  L.setAgentModel(s, 'codex', 'scout', null);
  L.setTierEffort(s, 'codex', tierId(s, 'Standard'), 'build', 'xhigh');
  const kept = JSON.parse(L.keepFolderKeys(L.buildFiles(s), existing, L.changesOf(s)).files[0].text);
  assert.deepEqual(kept.harnesses.own[0].tierEfforts, { quick: { plan: 'high' }, standard: { plan: 'low', build: 'xhigh' } });
  assert.deepEqual(kept.harnesses.own[0].agentModels, { 'data-lens': 'b', 'reader-lens': 'c' });
});

// PACT-111 C9.
test('0008 C9: renaming a tier moves its key in every own entry, and the dry run takes it', t => {
  const s = L.initialState();
  L.setTierEffort(s, 'codex', tierId(s, 'Standard'), 'plan', 'low');
  L.setTierEffort(s, 'claude', tierId(s, 'Standard'), 'build', 'low');
  s.parts.tiers[1].name = 'Deep Work';
  assert.deepEqual(own(s).map(e => [e.id, Object.keys(e.tierEfforts)]), [['codex', ['deep-work']], ['claude', ['deep-work']]]);
  const { rendered } = installerRenders(t, s);
  assert.match(rendered.get('rendered/claude/rules.md'), /\| \*\*Deep Work\*\* \|[^\n]*executor model, low \|/);
  assert.deepEqual(L.problems(s).filter(p => p.level === 'error'), []);
});

// PACT-111 C9.
test('0008 C9: a rename or a dropped tier moves or removes the keys a folder holds that the page never saw', () => {
  const existing = JSON.stringify({ schema: 1, harnesses: { own: [{ id: 'codex', tierEfforts: { standard: { build: 'low' }, thorough: { plan: 'max' }, deep: { plan: 'high' } } }] } });
  const s = L.initialState();
  s.parts.tiers[1].name = 'Deep';
  s.parts.tiers.splice(2, 1);
  const kept = JSON.parse(L.keepFolderKeys(L.buildFiles(s), existing, L.changesOf(s)).files[0].text);
  assert.deepEqual(kept.harnesses, { own: [{ id: 'codex', tierEfforts: { deep: { build: 'low' } } }] });
  assert.equal(Object.hasOwn(configOf(s), 'harnesses'), false, 'with no key of theirs to move, nothing is written');
});

// PACT-111 C9.
test('0008 C9: an own key with no row of that tier is an error on its harness’s row, which removing the key clears', () => {
  const s = L.initialState();
  assert.equal(L.addHarness(s, { ...OWN, tierEfforts: { deepest: { plan: 'low' } } }), null);
  const errors = () => L.problems(s).filter(p => p.where === 'mine' && p.level === 'error');
  assert.match(errors()[0].text, /deepest/);
  assert.deepEqual(L.tierTable(s).find(x => x.id === 'mine').orphans, ['deepest']);
  L.dropTierKey(s, 'mine', 'deepest');
  assert.deepEqual(errors(), []);
});

// PACT-111 C9.
test('0008 C9: an agent the configuration gives a model shows it, locked, in every harness; a role does not lock', () => {
  const s = L.initialState();
  s.agents.scout.model = 'my-model';
  s.agents['data-lens'].model = 'planning';
  const row = name => L.agentTable(s).rows.find(r => r.agent === name).cells;
  assert.deepEqual(row('scout').map(c => [c.id, c.model, c.locked]), KNOWN.map(h => [h.id, 'my-model', 'set by the configuration']));
  assert.deepEqual(row('data-lens').map(c => c.locked), [null, null, null]);
});

// PACT-111 C9.
test('0008 C9: each harness’s model dropdowns offer its known models, and Antigravity’s also its three aliases', () => {
  const s = L.initialState();
  assert.deepEqual(L.knownModels(s, 'claude'), ['opus', 'sonnet', 'haiku']);
  assert.deepEqual(L.knownModels(s, 'antigravity'), ['flash', 'pro', 'flash_lite']);
  assert.deepEqual(cellOf(s, 'data-lens', 'antigravity').roles.map(o => o.model), ['gemini-4-neon-high', 'gemini-4-hydrogen-high', 'flash']);
});

// PACT-111 C9.
for (const [name, model] of [['two words', 'two words'], ['a model holding <effort>', 'x-<effort>'], ['nothing', '']]) {
  test(`bad agent model: ${name} is refused and nothing is written`, () => {
    const s = L.initialState();
    assert.match(L.setAgentModel(s, 'codex', 'scout', model) ?? '', /one word/);
    assert.equal(Object.hasOwn(configOf(s), 'harnesses'), false);
  });
}

/** A home whose pact folder holds the page's saved files, the way a save leaves it. */
function savedMachine(t, state) {
  const files = L.buildFiles(state);
  const builder = L.builderWith(null, state);
  return machine(t, {
    '.claude/keep': '',
    '.codex/keep': '',
    ...Object.fromEntries(files.filter(f => !f.agent).map(f => [`.pact/${f.path}`, f.text])),
    ...(builder.text ? { '.pact/builder.json': builder.text } : {}),
  });
}

// PACT-111 C9.
test('0008 C9: a page rebuilt from the saved configuration shows both, and saves them unchanged', t => {
  const s = L.initialState();
  L.setAgentModel(s, 'codex', 'data-lens', 'big-model');
  s.parts.tiers[1].name = 'Deep';
  L.setTierEffort(s, 'codex', tierId(s, 'Deep'), 'plan', 'low');
  const m = savedMachine(t, s);
  const r = m.cli(['--builder', join(m.home, '.pact', 'builder.json')]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const P = logic(readFileSync(join(m.home, '.pact', 'scriptorium.html'), 'utf8'));
  const again = P.startState();
  assert.equal(P.agentTable(again).rows.find(x => x.agent === 'data-lens').cells.find(c => c.id === 'codex').own, 'big-model');
  assert.equal(P.tierTable(again).find(x => x.id === 'codex').rows.find(x => x.name === 'Deep').plan.own, 'low');
  const config = readFileSync(join(m.home, '.pact', 'config.json'), 'utf8');
  const kept = P.keepFolderKeys(P.buildFiles(again), config, P.changesOf(again), P.touchedAgents(again));
  assert.deepEqual(JSON.parse(kept.files[0].text).harnesses, JSON.parse(config).harnesses);
});

// ------------------------------------------------------------ spec 0008 C10: across harnesses, and the overview page

/** What one harness's rendered files say, read here: the models line, each tier's cells and each agent's model and effort. */
function readColumn(rendered, id) {
  const lines = rendered.get(`rendered/${id}/rules.md`).split('\n');
  const table = lines.slice(lines.findIndex(l => /^\| Tier \|/.test(l)) + 2);
  const tiers = table.slice(0, table.findIndex(l => !l.startsWith('|'))).map(l => l.split('|').map(c => c.trim())).map(c => [c[1].replaceAll('*', ''), c.at(-3), c.at(-2)]);
  const agents = {};
  for (const [rel, text] of rendered) {
    const m = new RegExp(`^rendered/${id}/agents/(.+)\\.(md|toml)$`).exec(rel);
    if (!m) continue;
    const head = m[2] === 'toml' ? text.split('developer_instructions')[0] : text.split('\n---\n')[0];
    const model = (m[2] === 'toml' ? /^model = "(.*)"$/m : /^model: (.*)$/m).exec(head)?.[1] ?? 'no model';
    const effort = (m[2] === 'toml' ? /^model_reasoning_effort = "(.*)"$/m : /^effort: (.*)$/m).exec(head)?.[1];
    if (id === 'antigravity') assert.equal(effort, undefined, `${rel} writes no effort`);
    agents[m[1]] = `${model}, ${id === 'antigravity' ? 'effort dropped' : (effort ?? 'no effort')}`;
  }
  return { line: lines.find(l => l.startsWith('Here the planning model is ')), tiers, agents };
}

/** The across table's rows as { label: { harness id: cell } }. */
const byLabel = ({ heads, rows }) => Object.fromEntries(rows.map(r => [r.label, Object.fromEntries(heads.map((h, i) => [h.id, r.cells[i]]))]));

function holdsColumns(table, rendered) {
  const rows = byLabel(table);
  for (const { id } of KNOWN) {
    const want = readColumn(rendered, id);
    assert.ok(want.tiers.length && Object.keys(want.agents).length, `${id} has something to compare`);
    assert.equal(rows['Models line'][id], want.line, id);
    for (const [tier, plan, build] of want.tiers) assert.deepEqual([rows[`${tier}, Plan`][id], rows[`${tier}, Build`][id]], [plan, build], `${id} ${tier}`);
    for (const [agent, text] of Object.entries(want.agents)) assert.equal(rows[agent][id], text, `${id} ${agent}`);
  }
}

// PACT-111 C10.
test('0008 C10: the Across-harnesses section shows for each harness what the renderer writes for the same configuration', t => {
  const s = L.initialState();
  L.setAgentModel(s, 'codex', 'data-lens', 'big-model');
  L.setTierEffort(s, 'antigravity', tierId(s, 'Quick'), 'build', 'low');
  const table = L.acrossTable(L.across(s));
  assert.deepEqual(table.heads.map(h => h.id), KNOWN.map(h => h.id));
  holdsColumns(table, installerRenders(t, s).rendered);
  assert.equal(byLabel(table)['Standard, Build'].codex, 'executor model, medium');
  assert.equal(byLabel(table)['data-lens'].antigravity, 'pro, effort dropped');
});

const unescaped = s => s.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&amp;', '&');
/** The overview page's one table, as the across table's shape, a known harness's heading read back to its id. */
function overviewTable(html) {
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(r => [...r[1].matchAll(/<t[hd](?: [^>]*)?>([\s\S]*?)<\/t[hd]>/g)].map(c => unescaped(c[1])));
  const [head, ...body] = rows;
  return { heads: head.slice(1).map(text => ({ id: KNOWN.find(k => k.name === text)?.id ?? text })), rows: body.map(([label, ...cells]) => ({ label, cells })) };
}

/** A home whose configuration's tiers differ from the default, with an own harness and a home path in its install record. */
function overviewMachine(t) {
  const s = L.initialState();
  s.parts.tiers[0].name = 'Tiny';
  s.parts.tiers[0].build = 'planning model, max';
  assert.equal(L.addHarness(s, OWN), null);
  assert.equal(L.setAgentModel(s, 'codex', 'reader-lens', 'a<b>&c'), null);
  const m = savedMachine(t, s);
  writeTree(m.home, { '.pact/install.json': JSON.stringify({ commit: 'abc', files: [{ path: join(m.home, '.claude', 'CLAUDE.md'), sha256: 'x' }] }) });
  return { ...m, state: s };
}

// PACT-111 C10.
test('0008 C10: --overview writes the home configuration’s across table alone, with no path, and installs nothing', t => {
  const m = overviewMachine(t);
  const out = join(tempDir(t, 'pact-overview-'), 'overview.html');
  const before = tree(m.home);
  const r = m.cli(['--overview', out]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(tree(m.home), before);
  const html = readFileSync(out, 'utf8');
  const table = overviewTable(html);
  assert.deepEqual(table.heads.map(h => h.id), ['claude', 'codex', 'antigravity', 'mine']);
  const rows = byLabel(table);
  assert.equal(rows['Tiny, Build'].claude, 'planning model, max');
  assert.equal(rows['Standard, Build'].codex, 'executor model, medium');
  assert.equal(rows['data-lens'].antigravity, 'pro, effort dropped');
  assert.deepEqual(table.rows, L.acrossTable(L.across(m.state)).rows);
  holdsColumns(table, installerRenders(t, m.state).rendered);
  for (const piece of [m.home, m.home.replaceAll('\\', '/'), 'user-home', '~/', '.mine', 'RULES.md', 'My harness']) assert.ok(!html.includes(piece), piece);
  assert.ok(!/<script|<link|:\/\//i.test(html), 'the page loads nothing');
  assert.ok(html.includes('a&lt;b&gt;&amp;c') && !html.includes('a<b>&c'), 'a model name is text, never markup');
});

// PACT-111 C10.
test('0008 C10: with no config.json, --overview shows the pact’s default configuration', t => {
  const m = machine(t, { '.claude/keep': '' });
  const out = join(tempDir(t, 'pact-overview-'), 'overview.html');
  const r = m.cli(['--overview', out]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(byLabel(overviewTable(readFileSync(out, 'utf8')))['Standard, Build'], { claude: 'executor model, high', codex: 'executor model, medium', antigravity: 'executor model, high' });
});

// PACT-111 C10.
for (const [name, place, says] of [
  ['a git work tree', t => { const d = tempDir(t, 'pact-overview-repo-'); mkdirSync(join(d, '.git')); return join(d, 'o.html'); }, /git work tree/],
  ['an existing file', t => { const d = tempDir(t, 'pact-overview-'); writeTree(d, { 'o.html': 'kept' }); return join(d, 'o.html'); }, /new file/],
]) {
  test(`bad --overview: ${name} is refused and nothing is written`, t => {
    const m = machine(t, { '.claude/keep': '' });
    const out = place(t);
    const was = existsSync(out) ? readFileSync(out, 'utf8') : null;
    const r = m.cli(['--overview', out]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, says);
    assert.equal(existsSync(out) ? readFileSync(out, 'utf8') : null, was);
  });
}

// PACT-111 C10.
test('bad --overview: it takes no other flag', t => {
  const m = machine(t, { '.claude/keep': '' });
  const out = join(tempDir(t, 'pact-overview-'), 'o.html');
  for (const more of [['--builder', EXAMPLE], ['--check'], ['--texts'], ['--out', `${out}2`]]) assert.equal(m.cli(['--overview', out, ...more]).status, 2, more[0]);
  assert.ok(!existsSync(out));
});
