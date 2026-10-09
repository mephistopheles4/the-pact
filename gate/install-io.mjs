// The install's file system reads and writes (#153, S3), used by the runner
// (gate/install-run.mjs) only: hashing, the stage's tree state, the link test
// that replaces the reparse-attribute test (S7), live file states and the
// writes. It makes no decision; gate/install-core.mjs does. Nothing here runs
// on import, and no error's text leaves here unhandled by the runner.
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
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
export function throughLink(root, rel) {
  let real;
  try {
    real = realpathSync.native(root);
  } catch (e) {
    return !(e && e.code === 'ENOENT');
  }
  let p = real;
  for (const seg of rel.split('/')) {
    p = join(p, seg);
    let st;
    try {
      st = lstatSync(p);
    } catch (e) {
      if (e && e.code === 'ENOENT') return false;
      return true;
    }
    if (st.isSymbolicLink()) return true;
    try {
      if (fold(realpathSync.native(p)) !== fold(p)) return true;
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

/** A folder's entries as the output checks read them: name, plain file or not, link or not, size. */
export function folderEntries(dir) {
  return readdirSync(dir).map(name => {
    const st = lstatSync(join(dir, name));
    return { name, file: st.isFile(), link: st.isSymbolicLink(), size: st.size };
  });
}

/**
 * Writes `bytes` over `dest` through an exclusive temp file in the same
 * folder, then a rename (S6, X4 and X5): a hard link at `dest` loses only its
 * own name. The temp file takes `dest`'s current mode, or `fallbackMode` when
 * there is none; it is deleted on any failure, and an existing one refuses.
 */
export function writeReplacing(dest, bytes, fallbackMode) {
  mkdirSync(dirname(dest), { recursive: true });
  let mode = fallbackMode;
  try {
    mode = statSync(dest).mode & 0o777;
  } catch {}
  const tmp = join(dirname(dest), `${basename(dest)}.pact-tmp`);
  writeFileSync(tmp, bytes, { flag: 'wx', mode: mode ?? 0o666 });
  try {
    if (mode !== undefined && process.platform !== 'win32') chmodSync(tmp, mode);
    renameSync(tmp, dest);
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {}
    throw e;
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
