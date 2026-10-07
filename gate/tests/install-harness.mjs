// Runs the install script end to end, against a throwaway git repo built from
// this tree and a throwaway -ClaudeHome. Never touches ~/.claude.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { REPO, routeTree, tempDir } from './helpers.mjs';

export const WIN = process.platform === 'win32';

function which(cmd) {
  const r = spawnSync(WIN ? 'where.exe' : 'which', [cmd], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} not found on PATH`);
  return r.stdout.split(/\r?\n/)[0].trim();
}

const PWSH = which('pwsh');
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
  for (const d of ['claude', 'cross', 'gate', 'familiars']) cpSync(join(REPO, d), join(root, d), { recursive: true });
  mkdirSync(join(root, 'scripts'));
  cpSync(join(REPO, 'scripts', 'install.ps1'), join(root, 'scripts', 'install.ps1'));
  cpSync(join(REPO, '.gitattributes'), join(root, '.gitattributes'));
  cpSync(join(REPO, 'AGENTS.md'), join(root, 'AGENTS.md'));
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

export function install(repo, home, { apply = false, path = [NODE_DIR, ...BASE_PATH], env = {}, extra = [] } = {}) {
  const args = ['-NoProfile', '-NonInteractive', '-File', join(repo, 'scripts', 'install.ps1'), '-ClaudeHome', home];
  if (apply) args.push('-Apply');
  args.push(...extra);
  const r = spawnSync(PWSH, args, { cwd: repo, encoding: 'utf8', env: envWith(path, env), timeout: 180_000 });
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
