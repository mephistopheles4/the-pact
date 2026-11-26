// The project install's one write function, and the read it and the verify
// use. A library: nothing here runs on import, so the tests call the write
// function directly with a temp name they choose. The shipped call
// (gate/project-core.mjs) always passes randomTempName(); no switch ships.
//
// writeContained(dir, tempName, finalName, bytes) writes `bytes` into `dir`
// under `finalName`: the temp file is created exclusively under `tempName` (a
// plain name with a non-.md suffix, because Claude Code loads .md files in a
// rules folder), written and flushed, and renamed over the target. A rename
// replaces a link at the target; it does not follow it. A temp file this call
// created is removed again on a later failure. Any failure throws Refused with
// rule 'project-write'.
//
// readContained(dir, name, cap) reads one file in `dir`: null when it does not
// exist; else it must be a regular file that is not a link, and is read with
// its cap enforced during the read. Any other outcome throws Refused with rule
// 'project-file'. The project is a cloned repo, whose committed files can hold
// a link, so this one look at what is there stays.
//
// Messages name only the caller's fixed file names, never a path or content.
// Node 20 or later, ESM.

import { randomBytes } from 'node:crypto';
import { closeSync, constants, fsyncSync, lstatSync, openSync, readSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { Refused, SEGMENT_RE } from './shared.mjs';

const TEMP_SUFFIX = '.pact-tmp';

/** A random temp name in the folder: ".pact-<24 hex>.pact-tmp". */
function randomTempName() {
  return `.pact-${randomBytes(12).toString('hex')}${TEMP_SUFFIX}`;
}

const plainName = n => typeof n === 'string' && SEGMENT_RE.test(n) && n !== '.' && n !== '..' && !n.endsWith('.');

function writeContained(dir, tempName, finalName, bytes) {
  const refuse = reason => new Refused('project-write', reason);
  if (!plainName(tempName) || !plainName(finalName) || tempName === finalName) throw refuse('the temp or final name is not a plain file name');
  if (tempName.toLowerCase().endsWith('.md')) throw refuse('the temp name ends in .md, which Claude Code would load as rules');
  const temp = join(dir, tempName);
  const target = join(dir, finalName);
  let fd;
  try {
    fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o644);
  } catch {
    throw refuse(`the temp file for ${finalName} could not be created as a new file`);
  }
  try {
    let off = 0;
    while (off < bytes.length) off += writeSync(fd, bytes, off, bytes.length - off);
    fsyncSync(fd);
  } catch {
    closeSync(fd);
    removeQuietly(temp);
    throw refuse(`the temp file for ${finalName} could not be written`);
  }
  closeSync(fd);
  try {
    renameSync(temp, target);
  } catch {
    removeQuietly(temp);
    throw refuse(`${finalName} could not be put in place`);
  }
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
    st = lstatSync(p);
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw refuse('could not be read');
  }
  if (st.isSymbolicLink()) throw refuse('is a link');
  if (!st.isFile()) throw refuse('is not a regular file');
  let fd;
  try {
    fd = openSync(p, constants.O_RDONLY);
  } catch {
    throw refuse('could not be opened');
  }
  try {
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
