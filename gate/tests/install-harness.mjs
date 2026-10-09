// Runs the install script (gate/install.mjs) end to end, against a throwaway
// git repo built from this tree and a throwaway --claude-home. Never touches
// ~/.claude.
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { afterEach, beforeEach } from 'node:test';
import { COPY_DIRS, COPY_FILES, COPY_SKIP } from './copy-list.mjs';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

export const WIN = process.platform === 'win32';

function which(cmd) {
  const r = spawnSync(WIN ? 'where.exe' : 'which', [cmd], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} not found on PATH`);
  return r.stdout.split(/\r?\n/)[0].trim();
}

// git and pwsh are looked up on first use, never at import (#151), so
// importing the harness starts no process. A missing one still fails the
// first install, naming it.
let base = null;
let pwsh = null;
const NODE_DIR = dirname(process.execPath);

/** The folders an install's PATH holds besides node's: git's and the system's. */
export function basePath() {
  base ??= Object.freeze([dirname(which('git')), ...(WIN ? [join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')] : ['/usr/bin', '/bin'])]);
  return base;
}

function envWith(pathDirs, extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^path$/i.test(k) || k === 'NODE_OPTIONS') continue;
    env[k] = v;
  }
  env.PATH = pathDirs.join(delimiter);
  return { ...env, ...extra };
}

export function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

export function commitAll(root, msg = 'test') {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '--allow-empty', '-m', msg);
}

/**
 * A git repo holding the files the install reads, committed; `mutate` runs
 * before the commit. The repo is not routed (#151): a `mutate` that adds a
 * test agent routes it itself, so the harness never reads the pact's agent
 * list, and an agent-file change doesn't pick every install test. install()
 * catches a route left out (below).
 */
export function makeRepo(t, mutate) {
  const root = tempDir(t, 'pact-repo-');
  // The install drops gate/tests before any check, so the copy leaves it out.
  const skip = new Set(COPY_SKIP.map(rel => join(REPO, ...rel.split('/'))));
  for (const d of COPY_DIRS) {
    cpSync(join(REPO, d), join(root, d), { recursive: true, filter: src => !skip.has(src) });
  }
  for (const f of COPY_FILES) {
    const to = join(root, ...f.split('/'));
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(REPO, ...f.split('/')), to);
  }
  writeFileSync(join(root, '.gitignore'), 'settings.json\n');
  if (mutate) mutate(root);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.invalid');
  git(root, 'config', 'user.name', 'gate test');
  git(root, 'config', 'commit.gpgsign', 'false');
  commitAll(root);
  return root;
}

// The purity guard (#140, T6): a file that imports this harness is in the
// install tier, so each of its tests must run the install script or skip
// itself. Each file runs in its own process, and its tests run one at a time,
// so one count serves the file. The count is per top-level test: a subtest's
// installs count toward the test it runs in, and a subtest is not checked on
// its own, so a subtest that reads its parent's install passes. makeRepo and
// git are not installs. A test that calls t.skip() stays a skip: the hook
// records the call and never throws for it, since node 24.21 reports a skipped
// test as failed when this hook throws (20.20 and 24.14 kept the skip). The
// guard's own tests pin that (ADR 0033).
let installs = 0;
let depth = 0;
let skipped = false;
beforeEach(t => {
  if (depth++ === 0) {
    installs = 0;
    skipped = false;
  }
  const skip = t.skip.bind(t);
  t.skip = (...args) => {
    skipped = true;
    return skip(...args);
  };
});
afterEach(t => {
  if (--depth === 0 && installs === 0 && !skipped) {
    throw new Error(`purity guard: "${t.name}" is in an install-tier file but neither ran the install script nor skipped itself; move it to a file that never installs`);
  }
});

/** Runs pwsh with `args`, one of which must name the PowerShell install script; counts as an install. */
export function spawnInstall(args, options) {
  if (!args.some(a => String(a).toLowerCase().includes('install.ps1'))) throw new Error('spawnInstall: no argument names the install script, so this is not an install');
  installs++;
  pwsh ??= which('pwsh');
  return spawnSync(pwsh, args, options);
}

/** Runs node with `args`, one of which must name the Node install script; counts as an install (#153). */
export function spawnNodeInstall(args, options) {
  if (!args.some(a => /install(-run)?\.mjs$/i.test(String(a)))) throw new Error('spawnNodeInstall: no argument names the Node install script, so this is not an install');
  installs++;
  return spawnSync(process.execPath, args, options);
}

/** spawnNodeInstall's async form, for a test that signals or waits on a running install. */
export function spawnNodeInstallAsync(args, options) {
  if (!args.some(a => /install(-run)?\.mjs$/i.test(String(a)))) throw new Error('spawnNodeInstallAsync: no argument names the Node install script, so this is not an install');
  installs++;
  return spawn(process.execPath, args, options);
}

/** The environment a Node install runs with in a test: this one, minus NODE_OPTIONS, with PATH set. */
export function nodeEnv(extra = {}, path = [NODE_DIR, ...basePath()]) {
  return envWith(path, extra);
}

/** The files seam A refused for routing, as the install prints them; what install()'s routing guard reads. */
export function routingFails(stdout) {
  return [...(stdout ?? '').matchAll(/^seam-a\| FAIL routing: ([^:\r\n]+):/gm)].map(m => m[1]);
}

/**
 * Runs the Node install (gate/install.mjs) on `repo` with `home` as its Claude
 * home folder. `apply` passes --apply with the commit `apply` names (true: the
 * repo's HEAD). A run that seam A refuses for routing fails the test, unless
 * the call expects it: `unrouted` lists the files the test means to leave
 * unrouted, or is true for any. makeRepo doesn't route, so a test agent left
 * unrouted would make a test that only asserts a refusal pass for the wrong
 * reason.
 */
export function install(repo, home, { apply = false, path, env = {}, extra = [], unrouted = [], script = join(repo, 'gate', 'install.mjs'), cwd = repo } = {}) {
  path ??= [NODE_DIR, ...basePath()];
  if (unrouted !== true && !(Array.isArray(unrouted) && unrouted.every(f => typeof f === 'string'))) throw new Error('install: unrouted is true or a list of file paths');
  const args = [script, '--claude-home', home];
  if (apply) args.push('--apply', '--commit', apply === true ? git(repo, 'rev-parse', 'HEAD').trim() : apply);
  args.push(...extra);
  const r = spawnNodeInstall(args, { cwd, encoding: 'utf8', env: envWith(path, env), timeout: 180_000 });
  const out = { code: r.status, stdout: r.stdout, stderr: r.stderr, out: `${r.stdout}${r.stderr}` };
  if (unrouted !== true) {
    const stray = routingFails(out.stdout).filter(f => !unrouted.includes(f));
    assert.deepEqual(stray, [], `seam A refused an agent the test did not mean to leave unrouted; route it in the test's makeRepo mutate (routeTree), or name it in unrouted:\n${out.out}`);
  }
  return out;
}

/**
 * Plants a wrapper round a gate core's check(), the function the install's
 * runner calls in-process: `before` runs first, with `argv`, and `after` runs
 * on its result `r` before it is returned. Both may use `fs`. Edits the file
 * in `root`'s gate folder; the caller commits it.
 */
export function wrapCheck(root, core, { before = '', after = '' }) {
  const p = join(root, 'gate', `${core}.mjs`);
  const s = readFileSync(p, 'utf8');
  const head = 'export function check(argv) {';
  assert.equal(s.split(head).length, 2, `expected exactly one check() in gate/${core}.mjs`);
  writeFileSync(p, `${s.replace(head, 'function checkUnplanted(argv) {')}\nexport function check(argv) {\n  const fs = process.getBuiltinModule('node:fs');\n  ${before}\n  const r = checkUnplanted(argv);\n  ${after}\n  return r;\n}\n`);
  return p;
}
/** An install that refused: exit 1, a REFUSED line, and the bootstrap's RESULT: refused last. */
export function refused(r, says) {
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^REFUSED: /m, r.out);
  assert.equal(r.stdout.trimEnd().split('\n').at(-1), 'RESULT: refused', r.out);
  if (says) assert.match(r.stdout, says, r.out);
}

/** An install that passed: exit 0 and RESULT: pass last. */
export function passed(r) {
  assert.equal(r.code, 0, r.out);
  assert.equal(r.stdout.trimEnd().split('\n').at(-1), 'RESULT: pass', r.out);
}

export function home(t) {
  return tempDir(t, 'pact-home-');
}

export function listTree(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true }).map(String).sort();
}
