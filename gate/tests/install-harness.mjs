// Runs the install script end to end, against a throwaway git repo built from
// this tree and a throwaway -ClaudeHome. Never touches ~/.claude.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { afterEach, beforeEach } from 'node:test';
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
  routeTree(root);
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
// git are not installs. A test that calls t.skip() stays a skip: node keeps
// its status over a throw from this hook (seen on Node 20.20 and 24.14), and
// the guard's own tests pin that (ADR 0033).
let installs = 0;
let depth = 0;
beforeEach(() => {
  if (depth++ === 0) installs = 0;
});
afterEach(t => {
  if (--depth === 0 && installs === 0) {
    throw new Error(`purity guard: "${t.name}" is in an install-tier file but neither ran the install script nor skipped itself; move it to a file that never installs`);
  }
});

/** Runs pwsh with `args`, one of which must name the install script; counts as an install. */
export function spawnInstall(args, options) {
  if (!args.some(a => String(a).toLowerCase().includes('install.ps1'))) throw new Error('spawnInstall: no argument names the install script, so this is not an install');
  installs++;
  return spawnSync(PWSH, args, options);
}

export function install(repo, home, { apply = false, path = [NODE_DIR, ...BASE_PATH], env = {}, extra = [] } = {}) {
  const args = ['-NoProfile', '-NonInteractive', '-File', join(repo, 'scripts', 'install.ps1'), '-ClaudeHome', home];
  if (apply) args.push('-Apply');
  args.push(...extra);
  const r = spawnInstall(args, { cwd: repo, encoding: 'utf8', env: envWith(path, env), timeout: 180_000 });
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
