// The table module (#140, T5): each rule seen to fail. Planted tables run in
// a child node --test from a temp folder, so a table that must fail fails
// there and is read back from the child's TAP; a malformed table must fail
// its file's load. A runner over an in-memory input stands in for a gate
// module, and its FAIL lines name real rule ids of gate/render.mjs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { moduleLiterals, moduleResult, problems, treeBytes } from './tables.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TABLES = pathToFileURL(join(HERE, 'tables.mjs')).href;

/** The planted file's head: a stand-in runner, and plants that trip the rules they name. */
const HEAD = `import { table, moduleResult } from ${JSON.stringify(TABLES)};
const fake = tree => {
  const s = tree['in.txt'];
  if (s === 'base') return moduleResult(0, 'RESULT: pass\\n');
  return moduleResult(1, s.slice('trip:'.length).split(',').map(i => 'FAIL ' + i + ': planted\\n').join('') + 'RESULT: fail\\n');
};
const base = () => ({ 'in.txt': 'base' });
const trip = s => tree => ({ ...tree, 'in.txt': 'trip:' + s });
const passing = () => moduleResult(0, 'RESULT: pass\\n');
const failing = () => moduleResult(1, 'FAIL edit-mark: planted\\nRESULT: fail\\n');
`;

/** Run a planted test file in a child; { status, out, results: Map<test name, 'ok' | 'not ok'> }. */
function planted(t, body) {
  const dir = mkdtempSync(join(tmpdir(), 'pact-tables-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'plant.test.mjs');
  writeFileSync(file, HEAD + body);
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], { cwd: dir, encoding: 'utf8', env });
  const results = new Map();
  for (const m of r.stdout.matchAll(/^(ok|not ok) \d+ - (.*)$/gm)) results.set(m[2], m[1]);
  return { status: r.status, out: r.stdout + r.stderr, results };
}

const expect = (r, want) => {
  for (const [name, verdict] of Object.entries(want)) assert.equal(r.results.get(name), verdict, `${name}\n${r.out}`);
};

// ------------------------------------------------------------ the tests a table makes

test('control: a good table passes its base, its row, and its base after the rows', t => {
  const r = planted(t, "table('good', { module: 'gate/render.mjs', base, run: fake, rows: [{ id: 'one', plant: trip('edit-mark'), fails: ['edit-mark'], says: /FAIL edit-mark/, why: 'control' }] });\n");
  assert.equal(r.status, 0, r.out);
  expect(r, { 'good: base passes': 'ok', 'good: one': 'ok', 'good: base passes after the rows': 'ok' });
});

test('bad case: a runner that always passes fails every row', t => {
  const r = planted(t, "table('always pass', { module: 'gate/render.mjs', base, run: passing, rows: [{ id: 'one', plant: trip('edit-mark'), fails: ['edit-mark'], why: 'w' }, { id: 'two', plant: trip('edit-op'), fails: ['edit-op'], why: 'w' }] });\n");
  assert.notEqual(r.status, 0, r.out);
  expect(r, { 'always pass: base passes': 'ok', 'always pass: one': 'not ok', 'always pass: two': 'not ok' });
});

test('bad case: a runner that always fails fails the base', t => {
  const r = planted(t, "table('always fail', { module: 'gate/render.mjs', base, run: failing, rows: [{ id: 'one', plant: trip('edit-mark'), fails: ['edit-mark'], why: 'w' }] });\n");
  assert.notEqual(r.status, 0, r.out);
  expect(r, { 'always fail: base passes': 'not ok', 'always fail: base passes after the rows': 'not ok' });
});

test('bad case: a row that also trips a second rule fails the equality check', t => {
  const r = planted(t, "table('second rule', { module: 'gate/render.mjs', base, run: fake, rows: [{ id: 'two-rules', plant: trip('edit-mark,edit-op'), fails: ['edit-mark'], why: 'w' }, { id: 'both-named', plant: trip('edit-mark,edit-op'), fails: ['edit-op', 'edit-mark'], why: 'w' }] });\n");
  expect(r, { 'second rule: two-rules': 'not ok', 'second rule: both-named': 'ok' });
});

test('bad case: a row whose says does not match fails', t => {
  const r = planted(t, "table('says', { module: 'gate/render.mjs', base, run: fake, rows: [{ id: 'wrong', plant: trip('edit-mark'), fails: ['edit-mark'], says: /no such text/, why: 'w' }, { id: 'right', plant: trip('edit-mark'), fails: ['edit-mark'], says: /planted/, why: 'w' }] });\n");
  expect(r, { 'says: wrong': 'not ok', 'says: right': 'ok' });
});

test('bad case: a runner that keeps state across calls fails the base after the rows', t => {
  const r = planted(t, "let calls = 0;\ntable('shared state', { module: 'gate/render.mjs', base, run: tree => (++calls > 2 ? failing() : fake(tree)), rows: [{ id: 'one', plant: trip('edit-mark'), fails: ['edit-mark'], why: 'w' }] });\n");
  expect(r, { 'shared state: base passes': 'ok', 'shared state: one': 'ok', 'shared state: base passes after the rows': 'not ok' });
});

// ------------------------------------------------------------ malformed tables fail their file's load

const GOOD_ROW = "{ id: 'one', plant: trip('edit-mark'), fails: ['edit-mark'], why: 'w' }";
const MALFORMED = [
  // [label, rows, the reason it names]
  ['an empty table', '[]', /the table has no rows/],
  ['a duplicate row id', `[${GOOD_ROW}, ${GOOD_ROW}]`, /row 2's id one repeats/],
  ['an odd row id', "[{ id: 'Not Plain', plant: trip('edit-mark'), fails: ['edit-mark'], why: 'w' }]", /row 1's id is not lower-case words joined by dashes/],
  ['an empty fails', "[{ id: 'one', plant: trip('edit-mark'), fails: [], why: 'w' }]", /row 1 names no rule it fails/],
  ['a no-op plant', "[{ id: 'one', plant: tree => tree, fails: ['edit-mark'], why: 'w' }]", /row 1's plant leaves the input unchanged/],
  ['a plant that writes the same bytes again', "[{ id: 'one', plant: tree => ({ ...tree, 'in.txt': 'base' }), fails: ['edit-mark'], why: 'w' }]", /row 1's plant leaves the input unchanged/],
  ['a row naming an id the module does not hold', "[{ id: 'one', plant: trip('no-such-rule'), fails: ['no-such-rule'], why: 'w' }]", /row 1 names the rule "no-such-rule", which gate\/render\.mjs does not hold/],
  ['a grimoire id the pinned check does not hold', "[{ id: 'one', plant: trip('grimoire/no-such-rule'), fails: ['grimoire/no-such-rule'], why: 'w' }]", /row 1 names the rule "grimoire\/no-such-rule", which the pinned check does not hold/],
  ['a row with no why', "[{ id: 'one', plant: trip('edit-mark'), fails: ['edit-mark'] }]", /row 1 gives no why/],
];

for (const [label, rows, reason] of MALFORMED) {
  test(`bad case: ${label} fails the file's load`, t => {
    const r = planted(t, `table('malformed', { module: 'gate/render.mjs', base, run: fake, rows: ${rows} });\n`);
    assert.notEqual(r.status, 0, r.out);
    assert.match(r.out, reason);
    assert.ok(![...r.results.keys()].some(n => n.startsWith('malformed: ')), `a malformed table registered a test\n${r.out}`);
  });
}

test('control: the same table with a good row loads, and a grimoire id the pinned check holds is accepted', t => {
  const r = planted(t, `table('malformed', { module: 'gate/render.mjs', base, run: fake, rows: [${GOOD_ROW}, { id: 'pinned', plant: trip('grimoire/keys'), fails: ['grimoire/keys'], why: 'w' }] });\n`);
  assert.equal(r.status, 0, r.out);
  expect(r, { 'malformed: one': 'ok', 'malformed: pinned': 'ok' });
});

// ------------------------------------------------------------ the pure parts

test('a rule id is looked for in the module and every gate file it imports, not in the tests', () => {
  const files = {
    'gate/a.mjs': "import { x } from './b.mjs';\nimport { y } from './tests/helpers.mjs';\nconst r = 'rule-a';\n",
    'gate/b.mjs': "import { z } from './c.mjs';\nexport const x = 'rule-b';\n",
    'gate/c.mjs': "export const z = 'rule-c';\n",
    'gate/tests/helpers.mjs': "export const y = 'rule-in-tests';\n",
  };
  const lits = moduleLiterals('gate/a.mjs', rel => files[rel]);
  for (const id of ['rule-a', 'rule-b', 'rule-c']) assert.ok(lits.has(id), id);
  assert.ok(!lits.has('rule-in-tests'));
  assert.deepEqual(
    problems('t', { module: 'gate/a.mjs', base: () => ({ f: 'a' }), run: () => null, rows: [{ id: 'r', plant: () => ({ f: 'b' }), fails: ['rule-c'], why: 'w' }] }, rel => files[rel]),
    [],
  );
});

test('seam A\'s rule ids are found through the files it imports', () => {
  const lits = moduleLiterals('gate/seam-a.mjs');
  assert.ok(lits.has('routing'), 'a rule seam-a.mjs holds');
});

test('a tree\'s bytes differ when a path or its bytes differ, and not when only key order does', () => {
  assert.ok(treeBytes({ a: 'x', b: 'y' }).equals(treeBytes({ b: 'y', a: 'x' })));
  assert.ok(!treeBytes({ a: 'x' }).equals(treeBytes({ a: 'y' })));
  assert.ok(!treeBytes({ a: 'x' }).equals(treeBytes({ b: 'x' })));
  assert.ok(!treeBytes({ 'a\0': '' }).equals(treeBytes({ a: '\0' })));
});

test('moduleResult reads the FAIL rule ids and the last line', () => {
  assert.deepEqual(moduleResult(1, 'note\nFAIL edit-mark: pact/config.json: x\nFAIL block-path: y\nRESULT: fail\n'), {
    code: 1,
    fails: ['edit-mark', 'block-path'],
    last: 'RESULT: fail',
    out: 'note\nFAIL edit-mark: pact/config.json: x\nFAIL block-path: y\nRESULT: fail\n',
  });
});
