// The in-process runner (#140, T10), gate-run.mjs: its result shape, its
// preload refusal, the parity guard refusing under a preload as a failure and
// never a skip, and the shared-state check seen to fail with a planted core
// that keeps a counter across calls. On the probe floor by name (AGENTS.md).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MODULES, childEnv, preloadRefusal, routeBeforeRun, runCheck, runCore, runSeamA, stageGate } from './gate-run.mjs';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PARITY = join(HERE, 'parity.test.mjs');

// ------------------------------------------------------------ the result shape

test('runCheck gives a child run\'s shape: the lines with a line feed after each, exit 1 when failed, nothing on stderr', () => {
  assert.deepEqual(runCheck(() => ({ lines: ['A', 'RESULT: pass'], failed: false }), []), { code: 0, stdout: 'A\nRESULT: pass\n', stderr: '', out: 'A\nRESULT: pass\n', lines: ['A', 'RESULT: pass'], failed: false });
  const f = runCheck(() => ({ lines: ['FAIL x: y', 'RESULT: fail'], failed: true }), []);
  assert.equal(f.code, 1);
  assert.equal(f.stdout, 'FAIL x: y\nRESULT: fail\n');
});

test('runCheck passes argv through unchanged', () => {
  let seen;
  runCheck(argv => ((seen = argv), { lines: ['RESULT: pass'], failed: false }), ['a', 'b c']);
  assert.deepEqual(seen, ['a', 'b c']);
});

test('bad case: a throw from a core reaches the test; it is never turned into an exit code', () => {
  assert.throws(() => runCheck(() => { throw new Error('planted'); }, []), /planted/);
});

// A child run shows what a check, or a module it calls, writes while it runs;
// so must the in-process run, or a "never echoes" canary reads half the output.
test('bad case: runCheck catches what a check writes to stderr or stdout while it runs, as a child run shows it', () => {
  const r = runCheck(() => {
    process.stderr.write('CANARY-err\n');
    console.error('CANARY-console');
    process.stdout.write(Buffer.from('CANARY-out\n'));
    return { lines: ['RESULT: pass'], failed: false };
  }, []);
  assert.equal(r.stderr, 'CANARY-err\nCANARY-console\n');
  assert.equal(r.stdout, 'CANARY-out\nRESULT: pass\n');
  assert.equal(r.out, 'CANARY-out\nRESULT: pass\nCANARY-err\nCANARY-console\n');
});

test('runCheck gives the streams back after the check, and after a throw', () => {
  const before = [process.stdout.write, process.stderr.write];
  runCheck(() => ({ lines: ['RESULT: pass'], failed: false }), []);
  assert.deepEqual([process.stdout.write, process.stderr.write], before);
  assert.throws(() => runCheck(() => { throw new Error('planted'); }, []), /planted/);
  assert.deepEqual([process.stdout.write, process.stderr.write], before);
});

test('bad case: a core that returns no { lines, failed } throws', () => {
  for (const r of [undefined, {}, { lines: 'RESULT: pass', failed: false }, { lines: ['RESULT: pass'], failed: 0 }, { lines: [1], failed: false }]) {
    assert.throws(() => runCheck(() => r, []), /no \{ lines, failed \}/, JSON.stringify(r));
  }
});

test('runCore runs each of the four cores, and refuses any other name', () => {
  assert.deepEqual([...MODULES], ['project', 'render', 'review', 'seam-a']);
  for (const m of MODULES) assert.equal(runCore(m, []).lines.at(-1), 'RESULT: fail', m);
  for (const bad of ['contained', 'shared', 'constructor', '__proto__', 'render.mjs']) assert.throws(() => runCore(bad, []), /no gate core named/, bad);
});

test('stageGate copies the gate without its tests, as the install stages it', t => {
  const s = stageGate(join(tempDir(t, 'pact-gate-run-'), 'stage'));
  for (const m of MODULES) {
    assert.ok(readFileSync(join(s, 'gate', `${m}.mjs`)).length > 0, m);
    assert.ok(readFileSync(join(s, 'gate', `${m}-core.mjs`)).length > 0, m);
  }
  assert.throws(() => readFileSync(join(s, 'gate', 'tests', 'gate-run.mjs')), /ENOENT/);
});

// ------------------------------------------------------------ the environment and the preload refusal

test('childEnv drops NODE_OPTIONS and NODE_TEST_CONTEXT in any letter case, and keeps the rest', () => {
  assert.deepEqual(childEnv({ NODE_OPTIONS: '--import x', node_options: 'y', NODE_TEST_CONTEXT: 'child', Node_Test_Context: 'v8', PATH: 'p', HOME: 'h' }), { PATH: 'p', HOME: 'h' });
});

test('preloadRefusal allows a clean process, and the options node\'s test runner passes each test file', () => {
  assert.equal(preloadRefusal({}, []), null);
  assert.equal(preloadRefusal({ PATH: 'p' }, ['--test-concurrency=4', '--test-isolation=process', '--stack-trace-limit=10', '--test-timeout=0', '--max-http-header-size=16384']), null);
});

for (const [label, env, execArgv] of [
  ['NODE_OPTIONS set', { NODE_OPTIONS: '--no-warnings' }, []],
  ['NODE_OPTIONS set but empty', { NODE_OPTIONS: '' }, []],
  ['NODE_OPTIONS in lower case', { node_options: '--no-warnings' }, []],
  ['--import as two words', {}, ['--import', 'data:text/javascript,export{}']],
  ['--import=', {}, ['--import=data:text/javascript,export{}']],
  ['--require', {}, ['--require', 'x.cjs']],
  ['--require=', {}, ['--require=x.cjs']],
  ['-r', {}, ['-r', 'x.cjs']],
  ['--loader', {}, ['--loader', 'x.mjs']],
  ['--loader=', {}, ['--loader=x.mjs']],
  ['--experimental-loader', {}, ['--experimental-loader', 'x.mjs']],
  ['--experimental-loader=', {}, ['--experimental-loader=x.mjs']],
  ['a preload among the test runner\'s options', {}, ['--test-concurrency=4', '--import=x.mjs', '--test-timeout=0']],
  // A config file's preload loads but shows in execArgv only as the config option (probed on Node 24, #156).
  ['--experimental-config-file', {}, ['--experimental-config-file', 'node.config.json']],
  ['--experimental-config-file=', {}, ['--experimental-config-file=node.config.json']],
  ['--experimental-default-config-file', {}, ['--experimental-default-config-file']],
]) {
  test(`bad case: preloadRefusal refuses ${label}`, () => {
    assert.match(preloadRefusal(env, execArgv) ?? '', /^(NODE_OPTIONS is set|this process was started with a preload option)/);
  });
}

// ------------------------------------------------------------ the parity guard under a preload: a failure, never a skip

/** parity.test.mjs run as a child with `pre` before it and `env` added; its TAP lines by test name. */
function parityChild(pre, env) {
  const r = spawnSync(process.execPath, [...pre, '--test-reporter=tap', PARITY], { cwd: REPO, encoding: 'utf8', env: { ...childEnv(), ...env } });
  const results = new Map();
  for (const m of r.stdout.matchAll(/^\s*(ok|not ok) \d+ - (.*)$/gm)) results.set(m[2].replace(/ # (SKIP|TODO).*$/, ''), m[0]);
  return { status: r.status, out: r.stdout + r.stderr, results };
}

function refusedEveryParityRun(r) {
  assert.notEqual(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /# SKIP|# TODO|^# skipped [1-9]/m, 'a refusal is never a skip');
  const guarded = [...r.results.keys()].filter(n => /^parity: .* in-process and the wrapper|^bad case: the parity guard catches/.test(n));
  assert.equal(guarded.length, MODULES.length * 9, r.out);
  for (const n of guarded) assert.match(r.results.get(n), /^\s*not ok /, `${n}\n${r.out}`);
  assert.match(r.out, /the parity guard refuses to run/);
}

test('bad case: the parity guard reports a failure, not a skip or a pass, with NODE_OPTIONS set', () => {
  const r = parityChild(['--test'], { NODE_OPTIONS: '--no-warnings' });
  refusedEveryParityRun(r);
  assert.match(r.out, /NODE_OPTIONS is set in this process/);
});

test('bad case: the parity guard reports a failure, not a skip or a pass, in a direct run started with --import', () => {
  const r = parityChild(['--import', 'data:text/javascript,export{}'], {});
  refusedEveryParityRun(r);
  assert.match(r.out, /started with a preload option \(--import\)/);
});

// ------------------------------------------------------------ the shared-state check, with a planted core

/**
 * A render table run in a child node --test, in-process through runCheck on
 * the render core of a staged copy of the gate. With `counter`, that core
 * keeps a count across calls and fails every passing render after the first.
 */
function stateTable(t, counter) {
  const dir = tempDir(t, 'pact-shared-state-');
  const gate = join(stageGate(join(dir, 'stage')), 'gate');
  const core = join(gate, 'render-core.mjs');
  if (counter) {
    const src = readFileSync(core, 'utf8');
    assert.equal(src.split('export function check(argv) {').length, 2, 'render-core.mjs declares check once');
    writeFileSync(
      core,
      `${src.replace('export function check(argv) {', 'function realCheck(argv) {')}
let passes = 0;
export function check(argv) {
  const r = realCheck(argv);
  if (!r.failed && ++passes > 1) return { lines: ['FAIL internal: planted state', 'RESULT: fail'], failed: true };
  return r;
}
`,
    );
  }
  const url = p => JSON.stringify(pathToFileURL(p).href);
  const file = join(dir, 'state.test.mjs');
  writeFileSync(
    file,
    `import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { moduleResult, table } from ${url(join(HERE, 'tables.mjs'))};
import { runCheck } from ${url(join(HERE, 'gate-run.mjs'))};
import { check } from ${url(core)};
const SOURCE = ${JSON.stringify(join(REPO, 'claude', 'CLAUDE.md'))};
const edits = e => JSON.stringify({ schema: 1, edits: e });
const run = (tree, t) => {
  const d = mkdtempSync(join(tmpdir(), 'pact-state-run-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  for (const [rel, text] of Object.entries(tree)) {
    mkdirSync(dirname(join(d, 'home', rel)), { recursive: true });
    writeFileSync(join(d, 'home', rel), text);
  }
  mkdirSync(join(d, 'out'));
  const r = runCheck(check, [SOURCE, join(d, 'out'), join(d, 'home')]);
  return moduleResult(r.code, r.stdout);
};
for (const c of table('shared state', {
  module: 'gate/render.mjs',
  base: () => ({ 'pact/config.json': edits([{ mark: 'move-4-extra', op: 'add-after', file: 'ok.md' }]), 'pact/blocks/ok.md': 'Text.\\n' }),
  run,
  rows: [{ id: 'unknown-mark', plant: h => ({ ...h, 'pact/config.json': edits([{ mark: 'move-9', op: 'remove' }]) }), fails: ['edit-mark'], why: 'a row between the two bases' }],
})) test(c.name, c.fn);
`,
  );
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], { cwd: dir, encoding: 'utf8', env: childEnv() });
  const results = new Map();
  for (const m of r.stdout.matchAll(/^(ok|not ok) \d+ - (.*)$/gm)) results.set(m[2], m[1]);
  return { status: r.status, out: r.stdout + r.stderr, results };
}

test('control: a render table on an unplanted staged core passes its base, its row and its base after the rows', t => {
  const r = stateTable(t, false);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(Object.fromEntries(r.results), { 'shared state: base passes': 'ok', 'shared state: unknown-mark': 'ok', 'shared state: base passes after the rows': 'ok' }, r.out);
});

test('bad case: the shared-state check catches a core that keeps a counter across calls: the base after the rows fails', t => {
  const r = stateTable(t, true);
  assert.notEqual(r.status, 0, r.out);
  assert.deepEqual(Object.fromEntries(r.results), { 'shared state: base passes': 'ok', 'shared state: unknown-mark': 'ok', 'shared state: base passes after the rows': 'not ok' }, r.out);
  assert.match(r.out, /planted state/);
});

// The router hook (#151): stage() in payload.mjs registers the fixture router,
// and runSeamA runs it on that stage before the check. Nothing else may run
// there, so a second, different function refuses.
test('the router hook runs the registered router before seam A, and refuses a second router', t => {
  const routed = [];
  const router = root => routed.push(root);
  const a = tempDir(t);
  routeBeforeRun(a, router);
  routeBeforeRun(a, router);
  runSeamA(a);
  assert.deepEqual(routed, [a]);
  runSeamA(tempDir(t));
  assert.deepEqual(routed, [a], 'a stage never registered is not routed');
  assert.throws(() => routeBeforeRun(tempDir(t), () => {}), /a second router/);
  assert.throws(() => routeBeforeRun(tempDir(t), 'routeTree'), /not a function/);
  runSeamA(a);
  assert.deepEqual(routed, [a, a], 'the refused router replaced nothing');
});