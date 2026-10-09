// The gate cores (#155): render, seam A, project and review each split into
// gate/<m>-core.mjs, which exports check(argv) and returns { lines, failed },
// and gate/<m>.mjs, the thin wrapper the install runs. These tests hold the
// split to its rules (#140, S4): a core does nothing when imported, never
// prints, exits or leaves work behind, and each wrapper is only its command
// line. The wrapper cases below fill the cells today's child-run tests leave
// empty; the others are named on #155.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { GATE, REPO, copyGate, failRules, lastLine, plantModule, tempDir } from './helpers.mjs';

const MODULES = ['project', 'render', 'review', 'seam-a'];
const TRAP = pathToFileURL(join(GATE, 'tests', 'fixtures', 'import-trap.mjs')).href;
const DRIVER = join(GATE, 'tests', 'fixtures', 'import-trap-driver.mjs');

function childEnv() {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  return env;
}

/** Import one module in a child with the trap armed: its one line, LOADED or TRAPPED. */
function importUnderTrap(file) {
  const r = spawnSync(process.execPath, ['--import', TRAP, DRIVER, pathToFileURL(file).href], { encoding: 'utf8', env: childEnv() });
  return { code: r.status, line: lastLine(r.stdout ?? '') ?? '', out: `${r.stdout}${r.stderr}` };
}

// ------------------------------------------------------------ the core import guard

test('the core import guard: the gate holds exactly the four cores', () => {
  assert.deepEqual(
    readdirSync(GATE)
      .filter(f => f.endsWith('-core.mjs'))
      .sort(),
    MODULES.map(m => `${m}-core.mjs`),
  );
});

for (const m of MODULES) {
  test(`the core import guard: ${m}-core.mjs touches no file, process, environment or OS user detail when imported`, () => {
    const r = importUnderTrap(join(GATE, `${m}-core.mjs`));
    assert.equal(r.line, 'LOADED function', r.out);
    assert.equal(r.code, 0, r.out);
  });
}

/** A copy of the gate with `plant` appended to module `m`'s core, imported under the trap. */
function plantedImport(t, m, plant) {
  const g = copyGate(tempDir(t, 'pact-cores-'));
  const p = join(g, `${m}-core.mjs`);
  writeFileSync(p, `${readFileSync(p, 'utf8')}${plant}\n`);
  return importUnderTrap(p);
}

test('control: an unplanted copy of each core loads under the trap', t => {
  for (const m of MODULES) assert.equal(plantedImport(t, m, '').line, 'LOADED function', m);
});

// Each plant uses a name the core already imports, so it reaches the trap the
// way the core's own calls would: through its named imports.
for (const [label, m, plant, trapped] of [
  ['reads a file', 'render', "readdirSync('.');", 'fs.readdirSync'],
  ['reads a file and catches the trap', 'seam-a', "try { readFileSync('AGENTS.md'); } catch {}", 'fs.readFileSync'],
  ['reads a file in a promise callback', 'render', "Promise.resolve().then(() => readdirSync('.'));", 'fs.readdirSync'],
  ['starts a process', 'seam-a', "spawnSync(process.execPath, ['-e', '']);", 'child_process.spawnSync'],
  ['reads an environment variable', 'review', 'const planted = process.env.HOME;', 'process.env'],
  ['reads the home folder through os.homedir', 'project', 'homedir();', 'os.homedir'],
  ['reads the OS user and catches the trap', 'project', 'try { userInfo(); } catch {}', 'os.userInfo'],
  ['reads the host name', 'render', "import { hostname as plantedHost } from 'node:os';\nplantedHost();", 'os.hostname'],
]) {
  test(`bad case: the core import guard catches a core that ${label} at import`, t => {
    const r = plantedImport(t, m, plant);
    assert.equal(r.code, 1, r.out);
    assert.match(r.line, /^TRAPPED /, r.out);
    assert.ok(r.line.split(' ').slice(1).includes(trapped), r.out);
  });
}

// ------------------------------------------------------------ the core source check

// A backstop, not the control: an alias gets past a text search. The control is
// the install's own two-part check, exit code and last line (#140, S4).
const BANNED = Object.freeze([
  'process.stdout',
  'process.stderr',
  'process.exit',
  'process.exitCode',
  'process.on(',
  'console.',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'node:fs/promises',
]);

/** The banned names a core's source holds. */
const bannedIn = text => BANNED.filter(b => text.includes(b));

for (const m of MODULES) {
  test(`the core source check: ${m}-core.mjs never prints, exits or schedules work`, () => {
    assert.deepEqual(bannedIn(readFileSync(join(GATE, `${m}-core.mjs`), 'utf8')), []);
  });
}

for (const [label, plant, name] of [
  ['calls console.log', "console.log('x');", 'console.'],
  ['writes to stdout', "process.stdout.write('x');", 'process.stdout'],
  ['calls process.exit', 'process.exit(1);', 'process.exit'],
  ['sets process.exitCode', 'process.exitCode = 1;', 'process.exitCode'],
  ['starts a timer', 'setTimeout(() => {}, 0);', 'setTimeout'],
]) {
  test(`bad case: the core source check catches a core that ${label}`, () => {
    const planted = `${readFileSync(join(GATE, 'render-core.mjs'), 'utf8')}${plant}\n`;
    assert.ok(bannedIn(planted).includes(name), plant);
  });
}

// ------------------------------------------------------------ the wrappers

/** Each wrapper, comments aside: import check, call it, print, set the exit code. */
for (const m of MODULES) {
  test(`the wrapper: ${m}.mjs is its command line and nothing else`, () => {
    const code = readFileSync(join(GATE, `${m}.mjs`), 'utf8')
      .split('\n')
      .filter(l => l !== '' && !l.startsWith('//') && !l.startsWith('#!'));
    assert.deepEqual(code, [
      `import { check } from './${m}-core.mjs';`,
      'const report = check(process.argv.slice(2));',
      "process.stdout.write(`${report.lines.join('\\n')}\\n`);",
      'process.exitCode = report.failed ? 1 : 0;',
    ]);
  });
}

function runModule(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: childEnv() });
  return { code: r.status, stdout: r.stdout, out: `${r.stdout}${r.stderr}` };
}

// The crash cell: today only seam A has a child-run internal-crash case.
for (const [m, args] of [
  ['render', (t, g) => [join(REPO, 'claude', 'CLAUDE.md'), tempDir(t), tempDir(t)]],
  ['project', t => ['check', tempDir(t), tempDir(t)]],
  ['review', t => [join(tempDir(t), 'review'), tempDir(t), join(REPO, 'claude', 'CLAUDE.md'), join(REPO, 'claude', 'CLAUDE.md')]],
]) {
  test(`the wrapper: an internal crash in ${m} prints one fixed line, no detail, and exits 1`, t => {
    const g = copyGate(tempDir(t, 'pact-cores-'));
    plantModule(g, m, '    run(argv, report);', "    throw new Error('CANARY-crash-detail');");
    const r = runModule(join(g, `${m}.mjs`), args(t, g));
    assert.equal(r.code, 1, r.out);
    assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
    assert.deepEqual(failRules(r.stdout), ['internal'], r.out);
    assert.doesNotMatch(r.out, /CANARY/);
  });
}

// The project module's pass and usage cells: today it is run only through the install.
test('the wrapper: project passes a configured project folder, and exits 0', t => {
  const proj = tempDir(t);
  mkdirSync(join(proj, '.claude'));
  writeFileSync(join(proj, '.claude', 'pact-config.json'), '{"schema": 1, "settings": {"usage-pause": 60}}\n');
  const r = runModule(join(GATE, 'project.mjs'), ['check', proj, tempDir(t)]);
  assert.equal(r.code, 0, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: pass', r.out);
  assert.match(r.stdout, /^STATE new$/m, r.out);
});

test('the wrapper: project with no arguments is a usage failure, and exits 1', () => {
  const r = runModule(join(GATE, 'project.mjs'), []);
  assert.equal(r.code, 1, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.deepEqual(failRules(r.stdout), ['usage'], r.out);
});
