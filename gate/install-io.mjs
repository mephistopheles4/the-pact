// The install's file system reads and writes (#153, S3), used by the runner
// (gate/install-run.mjs) only: hashing, the stage's tree state, the link test
// that replaces the reparse-attribute test (S7), live file states and the
// writes. It makes no decision; gate/install-core.mjs does. Nothing here runs
// on import, and no error's text leaves here unhandled by the runner.
import { createHash } from 'node:crypto';
import { chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import * as core from './install-core.mjs';
import { FOLD_CASE } from './paths.mjs';

export const sha256 = b => createHash('sha256').update(b).digest('hex');
export const blobId = b => createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
export const fileSha256 = p => sha256(readFileSync(p));
const fold = s => (FOLD_CASE ? s.toLowerCase() : s);

/** A file's bytes, or null when it does not exist. Any other error throws. */
export function readOptional(p) {
  try {
    return readFileSync(p);
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
}

/**
 * Everything under `root` as one text: each entry's relative path and kind,
 * and each file's hash, sorted. Hidden entries are included. A link is
 * recorded as one and never followed.
 */
export function treeState(root) {
  const entries = [];
  const dirs = [''];
  while (dirs.length) {
    const rel = dirs.pop();
    for (const d of readdirSync(join(root, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${d.name}` : d.name;
      const st = lstatSync(join(root, r));
      if (st.isSymbolicLink()) entries.push(`link ${r}`);
      else if (st.isDirectory()) {
        entries.push(`dir ${r}`);
        dirs.push(r);
      } else entries.push(`file ${r} ${fileSha256(join(root, r))}`);
    }
  }
  return entries.sort().join('\n');
}

/**
 * The link test (S7, replacing the reparse-attribute test): true when any
 * segment of `rel` below `root` is a link, or resolves anywhere but its own
 * path, or can't be read. `root` itself is taken at its real path, so its own
 * ancestors (a moved home folder, a short name) are never judged. A segment
 * that does not exist ends the walk.
 */
export const throughLink = (root, rel) => throughLinkWith(FS_OPS, root, rel);

/** The link test on a given set of file operations, so a test can make lstat and realpath disagree (#272, ex3.5). */
function throughLinkWith(ops, root, rel) {
  let real;
  try {
    real = ops.realpath(root);
  } catch (e) {
    return !(e && e.code === 'ENOENT');
  }
  let p = real;
  for (const seg of rel.split('/')) {
    p = join(p, seg);
    let st;
    try {
      st = ops.lstat(p);
    } catch (e) {
      if (e && e.code === 'ENOENT') return false;
      return true;
    }
    if (st.isSymbolicLink()) return true;
    try {
      if (fold(ops.realpath(p)) !== fold(p)) return true;
    } catch {
      return true;
    }
  }
  return false;
}

/** A live path's state, as the plan reads it: whether anything is there, whether it is a file, and its hash. */
export function liveState(p) {
  let st;
  try {
    st = statSync(p);
  } catch {
    return { exists: false, file: false, sha256: null };
  }
  if (!st.isFile()) return { exists: true, file: false, sha256: null };
  return { exists: true, file: true, sha256: fileSha256(p) };
}

/**
 * Whether anything is at `p`, a file, a folder or a link, read without
 * following a link (#203, the skill-clash check). An error other than "does
 * not exist" counts as present, so a path it can't read is never passed over.
 */
export function present(p) {
  try {
    lstatSync(p);
    return true;
  } catch (e) {
    return !(e && e.code === 'ENOENT');
  }
}

/** A folder's entries as the output checks read them: name, plain file or not, link or not, size. */
export function folderEntries(dir) {
  return readdirSync(dir).map(name => {
    const st = lstatSync(join(dir, name));
    return { name, file: st.isFile(), link: st.isSymbolicLink(), size: st.size };
  });
}

/** The temp file a write to `dest` goes through: the runner checks none is left before it writes. */
export const tempName = dest => join(dirname(dest), `${basename(dest)}.pact-tmp`);

/**
 * Writes `bytes` over `dest` through an exclusive temp file in the same
 * folder, then a rename (S6, X4 and X5): a hard link at `dest` loses only its
 * own name. The temp file takes `dest`'s current mode, or `fallbackMode` when
 * there is none. Once created, it is deleted on any failure, the write
 * included; one already there refuses and is left alone.
 */
export function writeReplacing(dest, bytes, fallbackMode) {
  mkdirSync(dirname(dest), { recursive: true });
  let mode = fallbackMode;
  try {
    mode = statSync(dest).mode & 0o777;
  } catch {}
  const tmp = tempName(dest);
  let fd = openSync(tmp, 'wx', mode ?? 0o666);
  try {
    writeFileSync(fd, bytes);
    closeSync(fd);
    fd = null;
    if (mode !== undefined && process.platform !== 'win32') chmodSync(tmp, mode);
    renameSync(tmp, dest);
  } catch (e) {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {}
    }
    try {
      unlinkSync(tmp);
    } catch {}
    throw e;
  }
}

/** Whether an existing file grants any group or other permission bit (Unix only; false elsewhere, or when absent). */
export function openToOthers(p) {
  if (process.platform === 'win32') return false;
  try {
    return (statSync(p).mode & 0o077) !== 0;
  } catch {
    return false;
  }
}

export const removeFile = p => unlinkSync(p);
export const exists = p => existsSync(p);

/** Other pact-install-* folders in the temp folder: what a hard stop left behind (S3, step 6). */
export function leftoverWorkFolders(tmp, own) {
  try {
    return readdirSync(tmp).filter(n => n.startsWith('pact-install-') && n !== own).length;
  } catch {
    return 0;
  }
}

// ------------------------------------------------------------ the backup (#272, S7)

/** The file operations the backup and prune steps use; a test passes a set with one that fails. */
export const FS_OPS = Object.freeze({
  mkdir: (p, mode) => mkdirSync(p, { mode }),
  open: (p, flags, mode) => openSync(p, flags, mode),
  write: (fd, bytes) => writeFileSync(fd, bytes),
  fsync: fd => fsyncSync(fd),
  close: fd => closeSync(fd),
  read: p => readFileSync(p),
  readdir: p => readdirSync(p),
  rename: (from, to) => renameSync(from, to),
  chmod: (p, mode) => chmodSync(p, mode),
  stat: p => statSync(p),
  lstat: p => lstatSync(p),
  realpath: p => realpathSync.native(p),
  unlink: p => unlinkSync(p),
  rmdir: p => rmdirSync(p),
});

const presentWith = (ops, p) => {
  try {
    ops.lstat(p);
    return true;
  } catch (e) {
    return !(e && e.code === 'ENOENT');
  }
};

/** A folder's entry names, or none when the folder does not exist. */
function namesIn(ops, dir) {
  try {
    return ops.readdir(dir);
  } catch (e) {
    if (e && e.code === 'ENOENT') return [];
    throw e;
  }
}

/** A new file, made exclusively with mode 0600, written and fsynced; its handle is closed whatever happens. */
function writeNew(ops, p, bytes) {
  const fd = ops.open(p, 'wx', 0o600);
  try {
    ops.write(fd, bytes);
    ops.fsync(fd);
  } finally {
    ops.close(fd);
  }
}

/**
 * Removes `rel` under `home` by walking it (ad2): each entry read with lstat,
 * a link or reparse point removed without descending into it, a folder whose
 * real path is not its own refused, and never a recursive remove. `last`
 * names an entry of the top folder removed after the others.
 */
function removeTree(ops, home, rel, last) {
  const p = join(home, ...rel.split('/'));
  const st = ops.lstat(p);
  if (st.isSymbolicLink() || !st.isDirectory()) {
    try {
      ops.unlink(p);
    } catch (e) {
      if (!st.isSymbolicLink()) throw e;
      ops.rmdir(p); // a Windows junction or folder link: removes the link only
    }
    return;
  }
  if (throughLinkWith(ops, home, rel)) throw new Error('a folder to remove resolves elsewhere');
  for (const n of ops.readdir(p).sort((a, b) => (a === last) - (b === last))) removeTree(ops, home, `${rel}/${n}`);
  ops.rmdir(p);
}

/**
 * Takes the backup (S7): after every check and before CHECKS DONE, a copy of
 * each `was: 'file'` entry, checked against its hash, and the manifest, built
 * in a staging folder and renamed into place. `entries` come from
 * core.backupEntries; `now` gives the time; `started` runs once the checks
 * that create nothing have passed. On Linux and macOS (`platform`) every
 * folder is 0700 and every file 0600. On any failure it removes only what it
 * made and refuses with "Nothing was changed.", or, when that removal fails,
 * with a line naming the staging folder. Returns the backup's name and how
 * many files it copied.
 */
export function takeBackup(ops, { home, commit, entries, platform, now, started }) {
  const unix = platform !== 'win32';
  const at = rel => join(home, ...rel.split('/'));
  const link = rel => throughLinkWith(ops, home, rel);
  const B = core.BACKUPS_REL;
  if (link(B)) core.backupStops.link(B);
  const left = namesIn(ops, at(B)).filter(n => n.startsWith('.staging-'));
  if (left.length) core.backupStops.stagingLeft(left.length);
  for (const e of entries) if (e.was === 'file' && link(e.path)) core.backupStops.link(e.path);
  const date = now();
  const base = core.backupName(date, commit);
  const free = n => !presentWith(ops, join(at(B), n)) && !presentWith(ops, join(at(B), `.staging-${n}`));
  const name = [base, ...Array.from({ length: 98 }, (_, i) => `${base}-${String(i + 2).padStart(2, '0')}`)].find(free);
  if (!name) core.backupStops.nameTaken();
  started();
  const stagingRel = `${B}/.staging-${name}`;
  const staging = at(stagingRel);
  const made = []; // the home folder, pact and pact/backups, each only when this run made it
  let stagingMade = false;
  try {
    for (const p of [home, at('pact'), at(B)]) {
      if (presentWith(ops, p)) continue;
      ops.mkdir(p, 0o700);
      made.push(p);
    }
    if (unix) {
      if (link(B)) core.backupStops.link(B);
      ops.chmod(at(B), 0o700); // follows a link, so the link test runs right before it (ad2.3)
    }
    ops.mkdir(staging, 0o700);
    stagingMade = true;
    const written = [at(B), staging, ...made];
    const listed = [];
    for (const e of [...entries].sort((a, b) => (a.path < b.path ? -1 : 1))) {
      if (e.was !== 'file') {
        listed.push({ path: e.path, was: 'absent' });
        continue;
      }
      const bytes = ops.read(at(e.path));
      if (sha256(bytes) !== e.sha256) core.backupStops.changed(e.path);
      const segs = e.path.split('/');
      for (let i = 1; i < segs.length; i++) {
        const d = join(staging, ...segs.slice(0, i));
        if (presentWith(ops, d)) continue;
        ops.mkdir(d, 0o700);
        written.push(d);
      }
      const dest = join(staging, ...segs);
      writeNew(ops, dest, bytes);
      written.push(dest);
      if (sha256(ops.read(dest)) !== e.sha256) core.backupStops.failed();
      listed.push({ path: e.path, was: 'file', sha256: e.sha256, bytes: bytes.length });
    }
    const manifest = join(staging, 'manifest.json');
    writeNew(ops, manifest, Buffer.from(core.manifestText({ commit, created: date.toISOString(), entries: listed })));
    written.push(manifest);
    if (unix) for (const p of written) if ((ops.stat(p).mode & 0o077) !== 0) core.backupStops.mode();
    if (link(B) || link(stagingRel)) core.backupStops.link(stagingRel);
    // A POSIX rename onto an empty folder succeeds, so the name is checked first.
    if (presentWith(ops, join(at(B), name))) core.backupStops.nameTaken();
    ops.rename(staging, join(at(B), name));
    return { name, files: listed.filter(e => e.was === 'file').length };
  } catch (e) {
    try {
      if (stagingMade) removeTree(ops, home, stagingRel);
      for (const p of made.reverse()) if (!namesIn(ops, p).length) ops.rmdir(p);
    } catch {
      core.backupStops.cleanup(stagingRel);
    }
    if (e instanceof core.Refusal) throw e;
    return core.backupStops.failed();
  }
}

/** What a dry run reports about pact/backups (S9): whether it is a link, and the staging folders left in it. */
export function backupFolder(home, ops = FS_OPS) {
  if (throughLinkWith(ops, home, core.BACKUPS_REL)) return { link: true, staging: [] };
  return { link: false, staging: namesIn(ops, join(home, ...core.BACKUPS_REL.split('/'))).filter(n => n.startsWith('.staging-')).sort() };
}
