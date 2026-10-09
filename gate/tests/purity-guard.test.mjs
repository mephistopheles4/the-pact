// One layer per test file (#140, T6). The install harness fails a test in an
// install-tier file that neither runs the install script nor skips itself, so
// a mixed file can't form again. Planted files import the real harness and run
// in a child node --test, since this file must not import it: it never
// installs, so it runs in fast. Also pins the files T6 split to their tiers.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { childEnv } from './gate-run.mjs';
import { tempDir } from './helpers.mjs';
import { INSTALL_SCRIPT, TEST_SUFFIX, pick } from './run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = pathToFileURL(join(HERE, 'install-harness.mjs')).href;

/** Run a planted install-tier test file in a child; { status, out, results: Map<test name, 'ok' | 'not ok'> }. */
function planted(t, body) {
  const dir = tempDir(t, 'pact-purity-');
  const file = join(dir, 'plant.test.mjs');
  writeFileSync(file, `import { test } from 'node:test';\nimport { spawnInstall } from ${JSON.stringify(HARNESS_URL)};\n${body}`);
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], { cwd: dir, encoding: 'utf8', env: childEnv() });
  const results = new Map();
  for (const m of r.stdout.matchAll(/^(ok|not ok) \d+ - (.*?)(?: # SKIP.*)?$/gm)) results.set(m[2], m[1]);
  return { status: r.status, out: r.stdout + r.stderr, results };
}

// A pwsh run whose command names the install script in a comment: counted as an
// install, at the cost of starting pwsh, never the script.
const COUNTED = `spawnInstall(['-NoProfile', '-NonInteractive', '-Command', ${JSON.stringify(`exit 0 # ${INSTALL_SCRIPT}`)}], { encoding: 'utf8' });`;

test('purity guard: a planted install-tier test that neither installs nor skips fails, naming the test', t => {
  const r = planted(t, "test('planted: does nothing', () => {});\n");
  assert.equal(r.status, 1, r.out);
  assert.equal(r.results.get('planted: does nothing'), 'not ok', r.out);
  assert.match(r.out, /purity guard: "planted: does nothing" is in an install-tier file but neither ran the install script nor skipped itself/, r.out);
});

test('purity guard: a planted test that calls t.skip() without installing passes', t => {
  const r = planted(t, "test('planted: skips', t => { t.skip('cannot plant here'); });\n");
  assert.equal(r.status, 0, r.out);
  assert.equal(r.results.get('planted: skips'), 'ok', r.out);
  assert.doesNotMatch(r.out, /purity guard/, r.out);
});

test('purity guard: control: a planted test that runs the install script through the harness passes, beside one that fails', t => {
  const r = planted(t, `test('planted: installs', () => { ${COUNTED} });\ntest('planted: does nothing', () => {});\n`);
  assert.equal(r.status, 1, r.out);
  assert.equal(r.results.get('planted: installs'), 'ok', r.out);
  assert.equal(r.results.get('planted: does nothing'), 'not ok', r.out);
});

test('purity guard: install() counts: a planted test that calls it passes, though the script it names is not there', t => {
  // A repo folder with no install script: pwsh exits at once, and the call still counts.
  const r = planted(t, `import { install } from ${JSON.stringify(HARNESS_URL)};\ntest('planted: calls install()', t => { const d = process.cwd(); install(d, d); });\n`);
  assert.equal(r.status, 0, r.out);
  assert.equal(r.results.get('planted: calls install()'), 'ok', r.out);
});

test('purity guard: each test is counted on its own, so an install in one test does not cover the next', t => {
  const r = planted(t, `test('planted: installs twice', () => { ${COUNTED} ${COUNTED} });\ntest('planted: then nothing', () => {});\n`);
  assert.equal(r.results.get('planted: installs twice'), 'ok', r.out);
  assert.equal(r.results.get('planted: then nothing'), 'not ok', r.out);
  assert.match(r.out, /purity guard: "planted: then nothing"/, r.out);
});

test('bad case: spawnInstall refuses a pwsh run that names no install script, so it never counts one', t => {
  const r = planted(t, "test('planted: not an install', () => { spawnInstall(['-NoProfile', '-NonInteractive', '-Command', 'exit 0'], { encoding: 'utf8' }); });\n");
  assert.equal(r.status, 1, r.out);
  assert.equal(r.results.get('planted: not an install'), 'not ok', r.out);
  assert.match(r.out, /spawnInstall: no argument names the install script/, r.out);
});

// ------------------------------------------------------------ the files T6 split, in their tiers

/** The tests folder as the runner reads it: its top-level test files, and every module's text. */
function realTree() {
  const names = readdirSync(HERE).filter(n => statSync(join(HERE, n)).isFile());
  const sources = new Map(names.filter(n => n.endsWith('.mjs')).map(n => [n, readFileSync(join(HERE, n), 'utf8')]));
  return { entries: names.filter(n => n.endsWith(TEST_SUFFIX)).map(name => ({ name, file: true })), sources };
}

// The larger part of each mixed file kept its name and never installs; the
// install cases went to the new files. Two strays went to settings and
// project-home.
const FAST = ['settings.test.mjs', 'builder-page.test.mjs', 'agent-settings.test.mjs', 'cross-install.test.mjs', 'project-home.test.mjs'];
const INSTALL = ['settings-install.test.mjs', 'builder-install.test.mjs', 'agent-settings-install.test.mjs', 'cross-script-install.test.mjs'];

test('one layer per file: the files T6 split run in fast, neither reaching the harness nor naming the install script; their install halves stay in the install tier', () => {
  const { entries, sources } = realTree();
  const fast = new Map(pick({ tier: 'fast', entries, sources }).files.map(f => [f.file, f.reason]));
  for (const f of FAST) assert.equal(fast.get(f), 'fast tier: does not run the install', f);
  const full = new Map(pick({ tier: 'full', entries, sources }).files.map(f => [f.file, f.reason]));
  for (const f of INSTALL) assert.match(full.get(f) ?? '', /^install tier: imports /, f);
  // This file itself never installs.
  assert.equal(fast.get('purity-guard.test.mjs'), 'fast tier: does not run the install');
});
