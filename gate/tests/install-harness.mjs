// Runs the install script end to end, against a throwaway git repo built from
// this tree and a throwaway -ClaudeHome. Never touches ~/.claude.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative, sep } from 'node:path';
import { after, afterEach, before } from 'node:test';
import { COPY_DIRS, COPY_FILES, COPY_SKIP } from './copy-list.mjs';
import { REPO, routeTree, tempDir } from './helpers.mjs';

export const WIN = process.platform === 'win32';

function which(cmd) {
  const r = spawnSync(WIN ? 'where.exe' : 'which', [cmd], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} not found on PATH`);
  return r.stdout.split(/\r?\n/)[0].trim();
}

export const PWSH = which('pwsh');
const GIT_DIR = dirname(which('git'));
const NODE_DIR = dirname(process.execPath);
const SYS_DIRS = WIN ? [join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')] : ['/usr/bin', '/bin'];
export const BASE_PATH = [GIT_DIR, dirname(PWSH), ...SYS_DIRS];

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

/** A git repo holding the files the install reads, committed; `mutate` runs before the commit. */
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
  routeTree(root);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.invalid');
  git(root, 'config', 'user.name', 'gate test');
  git(root, 'config', 'commit.gpgsign', 'false');
  commitAll(root);
  return root;
}

// ------------------------------------------------------------ one shared repo per test file (#146)

/** Set for every run against a shared repo, so git's status call never rewrites its index. */
export const SHARED_ENV = Object.freeze({ GIT_OPTIONAL_LOCKS: '0' });

// The shared repos built so far; install() gives each run against one SHARED_ENV.
const SHARED = new Set();

/**
 * Every entry under `root`, its git folder and ignored files included, by
 * kind, with each file's hash. Git never runs: links are recorded, never
 * followed, and special files are never read.
 */
export function treeHash(root) {
  const out = new Map();
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      const rel = relative(root, p).split(sep).join('/');
      const st = lstatSync(p);
      if (st.isSymbolicLink()) out.set(rel, `link ${readlinkSync(p)}`);
      else if (st.isDirectory()) {
        out.set(rel, 'dir');
        walk(p);
      } else if (!st.isFile()) out.set(rel, 'special'); // never read: a named pipe would block
      else out.set(rel, `file ${createHash('sha256').update(readFileSync(p)).digest('hex')}`);
    }
  };
  walk(root);
  return out;
}

/** The paths whose entries differ between two treeHash results, sorted. */
function changedPaths(was, now) {
  const paths = new Set([...was.keys(), ...now.keys()]);
  return [...paths].filter(p => was.get(p) !== now.get(p)).sort();
}

/**
 * One throwaway repo for the tests in this file that only read it, built
 * before the file's first test. Each test still takes its own throwaway home.
 * After each test the whole repo is hashed again; a test that changed anything
 * fails, naming the paths, and the next test gets a freshly built repo. Call
 * it once, at the top level of a test file. `root` is read inside each test.
 */
export function sharedRepo() {
  let root;
  let sum;
  const build = () => {
    root = buildRepo(mkdtempSync(join(tmpdir(), 'pact-shared-')));
    SHARED.add(root);
    sum = treeHash(root);
  };
  const drop = () => {
    SHARED.delete(root);
    rmSync(root, { recursive: true, force: true });
  };
  before(build);
  afterEach(() => {
    const changed = changedPaths(sum, treeHash(root));
    if (!changed.length) return;
    drop();
    build();
    throw new Error(`the test changed the shared repo, which only read-only tests may use: ${changed.join(', ')}`);
  });
  after(drop);
  return {
    get root() {
      return root;
    },
  };
}

export function install(repo, home, { apply = false, path = [NODE_DIR, ...BASE_PATH], env = {}, extra = [] } = {}) {
  const args = ['-NoProfile', '-NonInteractive', '-File', join(repo, 'scripts', 'install.ps1'), '-ClaudeHome', home];
  if (apply) args.push('-Apply');
  args.push(...extra);
  const runEnv = SHARED.has(repo) ? { ...env, ...SHARED_ENV } : env;
  const r = spawnSync(PWSH, args, { cwd: repo, encoding: 'utf8', env: envWith(path, runEnv), timeout: 180_000 });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, out: `${r.stdout}${r.stderr}` };
}

export function refused(r) {
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.stdout, /^REFUSED: /m, r.out);
}

export function home(t) {
  return tempDir(t, 'pact-home-');
}

export function listTree(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true }).map(String).sort();
}
