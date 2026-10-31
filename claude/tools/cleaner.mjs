#!/usr/bin/env node
// The cleaner (#438). It removes leftover worktrees under .claude/worktrees/
// and their local branches with its own fixed git commands, so no shell text
// has to be read to tell a removal apart.
//
//   node cleaner.mjs show   [--repo <dir>] [--worktree <name>]...
//   node cleaner.mjs remove [--repo <dir>] [--worktree <name>]... --yes <tag>[,<tag>]...
//
// show names back each candidate with what it holds and ends its block with a
// tag over everything it read. remove reads everything again and removes a
// candidate only when its fresh tag is in --yes: `git worktree remove`, then,
// only when git exited 0 and the folder is gone, `git branch -d`. It never
// forces, never touches a stash, a remote or anything it did not name, and
// keeps a worktree that is in use or holds commits found nowhere else.
//
// Output is fixed words, names relative to .claude/worktrees/ or the
// worktree, branch names, short hashes, stash refs and counts, every name
// escaped. git's own output is never printed. The last line is a RESULT line:
//   0  RESULT: shown <n> <tags>              or  removed <r> left 0 changed 0
//   1  RESULT: removed <r> left <l> changed <c>
//   2  RESULT: refused <count>     a usage fault; nothing run
//   4  RESULT: unavailable         git missing or too old, a linked folder,
//                                  the sessions check failed or a read failed
//
// Node 24 or later, ESM, node: built-ins only. Every rule is an exported
// function that takes the process call and the environment as inputs; only
// main reads the real values, and main runs only when this file is the entry
// script.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const BRANCH_RE = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;
const TAG_RE = /^[0-9a-f]{10}$/;
const LISTED = 20;
const GIT_FLOOR = [2, 36];
const GIT_VARS = new Set(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']);

class Unavailable extends Error {}

// ---------------------------------------------------------------- the command line

/** The command and its options, or the usage faults: nothing runs on a fault. */
export function parseArgs(argv) {
  const refusals = [];
  const [command, ...rest] = argv;
  const opts = { command, repo: null, worktrees: [], yes: null };
  if (command !== 'show' && command !== 'remove') return { opts, refusals: [{ rule: 'usage/command', where: 'argument 1' }] };
  for (let i = 0; i < rest.length; i += 1) {
    const at = `argument ${i + 2}`;
    const name = rest[i];
    const known = name === '--repo' || name === '--worktree' || (name === '--yes' && command === 'remove');
    if (!known) {
      refusals.push({ rule: 'usage/unknown-option', where: at });
      continue;
    }
    const value = rest[i + 1];
    i += 1;
    if (value === undefined) refusals.push({ rule: 'usage/value', where: at });
    else if (name === '--worktree') {
      if (NAME_RE.test(value)) opts.worktrees.push(value);
      else refusals.push({ rule: 'usage/worktree-name', where: at });
    } else if (opts[name.slice(2)] !== null) refusals.push({ rule: 'usage/repeated', where: at });
    else if (name === '--repo') opts.repo = value;
    else {
      const tags = value.split(',');
      if (tags.every(tag => TAG_RE.test(tag))) opts.yes = tags;
      else refusals.push({ rule: 'usage/tag', where: at });
    }
  }
  if (command === 'remove' && opts.yes === null && !refusals.some(r => r.rule === 'usage/tag')) refusals.push({ rule: 'usage/yes-missing', where: 'option --yes' });
  return { opts, refusals };
}

// ---------------------------------------------------------------- output

const cp = String.fromCodePoint;
const ESCAPED_RE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Zs}\\"]/gu;

/**
 * A name as printed, in one pass: a backslash doubled, a quote escaped when
 * the name goes in quotes, and every control, separator, format or
 * direction character but the space as \u{hex}.
 */
export function esc(s, inQuotes = false) {
  return s.replace(ESCAPED_RE, ch => {
    if (ch === ' ') return ' ';
    if (ch === '\\') return '\\\\';
    if (ch === '"') return inQuotes ? '\\"' : '"';
    return `\\u{${ch.codePointAt(0).toString(16)}}`;
  });
}

// The bidi controls, held as code points so this file carries none itself.
const BIDI = [cp(0x202a), cp(0x202e), cp(0x2066), cp(0x2069)];
if (!BIDI.every(ch => esc(ch) !== ch)) throw new Error('the escape table misses a direction character');

// ---------------------------------------------------------------- git

/** The value of `name` in `env`, matched without regard to case, as Windows reads it; '' when unset. */
function envValue(env, name) {
  for (const [k, v] of Object.entries(env ?? {})) if (k.toUpperCase() === name && typeof v === 'string' && v !== '') return v;
  return '';
}

/** git's absolute path from PATH, relative entries skipped, or null. */
export function findGit(env, platform = process.platform) {
  const file = platform === 'win32' ? 'git.exe' : 'git';
  for (const dir of envValue(env, 'PATH').split(delimiter)) {
    if (!dir || !isAbsolute(dir)) continue;
    try {
      if (statSync(join(dir, file)).isFile()) return join(dir, file);
    } catch {
      // not here
    }
  }
  return null;
}

/** The environment git runs with: the caller's, without the four variables that point git elsewhere. */
export function gitEnv(env) {
  return Object.fromEntries(Object.entries(env ?? {}).filter(([k, v]) => typeof v === 'string' && !GIT_VARS.has(k.toUpperCase())));
}

/**
 * A git runner: git by its absolute path, no shell, from an empty folder,
 * with the fixed flags and an empty hooks folder. `spawn` stands in for the
 * process call in tests. Returns { ok, stdout }; git's stderr is dropped.
 */
export function makeGit({ git, env, cwd, hooks, spawn = spawnSync }) {
  const clean = gitEnv(env);
  return (dir, args) => {
    const r = spawn(git, ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'log.showSignature=false', '-c', `core.hooksPath=${hooks}`, '-C', dir, ...args], { cwd, env: clean, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    return { ok: !r.error && r.status === 0, stdout: typeof r.stdout === 'string' ? r.stdout : '' };
  };
}

/** A read that must succeed: its stdout, or the run is unavailable. */
const read = (git, dir, args) => {
  const r = git(dir, args);
  if (!r.ok) throw new Unavailable('a read failed');
  return r.stdout;
};

/** The records of `git worktree list --porcelain -z`. */
export function parseWorktrees(out) {
  const records = [];
  let cur = null;
  for (const line of out.split('\0')) {
    if (line === '') {
      cur = null;
      continue;
    }
    if (cur === null) records.push((cur = {}));
    const at = line.indexOf(' ');
    const [key, value] = at < 0 ? [line, ''] : [line.slice(0, at), line.slice(at + 1)];
    cur[key] = value;
  }
  return records.filter(r => typeof r.worktree === 'string');
}

/** The entries of `git status --porcelain=v1 -z`, sorted into changed, untracked and ignored. */
export function parseStatus(out) {
  const lists = { changed: [], untracked: [], ignored: [] };
  for (const e of out.split('\0')) {
    if (e.length < 4) continue;
    const code = e.slice(0, 2);
    (code === '??' ? lists.untracked : code === '!!' ? lists.ignored : lists.changed).push(e.slice(3));
  }
  return lists;
}

// ---------------------------------------------------------------- the reads

const fold = (p, platform) => (platform === 'win32' ? resolve(p).toLowerCase() : resolve(p));
/** A path's real path, so one reached through a link compares equal; the path as given when it doesn't exist. */
const real = p => {
  try {
    return realpathSync.native(p);
  } catch {
    return resolve(p);
  }
};
const within = (inner, outer, platform) => {
  const a = fold(inner, platform);
  const b = fold(outer, platform);
  return a === b || a.startsWith(b.endsWith(sep) ? b : b + sep);
};

/** The cwd of every Claude Code session status file; a file that does not read stops the run. */
export function sessionCwds(home) {
  const dir = join(home, '.claude', 'sessions');
  let names;
  try {
    names = readdirSync(dir);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw new Unavailable('the sessions check failed');
  }
  return names.filter(n => n.endsWith('.json')).map(n => {
    let doc;
    try {
      doc = JSON.parse(readFileSync(join(dir, n), 'utf8'));
    } catch {
      throw new Unavailable('the sessions check failed');
    }
    if (typeof doc?.cwd !== 'string') throw new Unavailable('the sessions check failed');
    return doc.cwd;
  });
}

/**
 * Whether `p` is a link, the installer's way: lstat sees symlinks and
 * junctions, and a real path that differs from the path given catches the
 * reparse points lstat reads as plain folders. A missing path is no link.
 */
const isLink = (p, platform) => {
  try {
    if (lstatSync(p).isSymbolicLink()) return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
  return fold(realpathSync.native(p), platform) !== fold(p, platform);
};
const present = p => {
  try {
    lstatSync(p);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
};

/** Whether the folder holds a link anywhere inside, links never followed. */
function holdsLink(dir) {
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isSymbolicLink()) return true;
      if (e.isDirectory()) stack.push(join(d, e.name));
    }
  }
  return false;
}

/** The tag: the first 10 hex of SHA-256 over the JSON of a candidate's full facts. */
export const tagOf = facts => createHash('sha256').update(JSON.stringify(facts)).digest('hex').slice(0, 10);

/**
 * Every candidate and keep, read fresh: the main worktree, then each linked
 * worktree directly under <main>/.claude/worktrees/, narrowed by --worktree.
 */
export function readAll(git, { repo, worktrees, home, cwd, platform }) {
  const records = parseWorktrees(read(git, repo, ['worktree', 'list', '--porcelain', '-z']));
  if (!records.length) throw new Unavailable('a read failed');
  const main = realpathSync.native(records[0].worktree);
  if (isLink(join(main, '.claude'), platform) || isLink(join(main, '.claude', 'worktrees'), platform)) throw new Unavailable('the worktrees folder or its parent is a link');
  const container = join(main, '.claude', 'worktrees');
  const used = [...sessionCwds(home), cwd].map(real);
  const origin = read(git, main, ['for-each-ref', '--format=%(symref)', 'refs/remotes/origin/HEAD']).trim();
  const defaults = origin.startsWith('refs/remotes/origin/') ? [origin.slice('refs/remotes/origin/'.length)] : ['main', 'master'];
  const stashes = read(git, main, ['stash', 'list', '-z', '--format=%gd%x1f%gs']).split('\0').filter(Boolean).map(s => s.split('\x1f'));
  const items = [];
  for (const rec of records.slice(1)) {
    if ('bare' in rec) continue;
    const path = resolve(rec.worktree);
    if (fold(dirname(path), platform) !== fold(container, platform)) continue;
    const name = basename(path);
    if (worktrees.length && !worktrees.includes(name)) continue;
    const branch = typeof rec.branch === 'string' && rec.branch.startsWith('refs/heads/') ? rec.branch.slice('refs/heads/'.length) : null;
    const item = { name, path, branch, tip: rec.HEAD ?? '', keep: null };
    items.push(item);
    if (used.some(c => within(c, real(path), platform))) {
      item.keep = 'in use';
      continue;
    }
    // A name outside the --worktree set could dress its line; a linked folder would be read through its link.
    if (!NAME_RE.test(name)) {
      item.keep = 'a folder name the cleaner does not read';
      continue;
    }
    if (isLink(path, platform)) {
      item.keep = 'the folder is a link';
      continue;
    }
    // A branch name outside the rule can't go in --exclude, so its commits go unread and the worktree stays.
    if (branch !== null && !BRANCH_RE.test(branch)) {
      item.keep = 'a branch name the cleaner does not read';
      continue;
    }
    const nowhere = branch === null
      ? read(git, main, ['rev-list', '--not', '--remotes', '--branches', '--not', '--end-of-options', item.tip])
      : read(git, main, ['rev-list', '--not', '--remotes', `--exclude=${branch}`, '--branches', '--not', '--end-of-options', `refs/heads/${branch}`]);
    if (nowhere.trim()) {
      item.keep = 'commits found nowhere else';
      continue;
    }
    const gone = 'prunable' in rec || !present(path);
    const lists = gone ? parseStatus('') : parseStatus(read(git, path, ['status', '--porcelain=v1', '-z', '--ignored', '--no-renames']));
    const subjects = branch === null ? [] : [`WIP on ${branch}:`, `On ${branch}:`];
    item.facts = {
      main,
      folder: name,
      branch,
      tip: item.tip,
      locked: 'locked' in rec,
      gone,
      branchKept: branch !== null && defaults.includes(branch) ? 'the default branch' : null,
      ...lists,
      stashes: stashes.filter(([, s]) => subjects.some(p => s?.startsWith(p))).map(([ref]) => ref),
    };
    item.tag = tagOf(item.facts);
  }
  return items;
}

// ---------------------------------------------------------------- show and remove

const short = tip => (/^[0-9a-f]{7,}$/.test(tip) ? tip.slice(0, 7) : 'unknown');

/** A name in quotes, a quote inside it escaped, so it can't pass for the cleaner's own words. */
const quoted = s => `"${esc(s, true)}"`;
/** A worktree folder name: as it is when it fits the --worktree set, else quoted. */
const folderName = s => (NAME_RE.test(s) ? s : quoted(s));

function listLines(title, names, show = quoted) {
  if (!names.length) return [];
  const shown = names.slice(0, LISTED).map(n => `    ${show(n)}`);
  return [`  ${title}:`, ...shown, ...(names.length > LISTED ? [`    and ${names.length - LISTED} more`] : [])];
}

/** One candidate's name-back. */
export function blockLines(item) {
  const out = [`worktree ${folderName(item.name)}`];
  if (item.keep) return [...out, `  kept: ${item.keep}`];
  const f = item.facts;
  out.push(f.branch === null ? `  detached at ${short(f.tip)}` : `  branch ${esc(f.branch)} at ${short(f.tip)}`);
  if (f.gone) out.push("  folder gone, only git's record goes");
  if (f.locked) out.push('  locked, git will refuse');
  out.push(...listLines('changed files, git will refuse', f.changed));
  out.push(...listLines('untracked files, git will refuse', f.untracked));
  out.push(...listLines('ignored, deleted with the folder, with everything inside', f.ignored));
  // Stash refs are git's own stash@{n}, never a name someone chose.
  out.push(...listLines('stash entries made on it, kept: the cleaner never touches stashes', f.stashes, esc));
  if (f.branchKept) out.push(`  branch kept: ${f.branchKept}`);
  out.push(`  tag ${item.tag}`);
  return out;
}

/** Why git refused a worktree, from the facts show named. */
const refusedFor = f => (f.changed.length || f.untracked.length ? 'left, git refused: it holds changed or untracked files' : f.locked ? 'left, git refused: it is locked' : 'left, git refused it');

/** remove's work on the candidates whose tags are in `yes`. */
function removeAll(git, items, yes, hooks, platform) {
  const lines = [];
  const counts = { removed: 0, left: 0 };
  const wanted = new Set(yes);
  const main = items.find(i => i.facts)?.facts.main;
  let stopped = false;
  for (const item of items) {
    if (!item.tag || !wanted.has(item.tag)) continue;
    wanted.delete(item.tag);
    if (stopped) {
      counts.left += 1;
      lines.push(`worktree ${esc(item.name)}: left, the run stopped before it`);
      continue;
    }
    try {
      removeOne(git, item, main, hooks, platform, lines, counts);
    } catch {
      // A failure part way counts this item, and every one after it, as left.
      stopped = true;
      counts.left += 1;
      lines.push(`worktree ${esc(item.name)}: left, the run stopped here`);
    }
  }
  return { lines, ...counts, changed: wanted.size };
}

/** One candidate's removal, its report added to `lines` and its count to `counts`. */
function removeOne(git, item, main, hooks, platform, lines, counts) {
  const f = item.facts;
  const head = `worktree ${folderName(item.name)}`;
  const left = (why, extra = []) => {
    counts.left += 1;
    lines.push(`${head}: ${why}`, ...extra, ...(f.branch !== null ? [`  the branch stays: ${esc(f.branch)}`] : []));
  };
  // The hooks folder is checked right before each removal call.
  const hooksChanged = () => lstatSync(hooks).isSymbolicLink() || readdirSync(hooks).length > 0;
  if (hooksChanged()) return left("left, the run's hooks folder changed");
  const ok = git(main, ['worktree', 'remove', item.path]).ok;
  if (present(item.path)) {
    const link = isLink(item.path, platform) ? ['  it is a link: remove the link, not what it points to'] : holdsLink(item.path) ? ['  it holds a link: remove the link first'] : [];
    return left(ok ? 'left' : refusedFor(f), ['  the folder stays: remove it by hand', ...link]);
  }
  if (!ok) return left(refusedFor(f));
  if (f.branch === null) lines.push(`${head}: removed`);
  else if (f.branchKept) lines.push(`${head}: removed; branch ${esc(f.branch)} kept: ${f.branchKept}`);
  else if (!hooksChanged() && git(main, ['branch', '-d', f.branch]).ok) lines.push(`${head}: removed`);
  else {
    counts.left += 1;
    lines.push(`${head}: left, the folder is gone`, `  the branch stays: ${esc(f.branch)}`);
    return;
  }
  counts.removed += 1;
}

const refused = refusals => ({ code: 2, lines: [...refusals.map(r => `REFUSED ${r.rule} ${r.where}`), `RESULT: refused ${refusals.length}`] });
const unavailable = why => ({ code: 4, lines: [`the cleaner is unavailable: ${why}`, 'RESULT: unavailable'] });

/**
 * One run: `argv` after the script's name, and `io` holding env, home, cwd,
 * and optionally platform, spawn and rm, which stand in for the platform and
 * the process and folder-delete calls in tests. Returns { code, lines }; the last line
 * is always the RESULT line.
 */
export function clean(argv, io) {
  const { opts, refusals } = parseArgs(argv);
  if (refusals.length) return refused(refusals);
  const git = findGit(io.env, io.platform);
  if (git === null) return unavailable('git was not found');
  const made = [];
  let removing = false;
  try {
    const cwd = mkdtempSync(join(io.home, '.pact-cleaner-run-'));
    made.push(cwd);
    const hooks = mkdtempSync(join(io.home, '.pact-cleaner-hooks-'));
    made.push(hooks);
    const run = makeGit({ git, env: io.env, cwd, hooks, spawn: io.spawn });
    const repo = resolve(io.cwd, opts.repo ?? '.');
    const v = /^git version (\d+)\.(\d+)/.exec(read(run, repo, ['version']));
    if (!v || Number(v[1]) * 1000 + Number(v[2]) < GIT_FLOOR[0] * 1000 + GIT_FLOOR[1]) return unavailable('git is missing or older than 2.36');
    const platform = io.platform ?? process.platform;
    const items = readAll(run, { repo, worktrees: opts.worktrees, home: io.home, cwd: io.cwd, platform });
    if (opts.command === 'show') {
      const tags = items.filter(i => i.tag).map(i => i.tag);
      return { code: 0, lines: [...items.flatMap(blockLines), `RESULT: shown ${tags.length}${tags.length ? ` ${tags.join(',')}` : ''}`] };
    }
    removing = true;
    const r = removeAll(run, items, opts.yes, hooks, platform);
    return { code: r.left || r.changed ? 1 : 0, lines: [...r.lines, `RESULT: removed ${r.removed} left ${r.left} changed ${r.changed}`] };
  } catch (e) {
    // removeAll catches each removal's own failure; this is a failure around them.
    if (removing) return { code: 1, lines: ['the cleaner stopped part way; check git worktree list before running it again', 'RESULT: removed 0 left 0 changed 0'] };
    return unavailable(e instanceof Unavailable ? e.message : 'the cleaner failed before removing anything');
  } finally {
    // A run folder that can't be deleted (a handle held on Windows) never replaces the result with Node's error text.
    for (const d of made) {
      try {
        (io.rm ?? rmSync)(d, { recursive: true, force: true });
      } catch {
        // left under the home folder, empty
      }
    }
  }
}

// ---------------------------------------------------------------- main

function main() {
  const r = clean(process.argv.slice(2), { env: { ...process.env }, home: homedir(), cwd: process.cwd() });
  process.stdout.write(`${r.lines.join('\n')}\n`);
  process.exitCode = r.code;
}

/** Whether this file is the entry script. Node added import.meta.main in 24.2; an earlier Node 24 compares the real paths instead. */
function isEntry() {
  if (typeof import.meta.main === 'boolean') return import.meta.main;
  try {
    return typeof process.argv[1] === 'string' && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntry()) main();
