#!/usr/bin/env node
// The renderer (#53): turns the pact's source rules file into the rules file
// the install writes. The install script runs it from the stage, before seam A,
// so seam A checks the bytes that get installed.
//
//   node render.mjs <source rules file> <output folder> <Claude home folder>
//
// The source carries two kinds of mark. Gated marks are seam A's seven clauses
// (gate/pact-text.mjs); the renderer passes them through untouched. Open marks
// name the parts a configuration may change; the renderer always strips their
// mark lines from its output.
//
// Before any change, it checks the source's open marks: each opens at most
// once, closes after it opens, sits alone on its line, and never encloses, sits
// inside or shares a line with a gated mark.
//
// The configuration. The user file is CONFIG_REL under the Claude home folder,
// read under these rules:
//   - Only "does not exist" means no file. A link, a dangling link, a folder,
//     a file with more than one link, or any read error refuses.
//   - Every component below the Claude home folder is lstat'ed and must not be
//     a link; the file's real path must stay where it was named; the open
//     handle must be the regular, one-link file the lstat saw (device and
//     inode); and it is read once, its size cap enforced during the read.
//   - Node's lstat reports symbolic links and junctions, but reads other
//     reparse points as plain files and folders. The install script runs its
//     own reparse-attribute test on the file and its blocks folder before it
//     runs this; these checks are the second layer.
//   - The one buffer is checked (gate's text scanner, strict JSON, an exact
//     shape), rendered and hashed.
// Its shape: { "schema": 1, "settings": { <setting>: <value> }, "edits": [] }.
// Edits to open parts come in a later version, so a non-empty edit list
// refuses. A setting fills its open part from a fixed template with the checked
// number; no text from a file is ever spliced. When a configuration applies,
// the config-notice slot is filled with a fixed notice naming its digest and
// its values. The digest is the first 12 hex characters of the sha256 of one
// line per configuration file read, "<kind> <sha256 of the file>\n" (today only
// "user").
//
// With no configuration, the output is the source with its open-mark lines
// removed and every other byte unchanged. A line that is not an open-mark line
// passes through as it is, so anything else malformed (a bad gated mark, a
// carriage return, invalid UTF-8) reaches seam A unchanged, and seam A refuses
// it as before. Seam A's line numbers then count the rendered file.
//
// It writes one file, OUTPUT_NAME, into the output folder, which must be an
// empty folder that is not a link. It prints, one per line:
//
//   RENDERED <sha256 of the output file>
//   CONFIG none                       or   CONFIG user <sha256 of the file>
//                                          DIGEST <12 hex>
//                                          VALUE <setting> <number>   (one per value set)
//   RESULT: pass
//
// or FAIL lines and "RESULT: fail", with exit 1. Like seam A, it never echoes a
// file's content or a path from the command line: its messages are its own
// fixed text and constant names.
//
// No switch turns a check off. Node 20 or later, ESM.

import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MARKER_RE, MAX_BYTES, Refused, Report, readStrictJson, scanText } from './shared.mjs';

// The open marks this version knows. Hard-coded, so no file can add one.
// Adding a mark is a change to this list and to the pact source, on the
// security route like any other change here.
const OPEN_MARKS = Object.freeze(['config-notice', 'usage-pause', 'move-1', 'move-2', 'move-3', 'move-4-extra']);
const OUTPUT_NAME = 'CLAUDE.md';

// The user configuration file, under the Claude home folder.
const CONFIG_REL = Object.freeze(['pact', 'config.json']);
const CONFIG_SHOWN = 'pact/config.json';
const CONFIG_MAX = 64 * 1024;
const SCHEMA = 1;
const TOP_KEYS = Object.freeze(['schema', 'settings', 'edits']);

// Each setting: the open part it fills, its whole-number range, its default
// and its fixed template. The template at the default must equal the source's
// text between the part's marks, or the render refuses.
const USAGE_TEMPLATE = n => [
  'Before starting anything expensive — several subagents, a workflow, an eval —',
  'check my plan usage if a usage tool is available (the desktop app has one).',
  "Tell me the weekly figure and a rough cost for what you're about to start. If",
  `the weekly limit is above ${n}%, wait for my go-ahead. Never cut or stop work`,
  'because of usage on your own; that call is mine.',
];
const SETTINGS = new Map([['usage-pause', Object.freeze({ mark: 'usage-pause', min: 0, max: 100, def: 75, template: USAGE_TEMPLATE })]]);

// The notice. It starts with an empty line, so it reads as its own paragraph.
const NOTICE_MARK = 'config-notice';
const NOTICE_TEMPLATE = (digest, values) => [
  '',
  `**Configuration in effect.** This file was rendered with the configuration \`${digest}\`.`,
  `Values set: ${values.length ? values.map(([k, v]) => `${k} ${v}`).join(', ') : 'none'}. Parts edited: none.`,
];

const LF = 0x0a;
const FOLD_CASE = process.platform === 'win32' || process.platform === 'darwin';
// An open mark's name inside a comment that is not an exact open-mark line,
// whatever its spacing or case: the line would keep the mark from the
// renderer while a reader still takes it for one.
const OPEN_NEAR_RE = new RegExp(`<!--\\s*pact\\s*:\\s*(?:begin|end)\\s+(?:${[...OPEN_MARKS].sort((a, b) => b.length - a.length).join('|')})(?![a-z0-9])`, 'i');

const sha256 = b => createHash('sha256').update(b).digest('hex');

/** The mark on a line (bytes, no line feed): { kind, name, open } for an exact marker line, or null. */
function markOf(line) {
  for (const b of line) if (b > 0x7e) return null;
  const m = MARKER_RE.exec(line.toString('latin1'));
  return m ? { kind: m[1], name: m[2], open: OPEN_MARKS.includes(m[2]) } : null;
}

/** The source's lines, as byte buffers without their line feeds. Joining them with LF gives the source back. */
function splitLines(buf) {
  const lines = [];
  let start = 0;
  for (;;) {
    const end = buf.indexOf(LF, start);
    if (end < 0) {
      lines.push(buf.subarray(start));
      return lines;
    }
    lines.push(buf.subarray(start, end));
    start = end + 1;
  }
}

function joinLines(lines) {
  const parts = [];
  lines.forEach((l, i) => {
    if (i) parts.push(Buffer.from([LF]));
    parts.push(l);
  });
  return Buffer.concat(parts);
}

/**
 * The open marks' pairing and placement, checked on the source before any
 * change. Returns name -> { begin, end } (line indexes) for each paired open
 * mark, or null after recording every failure in `report`.
 */
function checkMarks(lines, report) {
  const pairs = new Map();
  let failed = false;
  const fail = (i, reason) => {
    failed = true;
    report.fail('placement', 'claude/CLAUDE.md', i + 1, reason);
  };
  let open = null; // the open mark now open: { name, begin }
  let gated = false; // whether a gated block is open
  lines.forEach((line, i) => {
    const m = markOf(line);
    if (!m) {
      if (OPEN_NEAR_RE.test(line.toString('latin1'))) fail(i, 'an open mark that is not alone on its line, exactly as written');
      return;
    }
    if (!m.open) {
      if (open) fail(i, `${open.name} encloses a gated mark`);
      gated = m.kind === 'begin';
      return;
    }
    if (m.kind === 'begin') {
      if (open) fail(i, `${m.name} opens inside ${open.name}`);
      else if (gated) fail(i, `${m.name} opens inside a gated block`);
      else if (pairs.has(m.name)) fail(i, `${m.name} opens twice`);
      else open = { name: m.name, begin: i };
      return;
    }
    if (!open || open.name !== m.name) return fail(i, `an end of ${m.name} with no open begin of the same name`);
    pairs.set(m.name, { begin: open.begin, end: i });
    open = null;
  });
  if (open) fail(open.begin, `${open.name} never closes`);
  return failed ? null : pairs;
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

const NONE = Object.freeze({ kind: 'none' });

/**
 * The user configuration file's bytes, read under the rules in the header.
 * Returns NONE when it does not exist, { buf } when it was read, or null after
 * recording the refusal in `report`.
 */
function readUserConfig(home, report) {
  const refuse = reason => {
    report.fail('config-file', CONFIG_SHOWN, null, reason);
    return null;
  };
  const missing = e => e && e.code === 'ENOENT';
  let root;
  try {
    root = realpathSync.native(home);
  } catch (e) {
    return missing(e) ? NONE : refuse('the Claude home folder could not be read');
  }
  const dir = join(root, CONFIG_REL[0]);
  const file = join(root, ...CONFIG_REL);
  let dst;
  try {
    dst = lstatSync(dir);
  } catch (e) {
    return missing(e) ? NONE : refuse('the pact folder could not be read');
  }
  if (dst.isSymbolicLink()) return refuse('the pact folder is a link');
  if (!dst.isDirectory()) return refuse('the pact folder is not a folder');
  let st;
  try {
    st = lstatSync(file, { bigint: true });
  } catch (e) {
    return missing(e) ? NONE : refuse('the user configuration file could not be read');
  }
  if (st.isSymbolicLink()) return refuse('the user configuration file is a link');
  if (!st.isFile()) return refuse('the user configuration file is not a regular file');
  if (st.nlink !== 1n) return refuse('the user configuration file has more than one link');
  let real;
  try {
    real = realpathSync.native(file);
  } catch {
    return refuse('the user configuration file could not be read');
  }
  if (FOLD_CASE ? real.toLowerCase() !== file.toLowerCase() : real !== file) return refuse('the user configuration file resolves somewhere else');
  let fd;
  try {
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    return refuse('the user configuration file could not be opened');
  }
  try {
    const fst = fstatSync(fd, { bigint: true });
    if (!fst.isFile() || fst.nlink !== 1n || fst.dev !== st.dev || fst.ino !== st.ino) return refuse('the user configuration file changed while it was opened');
    const buf = Buffer.alloc(CONFIG_MAX + 1);
    let n = 0;
    for (;;) {
      const got = readSync(fd, buf, n, buf.length - n, null);
      if (got === 0) break;
      n += got;
      if (n > CONFIG_MAX) {
        report.fail('config-size', CONFIG_SHOWN, null, 'larger than 64 KiB');
        return null;
      }
    }
    return { buf: buf.subarray(0, n) };
  } catch {
    return refuse('the user configuration file could not be read');
  } finally {
    closeSync(fd);
  }
}

const isObject = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const wholeIn = (v, min, max) => typeof v === 'number' && Number.isInteger(v) && !Object.is(v, -0) && v >= min && v <= max;

/**
 * The checked configuration from its bytes: [[setting, value], ...] in the
 * order SETTINGS lists them, or null after recording every refusal. Keys are
 * compared exactly against hard-coded lists, so no key such as "__proto__"
 * means anything.
 */
function checkConfig(buf, report) {
  const fail = (rule, reason) => report.fail(rule, CONFIG_SHOWN, null, reason);
  if (scanText(buf, CONFIG_SHOWN, report) === null) return null;
  let doc;
  try {
    doc = readStrictJson(buf);
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    fail('config-json', e.reason);
    return null;
  }
  if (!isObject(doc)) {
    fail('config-json', 'not a JSON object');
    return null;
  }
  let ok = true;
  const keys = Object.keys(doc);
  if (keys.some(k => !TOP_KEYS.includes(k))) {
    fail('config-key', 'a key that is not schema, settings or edits');
    ok = false;
  }
  if (!Object.hasOwn(doc, 'schema') || !wholeIn(doc.schema, SCHEMA, SCHEMA)) {
    fail('config-schema', `schema must be ${SCHEMA}`);
    ok = false;
  }
  if (Object.hasOwn(doc, 'edits') && (!Array.isArray(doc.edits) || doc.edits.length)) {
    fail('config-edits', 'edits must be an empty list: this version of the pact edits no open part');
    ok = false;
  }
  const values = [];
  if (Object.hasOwn(doc, 'settings')) {
    if (!isObject(doc.settings)) {
      fail('config-settings', 'settings must be an object');
      ok = false;
    } else {
      if (Object.keys(doc.settings).some(k => !SETTINGS.has(k))) {
        fail('config-settings', 'settings holds a name that is not a setting');
        ok = false;
      }
      for (const [name, spec] of SETTINGS) {
        if (!Object.hasOwn(doc.settings, name)) continue;
        const v = doc.settings[name];
        if (wholeIn(v, spec.min, spec.max)) values.push([name, v]);
        else {
          fail('config-value', `${name} must be a whole number from ${spec.min} to ${spec.max}`);
          ok = false;
        }
      }
    }
  }
  return ok ? values : null;
}

/** Lines of text as byte buffers. */
const toLines = texts => texts.map(s => Buffer.from(s, 'utf8'));

/**
 * The source with each value's template in its part and the notice in its
 * slot, open-mark lines still in place; or null after recording a refusal.
 */
function fill(lines, pairs, values, digest, report) {
  const fail = (name, reason) => {
    report.fail('render', 'claude/CLAUDE.md', null, `${name}: ${reason}`);
    return null;
  };
  const swaps = [];
  for (const [name, value] of values) {
    const spec = SETTINGS.get(name);
    const p = pairs.get(spec.mark);
    if (!p) return fail(spec.mark, 'the part is not in the source');
    const now = lines.slice(p.begin + 1, p.end);
    const def = toLines(spec.template(spec.def));
    if (now.length !== def.length || now.some((l, i) => !l.equals(def[i]))) return fail(spec.mark, 'the template at its default no longer matches the source');
    swaps.push({ ...p, with: toLines(spec.template(value)) });
  }
  const n = pairs.get(NOTICE_MARK);
  if (!n) return fail(NOTICE_MARK, 'the slot is not in the source');
  if (n.end !== n.begin + 1) return fail(NOTICE_MARK, 'the slot is not empty in the source');
  swaps.push({ ...n, with: toLines(NOTICE_TEMPLATE(digest, values)) });
  const out = lines.slice();
  for (const s of swaps.sort((a, b) => b.begin - a.begin)) out.splice(s.begin + 1, s.end - s.begin - 1, ...s.with);
  return out;
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
  if (argv.length !== 3 || argv.some(a => a === '' || a.startsWith('-'))) {
    report.fail('usage', null, null, 'usage: node render.mjs <source rules file> <output folder> <Claude home folder>');
    return;
  }
  const [source, out, home] = argv;
  if (!emptyFolder(out)) {
    report.fail('output', null, null, 'the output folder must be an empty folder that is not a link');
    return;
  }
  const buf = readSource(source, report);
  if (buf === null) return;
  let lines = splitLines(buf);
  const pairs = checkMarks(lines, report);
  if (pairs === null) return;

  const config = readUserConfig(home, report);
  if (config === null) return;
  const head = [];
  if (config === NONE) head.push('CONFIG none');
  else {
    const values = checkConfig(config.buf, report);
    if (values === null) return;
    const hash = sha256(config.buf);
    const digest = sha256(`user ${hash}\n`).slice(0, 12);
    lines = fill(lines, pairs, values, digest, report);
    if (lines === null) return;
    head.push(`CONFIG user ${hash}`, `DIGEST ${digest}`, ...values.map(([k, v]) => `VALUE ${k} ${v}`));
  }

  const rendered = joinLines(lines.filter(l => !markOf(l)?.open));
  if (rendered.length > MAX_BYTES) {
    report.fail('size', null, null, 'the rendered rules file would be larger than 1 MiB');
    return;
  }
  writeFileSync(join(out, OUTPUT_NAME), rendered, { flag: 'wx' });
  report.lines.push(`RENDERED ${sha256(rendered)}`, ...head);
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
