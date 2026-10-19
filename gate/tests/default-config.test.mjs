// The pact's default configuration and skill sources, outside the install
// (ADR 0094). The default is generated from one preset by the generator; the
// page saves the same files; the renderer, the builder and the page's shared
// checker refuse the same skills lists; and a person's own configuration
// renders as if no default existed. The install's side is in the install-tier
// configuration tests.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { buildPage, checkBuilder } from '../../builder/build.mjs';
import { DEFAULT_DIR_REL, DEFAULT_PRESET_REL, defaultFiles, defaultUpToDate } from '../../builder/default-config.mjs';
import { skillsProblems } from '../../builder/parts.mjs';
import { DEFAULT_CONFIG_DIR, DEFAULT_CONFIG_NAME } from '../install-core.mjs';
import { runCore } from './gate-run.mjs';
import { REPO, assertFails, assertPasses, moduleResult } from './text.mjs';
import { tempDir } from './tree.mjs';

const PAGE = readFileSync(join(REPO, 'builder', 'scriptorium.html'), 'utf8');
const SCRIPT_RE = /<script\b[^>]*>([\s\S]*?)<\/script>/i;
const PIN = 'a'.repeat(40);
const SKILLS = [{ repo: 'someone/skills', commit: PIN, paths: ['skills/one', 'skills/two'] }, { repo: 'other/more', commit: 'b'.repeat(40), paths: ['three'] }];
const SIX = ['spec-driven-development', 'incremental-implementation', 'test-driven-development', 'code-review-and-quality', 'shipping-and-launch', 'documentation-and-adrs'];

/** A throwaway clone-shaped root holding what the builder and the generator read, with `mutate` applied. */
function root(t, mutate = () => {}) {
  const r = tempDir(t, 'pact-default-root-');
  for (const d of ['claude', 'examples', 'familiars', join('docs', 'brand'), 'builder']) cpSync(join(REPO, d), join(r, d), { recursive: true });
  cpSync(join(REPO, 'gate'), join(r, 'gate'), { recursive: true, filter: s => !s.includes(join('gate', 'tests')) });
  mutate(r);
  return r;
}

/** Add `skills` to the default preset under `r`. */
const withPresetSkills = skills => r => {
  const p = join(r, DEFAULT_PRESET_REL);
  writeFileSync(p, `${JSON.stringify({ ...JSON.parse(readFileSync(p, 'utf8')), skills }, null, 2)}\n`);
};

/** Run the page's script in a fresh context, then `expr`, and hand back its JSON. */
const onPage = (page, expr) => JSON.parse(vm.runInContext(`${SCRIPT_RE.exec(page)[1]}\n;JSON.stringify(${expr})`, vm.createContext({})));

/** Render the pact's source against `home`, with the default folder `def` when given. */
function render(t, home, def) {
  const out = tempDir(t, 'pact-default-out-');
  const r = runCore('render', [join(REPO, 'claude', 'CLAUDE.md'), out, home, ...(def ? [def] : [])]);
  let bytes = null;
  try {
    bytes = readFileSync(join(out, 'CLAUDE.md'));
  } catch {}
  return { ...r, bytes };
}

/** A Claude home whose pact/config.json holds `doc`. */
function homeWith(t, doc) {
  const h = tempDir(t, 'pact-default-home-');
  mkdirSync(join(h, 'pact'));
  writeFileSync(join(h, 'pact', 'config.json'), JSON.stringify(doc));
  return h;
}

// #183 T4a C3
test('the committed default is what the generator builds from the preset, and the installer reads it where the generator writes it', () => {
  assert.equal(DEFAULT_CONFIG_DIR, DEFAULT_DIR_REL);
  assert.equal(defaultUpToDate(REPO), true, 'run node builder/default-config.mjs');
  assert.equal(DEFAULT_CONFIG_NAME, JSON.parse(readFileSync(join(REPO, DEFAULT_PRESET_REL), 'utf8')).title, "the dry run names the default by the preset's title");
});

// #183 T4a C3
test('bad case: a stale copy of the default fails the generator\'s --check, and the generator rebuilds it', t => {
  const r = root(t);
  const gen = args => spawnSync(process.execPath, [join(r, 'builder', 'default-config.mjs'), ...args], { encoding: 'utf8' });
  assert.equal(gen(['--check']).status, 0, 'a copied root starts up to date');
  const block = join(r, DEFAULT_DIR_REL, 'blocks', 'workflow.md');
  writeFileSync(block, readFileSync(block, 'utf8').replace('| Plan |', '| Plan, edited |'));
  const stale = gen(['--check']);
  assert.equal(stale.status, 1, stale.stdout + stale.stderr);
  assert.match(stale.stdout, /^builder\/default-config is out of date: run node builder\/default-config\.mjs$/m);
  assert.equal(defaultUpToDate(r), false);
  assert.equal(gen([]).status, 0);
  assert.equal(gen(['--check']).status, 0, 'the rebuild leaves it up to date');
  // A stray file is stale too: the kit would install any block beside the default's.
  writeFileSync(join(r, DEFAULT_DIR_REL, 'blocks', 'tiers.md'), 'stray\n');
  assert.equal(gen(['--check']).status, 1, 'a stray block passes --check');
  assert.equal(gen([]).status, 0);
  assert.equal(gen(['--check']).status, 0, 'the rebuild removes the stray block');
});

// #183 T4a C4: the page, set to the preset taken whole, saves what the generator writes, skills included.
test('the page saves for the default preset exactly the files the generator writes, with and without skills', t => {
  for (const r of [REPO, root(t, withPresetSkills(SKILLS))]) {
    const page = buildPage(r, PAGE);
    const saved = onPage(page, `(() => { const s = initialState(); const p = PACT.presets.find(p => p.id === 'level-3-full'); takePreset(s, p, presetPicks(p)); return buildFiles(s); })()`);
    const want = defaultFiles(r).map(f => ({ path: `pact/${f.path}`, text: f.text }));
    assert.deepEqual(saved.map(f => ({ path: f.path, text: f.text })), want);
  }
  assert.deepEqual(JSON.parse(defaultFiles(root(t, withPresetSkills(SKILLS)))[0].text).skills, SKILLS);
});

// #183 T4a C1: the default's workflow carries the six skills in its Skills column.
test('with no configuration of the person\'s, the default renders, and its workflow names the six skills in the "Skills, and when" column', t => {
  const r = render(t, tempDir(t, 'pact-default-home-'), join(REPO, DEFAULT_CONFIG_DIR));
  assert.equal(r.failed, false, r.lines.join('\n'));
  assert.match(r.lines.join('\n'), /^CONFIG default [0-9a-f]{64}$/m);
  const text = r.bytes.toString('utf8');
  const header = text.split('\n').find(l => l.startsWith('| Stage |'));
  const col = header.split('|').map(c => c.trim()).indexOf('Skills, and when');
  assert.ok(col > 0, header);
  const cells = text.split('\n').filter(l => /^\| (Plan|Design|Build|Test|Deploy|Maintain) \|/.test(l)).map(l => l.split('|')[col]).join(' ');
  for (const s of SIX) assert.ok(cells.includes(`\`${s}\``), `${s} is not in the Skills column`);
});

// #183 T4a C2: a person's configuration wins whole; the default is never merged in.
test('with a person\'s configuration, the render is the same whether or not the default is there to read', t => {
  const h = homeWith(t, { schema: 1, settings: { 'usage-pause': 90 } });
  const without = render(t, h);
  const withDefault = render(t, h, join(REPO, DEFAULT_CONFIG_DIR));
  assert.equal(without.failed, false, without.lines.join('\n'));
  assert.deepEqual(withDefault.lines, without.lines);
  assert.deepEqual(withDefault.bytes, without.bytes);
  assert.match(without.lines.join('\n'), /^CONFIG user [0-9a-f]{64}$/m);
});

// #183 C1: the default folder the installer stages is read under the renderer's read rules; a default that can't be read refuses, and never falls back to the pact's plain text.
{
  const base = () => ({ def: join(REPO, DEFAULT_CONFIG_DIR) });
  const run = (d, t) => {
    const r = render(t, tempDir(t, 'pact-default-home-'), d.def);
    if (r.failed) assert.equal(r.bytes, null, 'a refused render writes no rules file');
    return moduleResult(r.code, r.stdout);
  };
  const emptyDir = t => tempDir(t, 'pact-default-empty-');
  const rows = [
    { id: 'missing', plant: () => ({ def: null }), fails: ['default-config'], says: /the pact's default configuration is missing/, why: 'no config.json in the default folder' },
    { id: 'block-missing', plant: () => ({ def: 'block' }), fails: ['block-file'], says: /builder\/default-config\/blocks\/workflow\.md/, why: 'the default names a block its folder does not hold, read under the default folder' },
  ];
  const resolve = (d, t) => {
    if (d.def === null) return { def: emptyDir(t) };
    if (d.def === 'block') {
      const dir = emptyDir(t);
      cpSync(join(REPO, DEFAULT_CONFIG_DIR, 'config.json'), join(dir, 'config.json'));
      return { def: dir };
    }
    return d;
  };
  test('default folder: base passes', t => assertPasses(run(resolve(base(), t), t)));
  for (const r of rows) test(`default folder: ${r.id}`, t => assertFails(run(resolve(r.plant(base()), t), t), r.fails, r.says));
  test('default folder: base passes after the rows', t => assertPasses(run(resolve(base(), t), t)));
}

// #183 C5: D4's bad cases, each refused by the renderer (config-skills), and alike, in the same words, by the page's checker and the builder.
{
  const entry = (over = {}) => ({ repo: 'someone/skills', commit: PIN, paths: ['skills/one'], ...over });
  const withSkills = skills => doc => ({ ...doc, skills });
  // The base names exactly 100 paths, the most D4 allows.
  const base = () => ({ schema: 1, skills: [entry({ paths: Array.from({ length: 98 }, (_, i) => `skills/k${i}`) }), entry({ repo: 'other/more', commit: 'b'.repeat(40), paths: ['three', 'four'] })] });
  const builderWith = (t, skills) => {
    const dir = tempDir(t, 'pact-default-builder-');
    writeFileSync(join(dir, 'builder.json'), JSON.stringify({ schema: 1, skills }));
    return join(dir, 'builder.json');
  };
  const run = (doc, t) => {
    const r = render(t, homeWith(t, doc));
    const page = skillsProblems(doc.skills);
    const renderer = r.lines.filter(l => l.startsWith('FAIL config-skills: ')).map(l => l.replace(/^FAIL config-skills: pact\/config\.json: /, ''));
    const builder = checkBuilder(REPO, builderWith(t, doc.skills)).refusals.filter(m => /^skills/.test(m));
    assert.deepEqual(renderer, page, "the renderer's words differ from the page's checker");
    assert.deepEqual(builder, page, "the builder's words differ from the page's checker");
    return moduleResult(r.code, r.stdout);
  };
  const rows = [
    { id: 'not-a-list', plant: withSkills({ repo: 'a/b' }), fails: ['config-skills'], why: 'skills is a list' },
    { id: 'extra-key', plant: withSkills([entry({ ref: 'main' })]), fails: ['config-skills'], why: 'an entry holds repo, commit and paths only' },
    { id: 'no-commit', plant: withSkills([{ repo: 'a/b', paths: ['x'] }]), fails: ['config-skills'], why: 'every key is needed' },
    { id: 'repo-no-owner', plant: withSkills([entry({ repo: 'skills' })]), fails: ['config-skills'], why: 'repo is owner/name' },
    { id: 'repo-url', plant: withSkills([entry({ repo: 'github.com/a/b' })]), fails: ['config-skills'], why: 'a host is not owner/name' },
    { id: 'repo-owner-dash', plant: withSkills([entry({ repo: '-someone/skills' })]), fails: ['config-skills'], why: 'an owner a git command could read as an option' },
    { id: 'repo-only-dots', plant: withSkills([entry({ repo: 'someone/..' })]), fails: ['config-skills'], why: 'a name of only dots is no repo' },
    { id: 'repo-dot-git', plant: withSkills([entry({ repo: 'someone/skills.GIT' })]), fails: ['config-skills'], why: 'a .git ending would let one repo pass as two' },
    { id: 'repo-twice-any-case', plant: withSkills([entry(), entry({ repo: 'Someone/Skills', paths: ['other'] })]), fails: ['config-skills'], why: 'one entry per repo, compared without case' },
    { id: 'short-commit', plant: withSkills([entry({ commit: PIN.slice(1) })]), fails: ['config-skills'], why: 'a full 40-hex commit' },
    { id: 'upper-commit', plant: withSkills([entry({ commit: PIN.toUpperCase() })]), fails: ['config-skills'], why: 'lowercase hex only' },
    { id: 'branch-commit', plant: withSkills([entry({ commit: 'main' })]), fails: ['config-skills'], why: 'a branch is no pin' },
    { id: 'no-paths', plant: withSkills([entry({ paths: [] })]), fails: ['config-skills'], why: 'an entry names at least one path' },
    { id: 'dot-dot', plant: withSkills([entry({ paths: ['skills/../x'] })]), fails: ['config-skills'], why: 'no .. segment' },
    { id: 'dot', plant: withSkills([entry({ paths: ['./x'] })]), fails: ['config-skills'], why: 'no . segment' },
    { id: 'absolute', plant: withSkills([entry({ paths: ['/x'] })]), fails: ['config-skills'], why: 'an empty first segment is an absolute path' },
    { id: 'backslash', plant: withSkills([entry({ paths: ['skills\\x'] })]), fails: ['config-skills'], why: 'a backslash is no segment character' },
    { id: 'inner-dash', plant: withSkills([entry({ paths: ['-skills/x'] })]), fails: ['config-skills'], why: 'no segment a git command could read as an option' },
    { id: 'hidden-name', plant: withSkills([entry({ paths: ['skills/.x'] })]), fails: ['config-skills'], why: 'the name does not start with a dot' },
    { id: 'dash-name', plant: withSkills([entry({ paths: ['skills/-x'] })]), fails: ['config-skills'], why: 'the name does not start with a dash' },
    { id: 'name-twice-any-case', plant: withSkills([entry({ paths: ['a/x', 'b/X'] })]), fails: ['config-skills'], why: 'two paths that would install under one name' },
    { id: 'too-many', plant: doc => ({ ...doc, skills: [...doc.skills, entry({ repo: 'third/one', paths: ['one-more'] })] }), fails: ['config-skills'], says: /skills names more than 100 paths in all/, why: 'at most 100 paths, across entries' },
  ];
  test('skills checks: base passes', t => assertPasses(run(base(), t)));
  for (const r of rows) test(`skills checks: ${r.id}`, t => assertFails(run(r.plant(base()), t), r.fails, r.says));
  test('skills checks: base passes after the rows', t => assertPasses(run(base(), t)));
}

// #183 T4a C7
test('the page loads a builder file\'s skills, and saves them unchanged in builder.json and config.json', t => {
  const dir = tempDir(t, 'pact-default-builder-');
  const file = join(dir, 'builder.json');
  writeFileSync(file, JSON.stringify({ schema: 1, skills: SKILLS }));
  assert.deepEqual(checkBuilder(REPO, file).refusals, []);
  const out = onPage(buildPage(REPO, PAGE, file), `(() => { const s = initialState(); return { kept: JSON.parse(builderWith(null, s).text).skills, config: JSON.parse(buildFiles(s).find(f => f.path === 'pact/config.json').text).skills, problems: problems(s) }; })()`);
  assert.deepEqual(out.kept, SKILLS);
  assert.deepEqual(out.config, SKILLS);
  assert.deepEqual(out.problems, []);
});

// #183 T4a C8: D12's line in AGENTS.md names every path that changes the default.
test('AGENTS.md routes a change to the default through the sensitive route, naming each path', () => {
  const agents = readFileSync(join(REPO, 'AGENTS.md'), 'utf8');
  const line = agents.split(/\n(?=- )/).map(l => l.replace(/\s+/g, ' ')).find(l => l.includes('builder/default-config/') && l.includes('sensitive route'));
  assert.ok(line, 'no AGENTS.md line names builder/default-config/');
  for (const p of [DEFAULT_PRESET_REL, 'builder/default-config/', 'builder/default-config.mjs', 'cloud-sessions/pin-floor', 'sensitive route', 'security pair']) assert.ok(line.includes(p), `D12's line leaves out ${p}`);
});
