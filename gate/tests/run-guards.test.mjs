// Guards over the real tree for the test runner (#140), each with a planted
// bad case it is seen to catch. Guard 1: the full tier is every top-level test
// file, checked against a listing this file builds itself. Guard 3: the
// install smoke file exists and is in the install tier. This file imports
// nothing from the runner: it runs the runner's --list mode as a child.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tempDir } from './helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SMOKE = 'install-smoke.test.mjs';
const HARNESS = ['install', 'harness.mjs'].join('-');

/** The runner's --list output for a tier in `dir`, as { names, reasons }; throws unless it exits 0. */
function listed(dir, tier) {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [join(dir, 'run.mjs'), tier, '--list'], { env, encoding: 'utf8', timeout: 60_000 });
  if (r.status !== 0) throw new Error(`run.mjs ${tier} --list exited ${r.status}`);
  const rows = r.stdout
    .split('\n')
    .filter(Boolean)
    .map(l => l.split('\t'));
  const reasons = new Map(rows.map(([p, why]) => [p.replace(/^gate\/tests\//, ''), why]));
  return { names: [...reasons.keys()], reasons };
}

/** Guard 1: the top-level test files, by a plain listing, that the full tier leaves out or adds. */
export function fullTierGaps(dir) {
  const plain = readdirSync(dir)
    .filter(n => n.endsWith('.test.mjs'))
    .sort();
  const full = listed(dir, 'full').names;
  return { missing: plain.filter(n => !full.includes(n)), extra: full.filter(n => !plain.includes(n)) };
}

/** Guard 3: what is wrong with the smoke file, or [] when it exists and is in the install tier. */
export function smokeProblems(dir) {
  if (!existsSync(join(dir, SMOKE))) return ['the smoke file is missing'];
  const out = [];
  const why = listed(dir, 'full').reasons.get(SMOKE) ?? '';
  if (!why.startsWith('install tier')) out.push(`the full tier gives the smoke file as "${why}", not the install tier`);
  if (listed(dir, 'fast').names.includes(SMOKE)) out.push('the fast tier runs the smoke file');
  return out;
}

/** A planted tests folder: the runner, the copy list and `files`. */
function plantDir(t, files) {
  const dir = tempDir(t, 'pact-guard-');
  for (const f of ['run.mjs', 'copy-list.mjs']) copyFileSync(join(HERE, f), join(dir, f));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

const PASSING = "import { test } from 'node:test';\ntest('p', () => {});\n";
const SMOKE_SRC = `import '${'./' + HARNESS}';\n${PASSING}`;

test('guard 1: the full tier is every top-level test file in the real tree', () => {
  const gaps = fullTierGaps(HERE);
  assert.deepEqual(gaps, { missing: [], extra: [] });
  assert.ok(readdirSync(HERE).filter(n => n.endsWith('.test.mjs')).length > 30, 'the listing found the real test files');
});

test('guard 1 catches a narrowed full-tier filter in the runner', t => {
  const dir = plantDir(t, { 'a.test.mjs': PASSING, 'b.test.mjs': PASSING, 'c.test.mjs': PASSING });
  assert.deepEqual(fullTierGaps(dir), { missing: [], extra: [] });
  const src = readFileSync(join(dir, 'run.mjs'), 'utf8');
  const anchor = '.filter(e => e.name.endsWith(TEST_SUFFIX))';
  assert.ok(src.includes(anchor), 'the plant found its anchor in the runner');
  writeFileSync(join(dir, 'run.mjs'), src.replace(anchor, ".filter(e => e.name.endsWith(TEST_SUFFIX) && !e.name.startsWith('b'))"));
  assert.deepEqual(fullTierGaps(dir), { missing: ['b.test.mjs'], extra: [] });
});

test('guard 3: the smoke file exists in the real tree and is in the install tier', () => {
  assert.deepEqual(smokeProblems(HERE), []);
});

test('guard 3 catches a missing smoke file, and one outside the install tier', t => {
  const good = plantDir(t, { 'a.test.mjs': PASSING, [SMOKE]: SMOKE_SRC, [HARNESS]: '' });
  assert.deepEqual(smokeProblems(good), []);
  const missing = plantDir(t, { 'a.test.mjs': PASSING, [HARNESS]: '' });
  assert.deepEqual(smokeProblems(missing), ['the smoke file is missing']);
  const outside = plantDir(t, { 'a.test.mjs': PASSING, [SMOKE]: PASSING, [HARNESS]: '' });
  assert.deepEqual(smokeProblems(outside), ['the full tier gives the smoke file as "fast tier", not the install tier', 'the fast tier runs the smoke file']);
});

test('the runner\'s own test files are in the fast tier, so fast runs them', () => {
  const fast = listed(HERE, 'fast').names;
  for (const f of ['run.test.mjs', 'run-guards.test.mjs']) assert.ok(fast.includes(f), f);
});
