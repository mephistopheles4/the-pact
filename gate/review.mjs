#!/usr/bin/env node
// The review output (#53, slice 4): writes the rendered rules and the diff
// from the no-configuration render into a folder the person named, so they
// can read what a configuration does before they install it. The install
// script runs it through its Node runner, from the stage, only after every
// check for that run has passed.
//
//   node review.mjs <review folder> <Claude home folder> <rendered rules file> <diff file>
//
// The folder. Its path must be absolute. It is created if it does not exist
// (its parent must), or else must be an empty folder that is not a link. Then
// its final path, with links, short names and case resolved by the system
// (realpath), is checked. It refuses a folder that is, or is under:
//   - the Claude home folder named for the run, or the real default one
//     (.claude in the user's home folder), by real path; or
//   - any folder named .claude, in any case, on the path as given or on its
//     final path.
// On any refusal after the folder exists, what this run wrote is taken away:
// the files it created, by name, and the folder if it created it.
//
// The files. REVIEW_RULES and REVIEW_DIFF, names Claude Code never loads as
// rules. Each is created exclusively (and on Unix without following a link)
// under the folder's final path, checked from its open handle to be a
// regular, one-link file, and written. Afterwards the folder must hold exactly
// those two plain files, and still resolve to the same final path.
//
// It prints "REVIEW <sha256 of the rules written> <sha256 of the diff
// written>" and "RESULT: pass", or FAIL lines and "RESULT: fail" with exit 1.
// Like seam A, it never echoes a path from the command line or a file's
// content. No switch turns a check off. Node 20 or later, ESM.

import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, rmdirSync, unlinkSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { Report } from './shared.mjs';

const REVIEW_RULES = 'rendered-rules.txt';
const REVIEW_DIFF = 'config.diff';
const INPUT_MAX = 4 * 1024 * 1024;
const FOLD_CASE = process.platform === 'win32' || process.platform === 'darwin';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const fold = s => (FOLD_CASE ? s.toLowerCase() : s);
const segments = p => p.split(sep).filter(Boolean);

/** True when `inner`'s segments start with all of `outer`'s, compared whole (and case-folded where the system folds case). */
function within(inner, outer) {
  const a = segments(inner).map(fold);
  const b = segments(outer).map(fold);
  return b.length <= a.length && b.every((s, i) => s === a[i]);
}

/** A segment that names a .claude folder, however it is cased or padded with the dots and spaces Windows drops. */
const isClaudeSegment = s => s.replace(/[. ]+$/, '').toLowerCase() === '.claude';

/** The real path of the Claude home folder, or its plain absolute path when it does not exist yet. */
function realHome(home) {
  try {
    return realpathSync.native(home);
  } catch {
    return resolve(home);
  }
}

/** One input file, at most INPUT_MAX bytes, or null after a refusal. */
function readInput(path, which, report) {
  try {
    const st = lstatSync(path);
    if (!st.isFile() || st.size > INPUT_MAX) throw new Error();
    return readFileSync(path);
  } catch {
    report.fail('review-input', null, null, `the ${which} to write could not be read`);
    return null;
  }
}

/**
 * Create `name` under `dir` exclusively and write `bytes` into it; false
 * after a refusal. A file it created is added to `made`, so a later refusal can
 * take it away again.
 */
function writeNew(dir, name, bytes, made, report) {
  let fd;
  try {
    fd = openSync(join(dir, name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o644);
  } catch {
    report.fail('review-write', null, null, `${name} could not be created as a new file in the review folder`);
    return false;
  }
  made.push(name);
  try {
    const st = fstatSync(fd, { bigint: true });
    if (!st.isFile() || st.nlink !== 1n) {
      report.fail('review-write', null, null, `${name} is not a new plain file`);
      return false;
    }
    let off = 0;
    while (off < bytes.length) off += writeSync(fd, bytes, off, bytes.length - off);
    return true;
  } catch {
    report.fail('review-write', null, null, `${name} could not be written`);
    return false;
  } finally {
    closeSync(fd);
  }
}

function run(argv, report) {
  if (argv.length !== 4 || argv.some(a => a === '' || a.startsWith('-'))) {
    report.fail('usage', null, null, 'usage: node review.mjs <review folder> <Claude home folder> <rendered rules file> <diff file>');
    return;
  }
  const [folder, home, rulesFile, diffFile] = argv;
  if (!isAbsolute(folder)) {
    report.fail('review-folder', null, null, 'the review folder must be a full path');
    return;
  }
  const rules = readInput(rulesFile, 'rendered rules file', report);
  const diff = readInput(diffFile, 'diff', report);
  if (rules === null || diff === null) return;

  // The folder: created now, or an existing empty folder that is not a link.
  let created = false;
  try {
    mkdirSync(folder);
    created = true;
  } catch (e) {
    if (e.code !== 'EEXIST') {
      report.fail('review-folder', null, null, e.code === 'ENOENT' ? 'the review folder\'s parent folder does not exist' : 'the review folder could not be created');
      return;
    }
  }
  const refuse = reason => {
    report.fail('review-folder', null, null, reason);
    if (created) {
      try {
        rmdirSync(folder);
      } catch {}
    }
  };
  let st;
  try {
    st = lstatSync(folder);
  } catch {
    return refuse('the review folder could not be read');
  }
  if (st.isSymbolicLink()) return refuse('the review folder is a link');
  if (!st.isDirectory()) return refuse('the review folder is not a folder');
  let real;
  try {
    if (readdirSync(folder).length) return refuse('the review folder is not empty');
    real = realpathSync.native(folder);
  } catch {
    return refuse('the review folder could not be read');
  }
  // The .claude test runs on the path as given and on its final path, so a
  // .claude link that leads out to a folder of another name still refuses.
  if (segments(resolve(folder)).some(isClaudeSegment) || segments(real).some(isClaudeSegment)) return refuse('the review folder is in or under a folder named .claude');
  // The Claude home named for the run, and the real default one, whatever was named.
  if (within(real, realHome(home)) || within(real, realHome(join(homedir(), '.claude')))) return refuse('the review folder is in or under the Claude home folder');

  // A refusal from here on takes away what this run wrote: its own files, by
  // name (unlinking never follows a link), and the folder if it created it.
  const made = [];
  const undo = () => {
    for (const n of made) {
      try {
        unlinkSync(join(real, n));
      } catch {}
    }
    if (created) {
      try {
        rmdirSync(real);
      } catch {}
    }
  };
  if (!writeNew(real, REVIEW_RULES, rules, made, report) || !writeNew(real, REVIEW_DIFF, diff, made, report)) return undo();

  // Afterwards: exactly the two plain files, in a folder that still resolves where it did.
  try {
    const names = readdirSync(real).sort();
    const plain = names.every(n => {
      const s = lstatSync(join(real, n));
      return s.isFile() && !s.isSymbolicLink();
    });
    if (realpathSync.native(folder) !== real || names.join('/') !== [REVIEW_DIFF, REVIEW_RULES].join('/') || !plain) {
      report.fail('review-write', null, null, 'the review folder changed while it was written');
      return undo();
    }
  } catch {
    report.fail('review-write', null, null, 'the review folder could not be read after the write');
    return undo();
  }
  report.lines.push(`REVIEW ${sha256(rules)} ${sha256(diff)}`);
}

function main(argv) {
  const report = new Report();
  try {
    run(argv, report);
  } catch {
    // Never a pass, and never the error's text: it can quote a path.
    report.fail('internal', null, null, 'the review output itself failed');
  }
  report.lines.push(`RESULT: ${report.failed ? 'fail' : 'pass'}`);
  process.stdout.write(`${report.lines.join('\n')}\n`);
  process.exitCode = report.failed ? 1 : 0;
}

main(process.argv.slice(2));
