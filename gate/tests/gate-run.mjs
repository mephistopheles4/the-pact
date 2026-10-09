// The in-process runner (#140, T10): runs a gate module's core in this
// process, through its check(argv), and returns what a child run of the
// module's wrapper gives: the exit code, stdout and stderr. The test helpers'
// gate-module runners call it, and so does the parity guard, which proves the
// two ways give the same lines (parity.test.mjs). A case stays a child run
// when it varies the environment, runs a planted copy of a module, or runs
// under a test preload; runWrapper starts one as the install does.
//
// Importing this file loads the four cores, which do nothing when imported
// (#155); it touches no file and starts no process. On the probe floor by
// name (AGENTS.md): weakening it could let every in-process case pass.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check as project } from '../project-core.mjs';
import { check as render } from '../render-core.mjs';
import { check as review } from '../review-core.mjs';
import { check as seamA } from '../seam-a-core.mjs';

const GATE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORES = Object.freeze({ project, render, review, 'seam-a': seamA });

/** The four gate modules with a core, by file stem. */
export const MODULES = Object.freeze(Object.keys(CORES).sort());

/** Call `fn` with this process's stdout and stderr writes caught: { value, stdout, stderr }. Restored even on a throw. */
function catchingWrites(fn) {
  const caught = { stdout: '', stderr: '' };
  const restore = [];
  for (const name of ['stdout', 'stderr']) {
    const stream = process[name];
    const write = stream.write;
    stream.write = (chunk, enc, cb) => {
      caught[name] += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      const done = typeof enc === 'function' ? enc : cb;
      if (typeof done === 'function') done();
      return true;
    };
    restore.push(() => {
      stream.write = write;
    });
  }
  try {
    return { value: fn(), ...caught };
  } finally {
    for (const r of restore) r();
  }
}

/**
 * One call of a core's `check`, as a child run of its wrapper reports it: the
 * lines joined with a line feed after each, exit 1 when it failed. Anything
 * the check, or a module it calls, writes to stdout or stderr while it runs is
 * caught, as a child run would show it: stdout writes ahead of the lines, and
 * stderr writes as stderr, so a test that reads `out` still sees a leak there.
 * A throw is not caught: it fails the test, never passes as a code.
 */
export function runCheck(check, argv) {
  const run = catchingWrites(() => check(argv));
  const { lines, failed } = run.value ?? {};
  if (!Array.isArray(lines) || lines.some(l => typeof l !== 'string') || typeof failed !== 'boolean') throw new Error('a core returned no { lines, failed }');
  const stdout = `${run.stdout}${lines.join('\n')}\n`;
  return { code: failed ? 1 : 0, stdout, stderr: run.stderr, out: stdout + run.stderr, lines, failed };
}

/** Gate module `name`'s core, run in this process on `argv`. */
export function runCore(name, argv) {
  if (!Object.hasOwn(CORES, name)) throw new Error(`no gate core named ${JSON.stringify(name)}`);
  return runCheck(CORES[name], argv);
}

/** A stage for wrapper runs: every file in the gate folder outside its tests, under `<root>/gate`, as the install stages it. */
export function stageGate(root) {
  const tests = join(GATE, 'tests');
  mkdirSync(root, { recursive: true });
  cpSync(GATE, join(root, 'gate'), { recursive: true, filter: src => src !== tests });
  return root;
}

/**
 * This process's environment for a child gate run: no NODE_OPTIONS, and no
 * test-runner context, in any letter case (Windows reads names either way).
 */
export function childEnv(env = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) if (!/^(?:NODE_OPTIONS|NODE_TEST_CONTEXT)$/i.test(k)) out[k] = v;
  return out;
}

/**
 * Gate module `name`'s wrapper, run as a child as the install runs it: from
 * `stage`'s copy of the gate, with the stage as the working folder and
 * NODE_OPTIONS removed. stdout is kept as bytes as well as text, for a
 * byte-for-byte compare.
 */
export function runWrapper(stage, name, argv) {
  const r = spawnSync(process.execPath, [join(stage, 'gate', `${name}.mjs`), ...argv], { cwd: stage, env: childEnv() });
  const stdout = r.stdout ? r.stdout.toString('utf8') : '';
  const stderr = r.stderr ? r.stderr.toString('utf8') : '';
  return { code: r.status, stdout, stderr, out: stdout + stderr, bytes: r.stdout ?? Buffer.alloc(0), error: r.error };
}

/**
 * The preload options node takes on its command line, each as `--x v` or
 * `--x=v`, and the config-file options, whose file can set a preload that
 * then shows in neither `execArgv` nor NODE_OPTIONS.
 */
const PRELOAD = /^(?:--import|--require|-r|--loader|--experimental-loader|--experimental-config-file|--experimental-default-config-file)(?:=|$)/;

/**
 * Why this process can't run the parity guard, or null when it can. The
 * in-process side runs under whatever this process preloaded, and the child
 * side, started as the install starts it, under none; so a preload here could
 * make the two sides agree for the wrong reason. Any NODE_OPTIONS refuses,
 * and a preload option among this process's own options. node's test runner
 * passes its other options to each test file, so those are allowed.
 */
export function preloadRefusal(env = process.env, execArgv = process.execArgv) {
  if (Object.keys(env).some(k => /^NODE_OPTIONS$/i.test(k))) return 'NODE_OPTIONS is set in this process';
  const hit = execArgv.find(a => PRELOAD.test(a));
  if (hit) return `this process was started with a preload option (${hit.split('=')[0]})`;
  return null;
}

/**
 * Each way the two runs of one input differ, as plain sentences; empty when
 * they agree. The child's stdout must equal, byte for byte, both the
 * in-process lines and the in-process stdout the helpers read; neither side
 * may write to stderr; and each exit code must equal `failed`.
 */
export function parityProblems(inProcess, child) {
  const out = [];
  if (child.error) return [`the wrapper did not run: ${child.error.message}`];
  if (!child.bytes.equals(Buffer.from(`${inProcess.lines.join('\n')}\n`, 'utf8'))) out.push('the lines differ');
  if (!child.bytes.equals(Buffer.from(inProcess.stdout, 'utf8'))) out.push('the in-process stdout differs');
  if (inProcess.out !== inProcess.stdout + inProcess.stderr) out.push('the in-process out is not its stdout and stderr');
  if (child.stderr !== '') out.push('the wrapper wrote to stderr');
  if (inProcess.stderr !== '') out.push('the core wrote to stderr in-process');
  if (child.code !== (inProcess.failed ? 1 : 0)) out.push(`the exit code ${child.code} does not match failed: ${inProcess.failed}`);
  if (inProcess.code !== (inProcess.failed ? 1 : 0)) out.push(`the in-process exit code ${inProcess.code} does not match failed: ${inProcess.failed}`);
  return out;
}
