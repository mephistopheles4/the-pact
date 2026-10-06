// The gate's shared pieces (#91), imported by seam-a.mjs and pact-text.mjs:
// the strict JSON reader, the text scanner, the safe-path test, the name
// filter, the report and refusal types, the structure patterns and the marker
// parser. One copy, so every gate module reads a file the same way.
//
// The cross script keeps its own copy of the reader and the character rules,
// because it installs standalone; gate/tests/cross-parity.test.mjs holds that
// copy to this one, byte for byte. So the declarations it compares are written
// here exactly as there, and exported in one list at the end.
//
// Nothing here runs on import, and nothing here echoes a file's content.
// Node 20 or later, ESM, no imports.

const MAX_BYTES = 1024 * 1024;
const CHARACTER_HITS_MAX = 20;

const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
const JSON_SCALAR_RE = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?)/;
const JSON_DEPTH_MAX = 64;

// ---------------------------------------------------------------- output

/** A path from the stage, safe to print: anything outside the safe set becomes '?'. */
function shown(rel) {
  let s = '';
  for (const ch of rel.slice(0, 200)) s += /[A-Za-z0-9._/-]/.test(ch) ? ch : '?';
  return s;
}

class Report {
  constructor() {
    this.lines = [];
    this.failed = false;
    this.failedFiles = new Set();
  }
  fail(rule, file, line, reason) {
    this.failed = true;
    if (file) this.failedFiles.add(file);
    const where = file ? `${shown(file)}${line ? ` line ${line}` : ''}: ` : '';
    this.lines.push(`FAIL ${rule}: ${where}${reason}`);
  }
  note(rule, text) {
    this.lines.push(`NOTE ${rule}: ${text}`);
  }
  pass(rule, file) {
    this.lines.push(`PASS ${rule}: ${shown(file)}`);
  }
}

// ---------------------------------------------------------------- characters

const DEFAULT_IGNORABLE_RE = /^\p{Default_Ignorable_Code_Point}$/u;

/** Characters that change what a reader sees without being seen (as grimoire's isInvisible). */
function isInvisible(cp) {
  if (cp < 0xad) return false;
  return (
    (cp >= 0xe0000 && cp <= 0xe007f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    cp === 0x061c ||
    cp === 0x2060 ||
    cp === 0xfeff ||
    DEFAULT_IGNORABLE_RE.test(String.fromCodePoint(cp))
  );
}

/** Characters that read as a line break or a terminal command to some tool (as grimoire's isRefusedChar), and CR. */
function isRefused(cp) {
  return (cp < 0x20 && cp !== 9) || (cp >= 0x7f && cp <= 0x9f) || cp === 0x2028 || cp === 0x2029 || cp === 0xfffe || cp === 0xffff;
}

// ---------------------------------------------------------------- refusals

class Refused extends Error {
  constructor(rule, reason) {
    super(reason);
    this.rule = rule;
    this.reason = reason;
  }
}

// ---------------------------------------------------------------- the text scanner

/**
 * A checked file's text: at most 1 MiB, valid UTF-8, no byte-order mark, and
 * no control, line-separator or invisible character. Returns the text, or
 * null after recording every failure in `report`.
 */
function scanText(buf, file, report) {
  if (buf.length > MAX_BYTES) {
    report.fail('size', file, null, 'larger than 1 MiB');
    return null;
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf);
  } catch {
    report.fail('encoding', file, null, 'not valid UTF-8');
    return null;
  }
  if (text.charCodeAt(0) === 0xfeff) {
    report.fail('bom', file, 1, 'a byte-order mark');
    return null;
  }

  const lines = text.split('\n');
  let hits = 0;
  lines.forEach((line, i) => {
    for (const ch of line) {
      const cp = ch.codePointAt(0);
      let rule = null;
      if (isRefused(cp)) rule = ['characters', cp === 13 ? 'a carriage return' : 'a control or line-separator character'];
      else if (isInvisible(cp)) rule = ['invisible', 'an invisible or direction-changing character'];
      if (rule) {
        hits += 1;
        if (hits <= CHARACTER_HITS_MAX) report.fail(rule[0], file, i + 1, rule[1]);
        return;
      }
    }
  });
  if (hits > CHARACTER_HITS_MAX) report.fail('characters', file, null, `${hits - CHARACTER_HITS_MAX} more lines hold a refused character`);
  return hits > 0 ? null : text;
}

// ---------------------------------------------------------------- the strict JSON reader

/**
 * JSON read strictly, so every reader sees the same keys: no byte-order mark,
 * and no key twice in one object, compared after decoding its escapes and also
 * case-folded (PowerShell folds case; JSON.parse keeps the last). Throws
 * Refused with rule 'read' or 'duplicate'.
 */
function readStrictJson(buf) {
  if (buf.length > MAX_BYTES) throw new Refused('read', 'larger than 1 MiB');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf);
  } catch {
    throw new Refused('read', 'not valid UTF-8');
  }
  if (text.charCodeAt(0) === 0xfeff) throw new Refused('read', 'a byte-order mark');
  const notJson = () => new Refused('read', 'not valid JSON');
  let i = 0;
  const space = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i])) i += 1;
  };
  const string = () => {
    const start = i;
    i += 1;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    if (i >= text.length) throw notJson();
    i += 1;
    try {
      return JSON.parse(text.slice(start, i));
    } catch {
      throw notJson();
    }
  };
  // Each list and object closes with `end`, its members split by commas.
  const members = (end, member) => {
    i += 1;
    space();
    if (text[i] === end) {
      i += 1;
      return;
    }
    for (;;) {
      member();
      space();
      const d = text[i];
      i += 1;
      if (d === end) return;
      if (d !== ',') throw notJson();
    }
  };
  const value = depth => {
    if (depth > JSON_DEPTH_MAX) throw new Refused('read', 'nested too deeply');
    space();
    const c = text[i];
    if (c === '{') {
      const seen = new Set();
      members('}', () => {
        space();
        if (text[i] !== '"') throw notJson();
        const k = string().toLowerCase();
        if (seen.has(k)) throw new Refused('duplicate', 'a key seen twice in one object (compared exactly and case-folded)');
        seen.add(k);
        space();
        if (text[i] !== ':') throw notJson();
        i += 1;
        value(depth + 1);
      });
    } else if (c === '[') members(']', () => value(depth + 1));
    else if (c === '"') string();
    else {
      const m = JSON_SCALAR_RE.exec(text.slice(i, i + 400));
      if (!m) throw notJson();
      i += m[0].length;
    }
  };
  value(0);
  space();
  if (i !== text.length) throw notJson();
  try {
    return JSON.parse(text);
  } catch {
    throw notJson();
  }
}

// ---------------------------------------------------------------- the safe-path test

function safePath(rel) {
  return rel.split('/').every(s => SEGMENT_RE.test(s) && s !== '.' && s !== '..' && !s.endsWith('.'));
}

// ---------------------------------------------------------------- structure and markers

const MARKER_RE = /^ *<!-- pact:(begin|end) ([a-z][a-z0-9-]*) -->$/;
const FENCE_RE = /^ *(?:```|~~~)/;
// The pact files' structure is held to the forms the gate reads exactly as
// CommonMark does: no fence of any kind, no setext heading, and ATX headings
// only at column 0 with one space. Anything else could frame a block one way
// for the model and another way for the check.
const ANY_FENCE_RE = /^\s*(?:`{3,}|~{3,})/;
const SETEXT_RE = /^ {0,3}(?:=+|-+)\s*$/;
const HEADING_LIKE_RE = /^\s*#{1,6}(?:\s|$)/;
const HEADING_RE = /^#{1,6} \S/;
const MOVE_RE = /^([0-9]+)\. /;
const PACT_MARKER_RE = /<!--\s*pact\s*:/i;

/**
 * Read one checked file into lines, each with its section and whether it sits
 * in a fence, and its blocks. `known` is every block name the pact defines;
 * `allowed` is the set of block names this file may hold. Every grammar
 * failure is recorded in `report`.
 */
function parseDoc(text, file, known, allowed, report) {
  const lines = text.split('\n');
  const meta = [];
  const blocks = new Map();
  const seen = new Set();
  let section = null;
  let sub = false;
  let fenced = false;
  let open = null;
  lines.forEach((line, i) => {
    const ln = i + 1;
    const fence = FENCE_RE.test(line);
    if (fence) fenced = !fenced;
    const inFence = fence || fenced;
    if (!inFence) {
      if (line.startsWith('## ')) [section, sub] = [line.slice(3), false];
      else if (line.startsWith('# ')) [section, sub] = [null, false];
      else if (/^#{3,6} /.test(line)) sub = true;
    }
    meta.push({ section, sub, fenced: inFence, marker: false });
    if (!line.includes('<!--')) return;
    meta[i].marker = true;
    if (inFence) return report.fail('marker', file, ln, 'a comment inside a fenced code block');
    const m = MARKER_RE.exec(line);
    if (!m) return report.fail('marker', file, ln, 'a comment that is not a pact marker alone on its line');
    const [, kind, name] = m;
    if (!known.has(name)) return report.fail('marker', file, ln, 'an unknown block name');
    if (!allowed.has(name)) return report.fail('marker', file, ln, `${name} is not a block this file may hold`);
    if (kind === 'begin') {
      if (open) return report.fail('marker', file, ln, 'a block that opens inside another');
      if (seen.has(name)) return report.fail('marker', file, ln, `${name} opens twice`);
      seen.add(name);
      open = { name, line: i };
      return;
    }
    if (!open || open.name !== name) return report.fail('marker', file, ln, `an end of ${name} with no open begin of the same name`);
    blocks.set(name, { begin: open.line, end: i, text: lines.slice(open.line + 1, i).join('\n') });
    open = null;
  });
  if (open) report.fail('marker', file, open.line + 1, `${open.name} never closes`);
  return { lines, meta, blocks };
}

export {
  MAX_BYTES,
  CHARACTER_HITS_MAX,
  DEFAULT_IGNORABLE_RE,
  isInvisible,
  isRefused,
  scanText,
  JSON_SCALAR_RE,
  JSON_DEPTH_MAX,
  readStrictJson,
  SEGMENT_RE,
  safePath,
  shown,
  Report,
  Refused,
  FENCE_RE,
  ANY_FENCE_RE,
  SETEXT_RE,
  HEADING_LIKE_RE,
  HEADING_RE,
  MOVE_RE,
  MARKER_RE,
  PACT_MARKER_RE,
  parseDoc,
};
