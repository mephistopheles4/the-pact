#!/usr/bin/env node
// The cross script (#35, built in #44). It checks the findings block of each
// lens report from one pair, joins the pair on its anchors, and writes the
// comment section and a locked local page. A second mode compares the owner's
// pick with the result.
//
//   node cross.mjs cross --point <spec|result|diff> --tier <quick|standard|thorough>
//       [--anchors C1,C2,...] --out <new folder> <lens>=<report file> [<lens>=<report file>]
//   node cross.mjs pick --point ... --tier ... [--anchors ...] --pick <ids|none> <lens>=<report file> ...
//
// Exit 0: every check passed. `cross` wrote its comments and the page; `pick`
// printed its result. Exit 1: a check failed. No section is written, but each
// report that could be read is written in its fence and fold, counted. Exit 2
// (`cross` only): every check passed, but a verbatim report alone is over the
// comment limit. The section is written, and the report is listed as left out.
//
// Every input is data: the script runs nothing it reads. Its output names
// files, rules and fixed text only, never a byte of a report. The area comes
// from the lens names, never from the session's word. The same inputs give the
// same bytes. Node 20 or later, ESM, node: built-ins only.
//
// It cannot import the gate, which is never installed, so it holds its own
// copies of seam A's strict JSON reader and two character rules. A parity test
// (gate/tests/cross-parity.test.mjs) holds them to seam A's.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

// ---------------------------------------------------------------- copied from seam A

const MAX_BYTES = 1024 * 1024;
const JSON_SCALAR_RE = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?)/;
const JSON_DEPTH_MAX = 64;
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

class Refused extends Error {
  constructor(rule, reason) {
    super(reason);
    this.rule = rule;
    this.reason = reason;
  }
}

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

// ---------------------------------------------------------------- the roster

const AREAS = Object.freeze([
  { key: 'qa', name: 'QA', icon: '\u{1f9ea}', lenses: ['behaviour-lens', 'integrity-lens'], pair: 'joining', points: { result: 'claim' } },
  { key: 'security', name: 'Security', icon: '\u{1f510}', lenses: ['adversarial-lens', 'data-lens'], pair: 'joining', points: { spec: 'section', diff: 'symbol' }, thoroughOnly: true },
  { key: 'spec', name: 'Spec', icon: '\u{1f4d0}', lenses: ['executability-lens', 'good-enough-lens'], pair: 'tension', points: { spec: 'section' } },
  { key: 'standards', name: 'Standards', icon: '\u{1f4d6}', lenses: ['conventions-lens', 'reader-lens'], pair: 'joining', points: { diff: 'lines' } },
  { key: 'unstated', name: 'Unstated', icon: '\u{1f50d}', lenses: ['unstated-lens'], pair: null, points: { spec: 'section', result: 'claim' } },
]);
const LIKELIHOOD_LENSES = new Set(['adversarial-lens', 'data-lens']);
const DATA_LENS = 'data-lens';

const TIERS = new Set(['quick', 'standard', 'thorough']);
const POINTS = new Set(['spec', 'result', 'diff']);
const VERDICTS = new Set(['clear', 'findings', 'inconclusive', 'blocking']);
const STRICTNESS = { clear: 0, findings: 1, inconclusive: 2, blocking: 3 };
const SEVERITIES = new Set(['high', 'medium', 'low']);

// ---------------------------------------------------------------- limits and marks

const LIMIT = 65536; // GitHub's comment limit, counted in UTF-16 units (never fewer than code points)
const FINDINGS_MAX = 100;
const NOT_CHECKED_MAX = 20;
const NON_RISKS_MAX = 20;
const TEXT_MAX = 200;
const HEADLINE_MAX = 120;
const DATA_MAX = 60;
const ANCHORS_MAX = 999;

const MARK = { blocking: '⛔', inconclusive: '⚠️', findings: '\u{1f50e}', clear: '✅' };
const CROSSING = '✚';
const NOT_VERIFIED = '⚠️';
const DASH = '—';
const PROMPT = '**Where do you expect the problem?**';

const LISTED_ID_RE = { claim: /^C[1-9][0-9]{0,2}$/, section: /^S[1-9][0-9]{0,2}$/ };
const FINDING_ID_RE = /^F[0-9]{1,3}$/;
const PATH_RE = /^[A-Za-z0-9._/-]+$/;
const SYMBOL_RE = /^[A-Za-z0-9_.$:]{1,100}$/;
const LENS_ARG_RE = /^[a-z]+(?:-[a-z]+)*$/;
const PICK_ID_RE = /^[CSK][1-9][0-9]{0,3}$/;
const PICTOGRAPH_RE = /^\p{Extended_Pictographic}$/u;
// A label in the map: letters, digits, hyphens and spaces, plus the two marks.
const MAP_LABEL_RE = /^(?:[A-Za-z0-9 -]|✚|⚠️)+$/u;

// ---------------------------------------------------------------- refusals

/** The fixed text for each rule. A refusal prints only this, a rule name and a file name. */
const RULE_TEXT = {
  usage: 'the command line is not one the script takes',
  out: 'the output folder must be new or empty',
  read: 'the report file could not be read',
  size: 'the report file is larger than 1 MiB',
  encoding: 'the report file is not valid UTF-8',
  'lens-unknown': 'a report is dispatched as a lens the roster does not hold',
  'lens-twice': 'two reports are dispatched as the same lens',
  area: 'the reports must be the two lenses of one area, or unstated-lens alone',
  point: 'this area does not review at this review point',
  tier: 'the tier is not quick, standard or thorough, or a security-pair report came with a tier below thorough',
  anchors: 'the anchor list is missing, not needed, or holds an id of the wrong form or twice',
  pick: 'the pick must be "none" or anchors shown in this review, each once; unstated-lens takes no pick',
  'block-count': 'a report must hold exactly one lens-findings block',
  block: 'the lens-findings block must open with exactly three backticks and its label, and close with three backticks',
  json: 'the lens-findings block is not valid JSON, or is nested too deeply',
  duplicate: 'the lens-findings block holds a key twice in one object (compared exactly and case-folded)',
  characters: 'a string holds a control, line-break or tab character',
  invisible: 'a string holds an invisible or direction-changing character',
  pictograph: 'a string holds a pictograph',
  mark: "a string holds a lookalike of the script's crossing mark",
  schema: 'the findings block has a key it does not define, lacks a required key, or has a value of the wrong type',
  lens: 'the findings block names a lens other than the one dispatched for this file',
  verdict: 'the verdict is not clear, findings, inconclusive or blocking',
  findings: 'findings must be a list of at most 100',
  id: 'a finding id must be F and one to three digits, unique within the report',
  'anchor-kind': 'an anchor is of a kind this area and review point do not take',
  anchor: 'an anchor does not have the shape its kind takes',
  'anchor-unlisted': 'an anchor id is not on the dispatched anchor list',
  path: 'a path must be relative, at most 200 characters of letters, digits, ".", "_", "-" and "/", with no ".." segment',
  symbol: 'a symbol must be 1 to 100 letters, digits, "_", ".", "$" and ":"',
  lines: 'line numbers must be positive whole numbers, with start no greater than end',
  severity: 'a severity must be high, medium or low',
  headline: 'a headline must be 1 to 120 characters',
  likelihood: 'likelihood is required on adversarial-lens and data-lens, and refused on every other lens',
  data: 'data is required on data-lens, 1 to 60 characters, and refused on every other lens',
  notChecked: 'notChecked must hold 1 to 20 strings of 1 to 200 characters',
  nonRisks: 'nonRisks must be a list of at most 20 items, each with exactly an anchor and a note',
  note: 'a non-risk note must be 1 to 200 characters',
  agreement: 'the verdict disagrees with the findings',
  internal: 'the script itself failed',
};

const refuse = rule => {
  throw new Refused(rule, RULE_TEXT[rule]);
};

/** A file name, safe to print: its last segment, with anything outside the safe set as '?'. */
function shownName(file) {
  let s = '';
  for (const ch of basename(file).slice(0, 200)) s += /[A-Za-z0-9._-]/.test(ch) ? ch : '?';
  return s || '?';
}

// ---------------------------------------------------------------- characters

/** The rule a code point breaks in a lens string, or null. Tab is refused here too. */
function characterRule(cp) {
  if (isRefused(cp) || cp === 9) return 'characters';
  if (isInvisible(cp)) return 'invisible';
  if (PICTOGRAPH_RE.test(String.fromCodePoint(cp))) return 'pictograph';
  // The crossing mark and the dingbat crosses around it are not pictographs.
  if (cp >= 0x2719 && cp <= 0x2720) return 'mark';
  return null;
}

function checkCharacters(v) {
  if (typeof v === 'string') {
    for (const ch of v) {
      const rule = characterRule(ch.codePointAt(0));
      if (rule) refuse(rule);
    }
  } else if (Array.isArray(v)) v.forEach(checkCharacters);
  else if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      checkCharacters(k);
      checkCharacters(x);
    }
  }
}

/** Hidden or control code points in a verbatim report, by seam A's two rules, line feeds aside. */
function hiddenCount(text) {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp !== 10 && (isRefused(cp) || isInvisible(cp))) n += 1;
  }
  return n;
}

const length = s => [...s].length;

// ---------------------------------------------------------------- the findings block

const BLOCK_OPEN_RE = /^\s*(?:`{3,}|~{3,})\s*lens-findings/i;

/** The text of a report's one lens-findings block. */
function blockText(text) {
  const lines = text.split('\n').map(l => (l.endsWith('\r') ? l.slice(0, -1) : l));
  const opens = [];
  lines.forEach((l, i) => {
    if (BLOCK_OPEN_RE.test(l)) opens.push(i);
  });
  if (opens.length !== 1) refuse('block-count');
  const open = opens[0];
  if (lines[open] !== '```lens-findings') refuse('block');
  const close = lines.findIndex((l, i) => i > open && l === '```');
  if (close < 0) refuse('block');
  return lines.slice(open + 1, close).join('\n');
}

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function keysOnly(obj, allowed, required) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) refuse('schema');
  for (const k of required) if (!Object.hasOwn(obj, k)) refuse('schema');
}

function checkText(v, max, rule) {
  if (typeof v !== 'string' || v.length === 0 || length(v) > max) refuse(rule);
}

function checkPath(p) {
  if (typeof p !== 'string' || p.length > TEXT_MAX || !PATH_RE.test(p) || p.startsWith('/')) refuse('path');
  if (p.split('/').some(s => s === '..' || s === '')) refuse('path');
}

function checkAnchor(a, kind, listed) {
  if (!isObject(a)) refuse('anchor');
  if (a.kind !== kind) refuse('anchor-kind');
  if (kind === 'claim' || kind === 'section') {
    keysOnly(a, ['kind', 'id'], ['kind', 'id']);
    if (typeof a.id !== 'string' || !LISTED_ID_RE[kind].test(a.id)) refuse('anchor');
    if (!listed.has(a.id)) refuse('anchor-unlisted');
  } else if (kind === 'symbol') {
    keysOnly(a, ['kind', 'file', 'symbol'], ['kind', 'file', 'symbol']);
    checkPath(a.file);
    if (typeof a.symbol !== 'string' || !SYMBOL_RE.test(a.symbol)) refuse('symbol');
  } else {
    keysOnly(a, ['kind', 'file', 'start', 'end'], ['kind', 'file', 'start', 'end']);
    checkPath(a.file);
    const ok = n => Number.isSafeInteger(n) && n > 0;
    if (!ok(a.start) || !ok(a.end) || a.start > a.end) refuse('lines');
  }
}

/**
 * One report's text in, its checked findings block out. Throws Refused with
 * the rule that fired. `lens` is the lens the session dispatched for the file.
 */
function checkReport(text, lens, kind, listed) {
  const json = blockText(text);
  let doc;
  try {
    doc = readStrictJson(Buffer.from(json, 'utf8'));
  } catch (e) {
    if (e instanceof Refused) refuse(e.rule === 'duplicate' ? 'duplicate' : 'json');
    throw e;
  }
  if (!isObject(doc)) refuse('schema');
  checkCharacters(doc);
  keysOnly(doc, ['lens', 'verdict', 'findings', 'notChecked', 'nonRisks'], ['lens', 'verdict', 'findings', 'notChecked']);
  if (doc.lens !== lens) refuse('lens');
  if (!VERDICTS.has(doc.verdict)) refuse('verdict');
  if (!Array.isArray(doc.findings) || doc.findings.length > FINDINGS_MAX) refuse('findings');
  const ids = new Set();
  for (const f of doc.findings) {
    if (!isObject(f)) refuse('schema');
    keysOnly(f, ['id', 'anchor', 'severity', 'headline', 'likelihood', 'data'], ['id', 'anchor', 'severity', 'headline']);
    if (typeof f.id !== 'string' || !FINDING_ID_RE.test(f.id) || ids.has(f.id)) refuse('id');
    ids.add(f.id);
    checkAnchor(f.anchor, kind, listed);
    if (!SEVERITIES.has(f.severity)) refuse('severity');
    checkText(f.headline, HEADLINE_MAX, 'headline');
    if (LIKELIHOOD_LENSES.has(lens) ? !SEVERITIES.has(f.likelihood) : Object.hasOwn(f, 'likelihood')) refuse('likelihood');
    if (lens === DATA_LENS) checkText(f.data, DATA_MAX, 'data');
    else if (Object.hasOwn(f, 'data')) refuse('data');
  }
  const nc = doc.notChecked;
  if (!Array.isArray(nc) || nc.length < 1 || nc.length > NOT_CHECKED_MAX) refuse('notChecked');
  for (const s of nc) checkText(s, TEXT_MAX, 'notChecked');
  if (Object.hasOwn(doc, 'nonRisks')) {
    if (!Array.isArray(doc.nonRisks) || doc.nonRisks.length > NON_RISKS_MAX) refuse('nonRisks');
    for (const n of doc.nonRisks) {
      if (!isObject(n)) refuse('nonRisks');
      for (const k of Object.keys(n)) if (k !== 'anchor' && k !== 'note') refuse('nonRisks');
      if (!Object.hasOwn(n, 'anchor') || !Object.hasOwn(n, 'note')) refuse('nonRisks');
      checkAnchor(n.anchor, kind, listed);
      checkText(n.note, TEXT_MAX, 'note');
    }
  }
  // A high finding forces blocking; inconclusive allows any other findings.
  const high = doc.findings.some(f => f.severity === 'high');
  const n = doc.findings.length;
  const agrees = { blocking: high, findings: !high && n > 0, inconclusive: !high, clear: n === 0 }[doc.verdict];
  if (!agrees) refuse('agreement');
  return { ...doc, nonRisks: doc.nonRisks ?? [] };
}

// ---------------------------------------------------------------- the command line

function parseArgs(argv) {
  const a = { mode: argv[0], flags: {}, reports: [], usage: false };
  if (a.mode !== 'cross' && a.mode !== 'pick') a.usage = true;
  const known = a.mode === 'pick' ? ['--point', '--tier', '--anchors', '--pick'] : ['--point', '--tier', '--anchors', '--out'];
  for (let i = 1; i < argv.length; i += 1) {
    const t = argv[i];
    if (t.startsWith('--')) {
      if (!known.includes(t) || Object.hasOwn(a.flags, t) || i + 1 >= argv.length) {
        a.usage = true;
        i += 1;
        continue;
      }
      a.flags[t] = argv[i + 1];
      i += 1;
      continue;
    }
    const eq = t.indexOf('=');
    if (eq < 1 || eq === t.length - 1) {
      a.usage = true;
      continue;
    }
    a.reports.push({ lens: t.slice(0, eq), file: t.slice(eq + 1) });
  }
  if (a.reports.length < 1 || a.reports.length > 2) a.usage = true;
  for (const f of a.mode === 'pick' ? ['--point', '--tier', '--pick'] : ['--point', '--tier', '--out']) if (!Object.hasOwn(a.flags, f)) a.usage = true;
  return a;
}

/** Read each report file. Fills r.text, or r.failed with the rule. */
function readReports(reports) {
  for (const r of reports) {
    let buf;
    try {
      buf = readFileSync(r.file);
    } catch {
      r.failed = 'read';
      continue;
    }
    if (buf.length > MAX_BYTES) {
      r.failed = 'size';
      continue;
    }
    try {
      r.text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf);
    } catch {
      r.failed = 'encoding';
    }
  }
}

/** The area and anchor setup the inputs name, or the rule they break. */
function checkInputs(a) {
  const lenses = a.reports.map(r => r.lens);
  for (const l of lenses) if (!LENS_ARG_RE.test(l) || !AREAS.some(x => x.lenses.includes(l))) return { rule: 'lens-unknown' };
  if (new Set(lenses).size !== lenses.length) return { rule: 'lens-twice' };
  const area = AREAS.find(x => x.lenses.includes(lenses[0]));
  if (!lenses.every(l => area.lenses.includes(l)) || lenses.length !== area.lenses.length) return { rule: 'area' };
  const point = a.flags['--point'];
  if (!POINTS.has(point) || !Object.hasOwn(area.points, point)) return { rule: 'point', area };
  const tier = a.flags['--tier'];
  if (!TIERS.has(tier) || (area.thoroughOnly && tier !== 'thorough')) return { rule: 'tier', area };
  const kind = area.points[point];
  const listedKind = kind === 'claim' || kind === 'section';
  const raw = a.flags['--anchors'];
  let list = null;
  if (listedKind) {
    if (raw === undefined) return { rule: 'anchors', area };
    list = raw.split(',');
    if (list.length > ANCHORS_MAX || new Set(list).size !== list.length || !list.every(id => LISTED_ID_RE[kind].test(id))) return { rule: 'anchors', area };
  } else if (raw !== undefined) return { rule: 'anchors', area };
  if (a.mode === 'pick' && !area.pair) return { rule: 'pick', area };
  return { area, point, tier, kind, list };
}

// ---------------------------------------------------------------- the join

const idNumber = id => Number(id.slice(1));
const byId = (x, y) => idNumber(x.id) - idNumber(y.id) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

/**
 * Rows, one per anchor, in the fixed anchor order: list order for claims and
 * sections, else by file then symbol or start line. Line ranges join on file
 * and overlap. Only findings make rows; a non-risk never does.
 */
function joinPair(setup, docs) {
  const { kind, list } = setup;
  const rows = new Map();
  const rowFor = (key, anchor) => {
    if (!rows.has(key)) rows.set(key, { key, anchor, by: docs.map(() => []) });
    return rows.get(key);
  };
  if (list) for (const id of list) rowFor(id, { kind, id });
  const all = docs.flatMap((d, li) => d.findings.map(f => ({ f, li })));
  if (kind === 'lines') {
    const byFile = new Map();
    for (const { f } of all) {
      if (!byFile.has(f.anchor.file)) byFile.set(f.anchor.file, []);
      byFile.get(f.anchor.file).push([f.anchor.start, f.anchor.end]);
    }
    const clusters = new Map();
    for (const [file, ranges] of byFile) {
      ranges.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      const cs = [];
      for (const [s, e] of ranges) {
        const last = cs[cs.length - 1];
        if (last && s <= last.end) last.end = Math.max(last.end, e);
        else cs.push({ start: s, end: e });
      }
      clusters.set(file, cs);
    }
    for (const { f, li } of all) {
      const c = clusters.get(f.anchor.file).find(x => f.anchor.start >= x.start && f.anchor.start <= x.end);
      rowFor(`${f.anchor.file}\n${c.start}`, { kind, file: f.anchor.file, start: c.start, end: c.end }).by[li].push(f);
    }
  } else {
    for (const { f, li } of all) {
      const key = kind === 'symbol' ? `${f.anchor.file}\n${f.anchor.symbol}` : f.anchor.id;
      rowFor(key, kind === 'symbol' ? { kind, file: f.anchor.file, symbol: f.anchor.symbol } : f.anchor).by[li].push(f);
    }
  }
  let out = [...rows.values()];
  if (kind === 'symbol') out.sort((x, y) => cmp(x.anchor.file, y.anchor.file) || cmp(x.anchor.symbol, y.anchor.symbol));
  if (kind === 'lines') out.sort((x, y) => cmp(x.anchor.file, y.anchor.file) || x.anchor.start - y.anchor.start);
  for (const r of out) {
    r.by.forEach(fs => fs.sort(byId));
    r.count = r.by.filter(fs => fs.length > 0).length;
    r.crossing = docs.length === 2 && r.count === 2;
    r.high = r.by.some(fs => fs.some(f => f.severity === 'high'));
  }
  // Code anchors get a short id, K<n>, numbered in card order.
  if (!list) {
    out = out.filter(r => r.count > 0);
    let k = 0;
    for (const r of [...out.filter(r => r.crossing), ...out.filter(r => !r.crossing)]) r.label = `K${(k += 1)}`;
  } else for (const r of out) r.label = r.key;
  const verdict = docs.map(d => d.verdict).reduce((x, y) => (STRICTNESS[y] > STRICTNESS[x] ? y : x));
  return { rows: out, verdict };
}

/** The owner's pick against the result, by the rule fixed in the spec. */
function comparePick(joined, pick) {
  const targets = joined.rows.filter(r => r.high).map(r => r.label);
  const picked = pick === 'none' ? [] : pick.split(',');
  const shown = new Set(joined.rows.map(r => r.label));
  if (pick !== 'none' && (new Set(picked).size !== picked.length || !picked.every(id => PICK_ID_RE.test(id) && shown.has(id)))) refuse('pick');
  let rule = 0;
  if (pick === 'none' && joined.verdict !== 'clear') rule = 1;
  else if (pick !== 'none' && joined.verdict === 'clear') rule = 2;
  else if (pick !== 'none' && targets.length > 0 && !picked.some(id => targets.includes(id))) rule = 3;
  const missed = targets.filter(id => !picked.includes(id));
  const empty = picked.filter(id => joined.rows.find(r => r.label === id).count === 0);
  return { rule, missed, empty };
}

// ---------------------------------------------------------------- markdown

function longestRun(s, c) {
  let best = 0;
  let cur = 0;
  for (const ch of s) {
    cur = ch === c ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return best;
}

/** Lens text as a code span, its fence one backtick longer than its longest run. */
function span(s, inTable = false) {
  const t = inTable ? s.replaceAll('|', '\\|') : s;
  const fence = '`'.repeat(longestRun(t, '`') + 1);
  return `${fence} ${t} ${fence}`;
}

const code = s => `\`${s}\``;

/** An anchor as the owner reads it. Paths and symbols are schema-safe; they still go in a code span. */
function anchorText(a) {
  if (a.kind === 'claim' || a.kind === 'section') return code(a.id);
  if (a.kind === 'symbol') return span(`${a.file}#${a.symbol}`);
  return span(`${a.file}:${a.start}-${a.end}`);
}

function rowAnchor(r) {
  return r.anchor.kind === 'claim' || r.anchor.kind === 'section' ? code(r.label) : `${r.label} ${anchorText(r.anchor)}`;
}

function mapLabel(s) {
  if (!MAP_LABEL_RE.test(s)) throw new Error('map label');
  return `"${s}"`;
}

/** Everything the views need, worked out once. */
function model(setup, docs, joined) {
  const { area } = setup;
  const tension = area.pair === 'tension';
  const unverified = docs.filter(d => d.verdict === 'inconclusive').map(d => d.lens);
  const head = lens => `${code(lens)}${unverified.includes(lens) ? ` ${NOT_VERIFIED} not verified` : ''}`;
  return { area, tension, unverified, head, docs, joined, tier: setup.tier, kind: setup.kind };
}

function heading(m, icon) {
  const names = m.area.lenses.map(code).join(' and ');
  return `### ${icon ? `${m.area.icon} ` : ''}${m.area.pair ? `${m.area.name} pair` : m.area.name}: ${names}\n\n`;
}

function mapBlock(m) {
  const lines = ['```mermaid', 'flowchart LR'];
  const ids = m.area.lenses.map((_, i) => String.fromCharCode(65 + i));
  m.area.lenses.forEach((lens, i) => lines.push(`  ${ids[i]}[${mapLabel(`${lens}${m.unverified.includes(lens) ? ` ${NOT_VERIFIED} not verified` : ''}`)}]`));
  const crossings = m.joined.rows.filter(r => r.crossing);
  crossings.forEach((r, i) => {
    lines.push(`  X${i + 1}[${mapLabel(`${m.tension ? 'settle' : CROSSING} ${r.label}`)}]`);
    for (const id of ids) lines.push(`  ${id} --> X${i + 1}`);
  });
  const singles = m.joined.rows.filter(r => r.count > 0 && !r.crossing).length;
  if (singles > 0) {
    lines.push(`  N[${mapLabel(`${singles} ${m.area.pair ? 'one-lens anchor' : 'anchor'}${singles === 1 ? '' : 's'}`)}]`);
    for (const id of ids) lines.push(`  ${id} -.-> N`);
  }
  lines.push('```');
  return `${lines.join('\n')}\n\n`;
}

function unverifiedLines(m) {
  return m.unverified.map(lens => `${NOT_VERIFIED} **${code(lens)} not verified.** It could not check everything it was asked to. Its silence is not a pass: read its not-checked list below.\n\n`);
}

const NOTE = "_The cards come from each lens's findings block. Each lens's full text is in its folded report below._\n\n";

/**
 * The cards, crossings or disagreements first. Each finding line is one unit
 * inside its card, so a card too big for one comment splits between its lines
 * and repeats its anchor line in the next part.
 */
function cards(m, withSeverity) {
  const units = [];
  const rows = m.joined.rows.filter(r => r.count > 0);
  const groups = [
    [rows.filter(r => r.crossing), m.tension ? '**Disagreements: both lenses called this; you settle it**' : `**${CROSSING} Crossings: two different problems meet at one anchor**`],
    [rows.filter(r => !r.crossing), m.area.pair ? '**One lens only**' : '**Findings**'],
  ];
  for (const [group, title] of groups) {
    group.forEach((r, gi) => {
      const mark = r.crossing && !m.tension ? `${CROSSING} ` : '';
      const head = `- ${mark}${rowAnchor(r)}\n`;
      const card = { open: `${gi === 0 ? `${title}\n\n` : ''}${head}`, reopen: head, close: gi === group.length - 1 ? '\n' : '' };
      r.by.forEach((fs, li) => {
        for (const f of fs) units.push({ table: card, text: `  - ${code(m.area.lenses[li])} ${f.id}${withSeverity ? ` ${code(f.severity)}` : ''}: ${span(f.headline)}\n` });
      });
    });
  }
  if (rows.length === 0) units.push({ text: `${m.area.pair ? 'No findings from either lens.' : 'No findings.'}\n\n` });
  return units;
}

function matrix(m) {
  const lenses = m.area.lenses;
  const extra = m.area.pair ? [m.tension ? 'Disagreement' : 'Crossing'] : [];
  const cols = ['Anchor', ...lenses.map(l => m.head(l)), ...extra];
  const table = { open: `| ${cols.join(' | ')} |\n| ${cols.map(() => '---').join(' | ')} |\n`, close: '\n' };
  table.reopen = table.open;
  return m.joined.rows.map(r => {
    const cells = [rowAnchor(r), ...r.by.map(fs => (fs.length ? fs.map(f => f.id).join(', ') : DASH))];
    if (m.area.pair) cells.push(r.crossing ? (m.tension ? 'settle' : CROSSING) : '');
    return { table, text: `| ${cells.join(' | ')} |\n` };
  });
}

function verdictText(m) {
  const v = m.joined.verdict;
  const per = m.docs.map(d => `${code(d.lens)} ${code(d.verdict)}`).join(' and ');
  let s = m.area.pair
    ? `${m.area.icon} **Pair verdict: ${MARK[v]} ${code(v)}**, the stricter of ${per}. Order: blocking, inconclusive, findings, clear.\n\n`
    : `${m.area.icon} **Verdict: ${MARK[v]} ${code(v)}.** It advises: it does not change a pair's verdict.\n\n`;
  if (v === 'inconclusive') s += `${NOT_VERIFIED} **Inconclusive is not a pass.** A lens could not verify something it was asked to check. Read its not-checked list before you decide.\n\n`;
  s += 'Severity: `high` fix before proceeding; `medium` should be fixed; `low` can wait.\n\n';
  return s;
}

function findingsTable(m, fold) {
  const security = m.area.key === 'security';
  const cols = ['Lens', 'Id', 'Anchor', 'Severity', ...(security ? ['Likelihood', 'Data'] : []), 'Headline'];
  const table = { open: `| ${cols.join(' | ')} |\n| ${cols.map(() => '---').join(' | ')} |\n`, close: '\n' };
  table.reopen = table.open;
  const units = [];
  for (const r of m.joined.rows) {
    r.by.forEach((fs, li) => {
      for (const f of fs) {
        const cells = [code(m.area.lenses[li]), f.id, rowAnchor(r), code(f.severity)];
        if (security) cells.push(code(f.likelihood), f.data === undefined ? DASH : span(f.data, true));
        cells.push(span(f.headline, true));
        units.push({ fold, table, text: `| ${cells.join(' | ')} |\n` });
      }
    });
  }
  return units;
}

function callsTable(m, fold) {
  const rows = m.joined.rows.filter(r => r.crossing);
  if (!m.tension || rows.length === 0) return [];
  const cols = ['Anchor', ...m.area.lenses.map(code)];
  const table = { open: `**The calls, side by side**\n\n| ${cols.join(' | ')} |\n| ${cols.map(() => '---').join(' | ')} |\n`, close: '\n' };
  table.reopen = `| ${cols.join(' | ')} |\n| ${cols.map(() => '---').join(' | ')} |\n`;
  return rows.map(r => ({ fold, table, text: `| ${rowAnchor(r)} | ${r.by.map(fs => fs.map(f => `${f.id} ${code(f.severity)}`).join(', ')).join(' | ')} |\n` }));
}

/** The fixed order of a non-risk's anchor among the rows. */
function anchorOrder(setup, a) {
  if (setup.list) return [setup.list.indexOf(a.id), '', 0];
  return [0, a.file, a.kind === 'symbol' ? a.symbol : a.start];
}

function nonRiskUnits(m, setup, fold) {
  const units = [];
  m.docs.forEach(d => {
    if (d.nonRisks.length === 0) return;
    const items = d.nonRisks.map((n, i) => ({ n, i, o: anchorOrder(setup, n.anchor) }));
    items.sort((x, y) => x.o[0] - y.o[0] || cmp(x.o[1], y.o[1]) || (typeof x.o[2] === 'number' ? x.o[2] - y.o[2] : cmp(x.o[2], y.o[2])) || x.i - y.i);
    const header = '| Anchor | Note |\n| --- | --- |\n';
    const table = { open: `**Non-risks from ${code(d.lens)}:** what it checked and found sound, and the assumption that keeps it sound.\n\n${header}`, reopen: header, close: '\n' };
    for (const { n } of items) units.push({ fold, table, text: `| ${anchorText(n.anchor)} | ${span(n.note, true)} |\n` });
  });
  return units;
}

function notCheckedUnits(m) {
  return m.docs.map((d, i) => ({ text: `${i === 0 ? '**Not checked**\n\n' : ''}${d.notChecked.map(s => `- ${code(d.lens)}: ${span(s)}\n`).join('')}${i === m.docs.length - 1 ? '\n' : ''}` }));
}

const FOLD_VERDICT = {
  open: '<details>\n<summary>Verdict, severities and non-risks</summary>\n\n',
  reopen: '<details>\n<summary>Verdict, severities and non-risks, continued</summary>\n\n',
  close: '\n</details>\n\n',
};
const FOLD_NON_RISKS = {
  open: '<details>\n<summary>Non-risks</summary>\n\n',
  reopen: '<details>\n<summary>Non-risks, continued</summary>\n\n',
  close: '\n</details>\n\n',
};

/** The comment section as units, in order, for the tier. */
function sectionUnits(m, setup, leftOut) {
  const units = [];
  const thorough = m.tier === 'thorough';
  if (m.tier === 'quick') {
    const v = m.joined.verdict;
    const nv = m.unverified.map(l => ` · ${NOT_VERIFIED} ${code(l)} not verified`).join('');
    const counts = m.docs.map(d => `${code(d.lens)} ${d.notChecked.length}`).join(', ');
    units.push({ text: `${m.area.icon} **${m.area.pair ? `${m.area.name} pair` : m.area.name}: ${MARK[v]} ${code(v)}**${nv}. Not checked: ${counts}.\n\n` });
  } else if (thorough) {
    units.push({ text: heading(m, false) }, { text: mapBlock(m) });
    for (const t of unverifiedLines(m)) units.push({ text: t });
    units.push({ text: NOTE }, ...cards(m, false), ...matrix(m));
    // unstated-lens takes no pick, but its verdict still stays folded, so it
    // cannot hint at a pair's answer on the same anchors.
    if (m.area.pair) units.push({ text: `${PROMPT} Name one or more anchors above, or none, in chat. Then open the fold below.\n\n` });
    units.push({ fold: FOLD_VERDICT, text: verdictText(m) }, ...findingsTable(m, FOLD_VERDICT), ...callsTable(m, FOLD_VERDICT), ...nonRiskUnits(m, setup, FOLD_VERDICT));
  } else {
    units.push({ text: heading(m, true) });
    if (m.area.pair) units.push({ text: '_Optional: name where you expect the problem, in chat, before you read on._\n\n' });
    units.push({ text: mapBlock(m) });
    for (const t of unverifiedLines(m)) units.push({ text: t });
    units.push({ text: verdictText(m) }, { text: NOTE }, ...cards(m, true), ...matrix(m), ...callsTable(m, null));
    units.push(...nonRiskUnits(m, setup, FOLD_NON_RISKS));
  }
  units.push(...notCheckedUnits(m));
  if (leftOut.length) units.push({ text: `**Left out, over the comment limit:** ${leftOut.map(code).join(', ')}. Each is kept as a local file.\n\n` });
  return units;
}

/**
 * Units into comment parts of at most LIMIT. A part ends at a unit boundary;
 * an open table repeats its header in the next part, and an open fold closes
 * and reopens. Later parts carry a header with no total, so the number of
 * parts says nothing above the prompt.
 */
function pack(units) {
  const parts = [];
  let cur = '';
  let fold = null;
  let table = null;
  const opened = new Set();
  const closing = () => (table ? table.close : '') + (fold ? fold.close : '');
  const enter = (u, fresh) => {
    let s = '';
    if (!fresh) {
      if (table && table !== u.table) s += table.close;
      if (fold && fold !== u.fold) s += fold.close;
    }
    if (u.fold && (fresh || fold !== u.fold)) s += opened.has(u.fold) ? u.fold.reopen : u.fold.open;
    if (u.table && (fresh || table !== u.table)) s += opened.has(u.table) ? u.table.reopen : u.table.open;
    return s;
  };
  for (const u of units) {
    const piece = enter(u, false) + u.text;
    const after = (u.table ? u.table.close : '') + (u.fold ? u.fold.close : '');
    if (cur.length + piece.length + after.length > LIMIT && cur.length > 0) {
      parts.push(cur + closing());
      cur = `_Continued, part ${parts.length + 1}._\n\n${enter(u, true)}${u.text}`;
    } else cur += piece;
    if (u.fold) opened.add(u.fold);
    if (u.table) opened.add(u.table);
    fold = u.fold ?? null;
    table = u.table ?? null;
    if (cur.length + after.length > LIMIT) throw new Error('a unit over the limit');
  }
  parts.push(cur + closing());
  return parts;
}

/** One verbatim report, folded, in a fence longer than its longest backtick run, with its count. */
function verbatim(lens, text) {
  const fence = '`'.repeat(Math.max(3, longestRun(text, '`') + 1));
  const n = hiddenCount(text);
  const name = lens ? code(lens) : 'a lens the roster does not hold';
  const summary = lens ? `<code>${lens}</code>` : 'a lens the roster does not hold';
  return `<details>\n<summary>Verbatim report: ${summary}. Hidden or control characters: ${n}</summary>\n\nHidden or control characters in the report from ${name}: ${n}\n\n${fence}text\n${text}${text.endsWith('\n') ? '' : '\n'}${fence}\n\n</details>\n\n`;
}

/** Section parts, then verbatim reports added to the last comment while they fit, else one per comment. */
function comments(sectionParts, verbatims) {
  const out = [...sectionParts];
  for (const v of verbatims) {
    if (out.length > 0 && out[out.length - 1].length + v.length <= LIMIT) out[out.length - 1] += v;
    else out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------- the page

function html(s) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

const CSS = `:root{--bg:#ffffff;--fg:#1f2328;--mute:#59636e;--line:#d1d9e0;--card:#f6f8fa;--x:#cf222e;--warn:#9a6700}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--mute:#9198a1;--line:#3d444d;--card:#151b23;--x:#ff7b72;--warn:#d29922}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;max-width:860px;margin:0 auto;padding:16px}
h1{font-size:20px}h2{font-size:16px;margin-top:28px}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:8px 0}
.card.x{border-left:4px solid var(--x)}code{font:13px ui-monospace,monospace}
.warn{border-left:4px solid var(--warn);padding:8px 12px;background:var(--card);margin:8px 0}
table{border-collapse:collapse;width:100%}td,th{border:1px solid var(--line);padding:4px 8px;text-align:left;vertical-align:top}
.mute{color:var(--mute)}svg text{fill:var(--fg);font:12px ui-monospace,monospace}
.dot{fill:var(--fg)}.xdot{fill:var(--x)}.xline{stroke:var(--x);stroke-width:2}.grid{stroke:var(--line);fill:none}
.cell{fill:var(--card);stroke:var(--line)}.flow{stroke:var(--warn);stroke-width:1.5}
details{margin:12px 0}summary{cursor:pointer;font-weight:600}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--card);border:1px solid var(--line);padding:8px;font-size:12px}`;
const CSS_HASH = createHash('sha256').update(CSS).digest('base64');
const CSP = `default-src 'none'; style-src 'sha256-${CSS_HASH}'; form-action 'none'; base-uri 'none'`;

/** The cross-cut picture: anchors by lens, a dot per finding, a line for each crossing. No severity. */
function crossCutSvg(m) {
  const rows = m.joined.rows.filter(r => r.count > 0);
  const lenses = m.area.lenses;
  const h = 40 + Math.max(rows.length, 1) * 24;
  const xs = lenses.map((_, i) => 220 + i * 160);
  const out = [`<svg viewBox="0 0 560 ${h}" width="100%" role="img" aria-label="Anchors by lens">`];
  lenses.forEach((l, i) => out.push(`<text x="${xs[i] - 40}" y="20">${html(l)}</text>`));
  rows.forEach((r, i) => {
    const y = 44 + i * 24;
    out.push(`<line class="grid" x1="0" x2="560" y1="${y + 8}" y2="${y + 8}"/>`, `<text x="4" y="${y + 4}">${html(r.label)}</text>`);
    r.by.forEach((fs, li) => {
      if (fs.length) out.push(`<circle class="${r.crossing ? 'xdot' : 'dot'}" cx="${xs[li]}" cy="${y}" r="6"/>`);
    });
    if (r.crossing) out.push(`<line class="xline" x1="${xs[0] + 6}" x2="${xs[1] - 6}" y1="${y}" y2="${y}"/>`);
  });
  out.push('</svg>');
  return out.join('\n');
}

/** Security only: likelihood by severity, with the area not examined; and data items to their leak points. */
function securitySvgs(m) {
  const levels = ['high', 'medium', 'low'];
  const all = m.docs.flatMap(d => d.findings);
  const notExamined = m.docs.reduce((n, d) => n + d.notChecked.length, 0);
  const grid = ['<svg viewBox="0 0 420 250" width="100%" role="img" aria-label="Likelihood by severity">', '<text x="150" y="16">severity: high, medium, low</text>'];
  levels.forEach((lk, ri) => {
    grid.push(`<text x="4" y="${62 + ri * 50}">likelihood ${lk}</text>`);
    levels.forEach((sv, ci) => {
      const n = all.filter(f => f.likelihood === lk && f.severity === sv).length;
      grid.push(`<rect class="cell" x="${130 + ci * 90}" y="${30 + ri * 50}" width="88" height="48"/>`, `<text x="${168 + ci * 90}" y="${60 + ri * 50}">${n}</text>`);
    });
  });
  grid.push('<rect class="cell" x="130" y="185" width="268" height="40"/>', `<text x="140" y="210">not examined: ${notExamined} items, listed below</text>`, '</svg>');
  const dataLens = m.docs.find(d => d.lens === DATA_LENS);
  const items = [...new Set(dataLens.findings.map(f => f.data))].sort(cmp);
  const flow = [];
  const rowOf = f => m.joined.rows.find(r => r.by.some(fs => fs.includes(f)));
  const leaks = [...new Set(dataLens.findings.map(f => rowOf(f).label))];
  const h = 40 + Math.max(items.length, leaks.length, 1) * 26;
  flow.push(`<svg viewBox="0 0 520 ${h}" width="100%" role="img" aria-label="Data items and their leak points">`, '<text x="4" y="16">data item</text><text x="360" y="16">leak point</text>');
  items.forEach((it, i) => flow.push(`<text x="4" y="${44 + i * 26}">${html(it)}</text>`));
  leaks.forEach((l, i) => flow.push(`<text x="360" y="${44 + i * 26}">${html(l)}</text>`));
  for (const f of dataLens.findings) {
    const i = items.indexOf(f.data);
    const j = leaks.indexOf(rowOf(f).label);
    flow.push(`<line class="flow" x1="250" x2="352" y1="${40 + i * 26}" y2="${40 + j * 26}"/>`);
  }
  flow.push('</svg>');
  return `<h3>Likelihood by severity</h3>\n${grid.join('\n')}\n<h3>Data flow and leak points</h3>\n${flow.join('\n')}`;
}

function pageCards(m, withSeverity) {
  const rows = m.joined.rows.filter(r => r.count > 0);
  const ordered = [...rows.filter(r => r.crossing), ...rows.filter(r => !r.crossing)];
  if (ordered.length === 0) return '<p class="mute">No findings.</p>';
  return ordered
    .map(r => {
      const label = r.crossing ? (m.tension ? 'settle ' : `${CROSSING} `) : '';
      const anchor = r.anchor.kind === 'claim' || r.anchor.kind === 'section' ? html(r.label) : `${html(r.label)} ${html(anchorPlain(r.anchor))}`;
      const fs = r.by.flatMap((list, li) => list.map(f => `<div><code>${html(m.area.lenses[li])} ${html(f.id)}</code>${withSeverity ? ` <code>${html(f.severity)}</code>` : ''}: ${html(f.headline)}</div>`)).join('');
      return `<div class="card${r.crossing && !m.tension ? ' x' : ''}"><b>${label}</b><code>${anchor}</code>${fs}</div>`;
    })
    .join('\n');
}

function anchorPlain(a) {
  if (a.kind === 'claim' || a.kind === 'section') return a.id;
  if (a.kind === 'symbol') return `${a.file}#${a.symbol}`;
  return `${a.file}:${a.start}-${a.end}`;
}

function pageMatrix(m) {
  const head = ['Anchor', ...m.area.lenses.map(l => `${html(l)}${m.unverified.includes(l) ? ` ${NOT_VERIFIED} not verified` : ''}`), ...(m.area.pair ? [m.tension ? 'Disagreement' : 'Crossing'] : [])];
  const rows = m.joined.rows.map(r => {
    const cells = [html(r.anchor.kind === 'claim' || r.anchor.kind === 'section' ? r.label : `${r.label} ${anchorPlain(r.anchor)}`), ...r.by.map(fs => (fs.length ? html(fs.map(f => f.id).join(', ')) : DASH))];
    if (m.area.pair) cells.push(r.crossing ? (m.tension ? 'settle' : CROSSING) : '');
    return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
  });
  return `<table><tr>${head.map(c => `<th>${c}</th>`).join('')}</tr>\n${rows.join('\n')}</table>`;
}

function pageVerdict(m, setup) {
  const v = m.joined.verdict;
  const security = m.area.key === 'security';
  const lines = [`<p><b>${m.area.pair ? 'Pair verdict' : 'Verdict'}: ${MARK[v]} ${html(v)}</b>. ${m.docs.map(d => `<code>${html(d.lens)}</code> ${html(d.verdict)}`).join(', ')}. Order: blocking, inconclusive, findings, clear.</p>`];
  if (v === 'inconclusive') lines.push(`<div class="warn">${NOT_VERIFIED} <b>Inconclusive is not a pass.</b> A lens could not verify something it was asked to check. Read its not-checked list before you decide.</div>`);
  const cols = ['Lens', 'Id', 'Anchor', 'Severity', ...(security ? ['Likelihood', 'Data'] : []), 'Headline'];
  const rows = m.joined.rows.flatMap(r =>
    r.by.flatMap((fs, li) =>
      fs.map(f => {
        const cells = [m.area.lenses[li], f.id, anchorPlain(r.anchor) === r.label ? r.label : `${r.label} ${anchorPlain(r.anchor)}`, f.severity];
        if (security) cells.push(f.likelihood, f.data ?? DASH);
        cells.push(f.headline);
        return `<tr>${cells.map(c => `<td>${html(c)}</td>`).join('')}</tr>`;
      }),
    ),
  );
  lines.push(`<table><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>\n${rows.join('\n')}</table>`);
  for (const d of m.docs) {
    if (d.nonRisks.length === 0) continue;
    lines.push(`<h3>Non-risks from <code>${html(d.lens)}</code></h3>`, `<table><tr><th>Anchor</th><th>Note</th></tr>${d.nonRisks.map(n => `<tr><td><code>${html(anchorPlain(n.anchor))}</code></td><td>${html(n.note)}</td></tr>`).join('')}</table>`);
  }
  if (security) lines.push(securitySvgs(m));
  return lines.join('\n');
}

function page(m, setup, reports) {
  const title = `${m.area.pair ? `${m.area.name} pair` : m.area.name} review`;
  const body = [`<h1>${m.area.icon} ${html(title)}: ${m.area.lenses.map(l => `<code>${html(l)}</code>`).join(' and ')}</h1>`];
  const warn = m.unverified.map(l => `<div class="warn">${NOT_VERIFIED} <b><code>${html(l)}</code> not verified.</b> It could not check everything it was asked to. Its silence is not a pass: read its not-checked list below.</div>`).join('\n');
  const notChecked = `<h2>Not checked</h2>\n<ul>${m.docs.flatMap(d => d.notChecked.map(s => `<li><code>${html(d.lens)}</code>: ${html(s)}</li>`)).join('')}</ul>`;
  if (m.tier === 'quick') {
    const v = m.joined.verdict;
    body.push(`<p><b>${MARK[v]} ${html(v)}</b>${m.unverified.map(l => ` · ${NOT_VERIFIED} <code>${html(l)}</code> not verified`).join('')}</p>`, notChecked);
  } else if (m.tier === 'thorough') {
    body.push(crossCutSvg(m), warn, '<h2>Cards</h2>', pageCards(m, false), '<h2>Matrix</h2>', pageMatrix(m));
    if (m.area.pair) body.push('<h2>Where do you expect the problem?</h2>', '<p>Name one or more anchors, or none, in chat. Then open the verdict.</p>');
    body.push(`<details><summary>Verdict, severities and non-risks</summary>\n${pageVerdict(m, setup)}\n</details>`, notChecked);
  } else {
    body.push(crossCutSvg(m), warn, pageVerdict(m, setup), '<h2>Cards</h2>', pageCards(m, true), '<h2>Matrix</h2>', pageMatrix(m), notChecked);
  }
  body.push('<h2>Verbatim reports</h2>');
  for (const r of reports) body.push(`<details><summary>Verbatim report: <code>${html(r.lens)}</code>. Hidden or control characters: ${hiddenCount(r.text)}</summary><pre>${html(r.text)}</pre></details>`);
  return `<!doctype html>\n<html lang="en"><head><meta http-equiv="Content-Security-Policy" content="${CSP}">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${html(title)}</title>\n<style>${CSS}</style>\n</head><body>\n${body.filter(Boolean).join('\n')}\n</body></html>\n`;
}

// ---------------------------------------------------------------- main

/** Report order: the roster's lens order, then any other in argument order. */
function ordered(reports) {
  const pos = r => {
    for (const a of AREAS) if (a.lenses.includes(r.lens)) return AREAS.indexOf(a) * 10 + a.lenses.indexOf(r.lens);
    return 1000;
  };
  return reports.map((r, i) => ({ r, i })).sort((x, y) => pos(x.r) - pos(y.r) || x.i - y.i).map(x => x.r);
}

const knownLens = l => LENS_ARG_RE.test(l) && AREAS.some(a => a.lenses.includes(l));

function writeOut(dir, files) {
  for (const [name, text] of files) writeFileSync(join(dir, name), text);
}

/**
 * Exit 1: no section. Names each rule, and writes every report that could be
 * read in its fence and fold, counted. A report over the limit is kept local.
 */
function refusal(lines, outDir, reports, setupRule, failed) {
  if (setupRule) lines.push(`FAIL ${setupRule}: ${RULE_TEXT[setupRule]}`);
  for (const [r, rule] of failed) lines.push(`FAIL ${rule}: ${shownName(r.file)}: ${RULE_TEXT[rule]}`);
  if (outDir === null) return 1;
  const head = ['**The cross script refused the input.** No section was written. The reports follow, each in its fence and fold.\n\n'];
  if (setupRule) head.push(`- the input as a whole: rule ${code(setupRule)}\n`);
  for (const [r, rule] of failed) head.push(`- ${code(shownName(r.file))}: rule ${code(rule)}\n`);
  head.push('\n');
  const parts = [];
  const kept = [];
  for (const r of reports) {
    if (r.text === undefined) {
      kept.push(r);
      continue;
    }
    const v = verbatim(knownLens(r.lens) ? r.lens : null, r.text);
    if (v.length > LIMIT) kept.push(r);
    else parts.push(v);
  }
  const out = comments([head.join('')], parts);
  writeOut(outDir, out.map((c, i) => [`comment-${i + 1}.md`, c]));
  out.forEach((_, i) => lines.push(`COMMENT comment-${i + 1}.md`));
  for (const r of kept) lines.push(`KEPT-LOCAL ${shownName(r.file)}`);
  return 1;
}

function run(argv, lines) {
  const a = parseArgs(argv);
  if (a.usage) {
    lines.push(`FAIL usage: ${RULE_TEXT.usage}`);
    return 1;
  }
  const outDir = a.mode === 'cross' ? a.flags['--out'] : null;
  if (outDir !== null) {
    let ok = true;
    try {
      if (existsSync(outDir) && readdirSync(outDir).length > 0) ok = false;
      else mkdirSync(outDir, { recursive: true });
    } catch {
      ok = false;
    }
    if (!ok) {
      lines.push(`FAIL out: ${RULE_TEXT.out}`);
      return 1;
    }
  }
  const reports = ordered(a.reports);
  readReports(reports);
  const failed = [];
  for (const r of reports) if (r.failed) failed.push([r, r.failed]);

  const setup = checkInputs(a);
  const docs = [];
  if (!setup.rule && failed.length === 0) {
    const listed = new Set(setup.list ?? []);
    for (const r of reports) {
      try {
        docs.push(checkReport(r.text, r.lens, setup.kind, listed));
      } catch (e) {
        if (!(e instanceof Refused)) throw e;
        failed.push([r, e.rule]);
      }
    }
  }

  if (setup.rule || failed.length > 0) return refusal(lines, outDir, reports, setup.rule, failed);

  const joined = joinPair(setup, docs);
  if (a.mode === 'pick') {
    let result;
    try {
      result = comparePick(joined, a.flags['--pick']);
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      lines.push(`FAIL pick: ${RULE_TEXT.pick}`);
      return 1;
    }
    lines.push(`PICK ${result.rule === 0 ? 'match' : 'mismatch'}`);
    if (result.rule) lines.push(`RULE ${result.rule}`);
    lines.push(`MISSED ${result.missed.join(',') || 'none'}`, `EMPTY ${result.empty.join(',') || 'none'}`);
    return 0;
  }

  const m = model(setup, docs, joined);
  const verbatims = [];
  const leftOut = [];
  for (const r of reports) {
    const v = verbatim(r.lens, r.text);
    if (v.length > LIMIT) leftOut.push(r);
    else verbatims.push(v);
  }
  let out;
  let html;
  try {
    out = comments(pack(sectionUnits(m, setup, leftOut.map(r => r.lens))), verbatims);
    html = page(m, setup, reports);
  } catch {
    // Every check passed, but the script could not build the section. It
    // still writes every report in its fence and fold, as a refusal does.
    return refusal(lines, outDir, reports, 'internal', []);
  }
  writeOut(outDir, [...out.map((c, i) => [`comment-${i + 1}.md`, c]), ['page.html', html]]);
  out.forEach((_, i) => lines.push(`COMMENT comment-${i + 1}.md`));
  lines.push('PAGE page.html');
  for (const r of leftOut) lines.push(`LEFT-OUT ${r.lens} ${shownName(r.file)}`);
  return leftOut.length ? 2 : 0;
}

function main(argv) {
  const lines = [];
  let code;
  try {
    code = run(argv, lines);
  } catch {
    // Never the error's text: it can quote a report or a path.
    lines.push(`FAIL internal: ${RULE_TEXT.internal}`);
    code = 1;
  }
  lines.push(`RESULT: ${code === 0 ? 'pass' : code === 2 ? 'oversize' : 'fail'}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = code;
}

main(process.argv.slice(2));
