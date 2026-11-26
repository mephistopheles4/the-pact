// Runs the install script (gate/install.mjs) end to end, against a throwaway
// git repo built from this tree and a throwaway --home folder. Never touches
// ~/.pact or ~/.claude.
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { COPY_DIRS, COPY_FILES, COPY_SKIP } from './copy-list.mjs';
import { REPO } from './text.mjs';
import { longTmp, tempDir } from './tree.mjs';

export const WIN = process.platform === 'win32';


function which(cmd) {
  const r = spawnSync(WIN ? 'where.exe' : 'which', [cmd], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} not found on PATH`);
  return r.stdout.split(/\r?\n/)[0].trim();
}

// git is looked up on first use, never at import (#151), so importing the
// harness starts no process. A missing one still fails the first install,
// naming it.
let base = null;
const NODE_DIR = dirname(process.execPath);

/** The folders an install's PATH holds besides node's: git's and the system's. */
export function basePath() {
  // On macOS, Homebrew's folder holds node beside git, so the system git's folder is used.
  base ??= Object.freeze([process.platform === 'darwin' ? '/usr/bin' : dirname(which('git')), ...(WIN ? [join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')] : ['/usr/bin', '/bin'])]);
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
 * before the commit. The harness never reads the pact's agent list (#151), so
 * an agent-file change doesn't pick every install test.
 */
export function makeRepo(t, mutate) {
  return buildRepo(tempDir(t, 'pact-repo-'), mutate);
}

function buildRepo(root, mutate) {
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

/** Runs node with `args`, one of which must name the Node install script (#153). */
export function spawnNodeInstall(args, options) {
  if (!args.some(a => /install(-run)?\.mjs$/i.test(String(a)))) throw new Error('spawnNodeInstall: no argument names the Node install script, so this is not an install');
  return spawnSync(process.execPath, args, options);
}

/** spawnNodeInstall's async form, for a test that signals or waits on a running install. */
export function spawnNodeInstallAsync(args, options) {
  if (!args.some(a => /install(-run)?\.mjs$/i.test(String(a)))) throw new Error('spawnNodeInstallAsync: no argument names the Node install script, so this is not an install');
  return spawn(process.execPath, args, options);
}

// One repo and one applied install per test file (PACT-114), made on first use
// and removed when the file's process exits. Each file runs in its own process
// and its tests run one at a time, so a test that only reads them can share
// them. A test that changes the repo or the home makes its own with makeRepo
// and home: the shared ones must stay as made.
let sharedRoot = null;
let sharedRepoDir = null;
let sharedApplied = null;

function sharedFolder() {
  if (sharedRoot === null) {
    sharedRoot = mkdtempSync(join(longTmp(), 'pact-shared-'));
    process.on('exit', () => rmSync(sharedRoot, { recursive: true, force: true }));
  }
  return sharedRoot;
}

/** The file's one unmodified repo, as makeRepo(t) builds it. Never change it. */
export function sharedRepo() {
  if (sharedRepoDir === null) {
    const root = join(sharedFolder(), 'repo');
    mkdirSync(root);
    sharedRepoDir = buildRepo(root);
  }
  return sharedRepoDir;
}

/** The file's one passing applyBound of sharedRepo() into a home holding an empty .claude: { repo, home, r }. Never change it. */
export function sharedInstall() {
  if (sharedApplied === null) {
    const repo = sharedRepo();
    const h = join(sharedFolder(), 'home');
    mkdirSync(join(h, '.claude'), { recursive: true });
    const r = applyBound(repo, h);
    passed(r);
    sharedApplied = Object.freeze({ repo, home: h, r });
  }
  return sharedApplied;
}

/** The environment a Node install runs with in a test: this one, minus NODE_OPTIONS, with PATH set. */
export function nodeEnv(extra = {}, path = [NODE_DIR, ...basePath()]) {
  return envWith(path, extra);
}


/**
 * Runs the Node install (gate/install.mjs) on `repo` with `home` as its home
 * folder. `apply` passes --apply with the commit `apply` names (true: the
 * repo's HEAD).
 */
export function install(repo, home, { apply = false, path, env = {}, extra = [], script = join(repo, 'gate', 'install.mjs'), cwd = repo } = {}) {
  path ??= [NODE_DIR, ...basePath()];
  const args = [script, '--home', home];
  if (apply) args.push('--apply', '--commit', apply === true ? git(repo, 'rev-parse', 'HEAD').trim() : apply);
  args.push(...extra);
  const r = spawnNodeInstall(args, { cwd, encoding: 'utf8', env: envWith(path, env), timeout: 180_000 });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, out: `${r.stdout}${r.stderr}` };
}

/** The full rendered hash a dry run's Configuration block shows. */
export function renderedHash(r) {
  const m = /^ {2}rendered rules (?:file|of [a-z0-9, -]+, one hash over them all): sha256 ([0-9a-f]{64})\r?$/m.exec(r.stdout);
  assert.ok(m, r.out);
  return m[1];
}

/**
 * --apply bound by the rendered hash a dry run of the same repo and home shows
 * (#183 T4a): every home install renders a configuration, the pact's default
 * when the home folder holds none, so --apply needs the hash. The dry run is
 * an install of its own.
 */
export function applyBound(repo, home, opts = {}) {
  const dry = install(repo, home, { ...opts, apply: false });
  return install(repo, home, { apply: true, ...opts, extra: [...(opts.extra ?? []), '--rendered-hash', renderedHash(dry)] });
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
/**
 * The sum of a count line (Drift, Overwrite, Add, Delete, ...) over a dry run's
 * blocks, one per harness: a 0 in one block says nothing about the others.
 */
export function total(r, title) {
  const found = [...r.stdout.matchAll(new RegExp(`^${title}: (\\d+)\\r?$`, 'gm'))];
  assert.ok(found.length, r.out);
  return found.reduce((sum, m) => sum + Number(m[1]), 0);
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

/** A throwaway home folder holding an empty .claude, so Claude Code is found in it. */
export function home(t) {
  const dir = tempDir(t, 'pact-home-');
  mkdirSync(join(dir, '.claude'));
  return dir;
}

export function listTree(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true }).map(String).sort();
}
