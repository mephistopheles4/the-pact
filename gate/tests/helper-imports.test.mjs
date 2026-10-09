// The helper import guard (#151, #140 S4): importing a test helper, or a gate
// core, touches no file and starts no process. Each one is imported in a child
// with the import trap armed at the scope `io`, which makes every node:fs and
// node:child_process call throw and records it, caught or not. The helpers are
// found on each run, every module under the tests folder outside fixtures/
// that isn't a test file, so a new helper is guarded without being listed.
// Reading the environment at import is allowed here; the core import guard
// (cores.test.mjs) holds the cores to the stricter scope as well.
// What it can't see: a read through node's own loader (a JSON import,
// createRequire), network calls, and work deferred past the driver's short
// wait. No helper does any of these today.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { childEnv } from './gate-run.mjs';
import { GATE } from './text.mjs';
import { tempDir } from './tree.mjs';

const TESTS = join(GATE, 'tests');
const TRAP = pathToFileURL(join(TESTS, 'fixtures', 'import-trap.mjs')).href;
const DRIVER = join(TESTS, 'fixtures', 'import-trap-driver.mjs');

/** Every helper module under the tests folder, outside its top-level fixtures/ folder, as a path relative to it. */
function helpers(dir = TESTS, top = true) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!(top && e.name === 'fixtures')) out.push(...helpers(p, false));
    } else if (/\.(?:mjs|cjs|js)$/.test(e.name) && !e.name.endsWith('.test.mjs')) out.push(relative(TESTS, p).split('\\').join('/'));
  }
  return out.sort();
}

/** The four gate cores, found in the gate folder: every -core.mjs but the install's decisions, which export no check (#153). */
function cores() {
  return readdirSync(GATE)
    .filter(f => f.endsWith('-core.mjs') && f !== 'install-core.mjs')
    .sort();
}

/**
 * Import `file` in a child with the trap armed at the scope `io`: the driver's
 * line (LOADED, TRAPPED, FAILED or NO-TRAP) and the exit code. A helper that
 * registers node:test hooks makes node print a test summary after the line,
 * so the line is found by its word, not by its place.
 */
function importUnderTrap(file) {
  const r = spawnSync(process.execPath, ['--import', TRAP, DRIVER, pathToFileURL(file).href, 'io'], { encoding: 'utf8', env: childEnv() });
  const line = (r.stdout ?? '').split(/\r?\n/).find(l => /^(?:LOADED|TRAPPED|FAILED|NO-TRAP)\b/.test(l)) ?? '';
  return { code: r.status, line, out: `${r.stdout}${r.stderr}` };
}

test('the helper import guard finds every helper and core it must guard', () => {
  const found = helpers();
  for (const f of ['text.mjs', 'tree.mjs', 'gate-files.mjs', 'payload.mjs', 'gate-run.mjs', 'install-harness.mjs', 'copy-list.mjs', 'cross-helpers.mjs', 'practice-score.mjs', 'settings-rules.mjs', 'tables.mjs']) {
    assert.ok(found.includes(f), f);
  }
  assert.ok(!found.some(f => f.startsWith('fixtures/')), found.join('\n'));
  assert.deepEqual(cores(), ['project-core.mjs', 'render-core.mjs', 'review-core.mjs', 'seam-a-core.mjs']);
});

for (const f of helpers()) {
  test(`the helper import guard: ${f} touches no file and starts no process when imported`, () => {
    const r = importUnderTrap(join(TESTS, ...f.split('/')));
    assert.match(r.line, /^LOADED /, r.out);
    assert.equal(r.code, 0, r.out);
  });
}

for (const f of cores()) {
  test(`the helper import guard: gate/${f} touches no file and starts no process when imported`, () => {
    const r = importUnderTrap(join(GATE, f));
    assert.equal(r.line, 'LOADED function', r.out);
    assert.equal(r.code, 0, r.out);
  });
}

// The Node install's modules that the runner imports (#153): its decisions and
// its file system module touch nothing until called.
for (const f of ['install-core.mjs', 'install-io.mjs']) {
  test(`the helper import guard: gate/${f} touches no file and starts no process when imported`, () => {
    const r = importUnderTrap(join(GATE, f));
    assert.equal(r.line, 'LOADED undefined', r.out);
    assert.equal(r.code, 0, r.out);
  });
}

// Planted helpers sit in a temp folder and import only node's own modules, so
// each reaches the trap the way a real helper's calls would.
test('control: a planted helper that touches nothing loads under the trap', t => {
  const p = join(tempDir(t, 'pact-helper-'), 'planted.mjs');
  writeFileSync(p, "import { join } from 'node:path';\nexport const where = join('a', 'b');\nconst planted = process.env.PATH;\n");
  const r = importUnderTrap(p);
  assert.equal(r.line, 'LOADED undefined', r.out);
  assert.equal(r.code, 0, r.out);
});

for (const [label, plant, trapped] of [
  ['reads a file', "import { readdirSync } from 'node:fs';\nexport const listed = readdirSync('.');\n", 'fs.readdirSync'],
  ['reads a file and catches the trap', "import { readFileSync } from 'node:fs';\nlet text = null;\ntry { text = readFileSync('x'); } catch {}\nexport { text };\n", 'fs.readFileSync'],
  ['reads a file through a lazy value it calls itself', "import { readdirSync } from 'node:fs';\nlet list = null;\nexport const agents = () => (list ??= readdirSync('.'));\nagents();\n", 'fs.readdirSync'],
  ['spawns a process', "import { spawnSync } from 'node:child_process';\nexport const found = spawnSync(process.execPath, ['-e', '']);\n", 'child_process.spawnSync'],
  ['looks up a program in a process and catches the trap', "import { execFileSync } from 'node:child_process';\nlet git = null;\ntry { git = execFileSync('git', ['--version']); } catch {}\nexport { git };\n", 'child_process.execFileSync'],
]) {
  test(`bad case: the helper import guard catches a helper that ${label} at import`, t => {
    const p = join(tempDir(t, 'pact-helper-'), 'planted.mjs');
    writeFileSync(p, plant);
    const r = importUnderTrap(p);
    assert.equal(r.code, 1, r.out);
    assert.match(r.line, /^TRAPPED /, r.out);
    assert.ok(r.line.split(' ').slice(1).includes(trapped), r.out);
  });
}

test('control: the scope io lets an environment read through, and the scope all traps it', t => {
  const p = join(tempDir(t, 'pact-helper-'), 'planted.mjs');
  writeFileSync(p, 'export const home = process.env.PATH;\n');
  assert.equal(importUnderTrap(p).line, 'LOADED undefined');
  const all = spawnSync(process.execPath, ['--import', TRAP, DRIVER, pathToFileURL(p).href], { encoding: 'utf8', env: childEnv() });
  assert.equal(all.status, 1, `${all.stdout}${all.stderr}`);
  assert.match(all.stdout, /^TRAPPED process\.env$/m);
});

test('bad case: the driver refuses a scope it does not know, exiting 2 with no LOADED line', t => {
  const p = join(tempDir(t, 'pact-helper-'), 'planted.mjs');
  writeFileSync(p, 'export const x = 1;\n');
  const r = spawnSync(process.execPath, ['--import', TRAP, DRIVER, pathToFileURL(p).href, 'none'], { encoding: 'utf8', env: childEnv() });
  assert.equal(r.status, 2, `${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /^USAGE no scope none$/m);
  assert.doesNotMatch(r.stdout, /^LOADED/m);
});
