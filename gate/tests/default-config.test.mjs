// #183 T4a: the pact's default configuration and skill sources, outside the
// install. The default is generated from one preset by
// builder/default-config.mjs; the page saves the same files; the renderer, the
// builder and the page's shared checker refuse the same skills lists; and a
// person's own configuration renders as if no default existed. The install's
// side is in config-install.test.mjs.
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
import { check as renderCheck } from '../render-core.mjs';
import { REPO } from './text.mjs';
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
  const r = renderCheck([join(REPO, 'claude', 'CLAUDE.md'), out, home, ...(def ? [def] : [])]);
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

// #183 T4a C5: D4's bad cases, each refused alike by the page's checker, the renderer and the builder, with the same words.
{
  const entry = (over = {}) => ({ repo: 'someone/skills', commit: PIN, paths: ['skills/one'], ...over });
  const rows = [
    { id: 'not-a-list', skills: { repo: 'a/b' }, why: 'skills is a list' },
    { id: 'extra-key', skills: [entry({ ref: 'main' })], why: 'an entry holds repo, commit and paths only' },
    { id: 'no-commit', skills: [{ repo: 'a/b', paths: ['x'] }], why: 'every key is needed' },
    { id: 'repo-no-owner', skills: [entry({ repo: 'skills' })], why: 'repo is owner/name' },
    { id: 'repo-url', skills: [entry({ repo: 'github.com/a/b' })], why: 'a host is not owner/name' },
    { id: 'repo-twice-any-case', skills: [entry(), entry({ repo: 'Someone/Skills', paths: ['other'] })], why: 'one entry per repo, compared without case' },
    { id: 'short-commit', skills: [entry({ commit: PIN.slice(1) })], why: 'a full 40-hex commit' },
    { id: 'upper-commit', skills: [entry({ commit: PIN.toUpperCase() })], why: 'lowercase hex only' },
    { id: 'branch-commit', skills: [entry({ commit: 'main' })], why: 'a branch is no pin' },
    { id: 'no-paths', skills: [entry({ paths: [] })], why: 'an entry names at least one path' },
    { id: 'dot-dot', skills: [entry({ paths: ['skills/../x'] })], why: 'no .. segment' },
    { id: 'dot', skills: [entry({ paths: ['./x'] })], why: 'no . segment' },
    { id: 'absolute', skills: [entry({ paths: ['/x'] })], why: 'an empty first segment is an absolute path' },
    { id: 'backslash', skills: [entry({ paths: ['skills\\x'] })], why: 'a backslash is no segment character' },
    { id: 'hidden-name', skills: [entry({ paths: ['skills/.x'] })], why: 'the name does not start with a dot' },
    { id: 'dash-name', skills: [entry({ paths: ['skills/-x'] })], why: 'the name does not start with a dash' },
    { id: 'name-twice-any-case', skills: [entry({ paths: ['a/x', 'b/X'] })], why: 'two paths that would install under one name' },
    { id: 'too-many', skills: [entry({ paths: Array.from({ length: 101 }, (_, i) => `s/k${i}`) })], why: 'at most 100 paths' },
  ];
  const good = [entry({ paths: ['skills/one', 'skills/two'] }), entry({ repo: 'other/more', commit: 'b'.repeat(40), paths: ['three'] })];
  const builderWith = (t, skills) => {
    const dir = tempDir(t, 'pact-default-builder-');
    writeFileSync(join(dir, 'builder.json'), JSON.stringify({ schema: 1, skills }));
    return join(dir, 'builder.json');
  };
  const verdicts = (t, skills) => ({
    page: skillsProblems(skills),
    renderer: render(t, homeWith(t, { schema: 1, skills })).lines.filter(l => l.startsWith('FAIL config-skills')).map(l => l.replace(/^FAIL config-skills: pact\/config\.json: /, '')),
    builder: checkBuilder(REPO, builderWith(t, skills)).refusals.filter(m => /^skills/.test(m)),
  });
  test('skills checks: a good list passes all three', t => {
    assert.deepEqual(verdicts(t, good), { page: [], renderer: [], builder: [] });
    assert.equal(render(t, homeWith(t, { schema: 1, skills: good })).failed, false);
  });
  for (const r of rows) {
    test(`skills checks: ${r.id}`, t => {
      const v = verdicts(t, r.skills);
      assert.ok(v.page.length, `${r.why}: the page's checker passes it`);
      assert.deepEqual(v.renderer, v.page, `${r.why}: the renderer differs`);
      assert.deepEqual(v.builder, v.page, `${r.why}: the builder differs`);
    });
  }
  test('skills checks: a good list passes all three after the rows', t => assert.deepEqual(verdicts(t, good), { page: [], renderer: [], builder: [] }));
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
