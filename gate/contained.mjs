// Contained reads and writes in one folder (#53, slice 5): the project
// install's one write function, and the read it and the verify use. A library:
// nothing here runs on import, so the tests call the write function directly
// with a temp name they choose. The shipped call (gate/project.mjs) always
// passes randomTempName(); no switch ships.
//
// writeContained(dir, tempName, finalName, bytes) writes `bytes` into `dir`
// under `finalName`, so that a link planted at any name in the folder is
// replaced or refused, never followed:
//   1. The temp file is created exclusively, and on Unix without following a
//      link (O_NOFOLLOW), under `tempName`: a plain name with a non-.md
//      suffix, because Claude Code loads .md files in a rules folder.
//   2. Before any byte is written, the open handle's device and inode must
//      match an lstat of the in-folder temp name, and that lstat must show a
//      regular, one-link file. Every match is made on bigint stats: an inode
//      can be above 2^53.
//   3. The bytes are written and flushed, and the temp file is renamed over
//      the target. A rename replaces a link; it does not follow it.
//   4. After the rename, the target is lstat'ed and must be the plain file
//      written: regular, not a link, the same device and inode.
// Any failure throws Refused with rule 'project-write'. A temp file this call
// created and verified is removed again on a later failure; a name it did not
// create is never touched.
//
// Known limit (Windows). Windows makes no no-follow promise for an exclusive
// create: a dangling file link at the temp name is followed, and its target is
// created, empty, outside the folder. The guards there are the random name
// and step 2, which refuses before the first byte is written. Planting a
// dangling file link needs the right to make links (developer mode or an
// administrator).
//
// readContained(dir, name, cap) reads one file in `dir` under the same rules
// as the renderer's configuration reads: null when it does not exist; else it
// must be a regular, one-link file that is not a link, the open handle must be
// the file the lstat saw, and it is read once with its cap enforced during the
// read. Any other outcome throws Refused with rule 'project-file'.
//
// Messages name only the caller's fixed file names, never a path or content.
// Node 20 or later, ESM.

import { randomBytes } from 'node:crypto';
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { Refused, SEGMENT_RE } from './shared.mjs';

const TEMP_SUFFIX = '.pact-tmp';
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;

/** A random temp name in the folder: ".pact-<24 hex>.pact-tmp". */
function randomTempName() {
  return `.pact-${randomBytes(12).toString('hex')}${TEMP_SUFFIX}`;
}

const plainName = n => typeof n === 'string' && SEGMENT_RE.test(n) && n !== '.' && n !== '..' && !n.endsWith('.');
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;

function writeContained(dir, tempName, finalName, bytes) {
  const refuse = reason => new Refused('project-write', reason);
  if (!plainName(tempName) || !plainName(finalName) || tempName === finalName) throw refuse('the temp or final name is not a plain file name');
  if (tempName.toLowerCase().endsWith('.md')) throw refuse('the temp name ends in .md, which Claude Code would load as rules');
  const temp = join(dir, tempName);
  const target = join(dir, finalName);
  let fd;
  try {
    fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o644);
  } catch {
    throw refuse(`the temp file for ${finalName} could not be created as a new file`);
  }
  let opened;
  let ours = false;
  try {
    let lst;
    try {
      opened = fstatSync(fd, { bigint: true });
      lst = lstatSync(temp, { bigint: true });
    } catch {
      throw refuse(`the temp file for ${finalName} could not be checked`);
    }
    if (!lst.isFile() || lst.isSymbolicLink() || !opened.isFile() || opened.nlink !== 1n || !sameFile(opened, lst)) {
      throw refuse(`the temp file for ${finalName} is not the plain file opened`);
    }
    ours = true;
    try {
      let off = 0;
      while (off < bytes.length) off += writeSync(fd, bytes, off, bytes.length - off);
      fsyncSync(fd);
    } catch {
      throw refuse(`the temp file for ${finalName} could not be written`);
    }
  } catch (e) {
    closeSync(fd);
    if (ours) removeQuietly(temp);
    throw e;
  }
  closeSync(fd);
  try {
    renameSync(temp, target);
  } catch {
    removeQuietly(temp);
    throw refuse(`${finalName} could not be put in place`);
  }
  let after;
  try {
    after = lstatSync(target, { bigint: true });
  } catch {
    throw refuse(`${finalName} could not be checked after the rename`);
  }
  if (!after.isFile() || after.isSymbolicLink() || !sameFile(after, opened)) throw refuse(`${finalName} is not the plain file written, after the rename`);
}

function removeQuietly(p) {
  try {
    unlinkSync(p);
  } catch {}
}

function readContained(dir, name, cap) {
  const refuse = reason => new Refused('project-file', `${name} ${reason}`);
  const p = join(dir, name);
  let st;
  try {
    st = lstatSync(p, { bigint: true });
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw refuse('could not be read');
  }
  if (st.isSymbolicLink()) throw refuse('is a link');
  if (!st.isFile()) throw refuse('is not a regular file');
  if (st.nlink !== 1n) throw refuse('has more than one link');
  let fd;
  try {
    fd = openSync(p, constants.O_RDONLY | NOFOLLOW);
  } catch {
    throw refuse('could not be opened');
  }
  try {
    const fst = fstatSync(fd, { bigint: true });
    if (!fst.isFile() || fst.nlink !== 1n || !sameFile(fst, st)) throw refuse('changed while it was opened');
    const buf = Buffer.alloc(cap + 1);
    let n = 0;
    for (;;) {
      const got = readSync(fd, buf, n, buf.length - n, null);
      if (got === 0) break;
      n += got;
      if (n > cap) throw refuse(`is larger than ${cap} bytes`);
    }
    return { buf: buf.subarray(0, n) };
  } catch (e) {
    if (e instanceof Refused) throw e;
    throw refuse('could not be read');
  } finally {
    closeSync(fd);
  }
}

export { TEMP_SUFFIX, randomTempName, writeContained, readContained };
