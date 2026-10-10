#!/usr/bin/env node
// The install bootstrap (#153, S3), dry run by default:
//   node gate/install.mjs [--apply --commit <id>] [--rendered-hash <hash>]
//        [--claude-home <path>] [--review-folder <path>] [--project-folder <path>]
// The only part of the install that runs from the working tree, so it stays
// small, imports only node: built-ins, uses only syntax Node 16 parses (an old
// Node still reaches the floor message) and never reads the options. It stages
// HEAD's files through one batched git read, each blob checked by its id, and
// starts the runner (gate/install-run.mjs) from the stage, committed code only,
// with an allow-listed environment and a time limit. Every error becomes a
// fixed message. A test holds it to its line budget, imports and syntax.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, constants, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FLOOR = 24; // the current Node LTS (#153, D4 as amended at move 3)
const LIMIT_MS = 300000; // the runner's checks, until it prints CHECKS DONE (S5, control 3)
const WIN = process.platform === 'win32';
const FOLD = WIN || process.platform === 'darwin';
// Git variables that redirect the repository or its config. Their presence
// refuses, to show the shell is set up oddly; the real control is that no git
// call inherits them (KEEP below).
const GIT_REDIRECTS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT'];
// The only variables git and the runner get from the owner's environment.
const KEEP = ['PATH', 'SystemRoot', 'windir', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'TMPDIR'];
const SIGNALS = WIN ? ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] : ['SIGINT', 'SIGTERM', 'SIGHUP'];

const say = s => process.stdout.write(`${s}\n`);
class Stop extends Error {}
let work = null;
let child = null;

function refuse(why, outcome) {
  say(`REFUSED: ${why} ${outcome || 'Nothing was changed.'}`);
  say('RESULT: refused');
  throw new Stop();
}

function cleanup() {
  try {
    if (work) rmSync(work, { recursive: true, force: true });
  } catch (e) {}
  work = null;
}

// Stops the runner and all it started: taskkill from System32 by full path on Windows, the process group elsewhere.
function killTree() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (WIN) spawnSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore', windowsHide: true });
    else process.kill(-child.pid, 'SIGKILL');
  } catch (e) {}
}

const allowEnv = extra => {
  const env = {};
  for (const k of KEEP) if (process.env[k] !== undefined) env[k] = process.env[k];
  return Object.assign(env, extra);
};
const sha1 = (kind, b) => createHash('sha1').update(`${kind} ${b.length}\0`).update(b).digest('hex');
const same = (a, b) => (FOLD ? a.toLowerCase() === b.toLowerCase() : a === b);

// Git found by walking PATH's full entries: never a bare name, which Windows looks up in the current folder first (S6, G2).
function findGit() {
  for (const raw of (process.env.PATH || '').split(delimiter)) {
    const dir = raw.replace(/^"(.*)"$/, '$1');
    const p = join(dir, WIN ? 'git.exe' : 'git');
    try {
      if ((WIN ? /^[A-Za-z]:[\\/]/.test(dir) : dir.charAt(0) === '/') && statSync(p).isFile() && (WIN || accessSync(p, constants.X_OK) === undefined)) return p;
    } catch (e) {}
  }
  return null;
}

// Everything that runs before committed code (S3, steps 1 to 9).
function main() {
  if (Number(process.versions.node.split('.')[0]) < FLOOR) refuse(`the install needs Node ${FLOOR} or later; this is Node ${process.versions.node}.`);
  if (process.env.NODE_OPTIONS !== undefined || process.execArgv.length) {
    refuse(WIN ? 'NODE_OPTIONS is set, or node was started with an option. Run $env:NODE_OPTIONS = $null; then node gate/install.mjs with no option before the script.' : 'NODE_OPTIONS is set, or node was started with an option. Run env -u NODE_OPTIONS node gate/install.mjs with no option before the script.');
  }
  for (const k of GIT_REDIRECTS) if (process.env[k] !== undefined) refuse(`${k} is set; it redirects git. Unset it and run the install again.`);

  const self = fileURLToPath(import.meta.url);
  const repo = dirname(dirname(self));
  const gitPath = findGit();
  if (!gitPath) refuse('no git found on PATH.');
  const gitEnv = allowEnv({ GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0' });
  // No git output is ever printed: each call's bytes are parsed here, and any
  // failure is one fixed refusal.
  const git = (args, input, okCodes) => {
    const r = spawnSync(gitPath, ['--no-replace-objects', '-c', 'core.fsmonitor=false', '-C', repo].concat(args), { cwd: repo, env: gitEnv, input: input || '', maxBuffer: 1 << 30, windowsHide: true, shell: false });
    if (r.error || (okCodes || [0]).indexOf(r.status) < 0) refuse('a git command failed.');
    return r;
  };

  // The repo is this file's clone, by real path, never the working folder.
  const real = p => {
    try {
      return realpathSync.native(p);
    } catch (e) {
      return refuse('the repository folder could not be read.');
    }
  };
  const top = real(git(['rev-parse', '--show-toplevel']).stdout.toString('utf8').trim());
  if (!same(top, real(repo)) || !same(real(self), join(top, 'gate', 'install.mjs'))) refuse('this script is not at gate/install.mjs in the root of its git repository.');

  // Never the network: a partial clone refuses, read from two config keys
  // alone, so no remote address is ever read.
  if (git(['config', '--get', 'extensions.partialclone'], null, [0, 1]).status === 0) refuse('this is a partial clone; the install reads every blob locally and never fetches.');
  if (git(['config', '--name-only', '--get-regexp', '^remote\\..*\\.promisor$'], null, [0, 1]).stdout.length) refuse('this is a partial clone; the install reads every blob locally and never fetches.');

  // The commit, once, and its tree from the commit object itself.
  const commit = git(['rev-parse', 'HEAD']).stdout.toString('utf8').trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) refuse('HEAD is not a commit the install reads.');
  const body = git(['cat-file', 'commit', commit]).stdout;
  const treeLine = /^tree ([0-9a-f]{40})\n/.exec(body.toString('latin1'));
  if (sha1('commit', body) !== commit || !treeLine) refuse('the commit object is not the commit HEAD names.');
  const listing = git(['ls-tree', '-r', '-z', '--full-tree', treeLine[1]]).stdout;

  // Every record, then the staged set's checks, before anything is written (S6, G7).
  const all = [];
  for (const rec of listing.toString('utf8').split('\0')) {
    if (rec === '') continue;
    const m = /^(\d{6}) (\w+) ([0-9a-f]{40})\t([\s\S]+)$/.exec(rec);
    if (!m) refuse('git listed the commit in a form the install does not read.');
    all.push({ mode: m[1], type: m[2], id: m[3], rel: m[4] });
  }
  const staged = [];
  const folded = new Set();
  for (const e of all) {
    if (!(e.rel === 'AGENTS.md' || e.rel === 'cross/cross.mjs' || (/^(claude|familiars|gate)\//.test(e.rel) && e.rel.indexOf('gate/tests/') !== 0))) continue;
    const shownRel = e.rel.replace(/[^A-Za-z0-9._/-]/g, '?');
    if (e.mode !== '100644' || e.type !== 'blob') refuse(`the commit holds ${shownRel} with file mode ${e.mode}; only plain files (100644) are installed.`);
    for (const seg of e.rel.split('/')) if (!/^[A-Za-z0-9._-]+$/.test(seg) || seg === '.' || seg === '..') refuse(`the commit holds a path with unsafe characters: ${shownRel}.`);
    if (folded.has(e.rel.toLowerCase())) refuse(`the commit holds two paths that differ only in case: ${shownRel}.`);
    folded.add(e.rel.toLowerCase());
    staged.push(e);
  }

  // Dirty paths, counted without git status, which can run a clean filter:
  // tracked files whose bytes are not their blob, the index against the
  // commit, and untracked paths (S3, step 5).
  const dirty = new Set();
  for (const e of all.filter(x => x.type === 'blob')) {
    const p = join(repo, ...e.rel.split('/'));
    let bytes = null;
    try {
      bytes = e.mode === '120000' && lstatSync(p).isSymbolicLink() ? Buffer.from(readlinkSync(p, 'buffer')) : readFileSync(p);
    } catch (err) {}
    if (!bytes || sha1('blob', bytes) !== e.id) dirty.add(e.rel);
  }
  for (const rel of git(['diff-index', '--cached', '--no-ext-diff', '--name-only', '-z', commit]).stdout.toString('utf8').split('\0')) if (rel) dirty.add(rel);
  for (const rel of git(['ls-files', '--others', '--exclude-standard', '--directory', '--no-empty-directory', '-z']).stdout.toString('utf8').split('\0')) if (rel) dirty.add(rel);

  // One work folder (0700 on Unix) for the stage and every output, removed on every exit.
  try {
    work = mkdtempSync(join(tmpdir(), 'pact-install-'));
    mkdirSync(join(work, 'stage'));
    writeFileSync(join(work, 'tree'), listing, { flag: 'wx' });
  } catch (e) {
    refuse('the work folder could not be made in the temp folder.');
  }
  const stage = join(work, 'stage');
  const out = git(['cat-file', '--batch'], `${staged.map(e => e.id).join('\n')}\n`).stdout;
  let pos = 0;
  for (const e of staged) {
    const nl = out.indexOf(10, pos);
    const head = nl < 0 ? null : /^([0-9a-f]{40}) blob (\d+)$/.exec(out.toString('latin1', pos, nl));
    if (!head || head[1] !== e.id) refuse('a blob the commit names could not be read.');
    const bytes = out.subarray(nl + 1, nl + 1 + Number(head[2]));
    pos = nl + 2 + bytes.length;
    if (bytes.length !== Number(head[2]) || out[pos - 1] !== 10 || sha1('blob', bytes) !== e.id) refuse(`the bytes read for ${e.rel} are not its blob.`);
    try {
      const dest = join(stage, ...e.rel.split('/'));
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, bytes, { flag: 'wx' });
    } catch (err) {
      refuse('the stage could not be written.');
    }
  }

  // This script against its committed copy: a fact the runner decides on.
  const mine = staged.filter(e => e.rel === 'gate/install.mjs')[0];
  const selfDiffers = !mine || sha1('blob', readFileSync(self)) !== mine.id;
  const runner = join(stage, 'gate', 'install-run.mjs');
  if (!existsSync(runner)) refuse('the commit holds no install runner (gate/install-run.mjs).');

  // The runner: committed code only, with no exec options, an allow-listed
  // environment, its own process group on Unix, and the command line as typed.
  const args = [runner, work, commit, String(dirty.size), selfDiffers ? 'yes' : 'no', '--'].concat(process.argv.slice(2));
  child = spawn(process.execPath, args, { cwd: stage, env: allowEnv({}), stdio: ['ignore', 'pipe', 'pipe'], detached: !WIN, windowsHide: true });
  let timedOut = false;
  let checksDone = false;
  let last = null;
  let partial = '';
  const timer = setTimeout(() => {
    timedOut = true;
    killTree();
  }, LIMIT_MS);
  // Only the runner's stdout is relayed; its stderr is drained, never shown.
  const relay = line => {
    if (line !== 'CHECKS DONE') return say((last = line));
    checksDone = true;
    clearTimeout(timer);
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    const lines = (partial + chunk).split('\n');
    partial = lines.pop();
    lines.forEach(relay);
  });
  child.stderr.resume();
  child.on('error', () => {});
  child.on('close', code => {
    clearTimeout(timer);
    if (partial) relay(partial);
    // ADR 0032's control 4: a pass is exit 0 and a last line of exactly RESULT: pass.
    const ok = !timedOut && code === 0 && last === 'RESULT: pass';
    if (timedOut) say(`REFUSED: the install's checks did not finish within ${LIMIT_MS / 1000} s. Nothing was changed.`);
    else if (!ok && last !== 'RESULT: refused') say(checksDone ? 'REFUSED: the install runner failed after it began writing; the Claude home folder may hold part of this install.' : 'REFUSED: the install runner did not end with a pass. Nothing was changed.');
    if (!ok && (timedOut || last !== 'RESULT: refused')) say('RESULT: refused');
    process.exitCode = ok ? 0 : 1;
    cleanup();
  });
}

const stop = () => {
  killTree();
  cleanup();
};
for (const sig of SIGNALS) process.on(sig, () => process.exit((stop(), 1)));
process.on('exit', stop);
try {
  main();
} catch (e) {
  if (!(e instanceof Stop)) {
    say('REFUSED: the install bootstrap failed. Nothing was changed.');
    say('RESULT: refused');
  }
  process.exitCode = 1;
  cleanup();
}
