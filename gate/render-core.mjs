// render-core.mjs (#155): the check itself, for the renderer. render.mjs is its
// command line: it calls check() with its arguments, prints the lines and sets
// the exit code. Importing this file does nothing: no file, process,
// environment or OS user read until check() is called, and check() never prints
// or exits.
//
// The renderer (#53): turns the pact's source rules file into the rules file
// the install writes. The install script runs it from the stage, before seam A,
// so seam A checks the bytes that get installed.
//
//   node render.mjs <source rules file> <output folder> <Claude home folder>
//   node render.mjs project <output folder> <Claude home folder> <project folder>
//
// The second form is the project mode, described at the end of this header.
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
// The files it reads. The user file is CONFIG_REL under the Claude home
// folder; each block file an edit names is under BLOCKS_REL beside it. Both
// are read under these rules:
//   - For the user file, only "does not exist" means no file. A link, a
//     dangling link, a folder, a file with more than one link, or any read
//     error refuses. A block file that does not exist refuses.
//   - Every component below the Claude home folder is lstat'ed and must not be
//     a link; the file's real path must stay where it was named; the open
//     handle must be the regular, one-link file the lstat saw (device and
//     inode); and it is read once, its size cap enforced during the read.
//   - Node's lstat reports symbolic links and junctions, but reads other
//     reparse points as plain files and folders. The install script runs its
//     own reparse-attribute test on the file and its blocks folder before it
//     runs this; these checks are the second layer.
//   - Each file's one buffer is checked (gate's text scanner, then strict JSON
//     and an exact shape for the user file, or the block-text rules for a
//     block), rendered and hashed.
//   - A block path is checked on its text before any file system call.
//
// The user file's shape:
//   { "schema": 1, "settings": { <setting>: <value> },
//     "edits": [ { "mark": <open mark>, "op": "replace" | "remove" | "add-after",
//                  "file": <block path, except for remove> } ] }
// A setting fills its open part from a fixed template with the checked number;
// no text from the user file is ever spliced. An edit applies to an open part
// only: a gated mark, the notice slot and a setting's part are refused by name.
// Block text is re-indented to the part's mark line, so text inside a move
// stays inside it. When a configuration applies, the config-notice slot is
// filled with a fixed notice naming its digest, its values and its edited
// parts.
//
// The digest is the first 12 hex characters of the sha256 of one line per
// file read: "user <sha256 of the user file>\n", then for each edit with a
// block, in edit order, "block <block path> <sha256 of the block file>\n".
//
// With no configuration, the output is the source with its open-mark lines
// removed and every other byte unchanged. A line that is not an open-mark line
// passes through as it is, so anything else malformed (a bad gated mark, a
// carriage return, invalid UTF-8) reaches seam A unchanged, and seam A refuses
// it as before. Seam A's line numbers then count the rendered file.
//
// It writes two files into the output folder (a third per agent setting, see below), which must be an empty folder
// that is not a link: OUTPUT_NAME, the rendered rules file, and DIFF_NAME, a
// unified diff from the no-configuration render to this render (empty when no
// configuration applies). The diff is built from the parts the render changed,
// never by a general diff. It prints, one per line:
//
//   RENDERED <sha256 of the output file>
//   DIFF <sha256 of the diff file>
//   CONFIG none                       or   CONFIG user <sha256 of the file>
//                                          DIGEST <12 hex>
//                                          VALUE <setting> <number>   (one per value set)
//                                          EDIT <mark> remove                        (one per edit,
//                                          EDIT <mark> <op> <sha256> <block path>     in edit order)
//   RESULT: pass
//
// or FAIL lines and "RESULT: fail", with exit 1. Like seam A, it never echoes a
// file's content or a path from the command line: its messages are its own
// fixed text, constant names, edit positions, and a block path only once it
// has passed the path-text check, so it holds only letters, digits, '.', '_',
// '-' and '/'.
//
// Agent settings (#97). A user file may set the model and effort of every lens
// in CONFIGURABLE_AGENTS; each file's own values are its default. A sealed
// agent (scout) is refused by name. Only when a setting is given, the renderer
// reads that agent's file from the staged claude/agents/ folder beside the
// source rules file, under the source's read rules. It refuses an agent that
// carries a metadata (seal) key. It rewrites only the frontmatter's column-0
// model and effort lines, from the allow-list constants; an unset field keeps
// the file's value, which must be on the allow-list too; and it refuses if the
// result would differ from the file anywhere else, so no setting adds a tool.
// It classifies the agent as security-set when any sign holds: its tools line
// is not DEFAULT_AGENT_TOOLS, the tool allow-list has an entry for it, the
// source's security-route clause names it, its own file carries a risk-floor
// block, or it is on SECURITY_DOUBT. The signs are read on every run, so a lens
// that later gains one is marked without anyone editing a list. It writes the
// result as AGENT_OUTPUT_PREFIX + <name>.md and prints
//   AGENT <name> <model> <effort> <sha256 of the agent file> <plain|security-set> <default|override> <local|egress>
// after the CONFIG lines: override when the result differs from the file's
// own values, egress when the tools line holds more than the read tools. The
// notice gains an "Agents set:" line, and a security-set override carries
// OVERRIDE_MARK there, with a sentence telling the session to put it beside
// every report from that lens. Adding an agent to CONFIGURABLE_AGENTS is on
// AGENTS.md's probe floor.
//
// The project mode (#53, slice 5) renders the project rules file for a
// project install. It reads the user file, for the user's effective values and
// to refuse a bad one (its edits are checked for shape, but their blocks are
// not read, since no edit reaches a project), and the project file at
// PROJECT_REL in the project folder, under the same reading rules, rooted at
// the project folder. With no project file it refuses, saying there is no
// project configuration. The project file's shape is the user file's minus
// "edits": { "schema": 1, "settings": { <setting>: <value> } }. An edit list,
// even an empty one, and any other key refuse. It must set at least one value,
// and each must declare a tightening direction and be strictly tighter than
// the user's effective value (the user file's value, or the default). The
// output holds only fixed-template lines filled with the checked numbers, each
// reading as the lower of the project's value and the user's, so it stays
// tighter if the user later changes theirs. The shared text scanner runs on
// the output before its hash is reported. It writes PROJECT_OUTPUT_NAME alone
// into the output folder and prints:
//
//   RENDERED <sha256 of the output file>
//   CONFIG none                       or   CONFIG user <sha256 of the user file>
//   PROJECT <sha256 of the project file>
//   DIGEST <12 hex>
//   VALUE <setting> <number>          (one per project value)
//   RESULT: pass
//
// Its digest is the first 12 hex characters of the sha256 of "user <sha256 of
// the user file>\n" (when there is one), then "project <sha256 of the project
// file>\n". Nothing in this mode reads the source rules file or the stage.
//
// No switch turns a check off. Node 20 or later, ESM.

import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANY_FENCE_RE, HEADING_LIKE_RE, MARKER_RE, MAX_BYTES, Refused, Report, SEGMENT_RE, SETEXT_RE, readStrictJson, scanText } from './shared.mjs';

// The open marks this version knows. Hard-coded, so no file can add one.
// Adding a mark is a change to this list and to the pact source, on the
// security route like any other change here.
const OPEN_MARKS = Object.freeze(['config-notice', 'usage-pause', 'move-1', 'move-2', 'move-3', 'move-4-extra']);
// The open marks an edit may target: every open mark but the notice slot and
// a setting's part.
const EDITABLE = Object.freeze(['move-1', 'move-2', 'move-3', 'move-4-extra']);
// The gated clauses (gate/clauses/), which no edit may target with any
// operation. install-go-ahead lives in AGENTS.md, which is never installed,
// and is refused like the others.
const GATED = Object.freeze(['risk-floor', 'no-skill-overrides', 'security-route', 'never-substitute', 'move-4', 'stop-and-escalate', 'tracker-authors', 'install-go-ahead']);
const OPS = Object.freeze(['replace', 'remove', 'add-after']);
const EDIT_KEYS = Object.freeze(['mark', 'op', 'file']);
const EDITS_MAX = 16;

const OUTPUT_NAME = 'CLAUDE.md';
const DIFF_NAME = 'config.diff';

// The user configuration file and its blocks folder, under the Claude home folder.
const CONFIG_REL = Object.freeze(['pact', 'config.json']);
const CONFIG_SHOWN = 'pact/config.json';
const CONFIG_NAMES = Object.freeze(['the pact folder', 'the user configuration file']);
const CONFIG_MAX = 64 * 1024;
const BLOCKS_REL = Object.freeze(['pact', 'blocks']);
const BLOCK_MAX = 16 * 1024;
const BLOCK_PATH_MAX = 200;
const BLOCK_DEPTH_MAX = 8;
const SCHEMA = 1;
const TOP_KEYS = Object.freeze(['schema', 'settings', 'edits', 'agents']);

// Agent settings: who may be set, to what. Matched exactly; only these
// constants are ever printed or written.
const CONFIGURABLE_AGENTS = Object.freeze(['adversarial-lens', 'behaviour-lens', 'data-lens', 'executability-lens', 'good-enough-lens', 'integrity-lens', 'unstated-lens']);
// scout is a sealed familiar: its digest covers its own file.
const LOCKED_AGENTS = Object.freeze(['scout']);
const AGENT_MODELS = Object.freeze(['opus', 'sonnet']);
const AGENT_EFFORTS = Object.freeze(['low', 'medium', 'high']);
const AGENT_FIELDS = Object.freeze(['model', 'effort']);
const DEFAULT_AGENT_TOOLS = 'tools: [Read, Glob, Grep]';
const AGENT_OUTPUT_PREFIX = 'agent-';
// The signs of a security-set agent that are read from text: the gated
// clause that names it, and the block its own file carries.
const ROUTE_CLAUSE = 'security-route';
const RISK_FLOOR_BLOCK = '<!-- pact:begin risk-floor -->';
// Lenses on the probe floor by doubt (AGENTS.md: when in doubt, a change is on
// the floor), each with its reason. No sign in their files says so.
const SECURITY_DOUBT = Object.freeze({
  'good-enough-lens': 'it never defers a risk-floor item',
  'unstated-lens': 'it reports work that should have taken the security route',
});
const OVERRIDE_MARK = 'override, not security-tested';
const TOOL_ALLOWLIST = join(dirname(fileURLToPath(import.meta.url)), 'tool-allowlist.json');

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
// A setting's project line, for the project rules file: it reads as the lower
// of the project's value and the user's. `tighter` is the direction a project
// may move it: 'lower' means a smaller number is stricter.
const USAGE_PROJECT_LINE = n =>
  `- **Usage pause.** In this project, wait for my go-ahead when the weekly limit is above ${n}% or above the line in my user rules, whichever is lower.`;
const SETTINGS = new Map([
  ['usage-pause', Object.freeze({ mark: 'usage-pause', min: 0, max: 100, def: 75, template: USAGE_TEMPLATE, tighter: 'lower', projectLine: USAGE_PROJECT_LINE })],
]);

// The project file, in the project folder, and the project rules file this
// mode writes. The install script names the same constants.
const PROJECT_REL = Object.freeze(['.claude', 'pact-config.json']);
const PROJECT_SHOWN = '.claude/pact-config.json';
const PROJECT_NAMES = Object.freeze(["the project's .claude folder", 'the project configuration file']);
const PROJECT_TOP_KEYS = Object.freeze(['schema', 'settings']);
const PROJECT_OUTPUT_NAME = 'pact-project.md';
const PROJECT_TEMPLATE = lines => [
  '# Pact settings for this project',
  '',
  "The pact's installer wrote this file from this project's pact configuration. Each line can only make the pact stricter here.",
  '',
  ...lines,
  '',
];

// The notice. It starts with an empty line, so it reads as its own paragraph.
const NOTICE_MARK = 'config-notice';
const NOTICE_TEMPLATE = (digest, values, edits, agents = []) => [
  '',
  `**Configuration in effect.** This file was rendered with the configuration \`${digest}\`.`,
  `Values set: ${values.length ? values.map(([k, v]) => `${k} ${v}`).join(', ') : 'none'}. Parts edited: ${edits.length ? edits.map(e => `${e.mark} (${e.op})`).join(', ') : 'none'}.`,
  ...(agents.length ? [`Agents set: ${agents.map(a => `${a.name} (${a.model}, ${a.effort} effort${a.security && a.override ? `; ${OVERRIDE_MARK}` : ''})`).join(', ')}.`] : []),
  ...(agents.some(a => a.security && a.override)
    ? [`Put "${OVERRIDE_MARK}" beside every report you post from these lenses, and in their rows of the Lens dispositions table: ${agents.filter(a => a.security && a.override).map(a => a.name).join(', ')}.`]
    : []),
];

const LF = 0x0a;
const CR = 0x0d;
const FOLD_CASE = process.platform === 'win32' || process.platform === 'darwin';
// An open mark's name inside a comment that is not an exact open-mark line,
// whatever its spacing or case: the line would keep the mark from the
// renderer while a reader still takes it for one.
const OPEN_NEAR_RE = new RegExp(`<!--\\s*pact\\s*:\\s*(?:begin|end)\\s+(?:${[...OPEN_MARKS].sort((a, b) => b.length - a.length).join('|')})(?![a-z0-9])`, 'i');

// Block text forms that could frame a clause one way for the model and
// another way for the check, or move text out of its part.
const IMPORT_RE = /@[^ \n]/;
const THEMATIC_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const NUMBERED_RE = /^[0-9]{1,9}[.)](?:[ \t]|$)/;
const RESERVED_RE = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i;

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
const MISSING = Object.freeze({ kind: 'missing' });

/**
 * One file under the Claude home folder, read under the rules in the header.
 * `segs` are its path segments below the home folder; `names` label each one
 * in messages, the folders first and the file last. Returns MISSING when the
 * home folder or a segment does not exist, { buf } when it was read, or null
 * after recording the refusal (rule `rule`, or `size.rule` for the cap).
 */
function readUnder(home, segs, names, { cap, shownFile, rule, size, rootLabel = 'the Claude home folder' }, report) {
  const refuse = reason => {
    report.fail(rule, shownFile, null, reason);
    return null;
  };
  const missing = e => e && e.code === 'ENOENT';
  let root;
  try {
    root = realpathSync.native(home);
  } catch (e) {
    return missing(e) ? MISSING : refuse(`${rootLabel} could not be read`);
  }
  let dir = root;
  for (let i = 0; i < segs.length - 1; i += 1) {
    dir = join(dir, segs[i]);
    let dst;
    try {
      dst = lstatSync(dir);
    } catch (e) {
      return missing(e) ? MISSING : refuse(`${names[i]} could not be read`);
    }
    if (dst.isSymbolicLink()) return refuse(`${names[i]} is a link`);
    if (!dst.isDirectory()) return refuse(`${names[i]} is not a folder`);
  }
  const label = names[segs.length - 1];
  const file = join(dir, segs[segs.length - 1]);
  let st;
  try {
    st = lstatSync(file, { bigint: true });
  } catch (e) {
    return missing(e) ? MISSING : refuse(`${label} could not be read`);
  }
  if (st.isSymbolicLink()) return refuse(`${label} is a link`);
  if (!st.isFile()) return refuse(`${label} is not a regular file`);
  if (st.nlink !== 1n) return refuse(`${label} has more than one link`);
  let real;
  try {
    real = realpathSync.native(file);
  } catch {
    return refuse(`${label} could not be read`);
  }
  if (FOLD_CASE ? real.toLowerCase() !== file.toLowerCase() : real !== file) return refuse(`${label} resolves somewhere else`);
  let fd;
  try {
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    return refuse(`${label} could not be opened`);
  }
  try {
    const fst = fstatSync(fd, { bigint: true });
    if (!fst.isFile() || fst.nlink !== 1n || fst.dev !== st.dev || fst.ino !== st.ino) return refuse(`${label} changed while it was opened`);
    const buf = Buffer.alloc(cap + 1);
    let n = 0;
    for (;;) {
      const got = readSync(fd, buf, n, buf.length - n, null);
      if (got === 0) break;
      n += got;
      if (n > cap) {
        report.fail(size.rule, shownFile, null, size.reason);
        return null;
      }
    }
    return { buf: buf.subarray(0, n) };
  } catch {
    return refuse(`${label} could not be read`);
  } finally {
    closeSync(fd);
  }
}

/** The user configuration file's bytes: NONE when it does not exist, { buf } when read, or null after a refusal. */
function readUserConfig(home, report) {
  const r = readUnder(home, CONFIG_REL, CONFIG_NAMES, { cap: CONFIG_MAX, shownFile: CONFIG_SHOWN, rule: 'config-file', size: { rule: 'config-size', reason: 'larger than 64 KiB' } }, report);
  return r === MISSING ? NONE : r;
}

/**
 * Why a block path's text is refused, or null when it is a plain relative
 * path under the blocks folder. Checked before any file system call. The
 * reasons are fixed text: the path itself is never part of one.
 */
function blockPathProblem(p) {
  if (typeof p !== 'string' || p === '') return 'the block path is empty or not text';
  if (p.length > BLOCK_PATH_MAX) return `the block path is longer than ${BLOCK_PATH_MAX} characters`;
  if (p.startsWith('/') || p.startsWith('\\')) return 'an absolute path, a network share or a device path';
  if (/^[A-Za-z]:/.test(p)) return 'a drive or drive-relative path';
  if (p.includes('\\')) return 'a backslash separator';
  if (p.includes(':')) return 'stream syntax (a colon)';
  const segs = p.split('/');
  if (segs.length > BLOCK_DEPTH_MAX) return `more than ${BLOCK_DEPTH_MAX} path segments`;
  for (const s of segs) {
    if (s === '') return 'an empty path segment';
    if (s === '.' || s === '..') return 'a . or .. segment';
    if (s.endsWith('.') || s.endsWith(' ')) return 'a segment ending in a dot or a space';
    if (RESERVED_RE.test(s)) return 'a reserved device name';
    if (!SEGMENT_RE.test(s)) return "a character outside letters, digits, '.', '_' and '-'";
  }
  return null;
}

const isObject = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const wholeIn = (v, min, max) => typeof v === 'number' && Number.isInteger(v) && !Object.is(v, -0) && v >= min && v <= max;

/** The edit list, checked: [{ n, mark, op, path }] in edit order, or null after recording every refusal. */
function checkEdits(edits, fail) {
  if (!Array.isArray(edits)) {
    fail('config-edits', 'edits must be a list');
    return null;
  }
  if (edits.length > EDITS_MAX) {
    fail('edit-count', `more than ${EDITS_MAX} edits`);
    return null;
  }
  let ok = true;
  const out = [];
  const seen = new Set();
  edits.forEach((e, i) => {
    const n = i + 1;
    const bad = (rule, reason) => {
      fail(rule, `edit ${n}: ${reason}`);
      ok = false;
    };
    if (!isObject(e)) return bad('edit-shape', 'not an object');
    if (Object.keys(e).some(k => !EDIT_KEYS.includes(k))) return bad('edit-shape', 'a key that is not mark, op or file');
    if (typeof e.mark !== 'string') return bad('edit-shape', 'mark must be text');
    // Matched exactly against constant lists, and only the constant is printed.
    const gated = GATED.find(g => g === e.mark);
    if (gated) return bad('edit-gated', `${gated} is a gated clause; no edit may target it`);
    if (e.mark === 'usage-pause') return bad('edit-setting', 'usage-pause is set only through its setting; no edit may target it');
    if (e.mark === NOTICE_MARK) return bad('edit-notice', 'config-notice is filled by the renderer; no edit may target it');
    const mark = EDITABLE.find(m => m === e.mark);
    if (!mark) return bad('edit-mark', 'an unknown mark');
    if (seen.has(mark)) return bad('edit-twice', `${mark} is edited twice`);
    seen.add(mark);
    const op = typeof e.op === 'string' ? OPS.find(o => o === e.op) : undefined;
    if (!op) return bad('edit-op', 'an unknown operation');
    const hasFile = Object.hasOwn(e, 'file');
    if (op === 'remove') {
      if (hasFile) return bad('edit-shape', 'remove takes no file');
      out.push({ n, mark, op, path: null });
      return;
    }
    if (!hasFile) return bad('edit-shape', `${op} needs a file`);
    const why = blockPathProblem(e.file);
    if (why) return bad('block-path', why);
    out.push({ n, mark, op, path: e.file });
  });
  return ok ? out : null;
}

/**
 * The checked configuration from its bytes: { values, edits }, values as
 * [[setting, value], ...] in the order SETTINGS lists them, or null after
 * recording every refusal. Keys are compared exactly against hard-coded
 * lists, so no key such as "__proto__" means anything.
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
    fail('config-key', 'a key that is not schema, settings, edits or agents');
    ok = false;
  }
  if (!Object.hasOwn(doc, 'schema') || !wholeIn(doc.schema, SCHEMA, SCHEMA)) {
    fail('config-schema', `schema must be ${SCHEMA}`);
    ok = false;
  }
  let edits = [];
  if (Object.hasOwn(doc, 'edits')) {
    edits = checkEdits(doc.edits, fail);
    if (edits === null) ok = false;
  }
  let agents = [];
  if (Object.hasOwn(doc, 'agents')) {
    agents = checkAgentSettings(doc.agents, fail);
    if (agents === null) ok = false;
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
  return ok ? { values, edits, agents } : null;
}

/**
 * The agent settings, checked: [{ name, model, effort }] with each field a
 * constant from its allow-list or null when unset, or null after recording
 * every refusal. Names, fields and values are matched exactly.
 */
function checkAgentSettings(v, fail) {
  if (!isObject(v) || !Object.keys(v).length) {
    fail('config-agents', 'agents must be an object naming at least one agent');
    return null;
  }
  let ok = true;
  const out = [];
  for (const k of Object.keys(v)) {
    const name = CONFIGURABLE_AGENTS.find(a => a === k);
    if (!name) {
      const locked = LOCKED_AGENTS.find(a => a === k);
      fail('config-agents', locked ? `${locked} is locked: it is sealed, so its model and effort are not configurable` : `agents names an agent this configuration cannot set; only ${CONFIGURABLE_AGENTS.join(', ')} can be set`);
      ok = false;
      continue;
    }
    const e = v[k];
    if (!isObject(e) || !Object.keys(e).length || Object.keys(e).some(f => !AGENT_FIELDS.includes(f))) {
      fail('config-agents', `${name} must be an object holding model, effort or both, and nothing else`);
      ok = false;
      continue;
    }
    const model = Object.hasOwn(e, 'model') ? AGENT_MODELS.find(m => m === e.model) : null;
    const effort = Object.hasOwn(e, 'effort') ? AGENT_EFFORTS.find(m => m === e.effort) : null;
    if (model === undefined) {
      fail('config-agents', `${name}: model must be one of ${AGENT_MODELS.join(', ')}`);
      ok = false;
    }
    if (effort === undefined) {
      fail('config-agents', `${name}: effort must be one of ${AGENT_EFFORTS.join(', ')}`);
      ok = false;
    }
    if (model !== undefined && effort !== undefined) out.push({ name, model, effort });
  }
  return ok ? out : null;
}

/** A regular file that is not a link, read once with a cap; null after recording `reason`s under `rule`. */
function readCapped(path, cap, rule, shown, report) {
  const refuse = reason => {
    report.fail(rule, shown, null, reason);
    return null;
  };
  let st;
  try {
    st = lstatSync(path, { bigint: true });
  } catch {
    return refuse('the file is missing');
  }
  if (st.isSymbolicLink() || !st.isFile()) return refuse('not a regular file');
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    return refuse('could not be opened');
  }
  try {
    const fst = fstatSync(fd, { bigint: true });
    if (!fst.isFile() || fst.dev !== st.dev || fst.ino !== st.ino) return refuse('changed while it was opened');
    const buf = Buffer.alloc(cap + 1);
    let n = 0;
    for (;;) {
      const got = readSync(fd, buf, n, buf.length - n, null);
      if (got === 0) break;
      n += got;
      if (n > cap) return refuse('larger than its cap');
    }
    return buf.subarray(0, n);
  } catch {
    return refuse('could not be read');
  } finally {
    closeSync(fd);
  }
}

/**
 * One configured agent's file, read from the staged claude/agents/ folder
 * beside the source rules file and rewritten: { name, model, effort, buf },
 * or null after recording the refusal. Only the frontmatter's column-0 model
 * and effort lines change, to allow-list constants.
 */
function renderAgent(source, a, report, srcText = '') {
  const shown = `claude/agents/${a.name}.md`;
  const fail = reason => {
    report.fail('agent-file', shown, null, reason);
    return null;
  };
  const buf = readCapped(join(dirname(source), 'agents', `${a.name}.md`), MAX_BYTES, 'agent-file', shown, report);
  if (buf === null) return null;
  const text = scanText(buf, shown, report);
  if (text === null) return null;
  const lines = text.split('\n');
  if (lines[0] !== '---') return fail('no frontmatter: the first line is not ---');
  const close = lines.indexOf('---', 1);
  if (close < 0) return fail('the frontmatter never closes');
  const at = re => lines.slice(1, close).map((l, i) => (re.test(l) ? i + 1 : -1)).filter(i => i > 0);
  const modelAt = at(/^model:/);
  const effortAt = at(/^effort:/);
  const toolsAt = at(/^tools:/);
  if (modelAt.length !== 1) return fail('the frontmatter must hold exactly one model line');
  if (effortAt.length !== 1) return fail('the frontmatter must hold exactly one effort line');
  if (at(/^metadata:/).length) return fail('the agent carries a metadata (seal) key; a sealed agent cannot be configured');
  if (toolsAt.length !== 1) return fail('the frontmatter must hold exactly one tools line');
  const route = new RegExp(`<!-- pact:begin ${ROUTE_CLAUSE} -->\\n([\\s\\S]*?)<!-- pact:end ${ROUTE_CLAUSE} -->`).exec(srcText);
  if (!route) return fail(`the source has no ${ROUTE_CLAUSE} clause to check the agent against`);
  const allow = readCapped(TOOL_ALLOWLIST, 64 * 1024, 'agent-file', 'gate/tool-allowlist.json', report);
  if (allow === null) return null;
  let allowDoc;
  try {
    allowDoc = readStrictJson(allow);
  } catch {
    return fail('the tool allow-list could not be read');
  }
  if (!isObject(allowDoc)) return fail('the tool allow-list could not be read');
  // The pact's definition of a security-set lens, read from the evidence on
  // every run (see the header).
  const egress = lines[toolsAt[0]] !== DEFAULT_AGENT_TOOLS;
  const security = egress
    || Object.hasOwn(allowDoc, a.name)
    || route[1].includes(`\`${a.name}\``)
    || lines.includes(RISK_FLOOR_BLOCK)
    || Object.hasOwn(SECURITY_DOUBT, a.name);
  const nowModel = AGENT_MODELS.find(m => lines[modelAt[0]] === `model: ${m}`);
  const nowEffort = AGENT_EFFORTS.find(e => lines[effortAt[0]] === `effort: ${e}`);
  if (!nowModel) return fail(`the file's model line is not one of ${AGENT_MODELS.join(', ')}`);
  if (!nowEffort) return fail(`the file's effort line is not one of ${AGENT_EFFORTS.join(', ')}`);
  const model = a.model ?? nowModel;
  const effort = a.effort ?? nowEffort;
  const out = [...lines];
  out[modelAt[0]] = `model: ${model}`;
  out[effortAt[0]] = `effort: ${effort}`;
  if (out.length !== lines.length || out.some((l, i) => i !== modelAt[0] && i !== effortAt[0] && l !== lines[i])) return fail('the rendered file would differ from the source beyond its model and effort lines');
  const override = model !== nowModel || effort !== nowEffort;
  return { name: a.name, model, effort, security, override, egress, buf: Buffer.from(out.join('\n'), 'utf8') };
}

/**
 * A block file's lines, checked against the block-text rules, or null after
 * recording every failure. `file` is the block's shown name.
 */
function checkBlock(buf, file, report) {
  const fail = (line, reason) => report.fail('block-text', file, line, reason);
  if (buf.includes(CR)) {
    report.fail('block-crlf', file, null, 'a carriage return: the block file has CRLF (Windows) line endings; save it with LF line endings only');
    return null;
  }
  const text = scanText(buf, file, report);
  if (text === null) return null;
  if (text.trim() === '') {
    fail(null, 'empty');
    return null;
  }
  if (!text.endsWith('\n') || text.endsWith('\n\n')) {
    fail(null, 'must end with exactly one line feed');
    return null;
  }
  let ok = true;
  const bad = (line, reason) => {
    fail(line, reason);
    ok = false;
  };
  const lines = text.slice(0, -1).split('\n');
  lines.forEach((line, i) => {
    const ln = i + 1;
    if (line.includes('<!--')) bad(ln, 'an HTML comment opener (<!--)');
    if (IMPORT_RE.test(line)) bad(ln, 'an @ followed by text, which Claude Code may read as an import');
    if (line.trim() === '') bad(ln, 'a blank line');
    else if (/^[ \t]/.test(line)) bad(ln, 'a leading space or tab');
    else if (ANY_FENCE_RE.test(line)) bad(ln, 'a code fence');
    else if (HEADING_LIKE_RE.test(line)) bad(ln, 'an ATX heading');
    else if (SETEXT_RE.test(line)) bad(ln, 'a setext heading underline');
    else if (THEMATIC_RE.test(line)) bad(ln, 'a thematic break');
    else if (NUMBERED_RE.test(line)) bad(ln, 'a numbered list line');
  });
  return ok ? lines : null;
}

/**
 * Each edit's block, read and checked: the edits with `lines` (strings) and
 * `hash` added for each block, or null after recording every refusal.
 */
function readBlocks(home, edits, report) {
  let ok = true;
  const out = [];
  for (const e of edits) {
    if (!e.path) {
      out.push(e);
      continue;
    }
    const segs = e.path.split('/');
    const shownFile = `pact/blocks/${e.path}`;
    const names = ['the pact folder', 'the blocks folder', ...segs.slice(1).map(() => 'a folder on the block path'), 'the block file'];
    const r = readUnder(home, [...BLOCKS_REL, ...segs], names, { cap: BLOCK_MAX, shownFile, rule: 'block-file', size: { rule: 'block-size', reason: 'larger than 16 KiB' } }, report);
    if (r === MISSING) {
      report.fail('block-file', shownFile, null, `edit ${e.n}: the block file, or a folder on its path, does not exist`);
      ok = false;
      continue;
    }
    if (r === null) {
      ok = false;
      continue;
    }
    const lines = checkBlock(r.buf, shownFile, report);
    if (lines === null) {
      ok = false;
      continue;
    }
    out.push({ ...e, lines, hash: sha256(r.buf) });
  }
  return ok ? out : null;
}

/** Lines of text as byte buffers. */
const toLines = texts => texts.map(s => Buffer.from(s, 'utf8'));

/**
 * The swaps a configuration makes: [{ begin, end, with }], each replacing the
 * lines strictly between an open part's two mark lines; or null after
 * recording a refusal.
 */
function swapsFor(lines, pairs, values, edits, digest, report, agents = []) {
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
  for (const e of edits) {
    const p = pairs.get(e.mark);
    if (!p) return fail(e.mark, 'the part is not in the source');
    // The part's indentation is its mark line's: a move's parts sit at the
    // move's continuation indent, so block text stays inside the move.
    const indent = /^ */.exec(lines[p.begin].toString('latin1'))[0];
    const block = e.lines ? toLines(e.lines.map(l => `${indent}${l}`)) : [];
    const now = lines.slice(p.begin + 1, p.end);
    swaps.push({ ...p, with: e.op === 'replace' ? block : e.op === 'remove' ? [] : [...now, ...block] });
  }
  const n = pairs.get(NOTICE_MARK);
  if (!n) return fail(NOTICE_MARK, 'the slot is not in the source');
  if (n.end !== n.begin + 1) return fail(NOTICE_MARK, 'the slot is not empty in the source');
  swaps.push({ ...n, with: toLines(NOTICE_TEMPLATE(digest, values, edits, agents)) });
  return swaps;
}

/**
 * The render with `swaps` applied and open-mark lines stripped, and the
 * unified diff from the no-configuration render to it. The diff's hunks come
 * from the swaps themselves, with up to three lines of context.
 */
function apply(lines, swaps) {
  const at = new Map(swaps.map(s => [s.begin, s]));
  const def = [];
  const cfg = [];
  const changes = []; // { a, b, old, neu }: positions in def and cfg
  for (let i = 0; i < lines.length; i += 1) {
    const s = at.get(i);
    if (s) {
      const old = lines.slice(s.begin + 1, s.end);
      // The hunk holds only the lines that differ: lines the part keeps at
      // either end are context.
      let head = 0;
      while (head < old.length && head < s.with.length && old[head].equals(s.with[head])) head += 1;
      let tail = 0;
      while (tail < old.length - head && tail < s.with.length - head && old[old.length - 1 - tail].equals(s.with[s.with.length - 1 - tail])) tail += 1;
      changes.push({ a: def.length + head, b: cfg.length + head, old: old.slice(head, old.length - tail), neu: s.with.slice(head, s.with.length - tail) });
      def.push(...old);
      cfg.push(...s.with);
      i = s.end; // the part's end mark line is stripped too
      continue;
    }
    if (markOf(lines[i])?.open) continue;
    def.push(lines[i]);
    cfg.push(lines[i]);
  }
  return { rendered: joinLines(cfg), diff: unifiedDiff(def, cfg, changes) };
}

const CONTEXT = 3;

function unifiedDiff(def, cfg, changes) {
  const real = changes.filter(c => c.old.length !== c.neu.length || c.old.some((l, i) => !l.equals(c.neu[i])));
  if (!real.length) return Buffer.alloc(0);
  // The last element of a file ending in a line feed is the empty text after
  // it, not a line; it is never context.
  const defLen = def.length && def[def.length - 1].length === 0 ? def.length - 1 : def.length;
  const groups = [];
  for (const c of real) {
    const g = groups[groups.length - 1];
    if (g && c.a - (g[g.length - 1].a + g[g.length - 1].old.length) <= 2 * CONTEXT) g.push(c);
    else groups.push([c]);
  }
  const out = [Buffer.from('--- default/CLAUDE.md\n+++ configured/CLAUDE.md\n')];
  const line = (sign, l) => out.push(Buffer.from(sign), l, Buffer.from([LF]));
  for (const g of groups) {
    const first = g[0];
    const last = g[g.length - 1];
    const startA = Math.max(0, first.a - CONTEXT);
    const endA = Math.min(defLen, last.a + last.old.length + CONTEXT);
    const startB = first.b - (first.a - startA);
    const lenA = endA - startA;
    const lenB = lenA + g.reduce((n, c) => n + c.neu.length - c.old.length, 0);
    const from = (start, len) => `${len ? start + 1 : start},${len}`;
    out.push(Buffer.from(`@@ -${from(startA, lenA)} +${from(startB, lenB)} @@\n`));
    let a = startA;
    for (const c of g) {
      for (; a < c.a; a += 1) line(' ', def[a]);
      for (const l of c.old) line('-', l);
      for (const l of c.neu) line('+', l);
      a = c.a + c.old.length;
    }
    for (; a < endA; a += 1) line(' ', def[a]);
  }
  return Buffer.concat(out);
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

/**
 * The project file, checked against the user's effective values: [[setting,
 * value], ...] in SETTINGS order, or null after recording every refusal.
 */
function checkProject(buf, effective, report) {
  const fail = (rule, reason) => report.fail(rule, PROJECT_SHOWN, null, reason);
  if (scanText(buf, PROJECT_SHOWN, report) === null) return null;
  let doc;
  try {
    doc = readStrictJson(buf);
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    fail('project-json', e.reason);
    return null;
  }
  if (!isObject(doc)) {
    fail('project-json', 'not a JSON object');
    return null;
  }
  let ok = true;
  if (Object.hasOwn(doc, 'edits')) {
    fail('project-edit', 'a project file may not edit open parts; it may only set values tighter than the user\'s');
    ok = false;
  }
  if (Object.keys(doc).some(k => k !== 'edits' && !PROJECT_TOP_KEYS.includes(k))) {
    fail('project-key', 'a key that is not schema or settings');
    ok = false;
  }
  if (!Object.hasOwn(doc, 'schema') || !wholeIn(doc.schema, SCHEMA, SCHEMA)) {
    fail('project-schema', `schema must be ${SCHEMA}`);
    ok = false;
  }
  const values = [];
  const settings = Object.hasOwn(doc, 'settings') ? doc.settings : {};
  if (!isObject(settings)) {
    fail('project-settings', 'settings must be an object');
    return null;
  }
  if (Object.keys(settings).some(k => !SETTINGS.has(k))) {
    fail('project-settings', 'settings holds a name that is not a setting');
    ok = false;
  }
  for (const [name, spec] of SETTINGS) {
    if (!Object.hasOwn(settings, name)) continue;
    const v = settings[name];
    if (!wholeIn(v, spec.min, spec.max)) {
      fail('project-value', `${name} must be a whole number from ${spec.min} to ${spec.max}`);
      ok = false;
    } else if (spec.tighter !== 'lower') {
      fail('project-direction', `${name} has no tightening direction, so a project may not set it`);
      ok = false;
    } else if (!(v < effective.get(name))) {
      fail('project-looser', `${name} ${v} is not tighter than the user's effective value, ${effective.get(name)}`);
      ok = false;
    } else values.push([name, v]);
  }
  if (ok && !values.length) {
    fail('project-empty', 'the project configuration sets no value, so there is nothing to install');
    ok = false;
  }
  return ok ? values : null;
}

/** The project mode: see the header. */
function runProject(out, home, projectFolder, report) {
  const user = readUserConfig(home, report);
  if (user === null) return;
  const effective = new Map([...SETTINGS].map(([k, spec]) => [k, spec.def]));
  if (user !== NONE) {
    const checked = checkConfig(user.buf, report);
    if (checked === null) return;
    for (const [k, v] of checked.values) effective.set(k, v);
  }
  const proj = readUnder(projectFolder, PROJECT_REL, PROJECT_NAMES, {
    cap: CONFIG_MAX,
    shownFile: PROJECT_SHOWN,
    rule: 'project-file',
    size: { rule: 'project-size', reason: 'larger than 64 KiB' },
    rootLabel: 'the project folder',
  }, report);
  if (proj === null) return;
  if (proj === MISSING) {
    report.fail('project-none', PROJECT_SHOWN, null, 'there is no project configuration in the project folder, so there is nothing to install');
    return;
  }
  const values = checkProject(proj.buf, effective, report);
  if (values === null) return;
  const output = Buffer.from(PROJECT_TEMPLATE(values.map(([k, v]) => SETTINGS.get(k).projectLine(v))).join('\n'), 'utf8');
  // The output holds only constant text and checked numbers; the scanner runs
  // on it anyway, before its hash is reported, so a template change that
  // brings in a refused character can never be installed.
  if (scanText(output, PROJECT_OUTPUT_NAME, report) === null) return;
  const userHash = user === NONE ? null : sha256(user.buf);
  const projHash = sha256(proj.buf);
  const digest = sha256(`${userHash ? `user ${userHash}\n` : ''}project ${projHash}\n`).slice(0, 12);
  writeFileSync(join(out, PROJECT_OUTPUT_NAME), output, { flag: 'wx' });
  report.lines.push(
    `RENDERED ${sha256(output)}`,
    userHash ? `CONFIG user ${userHash}` : 'CONFIG none',
    `PROJECT ${projHash}`,
    `DIGEST ${digest}`,
    ...values.map(([k, v]) => `VALUE ${k} ${v}`),
  );
}

function run(argv, report) {
  const usage = 'usage: node render.mjs <source rules file> <output folder> <Claude home folder>, or node render.mjs project <output folder> <Claude home folder> <project folder>';
  if (argv.some(a => a === '' || a.startsWith('-'))) {
    report.fail('usage', null, null, usage);
    return;
  }
  if (argv.length === 4 && argv[0] === 'project') {
    if (!emptyFolder(argv[1])) {
      report.fail('output', null, null, 'the output folder must be an empty folder that is not a link');
      return;
    }
    runProject(argv[1], argv[2], argv[3], report);
    return;
  }
  if (argv.length !== 3) {
    report.fail('usage', null, null, usage);
    return;
  }
  const [source, out, home] = argv;
  if (!emptyFolder(out)) {
    report.fail('output', null, null, 'the output folder must be an empty folder that is not a link');
    return;
  }
  const buf = readSource(source, report);
  if (buf === null) return;
  const lines = splitLines(buf);
  const pairs = checkMarks(lines, report);
  if (pairs === null) return;

  const config = readUserConfig(home, report);
  if (config === null) return;
  const head = [];
  let swaps = [];
  let agents = [];
  if (config === NONE) head.push('CONFIG none');
  else {
    const checked = checkConfig(config.buf, report);
    if (checked === null) return;
    const { values } = checked;
    const edits = readBlocks(home, checked.edits, report);
    if (edits === null) return;
    // An agent file is read only when a setting names its agent.
    agents = checked.agents.map(a => renderAgent(source, a, report, buf.toString('utf8')));
    if (agents.some(a => a === null)) return;
    const hash = sha256(config.buf);
    const digest = sha256(`user ${hash}\n${edits.filter(e => e.path).map(e => `block ${e.path} ${e.hash}\n`).join('')}`).slice(0, 12);
    swaps = swapsFor(lines, pairs, values, edits, digest, report, agents);
    if (swaps === null) return;
    const editLines = edits.map(e => (e.path ? `EDIT ${e.mark} ${e.op} ${e.hash} ${e.path}` : `EDIT ${e.mark} ${e.op}`));
    head.push(`CONFIG user ${hash}`, `DIGEST ${digest}`, ...values.map(([k, v]) => `VALUE ${k} ${v}`), ...editLines);
  }

  const { rendered, diff } = apply(lines, swaps);
  if (rendered.length > MAX_BYTES) {
    report.fail('size', null, null, 'the rendered rules file would be larger than 1 MiB');
    return;
  }
  writeFileSync(join(out, OUTPUT_NAME), rendered, { flag: 'wx' });
  writeFileSync(join(out, DIFF_NAME), diff, { flag: 'wx' });
  for (const a of agents) writeFileSync(join(out, `${AGENT_OUTPUT_PREFIX}${a.name}.md`), a.buf, { flag: 'wx' });
  report.lines.push(`RENDERED ${sha256(rendered)}`, `DIFF ${sha256(diff)}`, ...head);
  for (const a of agents) report.lines.push(`AGENT ${a.name} ${a.model} ${a.effort} ${sha256(a.buf)} ${a.security ? 'security-set' : 'plain'} ${a.override ? 'override' : 'default'} ${a.egress ? 'egress' : 'local'}`);
}

/**
 * Run the check on `argv`. Returns the report's lines, with the RESULT line
 * last, and whether it failed. Any throw is an `internal` failure, never a pass.
 */
export function check(argv) {
  const report = new Report();
  try {
    run(argv, report);
  } catch {
    // Never a pass, and never the error's text: it can quote a path or a file.
    report.fail('internal', null, null, 'the renderer itself failed');
  }
  report.lines.push(`RESULT: ${report.failed ? 'fail' : 'pass'}`);
  return { lines: report.lines, failed: report.failed };
}
