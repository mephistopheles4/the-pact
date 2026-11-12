#!/usr/bin/env node
// The cleaner (#438). It removes leftover worktrees under .claude/worktrees/
// and their local branches with its own fixed git commands, so no shell text
// has to be read to tell a removal apart.
//
//   node cleaner.mjs show   [--recoverable] [--repo <dir>] [--worktree <name>]...
//   node cleaner.mjs remove [--recoverable] [--repo <dir>] [--worktree <name>]... [--yes <tag>[,<tag>]...] [--override <folder>=<tag>[,...]]
//   (remove needs --yes, --override or both)
//
// show names back each candidate with what it holds and ends its block with a
// tag over everything it read. remove reads everything again and removes a
// candidate only when its fresh tag is in --yes: `git worktree remove`, then,
// only when git exited 0 and the folder is gone, `git branch -d`. It never
// touches a stash, a remote or anything it did not name, and keeps a worktree
// that is in use or holds commits found nowhere else on a detached head. A
// lock Claude Code wrote for a stopped background session (#492) is unlocked
// just before its removal and put back if git refuses; any other lock stands.
//
// The override (#523) is the one way past a refusal. A soft risk (changed or
// untracked files, commits found nowhere else on a branch, a lock that is not
// a stopped session's) gets a warning naming what is lost, an undo line with
// full hashes, and a 16-hex override tag, and remove --override
// <folder>=<tag> takes only a pair whose folder and fresh tag match. It reads
// the folder once more before lifting a lock, lifts any lock, and passes
// --force at most once, in a `git worktree remove`, only when changed or
// untracked files were listed; never -f, -D or --delete. A hard keep (in use,
// a link, a submodule, edits git is told not to check, a read that failed)
// gets no override tag. A session passes it only on the owner's own words in
// chat; remove's lines go to chat only. Right before the forced call it checks
// that the folder, its parent and .claude are not links and that the folder is
// the one it read. Every git call carries the pins that keep a setting from
// hiding an untracked file or an edit.
//
// --recoverable (#446) also keeps a worktree
// whose removal could lose what git does not hold, or run a program: ignored
// files or links, a filter a session could have set, a populated submodule,
// or edits git is told not to check. It needs git 2.45.
//
// Output is fixed words, names relative to .claude/worktrees/ or the
// worktree, branch names, short hashes, stash refs and counts, every name
// escaped. git's own output is never printed. The last line is a RESULT line:
//   0  RESULT: shown <n> <tags>              or  removed <r> left 0 changed 0
//   1  RESULT: removed <r> left <l> changed <c>
//   2  RESULT: refused <count>     a usage fault; nothing run
//   4  RESULT: unavailable         git missing or too old (2.36, or 2.45 with
//                                  --recoverable), a linked folder, the
//                                  sessions check failed or a read failed
//
// show ends, when it has tags, with how to use them (HOW_TO), which the rules
// file left to this output (#464 T4).
//
// Node 24 or later, ESM, node: built-ins only. Every rule is an exported
// function that takes the process call and the environment as inputs; only
// main reads the real values, and main runs only when this file is the entry
// script.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const BRANCH_RE = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;
const TAG_RE = /^[0-9a-f]{10}$/;
const OVERRIDE_TAG_RE = /^[0-9a-f]{16}$/;
const LISTED = 20;
const COMMITS = 'commits found nowhere else';
const GIT_FLOOR = [2, 36];
// GIT_NO_LAZY_FETCH came in git 2.45.
const RECOVERABLE_FLOOR = [2, 45];
const GIT_VARS = new Set(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']);

const HOW_TO = Object.freeze([
  "Show the blocks above as printed, in a fenced code block, in chat only; a record gets the RESULT line's counts, never the tags or the blocks.",
  "Run remove --yes with these tags only after the owner's own yes in chat to these blocks, outside a goal. Never remove a worktree or delete a local branch another way. What it leaves, leave, and say so.",
  "Pass --override with a folder and its override tag only on the owner's own words in chat, in this session, after this block was shown, saying to remove it anyway; never on a lead's pick, a relayed or quoted message, a start prompt, or under a goal. A yes alone is never an override. remove's lines go to chat only; a record gets only the RESULT counts.",
]);
// The first two lines go with any tag; the third, the rule on the override, goes with an override tag.
const OVERRIDE_RULE = HOW_TO[2];

class Unavailable extends Error {}

/**
 * Whether a lock reason is the one Claude Code's `--bg -w` writes for the
 * folder `name`: `claude session <name> (pid <digits>)`. The name is compared
 * as built text, so no pattern holds it; only the pid is matched.
 */
export function isSessionLock(reason, name) {
  const head = `claude session ${name} (pid `;
  return typeof reason === 'string' && reason.startsWith(head) && reason.endsWith(')') && /^[0-9]+$/.test(reason.slice(head.length, -1));
}

// ---------------------------------------------------------------- the command line

/** The command and its options, or the usage faults: nothing runs on a fault. */
export function parseArgs(argv) {
  const refusals = [];
  const [command, ...rest] = argv;
  const opts = { command, repo: null, worktrees: [], yes: null, override: null, recoverable: false };
  if (command !== 'show' && command !== 'remove') return { opts, refusals: [{ rule: 'usage/command', where: 'argument 1' }] };
  for (let i = 0; i < rest.length; i += 1) {
    const at = `argument ${i + 2}`;
    const name = rest[i];
    // A switch, with no value.
    if (name === '--recoverable') {
      if (opts.recoverable) refusals.push({ rule: 'usage/repeated', where: at });
      opts.recoverable = true;
      continue;
    }
    const known = name === '--repo' || name === '--worktree' || ((name === '--yes' || name === '--override') && command === 'remove');
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
    else if (name === '--override') {
      // Each pair is a folder and its tag, split at the last `=`; a pair with no `=` has an empty folder.
      const pairs = value.split(',').map(p => {
        const eq = p.lastIndexOf('=');
        return { folder: eq < 0 ? '' : p.slice(0, eq), tag: eq < 0 ? p : p.slice(eq + 1) };
      });
      const badTag = pairs.some(p => !OVERRIDE_TAG_RE.test(p.tag));
      const badName = pairs.some(p => !NAME_RE.test(p.folder));
      if (badTag) refusals.push({ rule: 'usage/tag', where: at });
      if (badName) refusals.push({ rule: 'usage/override-name', where: at });
      if (!badTag && !badName) opts.override = pairs;
    } else {
      const tags = value.split(',');
      if (tags.every(tag => TAG_RE.test(tag))) opts.yes = tags;
      else refusals.push({ rule: 'usage/tag', where: at });
    }
  }
  if (command === 'remove' && opts.yes === null && opts.override === null && !refusals.some(r => r.rule === 'usage/tag' || r.rule === 'usage/override-name')) refusals.push({ rule: 'usage/yes-missing', where: 'option --yes' });
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
 * with the fixed flags, an empty hooks folder and, on every call, the pins
 * that keep a setting from hiding an untracked file or an edit. With
 * `recoverable`, every call also fetches no missing object (git 2.45).
 * `spawn` stands in for the process call in tests. Returns
 * { ok, stdout }; git's stderr is dropped.
 */
export function makeGit({ git, env, cwd, hooks, recoverable = false, spawn = spawnSync }) {
  const clean = recoverable ? { ...gitEnv(env), GIT_NO_LAZY_FETCH: '1' } : gitEnv(env);
  // Untracked files and stat trust are pinned on every call (#523), so no setting hides an untracked file from the
  // cleaner or from git's own check, or makes an edited file read as clean.
  const pins = ['-c', 'status.showUntrackedFiles=normal', '-c', 'core.checkStat=default', '-c', 'core.trustctime=true'];
  return (dir, args) => {
    const r = spawn(git, ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'log.showSignature=false', '-c', `core.hooksPath=${hooks}`, ...pins, '-C', dir, ...args], { cwd, env: clean, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
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
// Two separators open a network or device path; resolving one on Windows can
// contact its host. A device prefix before a drive letter is a local path.
const NET_RE = /^[\\/]{2}/;
const DEVICE_DRIVE_RE = /^[\\/]{2}[?.][\\/](?=[A-Za-z]:)/;
const local = p => p.replace(DEVICE_DRIVE_RE, '');

// A path under an autofs root mounts from the host named in it (#442). On
// Windows /net is a plain folder and none counts. On macOS /net and
// /Network/Servers count, in any case. Elsewhere /net counts, as written.
const AUTOFS_RE = /^\/net(?:\/|$)/;
const AUTOFS_MAC_RE = /^\/(?:net|network\/servers)(?:\/|$)/i;

/** Whether reading `p` could reach another host: a network path, or an autofs path under /net (macOS: also /Network/Servers). */
const remote = (p, platform) => NET_RE.test(local(p)) || (platform === 'darwin' ? AUTOFS_MAC_RE.test(p) : platform !== 'win32' && AUTOFS_RE.test(p));

/**
 * Whether a link target, as `readlink` returned it, may be followed (#442).
 * It is checked on the raw string, before any resolve(), which would turn
 * `\??\GLOBALROOT\Device\Mup\h\s` into a drive path that looks local. On
 * Windows only a drive-absolute path, or a relative one with no drive letter,
 * is plain; elsewhere any target but one with two leading separators is.
 */
export function plainTarget(t, platform) {
  const s = local(t);
  if (platform === 'win32') return /^[A-Za-z]:[\\/]/.test(s) || !/^[\\/]|^[A-Za-z]:/.test(s);
  return !NET_RE.test(t);
}

// What the walk returns for a remote path and for any doubt alike: compare the path as written.
const REMOTE = 'remote';
const MAX_HOPS = 40;
const MAX_STEPS = 4096;
const FOLDS = platform => platform === 'win32' || platform === 'darwin';

/**
 * The physical folder a path reaches, found without opening, probing or
 * resolving a part before its parent's listing has shown it is not a link
 * (#442). A part the listing does not show is never touched: on Windows a
 * name it hides (an 8.3 short name, a trailing dot) can open a junction, and
 * lstat on a junction to a network path can follow its target (it threw
 * ENOENT on Windows, as a failed lookup would, #442 C15). So the walk's own
 * code calls no lstat, stat, realpath or access (Node may lstat, on POSIX, an
 * entry whose type comes back unknown): `io.readdir` lists a folder and
 * `io.readlink` reads a link the listing showed. Returns REMOTE, or
 * `{ real, rest }`: the folder reached, and the parts left unwalked. Every
 * doubt ends REMOTE, and the path is then compared as written.
 */
function walk(p, platform, io) {
  const split = s => s.split(platform === 'win32' ? /[\\/]/ : '/').filter(Boolean);
  const { root } = parse(p);
  const todo = split(p.slice(root.length));
  let cur = root;
  let hops = 0;
  for (let steps = 0; todo.length; ) {
    if (++steps > MAX_STEPS) return REMOTE;
    const part = todo.shift();
    if (part === '.') continue;
    if (part === '..') {
      cur = dirname(cur); // cur is always physical, so this is the physical parent
      continue;
    }
    if (remote(join(cur, part), platform)) return REMOTE;
    const unwalked = { real: cur, rest: [part, ...todo] };
    let list;
    try {
      list = io.readdir(cur, { withFileTypes: true });
    } catch (e) {
      return e?.code === 'ENOENT' || e?.code === 'ENOTDIR' ? unwalked : REMOTE;
    }
    let entry = list.find(e => e.name === part);
    if (!entry && FOLDS(platform)) {
      const same = list.filter(e => e.name.toLowerCase() === part.toLowerCase());
      if (same.length > 1 || same[0]?.isSymbolicLink()) return REMOTE;
      entry = same[0];
    }
    if (!entry) return unwalked; // nothing touches the unshown name
    if (entry.isSymbolicLink()) {
      if (++hops > MAX_HOPS) return REMOTE;
      let target;
      try {
        target = io.readlink(join(cur, entry.name));
      } catch {
        return REMOTE;
      }
      if (!plainTarget(target, platform) || remote(target, platform)) return REMOTE;
      const t = local(target);
      const { root: tr } = parse(t);
      todo.unshift(...split(t.slice(tr.length)));
      if (tr) cur = tr; // an absolute target restarts at its root; a relative one starts in the link's folder
    } else if (entry.isDirectory()) {
      cur = join(cur, entry.name); // the entry's own name, so the next listing opens what was checked
    } else {
      return unwalked; // a file, a device or an unknown type is never gone into
    }
  }
  return { real: cur, rest: [] };
}

/**
 * A path's real path, so one reached through a link compares equal: the
 * physical folder the walk reached, resolved, with the unwalked rest joined
 * on. A path that is remote, or reaches a remote path through a link or a
 * chain of links, is never resolved on disk. `rp` stands in for the real-path
 * call in tests, `io` for the listing and link reads. The real-path call runs
 * only on a folder a listing showed (or the path's root), never on a part no
 * listing showed.
 */
export function realOf(p, rp = realpathSync.native, platform = process.platform, io = { readdir: readdirSync, readlink: readlinkSync }) {
  const given = resolve(local(p));
  if (remote(p, platform) || remote(given, platform)) return given;
  // The walk takes the path as written, so a `..` after a link is its physical parent.
  const start = local(p);
  const w = walk(isAbsolute(start) ? start : `${process.cwd()}${sep}${start}`, platform, io);
  if (w === REMOTE) return given;
  try {
    return join(rp(w.real), ...w.rest);
  } catch {
    return given;
  }
}

/** Every form a path is known by: as given, and its real path. */
const forms = p => [...new Set([resolve(local(p)), realOf(p)])];
const within = (inner, outer, platform) => {
  const a = fold(inner, platform);
  const b = fold(outer, platform);
  return a === b || a.startsWith(b.endsWith(sep) ? b : b + sep);
};

/**
 * The cwd of every Claude Code session status file. A file that does not
 * read, and (#442) a sessions folder or a status file that is a link or the
 * wrong kind, stop the run: a planted link could point at another host, and
 * reading through it would reach it. `~/.claude` is listed as given, so a
 * link there is not caught (#519); the sessions folder and its files are
 * listed first, so nothing under them is opened before a listing shows it is
 * no link.
 */
export function sessionCwds(home, platform = process.platform) {
  const fail = () => new Unavailable('the sessions check failed');
  const list = dir => {
    try {
      return readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw fail();
    }
  };
  const claude = join(home, '.claude');
  const top = list(claude);
  if (!top) return [];
  let entry = top.find(e => e.name === 'sessions');
  if (!entry && FOLDS(platform)) {
    const same = top.filter(e => e.name.toLowerCase() === 'sessions');
    if (same.length > 1) throw fail();
    entry = same[0];
  }
  if (!entry) return [];
  if (entry.isSymbolicLink() || !entry.isDirectory()) throw fail();
  const dir = join(claude, entry.name);
  const files = list(dir);
  if (!files) return [];
  const status = files.filter(e => e.name.endsWith('.json'));
  if (status.some(e => e.isSymbolicLink() || !e.isFile())) throw fail();
  return status.map(e => {
    let doc;
    try {
      doc = JSON.parse(readFileSync(join(dir, e.name), 'utf8'));
    } catch {
      throw fail();
    }
    if (typeof doc?.cwd !== 'string') throw fail();
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

/**
 * A worktree folder's identity (device and inode), or null when it, its parent
 * `.claude/worktrees` or `.claude` is a link, or it can't be read. Run after the
 * last read and again right before a forced removal: a difference means the
 * folder was swapped in between (#523).
 */
function standOf(path, main, platform) {
  try {
    if (isLink(path, platform) || isLink(join(main, '.claude'), platform) || isLink(join(main, '.claude', 'worktrees'), platform)) return null;
    const st = lstatSync(path);
    return `${st.dev}:${st.ino}`;
  } catch {
    return null;
  }
}

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

// --recoverable's keeps, read before any `status` runs. A filter driver's
// program runs when `status` reads a changed file, and none of the fixed
// flags stops it; git's status runs one inside each populated submodule too.
// A session can write a filter into its repository's own config, or a key a
// global or system driver reads from it (an LFS extension), or a hook set in
// config, which the empty hooks folder doesn't cover; so a `filter.`, `lfs.`
// or `hook.` key of local or worktree scope keeps the worktree, as a config
// read that fails does; an included file counts in its includer's scope.
// Global, system and command scope stay as they are: a writer there already
// reaches every git call the owner runs.
const LOCAL_PROGRAM = /^(?:local|worktree)\t(?:filter|lfs|hook)\./i;
// A work tree set in config points git's reads at another folder than the one git's own check removes.
const LOCAL_WORKTREE = /^(?:local|worktree)\tcore\.worktree$/i;
const ELSEWHERE = 'its config points git at another folder';
const POINTER = 'its .git file names another git folder';
const POINTER_MAX = 4096;
const FILTER = 'a filter program could run';
const HIDES = 'hides edits from git';
const IGNORED = 'holds ignored files, which are not in git';
const CHANGED = 'holds changed or untracked files';
const LINKED = 'a submodule path goes through a link';
const UNSEEN = 'a submodule folder holds files git does not see';
const READ_FAILED = 'a read failed, so it is kept';
const LINK_KEEP = 'holds a link: remove the link itself first, never with a recursive delete, then the folder by hand';
const GIT_KEEP = 'holds a .git entry below its root, which git does not see';

/**
 * What git's removal would walk into or past without the cleaner seeing it
 * (#454): every link (a symlink or junction as Node reports it, file or
 * folder) and every `.git` entry below the root, in any case, as sorted
 * relative paths. A link is listed and never entered, and so is a `.git`
 * entry; the root's own `.git` is the pointer file `pointsHome` reads. A folder
 * whose real path differs from where the walk found it is a link too, the
 * installer's test, for a reparse point Node lists as a plain folder. A read
 * that fails throws, so the caller keeps that worktree.
 */
export function walkTree(root, readdir = readdirSync, real = realpathSync.native, platform = process.platform) {
  const links = [];
  const gits = [];
  const stack = [''];
  const realRoot = real(root);
  // A root swapped for a link after the caller's link check would be read through, so it is a failed read.
  if (fold(realRoot, platform) !== fold(root, platform)) throw new Error('the root is a link');
  while (stack.length) {
    const rel = stack.pop();
    for (const e of readdir(rel ? join(root, rel) : root, { withFileTypes: true })) {
      const at = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) links.push(at);
      else if (e.name.toLowerCase() === '.git') {
        if (rel) gits.push(at);
      } else if (e.isDirectory()) {
        if (fold(real(join(root, at)), platform) !== fold(join(realRoot, at), platform)) links.push(at);
        else stack.push(at);
      }
    }
  }
  return { links: links.sort(), gits: gits.sort() };
}

/**
 * Whether the `.git` file at `p`, a populated submodule's, names a folder under
 * the main repository's git folder and no part of the way there is a link: a
 * pointer git can follow without leaving the repository (#442). A directory
 * `.git`, a pointer naming another place and a remote path all say no. Read
 * with no git run.
 */
function submoduleHome(main, p, platform) {
  try {
    const st = lstatSync(p);
    if (!st.isFile() || st.size > POINTER_MAX) return false;
    const m = /^gitdir: (.+?)\r?\n?$/.exec(readFileSync(p, 'utf8'));
    if (!m) return false;
    const target = resolve(dirname(p), m[1]);
    const gitDir = join(main, '.git');
    if (remote(target, platform) || !within(target, gitDir, platform) || fold(target, platform) === fold(gitDir, platform)) return false;
    return !throughLink(gitDir, relative(gitDir, target).split(sep).join('/'), platform);
  } catch {
    return false;
  }
}

/** Why the config read from `dir` keeps a worktree: a program or a work tree a session could have set, or a read that fails; else null. */
export function configKeep(git, dir) {
  const config = git(dir, ['config', '--show-scope', '--list', '--name-only']);
  if (!config.ok) return FILTER;
  const keys = config.stdout.split('\n');
  if (keys.some(l => LOCAL_PROGRAM.test(l))) return FILTER;
  if (keys.some(l => LOCAL_WORKTREE.test(l))) return ELSEWHERE;
  return null;
}

/**
 * Whether the worktree's `.git` file names its own folder under
 * `<main>/.git/worktrees/`, whose `gitdir` names it back, so no git call in
 * it is pointed at another repository or a remote path. Read with no git run.
 * Returns that admin folder's path, or null.
 */
function pointsHome(main, path, platform) {
  // A pointer file is one short line: a regular file, not a link, read only when small.
  const small = p => {
    const st = lstatSync(p);
    return st.isFile() && st.size <= POINTER_MAX ? readFileSync(p, 'utf8') : null;
  };
  const dotGit = join(path, '.git');
  const line = small(dotGit);
  const m = line === null ? null : /^gitdir: (.+?)\r?\n?$/.exec(line);
  if (!m) return null;
  const admin = resolve(path, m[1]);
  if (remote(admin, platform) || fold(dirname(admin), platform) !== fold(join(main, '.git', 'worktrees'), platform) || isLink(admin, platform)) return null;
  // git keeps both paths relative to the admin folder when they are relative.
  const back = small(join(admin, 'gitdir'));
  const common = small(join(admin, 'commondir'));
  if (back === null || common === null) return null;
  const commonDir = resolve(admin, common.trim());
  if (remote(commonDir, platform) || fold(commonDir, platform) !== fold(join(main, '.git'), platform)) return null;
  return fold(resolve(admin, back.trim()), platform) === fold(dotGit, platform) ? admin : null;
}

/** Whether any part of `rel` under `root` is a link, the installer's way, walked from the root, never statting through one. */
function throughLink(root, rel, platform) {
  let cur = root;
  for (const part of rel.split('/').filter(Boolean)) {
    cur = join(cur, part);
    if (!present(cur)) return false;
    if (isLink(cur, platform)) return true;
  }
  return false;
}

/** Whether a folder holds anything; a missing one holds nothing. */
function holdsAny(dir) {
  try {
    return readdirSync(dir).length > 0;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}

/**
 * Why --recoverable keeps the worktree at `path` before its status is read,
 * with the names it lists, or null. No git call runs inside a submodule: a
 * populated one is a gitlink in the worktree's index with a `.git` entry at
 * its path, read without statting through a link. A read that fails keeps
 * this worktree alone.
 */
export function heldBack(git, path, platform = process.platform) {
  const config = configKeep(git, path);
  if (config) return { keep: config, lists: [] };
  try {
    const entries = out => out.split('\0').filter(Boolean);
    const gitlinks = entries(read(git, path, ['ls-files', '--stage', '-z'])).filter(e => e.startsWith('160000 ')).map(e => e.slice(e.indexOf('\t') + 1));
    // An index path is the session's text: one that could climb out of the worktree is never joined.
    if (gitlinks.some(p => p.split('/').some(part => part === '' || part === '.' || part === '..' || /[\\:]/.test(part)))) return { keep: READ_FAILED, lists: [] };
    // Since #442 the walk keeps a worktree holding a link before this runs, so this keep is reached only by a link made
    // between the walk and this read. It stays as the second check.
    const linked = gitlinks.filter(p => throughLink(path, p, platform));
    if (linked.length) return { keep: LINKED, lists: [['submodule paths', linked]] };
    const populated = gitlinks.filter(p => present(join(path, p, '.git')));
    if (populated.length) return { keep: FILTER, lists: [['populated submodules', populated]] };
    // git leaves a submodule that isn't populated as an empty folder, and reads nothing inside it.
    const unseen = gitlinks.filter(p => holdsAny(join(path, p)));
    if (unseen.length) return { keep: UNSEEN, lists: [['submodule folders', unseen]] };
    // ls-files -v marks an assume-unchanged entry with a lower-case letter and a skip-worktree one with S.
    const hidden = entries(read(git, path, ['ls-files', '-v', '-z'])).filter(e => /^(?:[a-z]|S) /.test(e)).map(e => e.slice(2));
    if (hidden.length) return { keep: HIDES, lists: [['files git does not check for edits', hidden]] };
  } catch {
    return { keep: READ_FAILED, lists: [] };
  }
  return null;
}

/** The tag: the first `length` hex (10 for a yes tag, 16 for an override tag) of SHA-256 over the JSON of a candidate's full facts. */
export const tagOf = (facts, length = 10) => createHash('sha256').update(JSON.stringify(facts)).digest('hex').slice(0, length);

// ---------------------------------------------------------------- the override read (#523)

/** Whether a name from git's own lists could climb out of the worktree when joined to it, as `heldBack` asks of an index path. */
const climbs = name => name.split('/').some(part => part === '' || part === '.' || part === '..' || /[\\:]/.test(part));

/**
 * What an override would take from a worktree whose folder is present and that
 * no hard keep holds. `submodules`: a gitlink in its index or a `modules`
 * folder in its admin folder (read with no git). Unless `recoverable`: the
 * entries git is told not to check (`hidden`), every changed and untracked
 * file with no folder collapsed, and one lstat tuple per such name, which are
 * never followed and run no git. A read that fails sets `failed`, which
 * withholds the override tag and nothing else (F6).
 */
function overrideRead(git, path, admin, recoverable, lstat) {
  const risk = { submodules: false, hidden: [], failed: false, changed: [], untracked: [], files: [] };
  const entries = out => out.split('\0').filter(Boolean);
  const take = args => {
    const r = git(path, args);
    if (!r.ok) risk.failed = true;
    return r.ok ? r.stdout : null;
  };
  const stage = take(['ls-files', '--stage', '-z']);
  if (stage !== null && entries(stage).some(e => e.startsWith('160000 '))) risk.submodules = true;
  // The names the index holds: only these can be a deleted file, so a name outside it that lstat cannot find (a name git's text decodes to something else, or a race) bars the tag.
  const tracked = new Set(stage === null ? [] : entries(stage).map(e => e.slice(e.indexOf('\t') + 1)));
  try {
    if (admin !== null && present(join(admin, 'modules'))) risk.submodules = true;
  } catch {
    risk.failed = true;
  }
  if (recoverable) return risk;
  const hidden = take(['ls-files', '-v', '-z']);
  // ls-files -v marks an assume-unchanged entry with a lower-case letter and a skip-worktree one with S.
  if (hidden !== null) risk.hidden = entries(hidden).filter(e => /^(?:[a-z]|S) /.test(e)).map(e => e.slice(2));
  const status = take(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']);
  if (status !== null) {
    const lists = parseStatus(status);
    risk.changed = lists.changed;
    risk.untracked = lists.untracked;
  }
  for (const name of [...risk.changed, ...risk.untracked]) {
    // A name is git's text, and the session's: one that could climb out of the worktree is never joined.
    if (climbs(name)) {
      risk.failed = true;
      break;
    }
    try {
      const st = lstat(join(path, name));
      risk.files.push([name, st.size, st.mtimeMs, st.ctimeMs, Number(st.ino)]);
    } catch (e) {
      // A deleted tracked file is gone: nulls in place of its numbers. Any other name that is not there is a failed read.
      if (e?.code === 'ENOENT' && tracked.has(name)) risk.files.push([name, null, null, null, null]);
      else {
        risk.failed = true;
        break;
      }
    }
  }
  return risk;
}

/** The override tag of an item with facts: 16 hex over the facts and the override read, or null when a keep, a hidden edit or a failed read bars it, or nothing soft stands in the way. */
function overrideTagOf(item) {
  const { facts: f, risk: r } = item;
  if (!f || !r || r.submodules || r.failed || r.hidden.length) return null;
  const soft = r.changed.length || r.untracked.length || (f.lock !== null && !isSessionLock(f.lock, f.folder)) || f.branchKept === COMMITS;
  if (!soft) return null;
  return tagOf({ ...f, submodules: false, overrideChanged: r.changed, overrideUntracked: r.untracked, overrideFiles: r.files, override: true }, 16);
}

/**
 * Every candidate and keep, read fresh: the main worktree, then each linked
 * worktree directly under <main>/.claude/worktrees/, narrowed by --worktree.
 * `lstat` stands in for the lstat of the override read's file tuples.
 */
export function readAll(git, { repo, worktrees, home, cwd, platform, recoverable = false, readdir = readdirSync, lstat = lstatSync }) {
  const records = parseWorktrees(read(git, repo, ['worktree', 'list', '--porcelain', '-z']));
  if (!records.length) throw new Unavailable('a read failed');
  const main = realpathSync.native(records[0].worktree);
  if (isLink(join(main, '.claude'), platform) || isLink(join(main, '.claude', 'worktrees'), platform)) throw new Unavailable('the worktrees folder or its parent is a link');
  const container = join(main, '.claude', 'worktrees');
  const used = [...sessionCwds(home, platform), cwd].flatMap(forms);
  const origin = read(git, main, ['for-each-ref', '--format=%(symref)', 'refs/remotes/origin/HEAD']).trim();
  const defaults = origin.startsWith('refs/remotes/origin/') ? [origin.slice('refs/remotes/origin/'.length)] : ['main', 'master'];
  const stashes = read(git, main, ['stash', 'list', '-z', '--format=%gd%x1f%gs']).split('\0').filter(Boolean).map(s => s.split('\x1f'));
  // `branch -d` runs from the main worktree, so a program its own config names keeps every worktree.
  const mainKeep = recoverable ? configKeep(git, main) : null;
  const mainHeld = mainKeep ? { keep: mainKeep, lists: [] } : null;
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
    try {
      // A linked folder is kept before anything resolves or reads through it.
      if (isLink(path, platform)) {
        item.keep = 'the folder is a link';
        continue;
      }
      // In use when any form of a cwd sits in any form of the worktree: a link either way keeps it.
      const where = forms(path);
      if (used.some(c => where.some(w => within(c, w, platform)))) {
        item.keep = 'in use';
        continue;
      }
      // A name outside the --worktree set could dress its line.
      if (!NAME_RE.test(name)) {
        item.keep = 'a folder name the cleaner does not read';
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
      const unpushed = nowhere.trim() ? nowhere.trim().split('\n').length : 0;
      // On a branch these commits stay on the branch after the folder goes: a soft risk, read on through every
      // later check. On a detached head nothing would name them: a hard keep.
      if (unpushed && branch === null) {
        item.keep = COMMITS;
        continue;
      }
      const gone = 'prunable' in rec || !present(path);
      // git lists no folder link to an empty folder and skips a `.git` entry, and its removal might walk into either,
      // so the cleaner walks a folder that is still there itself, in every run, links never entered (#454).
      // The walk runs no git and enters no link (it lists, and resolves the real path of each folder a listing
      // showed as plain), so it comes before any git call in the worktree (#442): git's status, its config and
      // its index reads follow a junction on Windows, and a session can plant one aimed at a share.
      let walked = { links: [], gits: [] };
      if (present(path)) {
        try {
          walked = walkTree(path, readdir, undefined, platform);
        } catch {
          item.keep = READ_FAILED;
          item.keepLists = [];
          continue;
        }
      }
      // The main worktree's config keep reads nothing in this folder, so it still comes first. A link keeps the
      // worktree with no git call in it, so the changed and untracked files git would name are not listed.
      if (walked.links.length && !(recoverable && mainHeld)) {
        item.keep = LINK_KEEP;
        item.keepLists = [['links', walked.links, true], ['.git entries', walked.gits]];
        continue;
      }
      // A folder already gone holds nothing to lose; only git's record goes. A
      // record git calls prunable over a folder still there is read by nothing.
      // The main worktree's keep holds a gone record too, since `branch -d` runs there.
      // The pointer check runs in every run (#442): git's setup reads the root `.git` pointer and probes the folder it
      // names before any other work, so a pointer naming a share must keep the worktree before git runs in it.
      let admin = null;
      const held = recoverable && mainHeld
        ? mainHeld
        : gone
          ? (recoverable && present(path) ? { keep: READ_FAILED, lists: [] } : null)
          : (admin = pointsHome(main, path, platform)) === null
            ? { keep: POINTER, lists: [] }
            : recoverable ? heldBack(git, path, platform) : null;
      if (held) {
        item.keep = held.keep;
        item.keepLists = held.lists;
        continue;
      }
      // A nested `.git` entry is never entered by the walk, and git's status probes the folder a nested pointer names,
      // so the keep for one is decided before status, from the index alone (#442). Only a populated submodule whose
      // pointer names a folder under the main repository's git folder is one git sees; any other entry keeps the worktree.
      if (walked.gits.length) {
        try {
          const gitlinks = new Set(read(git, path, ['ls-files', '--stage', '-z']).split('\0').filter(e => e.startsWith('160000 ')).map(e => e.slice(e.indexOf('\t') + 1)));
          walked.gits = walked.gits.filter(g => !(g.endsWith('/.git') && gitlinks.has(g.slice(0, -'/.git'.length)) && submoduleHome(main, join(path, g), platform)));
        } catch {
          item.keep = READ_FAILED;
          item.keepLists = [];
          continue;
        }
        if (walked.gits.length) {
          item.keep = GIT_KEEP;
          item.keepLists = [['.git entries', walked.gits]];
          continue;
        }
      }
      let status = '';
      if (!gone) {
        const r = git(path, ['status', '--porcelain=v1', '-z', '--ignored', '--no-renames']);
        if (!r.ok && recoverable) {
          item.keep = READ_FAILED;
          continue;
        }
        if (!r.ok) throw new Unavailable('a read failed');
        status = r.stdout;
      }
      const lists = parseStatus(status);
      const named = [['changed files', lists.changed], ['untracked files', lists.untracked], ['ignored files', lists.ignored]];
      // git's own check before a removal can trust a cache in the worktree's
      // index, which a session can write, so with the flag the cleaner's own
      // read of changed and untracked files keeps the worktree too.
      if (recoverable && (lists.changed.length || lists.untracked.length || lists.ignored.length)) {
        item.keep = lists.changed.length || lists.untracked.length ? CHANGED : IGNORED;
        item.keepLists = named;
        continue;
      }
      // What an override would take (#523): read for a folder that is present, in every run, after every keep.
      item.risk = gone ? { submodules: false, hidden: [], failed: false, changed: [], untracked: [], files: [] } : overrideRead(git, path, admin, recoverable, lstat);
      const subjects = branch === null ? [] : [`WIP on ${branch}:`, `On ${branch}:`];
      item.facts = {
        main,
        folder: name,
        branch,
        tip: item.tip,
        // The reason, not just a yes: a lock added, dropped or changed since show reads as changed.
        lock: 'locked' in rec ? rec.locked : null,
        gone,
        branchKept: unpushed ? COMMITS : branch !== null && defaults.includes(branch) ? 'the default branch' : null,
        ...lists,
        stashes: stashes.filter(([, s]) => subjects.some(p => s?.startsWith(p))).map(([ref]) => ref),
        ...(unpushed ? { unpushed } : {}),
        // The flag joins the facts, so a tag from a run without it never passes a run with it.
        ...(recoverable ? { recoverable: true } : {}),
      };
      // Commits found nowhere else have no yes tag: only an override removes the folder.
      item.tag = unpushed ? null : tagOf(item.facts);
      item.overrideTag = overrideTagOf(item);
    } catch (e) {
      // With the flag, one worktree's failing read keeps that worktree alone.
      if (!recoverable) throw e;
      item.keep = READ_FAILED;
      item.keepLists = [];
      delete item.facts;
      delete item.tag;
      delete item.risk;
      delete item.overrideTag;
    }
  }
  return items;
}

// ---------------------------------------------------------------- show and remove

const short = tip => (/^[0-9a-f]{7,}$/.test(tip) ? tip.slice(0, 7) : 'unknown');

/** A name in quotes, a quote inside it escaped, so it can't pass for the cleaner's own words. */
const quoted = s => `"${esc(s, true)}"`;
/** A worktree folder name: as it is when it fits the --worktree set, else quoted. */
const folderName = s => (NAME_RE.test(s) ? s : quoted(s));

function listLines(title, names, show = quoted, cap = LISTED) {
  if (!names.length) return [];
  const shown = names.slice(0, cap).map(n => `    ${show(n)}`);
  return [`  ${title}:`, ...shown, ...(names.length > cap ? [`    and ${names.length - cap} more`] : [])];
}

/**
 * The undo line (#523): the first form that applies, with every name escaped.
 * `files`: the removal deletes changed or untracked files, which nothing
 * brings back. `stays`: the branch stays, so the worktree is added on it;
 * otherwise `branch -d` deletes it and `-b` makes it again. Each form but
 * `none` says what it does not restore.
 */
function undoLine(f, { files, stays }) {
  const tail = (branchRef) => `; not restored: ignored files, the worktree's reflog, refs and config${branchRef ? ", the branch's reflog and upstream" : ''}${f.lock !== null ? ', the lock' : ''}`;
  if (files) return `  undo: none; the files above are gone for good${tail(false)}`;
  const dir = `.claude/worktrees/${esc(f.folder)}`;
  const root = '  undo, from the repository root: git worktree add';
  if (f.branch === null) return `${root} --detach ${dir} ${f.tip}${tail(false)}`;
  if (stays) return `${root} ${dir} ${esc(f.branch)} (it was at ${f.tip})${tail(false)}`;
  return `${root} -b ${esc(f.branch)} ${dir} ${f.tip}${tail(true)}`;
}

/** One candidate's name-back. */
export function blockLines(item) {
  const out = [`worktree ${folderName(item.name)}`];
  // The links list is never cut: each link is a step the owner must take by hand first.
  if (item.keep) return [...out, `  kept: ${item.keep}`, ...(item.keepLists ?? []).flatMap(([title, names, all]) => listLines(title, names, quoted, all ? Infinity : LISTED))];
  const f = item.facts;
  const over = item.overrideTag ?? null;
  // With an override tag, the lists are the override read's: every file, no folder collapsed, none cut.
  const changed = over ? item.risk.changed : f.changed;
  const untracked = over ? item.risk.untracked : f.untracked;
  const files = Boolean(over) && changed.length + untracked.length > 0;
  out.push(f.branch === null ? `  detached at ${short(f.tip)}` : `  branch ${esc(f.branch)} at ${short(f.tip)}`);
  // The counts are printed so that a cut display still states the loss.
  if (files) out.push(`  WARNING: the override deletes ${changed.length} changed and ${untracked.length} untracked file(s) git holds no copy of`);
  if (over && f.branchKept === COMMITS) out.push(`  WARNING: the override removes the folder; branch ${esc(f.branch)} keeps its ${f.unpushed} commits`);
  if (f.gone) out.push("  folder gone, only git's record goes");
  if (f.lock !== null) out.push(isSessionLock(f.lock, f.folder) ? '  locked by a stopped session; remove unlocks it' : over ? '  locked, its holder is not named: the override lifts the lock' : '  locked, git will refuse');
  if (over) {
    out.push(...listLines(`changed files, lost if overridden (${changed.length})`, changed, quoted, Infinity));
    out.push(...listLines(`untracked files, lost if overridden (${untracked.length})`, untracked, quoted, Infinity));
  } else {
    out.push(...listLines('changed files, git will refuse', f.changed));
    out.push(...listLines('untracked files, git will refuse', f.untracked));
  }
  out.push(...listLines('ignored, deleted with the folder, with everything inside', f.ignored));
  // Stash refs are git's own stash@{n}, never a name someone chose.
  out.push(...listLines('stash entries made on it, kept: the cleaner never touches stashes', f.stashes, esc));
  // The commits are named by their own warning.
  if (f.branchKept && f.branchKept !== COMMITS) out.push(`  branch kept: ${f.branchKept}`);
  if (item.risk?.hidden.length) {
    const shown = listLines('no override: git is told not to check edits in these files, and a yes deletes those edits too', item.risk.hidden);
    shown[0] = shown[0].slice(0, -1);
    out.push(...shown);
  }
  if (over) out.push(undoLine(f, { files, stays: Boolean(f.branchKept) }));
  if (item.tag) out.push(over ? `  tag ${item.tag}: a yes alone leaves it, git refuses` : `  tag ${item.tag}`);
  if (over) out.push(`  override tag ${over}${files ? ` (deletes ${changed.length} changed, ${untracked.length} untracked)` : ''}: pass it as --override ${f.folder}=${over}, only on the owner's own words in chat`);
  return out;
}

/** Why git refused a worktree, from the facts show named. */
const refusedFor = f => (f.changed.length || f.untracked.length ? 'left, git refused: it holds changed or untracked files' : f.lock !== null && !isSessionLock(f.lock, f.folder) ? 'left, git refused: it is locked' : 'left, git refused it');

/**
 * remove's work on the candidates whose yes tags are in `yes`, or whose folder
 * and override tag make a pair in `override` (#523). `again(name)` is the last
 * read of one folder, run before a forced removal.
 */
function removeAll(git, items, { yes, override }, hooks, platform, again) {
  const lines = [];
  const counts = { removed: 0, left: 0 };
  const wanted = new Set(yes ?? []);
  const pairs = (override ?? []).map(p => ({ ...p, hit: false }));
  const main = items.find(i => i.facts)?.facts.main;
  let stopped = false;
  for (const item of items) {
    const matched = item.overrideTag ? pairs.filter(p => p.folder === item.name && p.tag === item.overrideTag) : [];
    const forced = matched.length > 0;
    const byYes = Boolean(item.tag) && wanted.has(item.tag);
    if (!forced && !byYes) continue;
    for (const p of matched) p.hit = true;
    // Named in both lists, the forced path takes it and neither counts as changed.
    if (byYes) wanted.delete(item.tag);
    if (stopped) {
      counts.left += 1;
      lines.push(`worktree ${esc(item.name)}: left, the run stopped before it`);
      continue;
    }
    try {
      removeOne(git, item, main, hooks, platform, lines, counts, forced ? again : null);
    } catch {
      // A failure part way counts this item, and every one after it, as left.
      stopped = true;
      counts.left += 1;
      lines.push(`worktree ${esc(item.name)}: left, the run stopped here`);
    }
  }
  return { lines, ...counts, changed: wanted.size + pairs.filter(p => !p.hit).length };
}

/**
 * One candidate's removal, its report added to `lines` and its count to
 * `counts`. With `again`, the removal is forced (#523): the folder is read once
 * more first, and any lock and any listed file go.
 */
function removeOne(git, item, main, hooks, platform, lines, counts, again) {
  const f = item.facts;
  const head = `worktree ${folderName(item.name)}`;
  const left = (why, extra = []) => {
    counts.left += 1;
    lines.push(`${head}: ${why}`, ...extra, ...(f.branch !== null ? [`  the branch stays: ${esc(f.branch)}`] : []));
  };
  // The hooks folder is checked right before each removal call.
  const hooksChanged = () => lstatSync(hooks).isSymbolicLink() || readdirSync(hooks).length > 0;
  if (hooksChanged()) return left("left, the run's hooks folder changed");
  // The last read, before any lock is lifted: a hard keep that now holds, any fact that differs, or a read that throws leaves the worktree.
  if (again) {
    let fresh = null;
    try {
      fresh = again(item.name);
    } catch {
      // a failed read is a change
    }
    if (!fresh || fresh.overrideTag !== item.overrideTag) return left('left, it changed since the read');
  }
  // The folder's identity as of the last read, for the check right before git is told to force (the window after the last read, #523).
  const stood = again ? standOf(item.path, main, platform) : null;
  if (again && stood === null) return left('left, it changed since the read');
  const listed = again ? item.risk.changed.length + item.risk.untracked.length : 0;
  // A stopped session's own lock comes off just before the removal; git's other refusals still stand. An override lifts any lock.
  const lifted = f.lock !== null && (Boolean(again) || isSessionLock(f.lock, f.folder));
  if (lifted && !git(main, ['worktree', 'unlock', item.path]).ok) return left('left, git refused: it is locked');
  // --force skips git's own clean check, so a folder or parent swapped for a link, or a folder made anew, since the last read is never forced.
  if (again && standOf(item.path, main, platform) !== stood) {
    const back = lifted ? (git(main, ['worktree', 'lock', ...(f.lock === '' ? [] : ['--reason', f.lock]), item.path]).ok ? [] : ['  the lock was not put back']) : [];
    return left('left, it changed since the read', back);
  }
  // --force at most once, only with listed files, so git's own lock check and, without files, its check for changed files still hold.
  const ok = git(main, ['worktree', 'remove', ...(listed ? ['--force'] : []), item.path]).ok;
  // A refusal leaves the lock as it was found.
  const relock = !ok && lifted ? (git(main, ['worktree', 'lock', ...(f.lock === '' ? [] : ['--reason', f.lock]), item.path]).ok ? [] : ['  the lock was not put back']) : [];
  const note = listed ? ['  some listed files may already be gone'] : [];
  if (present(item.path)) {
    const link = isLink(item.path, platform) ? ['  it is a link: remove the link, not what it points to'] : holdsLink(item.path) ? ['  it holds a link: remove the link itself first, never with a recursive delete'] : [];
    return left(ok ? 'left' : refusedFor(f), [...note, ...relock, '  the folder stays: remove it by hand', ...link]);
  }
  if (!ok) return left(refusedFor(f), [...note, ...relock]);
  if (again) {
    const c = item.risk.changed.length;
    const u = item.risk.untracked.length;
    const parts = [
      ...(c ? [`${c} changed file${c === 1 ? '' : 's'} deleted`] : []),
      ...(u ? [`${u} untracked file${u === 1 ? '' : 's'} deleted`] : []),
      ...(f.lock !== null ? ['lock removed'] : []),
      ...(f.branchKept === COMMITS ? [`branch ${esc(f.branch)} kept with ${f.unpushed} commits`] : []),
    ];
    const kept = f.branch !== null && !f.branchKept && !(!hooksChanged() && git(main, ['branch', '-d', f.branch]).ok);
    const undo = undoLine(f, { files: c + u > 0, stays: Boolean(f.branchKept) || kept });
    if (kept) {
      counts.left += 1;
      lines.push(`${head}: left, the folder is gone, overridden: ${parts.join(', ')}`, `  the branch stays: ${esc(f.branch)}`, undo);
      return;
    }
    lines.push(`${head}: removed, overridden: ${parts.join(', ')}`, undo);
    counts.removed += 1;
    return;
  }
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
 * and optionally platform, spawn, rm and readdir, which stand in for the
 * platform and the process, folder-delete and folder-read calls in tests. Returns { code, lines }; the last line
 * is always the RESULT line.
 */
export function clean(argv, io) {
  const { opts, refusals } = parseArgs(argv);
  // The rule comes first in every run given an override, a refused one included: a reminder for later runs, not a control (decision 43).
  const first = r => (argv.includes('--override') ? { ...r, lines: [OVERRIDE_RULE, ...r.lines] } : r);
  if (refusals.length) return first(refused(refusals));
  return first(cleanRun(opts, io));
}

/** One run's work after the command line has parsed. */
function cleanRun(opts, io) {
  const git = findGit(io.env, io.platform);
  if (git === null) return unavailable('git was not found');
  const made = [];
  let removing = false;
  try {
    const cwd = mkdtempSync(join(io.home, '.pact-cleaner-run-'));
    made.push(cwd);
    const hooks = mkdtempSync(join(io.home, '.pact-cleaner-hooks-'));
    made.push(hooks);
    const { recoverable } = opts;
    const run = makeGit({ git, env: io.env, cwd, hooks, recoverable, spawn: io.spawn });
    const repo = resolve(io.cwd, opts.repo ?? '.');
    const v = /^git version (\d+)\.(\d+)/.exec(read(run, repo, ['version']));
    const [major, minor] = recoverable ? RECOVERABLE_FLOOR : GIT_FLOOR;
    if (!v || Number(v[1]) * 1000 + Number(v[2]) < major * 1000 + minor) return unavailable(`git is missing or older than ${major}.${minor}`);
    const platform = io.platform ?? process.platform;
    const readWith = { repo, home: io.home, cwd: io.cwd, platform, recoverable, readdir: io.readdir, lstat: io.lstat };
    const items = readAll(run, { ...readWith, worktrees: opts.worktrees });
    if (opts.command === 'show') {
      const tags = items.filter(i => i.tag).map(i => i.tag);
      const overrides = items.some(i => i.overrideTag);
      // The rule on the override goes with an override tag; the first two lines go with any tag.
      const how = tags.length || overrides ? (overrides ? HOW_TO : HOW_TO.slice(0, 2)) : [];
      return { code: 0, lines: [...items.flatMap(blockLines), ...how, `RESULT: shown ${tags.length}${tags.length ? ` ${tags.join(',')}` : ''}`] };
    }
    removing = true;
    // The last read of one folder, as the run's own read made it and reusing nothing from it (#523).
    const again = name => readAll(run, { ...readWith, worktrees: [name] }).find(i => i.name === name);
    const r = removeAll(run, items, opts, hooks, platform, again);
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
