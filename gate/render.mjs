#!/usr/bin/env node
// The renderer (#53): turns the pact's source rules file into the rules file
// the install writes. The install script runs it from the stage, before seam A,
// so seam A checks the bytes that get installed.
//
//   node render.mjs <source rules file> <output folder>
//
// The source carries two kinds of mark. Gated marks are seam A's seven clauses
// (gate/pact-text.mjs); the renderer passes them through untouched. Open marks
// name the parts a configuration may change; the renderer always strips their
// mark lines from its output. This version reads no configuration, so the
// output is the source with its open-mark lines removed and every other byte
// unchanged.
//
// It works on bytes. A line is dropped only when it is exactly an open-mark
// line: ASCII, and MARKER_RE with one of OPEN_MARKS. Every other line passes
// through as it is, so anything malformed (a bad mark, a carriage return,
// invalid UTF-8) reaches seam A unchanged, and seam A refuses it as before.
//
// It writes one file, OUTPUT_NAME, into the output folder, which must be an
// empty folder that is not a link. It prints, one per line:
//
//   RENDERED <sha256 of the output file>
//   CONFIG none
//   RESULT: pass
//
// or FAIL lines and "RESULT: fail", with exit 1. Like seam A, it never echoes a
// file's content: its messages are its own fixed text.
//
// No switch turns a check off. Node 20 or later, ESM.

import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MARKER_RE, MAX_BYTES, Report } from './shared.mjs';

// The open marks this version knows. Hard-coded, so no file can add one.
// Adding a mark is a change to this list and to the pact source, on the
// security route like any other change here.
const OPEN_MARKS = Object.freeze(['config-notice', 'usage-pause', 'move-1', 'move-2', 'move-3', 'move-4-extra']);
const OUTPUT_NAME = 'CLAUDE.md';

const LF = 0x0a;

/** True when `line` (bytes, no line feed) is exactly an open-mark line. */
function isOpenMarkLine(line) {
  for (const b of line) if (b > 0x7e) return false;
  const m = MARKER_RE.exec(line.toString('latin1'));
  return m !== null && OPEN_MARKS.includes(m[2]);
}

/** The source with its open-mark lines removed; every other byte as it was. */
function stripOpenMarks(buf) {
  const kept = [];
  let start = 0;
  for (;;) {
    const end = buf.indexOf(LF, start);
    const line = buf.subarray(start, end < 0 ? buf.length : end);
    if (!isOpenMarkLine(line)) kept.push(end < 0 ? line : buf.subarray(start, end + 1));
    if (end < 0) break;
    start = end + 1;
  }
  return Buffer.concat(kept);
}

/** The source, read once from a regular file that is not a link, at most MAX_BYTES. */
function readSource(path, report) {
  let st;
  try {
    st = lstatSync(path);
  } catch {
    report.fail('source', null, null, 'the source rules file is missing');
    return null;
  }
  if (!st.isFile()) {
    report.fail('source', null, null, 'the source rules file is not a regular file');
    return null;
  }
  const fd = openSync(path, constants.O_RDONLY);
  try {
    const fst = fstatSync(fd);
    if (!fst.isFile() || fst.dev !== st.dev || fst.ino !== st.ino) {
      report.fail('source', null, null, 'the source rules file changed while it was opened');
      return null;
    }
    const buf = Buffer.alloc(MAX_BYTES + 1);
    let n = 0;
    for (;;) {
      const got = readSync(fd, buf, n, buf.length - n, null);
      if (got === 0) break;
      n += got;
      if (n > MAX_BYTES) {
        report.fail('size', null, null, 'the source rules file is larger than 1 MiB');
        return null;
      }
    }
    return buf.subarray(0, n);
  } finally {
    closeSync(fd);
  }
}

/** True when `path` is an empty folder that is not a link. */
function emptyFolder(path) {
  try {
    const st = lstatSync(path);
    return st.isDirectory() && !st.isSymbolicLink() && readdirSync(path).length === 0;
  } catch {
    return false;
  }
}

function run(argv, report) {
  if (argv.length !== 2 || argv.some(a => a === '' || a.startsWith('-'))) {
    report.fail('usage', null, null, 'usage: node render.mjs <source rules file> <output folder>');
    return;
  }
  const [source, out] = argv;
  if (!emptyFolder(out)) {
    report.fail('output', null, null, 'the output folder must be an empty folder that is not a link');
    return;
  }
  const buf = readSource(source, report);
  if (buf === null) return;
  const rendered = stripOpenMarks(buf);
  writeFileSync(join(out, OUTPUT_NAME), rendered, { flag: 'wx' });
  report.lines.push(`RENDERED ${createHash('sha256').update(rendered).digest('hex')}`);
  report.lines.push('CONFIG none');
}

function main(argv) {
  const report = new Report();
  try {
    run(argv, report);
  } catch {
    // Never a pass, and never the error's text: it can quote a path or a file.
    report.fail('internal', null, null, 'the renderer itself failed');
  }
  report.lines.push(`RESULT: ${report.failed ? 'fail' : 'pass'}`);
  process.stdout.write(`${report.lines.join('\n')}\n`);
  process.exitCode = report.failed ? 1 : 0;
}

main(process.argv.slice(2));
