#!/usr/bin/env node
// Seam A: the pact's own static check, run by scripts/install.ps1 on a staged
// copy of what it is about to install. Zero dependencies.
//
//   node seam-a.mjs <stage root>
//
// The stage root holds claude/, familiars/, cross/cross.mjs and AGENTS.md as
// the commit has them. Seam A decides what each file is, checks every agent
// the install would copy, the cross script's characters and the pact's own
// text (pact-text.mjs), and prints the exact copy set as INSTALL lines. The install copies those files
// and nothing else, and refuses unless its own reading of the stage agrees.
// It also holds the settings overlay to gate/settings-allowlist.json, and
// prints its hash as one SETTINGS line, which the install's merge must match.
//
// Exit 0 and a last line "RESULT: pass", or exit 1 and "RESULT: fail". The
// output names files, rules and line numbers. It never echoes a file's
// content: no value, no key, no name. The only text it prints from the stage
// is a file's path, and only once the path is made of safe characters.
//
// Node 20 or later, ESM, node: built-ins only.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPactText } from './pact-text.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PINNED = join(HERE, 'grimoire', 'check.mjs');
const PIN = join(HERE, 'grimoire', 'check.mjs.pin');
const ALLOWLIST = join(HERE, 'tool-allowlist.json');
const SETTINGS_ALLOWLIST = join(HERE, 'settings-allowlist.json');
const OVERLAY = 'claude/settings.overlay.json';
// The cross script (#35): one file, by exact path, to one fixed live path. The
// pact calls only the live copy. Nothing else in cross/ is ever installed.
const CROSS_FILES = Object.freeze([Object.freeze(['cross/cross.mjs', 'pact/cross.mjs'])]);

// Every agent gets these unless the allow-list names it. Hard-coded here, not
// read from the allow-list, so a broken allow-list cannot widen the default.
const DEFAULT_TOOLS = Object.freeze(['Read', 'Glob', 'Grep']);
// The frontmatter keys any installed agent may have. Everything else fails,
// whatever a contract's "Extra keys:" line says.
const ALLOWED_KEYS = new Set(['name', 'description', 'tools', 'model', 'effort', 'metadata']);
// The one wildcard tool name a flow list may hold.
const BROWSER_WILDCARD = 'mcp__Claude_Browser__*';
const MARK_KEYS = ['contract-version', 'familiar-digest', 'contract-digest'];

// Settings that run a command, load code or reach a tool server. Refused by
// name as an object key at any depth of the overlay, whatever the settings
// allow-list says. Hard-coded here so an allow-list edit cannot unban one.
const BANNED_SETTINGS = Object.freeze([
  'hooks',
  'mcpServers',
  'statusLine',
  'fileSuggestion',
  'apiKeyHelper',
  'awsAuthRefresh',
  'awsCredentialExport',
  'otelHeadersHelper',
  'enabledPlugins',
  'extraKnownMarketplaces',
  'enableAllProjectMcpServers',
  'enabledMcpjsonServers',
]);
const BANNED_SETTINGS_SET = new Set(BANNED_SETTINGS);
// The only permission mode the overlay may set, whatever the allow-list says.
const SETTINGS_MODE = 'auto';
// The two overlay keys whose children are key paths of their own.
const SETTINGS_CONTAINERS = new Set(['env', 'permissions']);
// Permission lists are sets of rules: each entry must be allowed, none twice.
const SETTINGS_SETS = new Set(['permissions.allow', 'permissions.deny', 'permissions.ask']);
// Paths the overlay must set. A set must hold every allowed entry.
const SETTINGS_REQUIRED = Object.freeze(['permissions.defaultMode', 'permissions.ask']);
// The "ask" rules that make the install's apply step prompt the owner. The
// overlay must hold them, whatever the allow-list says.
const SETTINGS_APPLY_ASK = Object.freeze([
  'PowerShell(./scripts/install.ps1 -Apply)',
  'PowerShell(*install.ps1*-A*)',
  'Bash(*nstall.ps1*-A*)',
  'Bash(*nstall.ps1*-a*)',
]);
// The "ask" rule on edits to the installed cross script's folder (#45). The
// overlay must hold it too, whatever the allow-list says.
const SETTINGS_CROSS_ASK = 'Edit(~/.claude/pact/**)';

const MAX_BYTES = 1024 * 1024;
const PINNED_TIMEOUT_MS = 60_000;
const CHARACTER_HITS_MAX = 20;

const PIN_RE = /^commit ([0-9a-f]{40})\nsha256 ([0-9a-f]{64})\n$/;
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
const TOP_KEY_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const META_KEY_RE = /^[a-z][a-z0-9-]*$/;
const SETTINGS_KEY_RE = /^[A-Za-z0-9_]+$/;
const SETTINGS_PATH_RE = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)?$/;
const JSON_SCALAR_RE = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?)/;
const JSON_DEPTH_MAX = 64;
const TOOL_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
// An unmigrated agent's name: letters and digits in hyphen-joined runs, as
// today's files use (Explore keeps its capital). A familiar's stem must pass
// grimoire's own rule as well: lower case only.
const AGENT_NAME_RE = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const FAMILIAR_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NAME_MAX = 64;
const GRIMOIRE_RULE_RE = /^(?:FAIL|CANNOT-CHECK) ([a-z][a-z0-9-]*)(?::|$)/;

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

// ---------------------------------------------------------------- values

// A plain value YAML reads as null, a boolean, a number or a date (grimoire's
// rule, which refuses the whole class rather than guess a loader's reading).
const YAML_WORDS = new Set(['~', 'null', 'true', 'false', 'yes', 'no', 'on', 'off', 'y', 'n']);
const YAML_NUMBER_RES = [
  /^\.[0-9]+$/,
  /^\.[0-9]+[eE][-+]?[0-9]+$/,
  /^[0-9][0-9_]*$/,
  /^[0-9][0-9_]*\.[0-9]*$/,
  /^[0-9][0-9_]*[eE][-+]?[0-9]+$/,
  /^[0-9][0-9_]*\.[0-9]*[eE][-+]?[0-9]+$/,
  /^0x[0-9A-Fa-f_]+$/,
  /^0b[01_]+$/,
  /^0o[0-7_]+$/,
];
const BASE_PREFIX_UNDERSCORES_RE = /^0[xXbBoO]_+$/;
const YAML_DATE_RE = /^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:$|[Tt \u{9}])/u;
const BASE60_FIRST_RE = /^[0-9][0-9_]*$/;
const BASE60_PART_RE = /^[0-5]?[0-9]$/;
const BASE60_LAST_FRACTION_RE = /^[0-5]?[0-9]\.[0-9_]*$/;
const PLAIN_BAD_START = '{}[]&*!|>%@`#,\'"';

function yamlBase60(unsigned) {
  const parts = unsigned.split(':');
  if (parts.length < 2 || !BASE60_FIRST_RE.test(parts[0])) return false;
  for (let i = 1; i < parts.length - 1; i += 1) if (!BASE60_PART_RE.test(parts[i])) return false;
  const last = parts[parts.length - 1];
  return BASE60_PART_RE.test(last) || BASE60_LAST_FRACTION_RE.test(last);
}

function yamlReadsAsNonText(v) {
  if (YAML_WORDS.has(v.toLowerCase()) || YAML_DATE_RE.test(v)) return true;
  const unsigned = v[0] === '-' || v[0] === '+' ? v.slice(1) : v;
  if (BASE_PREFIX_UNDERSCORES_RE.test(unsigned)) return true;
  const bare = unsigned.toLowerCase().replaceAll('_', '');
  if (bare === '.inf' || bare === '.nan') return true;
  if (YAML_NUMBER_RES.some(re => re.test(bare))) return true;
  return yamlBase60(bare);
}

class Refused extends Error {
  constructor(rule, reason) {
    super(reason);
    this.rule = rule;
    this.reason = reason;
  }
}

function parseQuoted(raw) {
  const q = raw[0];
  let out = '';
  let i = 1;
  for (;;) {
    if (i >= raw.length) throw new Refused('value', 'a quoted value that does not close on its line');
    const ch = raw[i];
    if (q === '"' && ch === '\\') {
      const next = raw[i + 1];
      if (next !== '"' && next !== '\\') throw new Refused('value', 'a backslash escape other than \\" or \\\\');
      out += next;
      i += 2;
    } else if (q === "'" && ch === "'" && raw[i + 1] === "'") {
      out += "'";
      i += 2;
    } else if (ch === q) {
      i += 1;
      break;
    } else {
      out += ch;
      i += 1;
    }
  }
  if (i !== raw.length) throw new Refused('value', 'text after a closing quote');
  return out;
}

function parsePlain(v) {
  if (v === '') throw new Refused('value', 'an empty value');
  if (v !== v.trimEnd()) throw new Refused('value', 'trailing spaces after a value');
  if (PLAIN_BAD_START.includes(v[0])) throw new Refused('value', 'a value starting with a flow, anchor, alias, tag, block or quote character');
  if (v === '-' || v === '?' || v === ':' || v.startsWith('- ') || v.startsWith('? ') || v.startsWith(': ')) {
    throw new Refused('value', 'a value that starts a list item or a complex key');
  }
  if (v.includes(': ') || v.endsWith(':')) throw new Refused('value', 'a colon followed by a space inside an unquoted value');
  if (v.includes(' #') || v.includes('\t#')) throw new Refused('value', 'a trailing comment after a value');
  if (v === '=' || v === '<<') throw new Refused('value', 'an unquoted = or <<');
  if (yamlReadsAsNonText(v)) throw new Refused('value', 'an unquoted value YAML reads as null, a boolean, a number or a date');
  return v;
}

/** `[A, B]`: the tool names, in order. Each is a plain tool name or the one browser wildcard. */
function parseFlow(raw) {
  if (!raw.endsWith(']')) throw new Refused('value', 'a flow list that does not close on its line');
  const inner = raw.slice(1, -1);
  if (inner.trim() === '') return [];
  return inner.split(',').map(part => {
    const item = part.trim();
    if (item !== BROWSER_WILDCARD && (!TOOL_RE.test(item) || yamlReadsAsNonText(item))) {
      throw new Refused('value', 'a flow list item that is not a plain tool name');
    }
    return item;
  });
}

/** One value after "key: ". Returns { kind: 'text' | 'flow', value?, items? }. */
function parseValue(raw, key) {
  if (raw.startsWith(' ')) throw new Refused('value', 'more than one space after the colon');
  if (raw[0] === '"' || raw[0] === "'") {
    const value = parseQuoted(raw);
    if (key === 'tools') throw new Refused('quoted-list', 'tools must be a flow list, not a quoted value');
    return { kind: 'text', value };
  }
  if (raw[0] === '[') {
    if (key !== 'tools') throw new Refused('value', 'a flow list for a key that takes text');
    return { kind: 'flow', items: parseFlow(raw) };
  }
  if (key === 'tools') {
    // Checked before the plain rules so a comma list is named for what it is.
    throw new Refused('flow-form', 'tools must be a flow list in brackets, [A, B]');
  }
  return { kind: 'text', value: parsePlain(raw) };
}

// ---------------------------------------------------------------- the strict reader

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

/**
 * Read an agent file's frontmatter with a strict subset reader. Records every
 * failure in `report` and returns { top, metadata } or null. `top` maps key ->
 * { line, kind, value?, items? }. A file must mean the same thing to this
 * reader and to Claude Code, so anything outside the subset fails.
 */
function readAgent(buf, file, report) {
  const text = scanText(buf, file, report);
  if (text === null) return null;
  const lines = text.split('\n');

  if (lines[0] !== '---') {
    report.fail('frontmatter', file, 1, 'the first line must be ---');
    return null;
  }
  const close = lines.indexOf('---', 1);
  if (close < 0) {
    report.fail('frontmatter', file, null, 'no closing --- line');
    return null;
  }

  const top = new Map();
  const metadata = new Map();
  let inMetadata = false;
  let ok = true;
  const bad = (rule, ln, reason) => {
    ok = false;
    report.fail(rule, file, ln, reason);
  };

  for (let i = 1; i < close; i += 1) {
    const line = lines[i];
    const ln = i + 1;
    if (line.trim() === '') {
      bad('blank', ln, 'a blank line in the frontmatter');
      continue;
    }
    if (line.includes('---')) {
      bad('delimiter', ln, 'three dashes inside a frontmatter line');
      continue;
    }
    if (line[0] === ' ' || line[0] === '\t') {
      const child = inMetadata && line.startsWith('  ') && line[2] !== ' ' && line[2] !== '\t';
      if (!child) {
        bad('indented', ln, 'an indented line (a continuation, a nested map or a list)');
        continue;
      }
      const body = line.slice(2);
      if (body.includes('\t')) {
        // A tab can start a comment YAML drops and this reader would keep.
        bad('value', ln, 'a tab in a metadata line');
        continue;
      }
      if (body[0] === '#') {
        bad('comment', ln, 'a comment');
        continue;
      }
      if (body === '-' || body.startsWith('- ')) {
        bad('block-list', ln, 'a list item');
        continue;
      }
      const colon = body.indexOf(':');
      const key = colon > 0 ? body.slice(0, colon) : '';
      if (!META_KEY_RE.test(key) || body[colon + 1] !== ' ') {
        bad('syntax', ln, 'a metadata line that is not "key: value"');
        continue;
      }
      if (metadata.has(key)) {
        bad('duplicate-key', ln, 'a metadata key seen twice');
        continue;
      }
      try {
        const v = parseValue(body.slice(colon + 2), null);
        metadata.set(key, { line: ln, ...v });
      } catch (e) {
        if (!(e instanceof Refused)) throw e;
        bad(e.rule, ln, e.reason);
      }
      continue;
    }
    inMetadata = false;
    if (line[0] === '#') {
      bad('comment', ln, 'a comment');
      continue;
    }
    if (line === '-' || line.startsWith('- ')) {
      bad('block-list', ln, 'a list item');
      continue;
    }
    const colon = line.indexOf(':');
    const key = colon > 0 ? line.slice(0, colon) : '';
    if (!TOP_KEY_RE.test(key)) {
      bad('syntax', ln, 'a line that is not "key: value"');
      continue;
    }
    if (top.has(key)) {
      bad('duplicate-key', ln, 'a key seen twice');
      continue;
    }
    const rest = line.slice(colon + 1);
    if (rest === '') {
      if (key === 'metadata') {
        top.set(key, { line: ln, kind: 'map' });
        inMetadata = true;
      } else {
        top.set(key, { line: ln, kind: 'none' });
        bad('block-list', ln, 'a key with no value on its line (a block list or a nested map)');
      }
      continue;
    }
    if (rest.includes('\t')) {
      top.set(key, { line: ln, kind: 'none' });
      bad('value', ln, 'a tab in a value');
      continue;
    }
    if (rest[0] !== ' ') {
      bad('syntax', ln, 'a key not followed by ": "');
      continue;
    }
    try {
      top.set(key, { line: ln, ...parseValue(rest.slice(1), key) });
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      top.set(key, { line: ln, kind: 'none' });
      bad(e.rule, ln, e.reason);
    }
  }
  return ok ? { top, metadata } : { top, metadata, partial: true };
}

// ---------------------------------------------------------------- the gate's own files

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function verifyPin(report) {
  let pin;
  let script;
  try {
    pin = readFileSync(PIN, 'utf8');
    script = readFileSync(PINNED);
  } catch {
    report.fail('pin', null, null, 'the pinned check script or its pin file is missing');
    return null;
  }
  const m = PIN_RE.exec(pin);
  if (!m) {
    report.fail('pin', null, null, 'the pin file is not exactly "commit <40 hex>" and "sha256 <64 hex>"');
    return null;
  }
  if (sha256(script) !== m[2]) {
    report.fail('pin', null, null, 'the pinned check script does not match its pin');
    return null;
  }
  report.note('pin', `grimoire check.mjs at ${m[1]}, sha256 verified`);
  return m[1];
}

/** The per-agent tool allow-list, as a Map from agent name to its exact tool set. */
function loadAllowlist(report) {
  let text;
  try {
    text = readFileSync(ALLOWLIST, 'utf8');
  } catch {
    report.fail('allowlist', null, null, 'the tool allow-list is missing');
    return null;
  }
  // JSON.parse keeps the last of two equal keys. Every string in this file is
  // a key or a tool name, and only a key is followed by a colon.
  // Each key is decoded first, so an escape cannot spell one name two ways.
  let keys;
  try {
    keys = [...text.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g)].map(m => JSON.parse(`"${m[1]}"`));
  } catch {
    report.fail('allowlist', null, null, 'the tool allow-list is not valid JSON');
    return null;
  }
  if (new Set(keys).size !== keys.length) {
    report.fail('allowlist', null, null, 'the tool allow-list names an agent twice');
    return null;
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    report.fail('allowlist', null, null, 'the tool allow-list is not valid JSON');
    return null;
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    report.fail('allowlist', null, null, 'the tool allow-list must be an object of agent name to tool list');
    return null;
  }
  const map = new Map();
  for (const name of Object.keys(doc)) {
    const tools = doc[name];
    const valid =
      AGENT_NAME_RE.test(name) &&
      Array.isArray(tools) &&
      tools.every(x => typeof x === 'string' && (TOOL_RE.test(x) || x === BROWSER_WILDCARD)) &&
      new Set(tools).size === tools.length;
    if (!valid) {
      report.fail('allowlist', null, null, 'an allow-list entry is not a name with a list of distinct tool names');
      return null;
    }
    map.set(name, new Set(tools));
  }
  return map;
}

// ---------------------------------------------------------------- settings

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isStringSet(v) {
  return Array.isArray(v) && v.every(x => typeof x === 'string') && new Set(v).size === v.length;
}

/** Equal as JSON: lists in order, objects by their own keys. */
function sameJson(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  }
  if (isObject(a) || isObject(b)) {
    if (!isObject(a) || !isObject(b)) return false;
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every(k => Object.hasOwn(b, k) && sameJson(a[k], b[k]));
  }
  return a === b;
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

/** The settings allow-list, as a Map from key path to its one allowed value. */
function loadSettingsAllowlist(report) {
  const fail = reason => {
    report.fail('settings-allowlist', null, null, reason);
    return null;
  };
  let doc;
  try {
    doc = readStrictJson(readFileSync(SETTINGS_ALLOWLIST));
  } catch (e) {
    return fail(e instanceof Refused ? `the settings allow-list: ${e.reason}` : 'the settings allow-list is missing');
  }
  if (!isObject(doc)) return fail('the settings allow-list must be an object of key path to value');
  const map = new Map();
  for (const path of Object.keys(doc)) {
    const segs = path.split('.');
    const valid =
      SETTINGS_PATH_RE.test(path) &&
      SETTINGS_CONTAINERS.has(segs[0]) === (segs.length === 2) &&
      !segs.some(s => BANNED_SETTINGS_SET.has(s)) &&
      (!SETTINGS_SETS.has(path) || isStringSet(doc[path]));
    if (!valid) return fail('a settings allow-list entry is not an allowed key path with its value');
    map.set(path, doc[path]);
  }
  return map;
}

/** Call `visit` with every object key at any depth. */
function eachKey(v, visit) {
  if (Array.isArray(v)) for (const x of v) eachKey(x, visit);
  else if (isObject(v)) {
    for (const k of Object.keys(v)) {
      visit(k);
      eachKey(v[k], visit);
    }
  }
}

/**
 * Hold the settings overlay to the allow-list: exact key paths, exact values,
 * banned names and the permission mode hard-coded. Returns the overlay's
 * sha256 when it passes, else null. Prints no key or value from the overlay;
 * a banned name it prints is this file's own constant.
 */
function checkSettings(root, present, allow, report) {
  if (!present) {
    report.fail('settings-read', OVERLAY, null, 'the settings overlay is missing');
    return null;
  }
  const buf = readFileSync(join(root, ...OVERLAY.split('/')));
  let doc;
  try {
    doc = readStrictJson(buf);
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    report.fail(`settings-${e.rule}`, OVERLAY, null, e.reason);
    return null;
  }
  if (!isObject(doc)) {
    report.fail('settings-read', OVERLAY, null, 'the root is not an object');
    return null;
  }
  let ok = true;
  const fail = (rule, reason) => {
    ok = false;
    report.fail(rule, OVERLAY, null, reason);
  };

  const banned = new Set();
  eachKey(doc, k => BANNED_SETTINGS_SET.has(k) && banned.add(k));
  for (const k of BANNED_SETTINGS) if (banned.has(k)) fail('settings-banned', `a command-running setting (${k})`);

  const perms = doc.permissions;
  if (isObject(perms) && Object.hasOwn(perms, 'defaultMode') && perms.defaultMode !== SETTINGS_MODE) {
    fail('settings-mode', 'permissions.defaultMode may only be auto');
  }
  const ask = isObject(perms) && Array.isArray(perms.ask) ? perms.ask : [];
  if (!SETTINGS_APPLY_ASK.every(r => ask.includes(r))) fail('settings-required', "the overlay must hold the apply step's ask rules");
  if (!ask.includes(SETTINGS_CROSS_ASK)) fail('settings-required', "the overlay must hold the cross script's ask rule");

  // Default-deny: every key path, top level and inside env and permissions.
  const leaves = new Map();
  const leaf = (path, key, v) => {
    if (BANNED_SETTINGS_SET.has(key)) return;
    if (!SETTINGS_KEY_RE.test(key)) fail('settings-key', "a key with characters outside letters, digits and '_'");
    else leaves.set(path, v);
  };
  for (const top of Object.keys(doc)) {
    if (!SETTINGS_CONTAINERS.has(top)) {
      leaf(top, top, doc[top]);
      continue;
    }
    if (!isObject(doc[top])) {
      fail('settings-value', 'env and permissions must be objects');
      continue;
    }
    for (const k of Object.keys(doc[top])) leaf(`${top}.${k}`, k, doc[top][k]);
  }
  if (!allow) return null;
  for (const [path, v] of leaves) {
    if (!allow.has(path)) {
      fail('settings-unlisted', 'a key path outside the settings allow-list');
      continue;
    }
    if (path === 'permissions.defaultMode') continue;
    const want = allow.get(path);
    if (SETTINGS_SETS.has(path)) {
      if (!isStringSet(v) || !v.every(x => want.includes(x))) fail('settings-value', 'a rule list outside the settings allow-list');
    } else if (!sameJson(v, want)) fail('settings-value', 'a value outside the settings allow-list');
  }
  for (const path of SETTINGS_REQUIRED) {
    const v = leaves.get(path);
    const whole = SETTINGS_SETS.has(path) ? Array.isArray(v) && allow.has(path) && allow.get(path).every(x => v.includes(x)) : v !== undefined;
    if (!whole) fail('settings-required', `the overlay must set ${path}, in full`);
  }
  if (!ok) return null;
  report.pass('settings', OVERLAY);
  return sha256(buf);
}

// ---------------------------------------------------------------- the stage

/** Every entry under root/<top>, as '/'-joined paths. Links and other non-files fail. */
function walk(root, top, report) {
  const files = [];
  const visit = rel => {
    const abs = join(root, ...rel.split('/'));
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      return;
    }
    if (st.isSymbolicLink()) return report.fail('path', rel, null, 'a link in the stage');
    if (st.isDirectory()) {
      for (const e of readdirSync(abs).sort()) visit(`${rel}/${e}`);
      return;
    }
    if (!st.isFile()) return report.fail('path', rel, null, 'not a regular file');
    files.push(rel);
  };
  visit(top);
  return files;
}

function safePath(rel) {
  return rel.split('/').every(s => SEGMENT_RE.test(s) && s !== '.' && s !== '..' && !s.endsWith('.'));
}

/**
 * What each staged file is. Returns { agents, installs } where each agent is
 * { file, stem, dest, familiar } and each install is { file, dest }. Matching
 * is exact and case-sensitive: `x.CONTRACT.md` is an agent, not a contract.
 */
function classify(root, report) {
  const agents = [];
  const installs = [];
  const contracts = new Set();
  let overlay = false;
  const files = [...walk(root, 'claude', report), ...walk(root, 'familiars', report)];
  for (const rel of files) {
    if (!safePath(rel)) {
      report.fail('path', rel, null, "a path with characters outside letters, digits, '.', '_' and '-'");
      continue;
    }
    const seg = rel.split('/');
    if (seg[0] === 'claude') {
      if (rel === 'claude/CLAUDE.md') {
        installs.push({ file: rel, dest: 'CLAUDE.md' });
        report.note('partly-checked', 'claude/CLAUDE.md is checked for routing and its marked clauses only; the rest of its text is not checked until ticket 4');
      } else if (rel === OVERLAY) {
        overlay = true;
      } else if (seg.length === 3 && seg[1] === 'agents' && seg[2].endsWith('.md')) {
        const a = { file: rel, stem: seg[2].slice(0, -3), dest: `agents/${seg[2]}`, familiar: false };
        agents.push(a);
        installs.push(a);
      } else report.fail('unclassified', rel, null, 'a payload file of no known kind');
      continue;
    }
    // familiars/
    if (seg.length !== 2) report.fail('unclassified', rel, null, 'a subfolder in familiars');
    else if (seg[1] === '.gitkeep') continue;
    else if (seg[1].endsWith('.contract.md')) contracts.add(seg[1]);
    else if (seg[1].endsWith('.practice-test.md')) continue;
    else if (seg[1].endsWith('.md')) {
      const a = { file: rel, stem: seg[1].slice(0, -3), dest: `agents/${seg[1]}`, familiar: true };
      agents.push(a);
      installs.push(a);
    } else report.fail('unclassified', rel, null, 'a file in familiars of no known kind');
  }
  for (const a of agents) a.hasContract = a.familiar && contracts.has(`${a.stem}.contract.md`);
  for (const [file, dest] of CROSS_FILES) {
    let st;
    try {
      st = lstatSync(join(root, ...file.split('/')));
    } catch {
      report.fail('cross-script', file, null, 'the cross script is missing');
      continue;
    }
    if (st.isSymbolicLink() || !st.isFile()) {
      report.fail('cross-script', file, null, 'the cross script is not a regular file');
      continue;
    }
    installs.push({ file, dest, text: true });
  }
  return { agents, installs, overlay };
}

// ---------------------------------------------------------------- the rules

function nameOk(v, familiar) {
  return v.length >= 1 && v.length <= NAME_MAX && (familiar ? FAMILIAR_NAME_RE : AGENT_NAME_RE).test(v);
}

function checkAgent(a, parsed, allow, report) {
  const { top } = parsed;
  for (const [key, e] of top) {
    if (!ALLOWED_KEYS.has(key)) report.fail('keys', a.file, e.line, 'a key outside the allow-list');
  }

  const name = top.get('name');
  if (!name) report.fail('name', a.file, null, 'no name');
  else if (name.kind === 'text') {
    if (!nameOk(name.value, false)) report.fail('name', a.file, name.line, 'a name outside letters, digits and single hyphens, 1-64 long');
    if (name.value !== a.stem) report.fail('name-stem', a.file, name.line, 'the name differs from the file stem');
    a.name = name.value;
  }

  const desc = top.get('description');
  if (!desc) report.fail('description', a.file, null, 'no description');
  else if (desc.kind === 'text' && desc.value.trim() === '') report.fail('description', a.file, desc.line, 'an empty description');

  const tools = top.get('tools');
  if (!tools) report.fail('tools-missing', a.file, null, 'no tools line; an agent without one gets every tool');
  else if (tools.kind === 'flow') {
    const want = (allow && allow.get(a.stem)) ?? new Set(DEFAULT_TOOLS);
    const got = new Set(tools.items);
    const same = got.size === tools.items.length && got.size === want.size && [...got].every(x => want.has(x));
    if (got.size !== tools.items.length) report.fail('tools', a.file, tools.line, 'a tool listed twice');
    else if (!same) report.fail('tools', a.file, tools.line, "the tools differ from this agent's allow-list entry");
  }

  if (a.familiar) {
    const marks = MARK_KEYS.filter(k => parsed.metadata.has(k));
    if (marks.length !== MARK_KEYS.length) report.fail('mark', a.file, null, 'a familiar without a full contract mark');
    a.marked = marks.length === MARK_KEYS.length;
  }
}

// The one import form the cross script may use: a whole line, from one of the
// three built-ins it needs. None of them can load or run other code.
const NODE_IMPORT_RE = /^import (?:\{[A-Za-z0-9_$, ]*\}|[A-Za-z_$][A-Za-z0-9_$]*|\* as [A-Za-z_$][A-Za-z0-9_$]*) from 'node:(?:crypto|fs|path)';$/;
const IMPORT_WORD_RE = /\b(?:import|export)\b(?!\.meta\b)/;
const LOADER_RE = /\b(?:require|createRequire)\b|\bimport\s*\(/;

/**
 * The cross script loads only node:crypto, node:fs and node:path (#35, #45).
 * Every line that is not a // comment and holds the word import or export
 * must be one whole-line import from one of them; require, createRequire and
 * import() are refused anywhere. Strict on purpose: an unusual but harmless
 * form fails, and is rewritten.
 *
 * It guards against an accidental import, not a deliberate one. It reads
 * lines, not JavaScript, so code made to look like a comment (inside a
 * template string, say) or built from pieces at run time gets past it.
 * Anyone who could write that can edit this gate too, and the dry run shows
 * a gate change.
 */
function checkImports(text, file, report) {
  text.split('\n').forEach((line, i) => {
    const code = line.trimStart();
    if (code.startsWith('//')) return;
    if (LOADER_RE.test(line)) report.fail('cross-imports', file, i + 1, 'a require, createRequire or import() call');
    else if (IMPORT_WORD_RE.test(line) && !NODE_IMPORT_RE.test(line)) report.fail('cross-imports', file, i + 1, "an import or export that is not one whole-line import from a node: built-in");
  });
}

/** Run the pinned grimoire check on one familiar. Relays rule names and line numbers only. */
function runPinned(root, a, report) {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [PINNED, join(root, ...a.file.split('/'))], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: PINNED_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
  const out = typeof r.stdout === 'string' ? r.stdout : '';
  const lines = out.split('\n').filter(l => l !== '');
  if (r.status === 0 && lines[lines.length - 1] === 'RESULT: pass') return;
  for (const l of lines) {
    const m = GRIMOIRE_RULE_RE.exec(l);
    if (!m) continue;
    const ln = /\bline ([0-9]+)\b/.exec(l);
    report.fail(`grimoire/${m[1]}`, a.file, ln ? ln[1] : null, 'the pinned check reports this rule');
  }
  report.fail('grimoire', a.file, null, 'the pinned check did not pass');
}

function run(root, report) {
  // @@TEST-CRASH-HOOK@@
  const pinned = verifyPin(report);
  const allow = loadAllowlist(report);
  const settingsAllow = loadSettingsAllowlist(report);
  const { agents, installs, overlay } = classify(root, report);
  let settingsHash = checkSettings(root, overlay, settingsAllow, report);

  for (const a of agents) {
    const buf = readFileSync(join(root, ...a.file.split('/')));
    const parsed = readAgent(buf, a.file, report);
    if (parsed) checkAgent(a, parsed, allow, report);
    if (!a.familiar) continue;
    if (!nameOk(a.stem, true)) report.fail('familiar-name', a.file, null, "a familiar's file stem must be lower-case letters, digits and single hyphens");
    if (!a.hasContract) report.fail('contract', a.file, null, 'a familiar without its sibling contract');
    if (pinned && parsed && !parsed.partial && a.hasContract && a.marked && nameOk(a.stem, true)) runPinned(root, a, report);
  }

  // The cross script is code the pact runs: held to the same character rules
  // as every other installed text, so nothing in it reads one way and runs
  // another, and to three built-in modules, so no package is pulled in by
  // accident (checkImports says what that rule does not catch).
  for (const i of installs) {
    if (!i.text) continue;
    const text = scanText(readFileSync(join(root, ...i.file.split('/'))), i.file, report);
    if (text !== null) checkImports(text, i.file, report);
  }

  const names = new Map();
  for (const a of agents) {
    if (a.name === undefined) continue;
    const k = a.name.toLowerCase();
    if (names.has(k)) report.fail('name-duplicate', a.file, null, `shares its name with ${shown(names.get(k))}`);
    else names.set(k, a.file);
  }
  const dests = new Map();
  for (const i of installs) {
    const k = i.dest.toLowerCase();
    if (dests.has(k)) report.fail('destination-duplicate', i.file, null, `installs to the same live path as ${shown(dests.get(k))}`);
    else dests.set(k, i.file);
  }

  checkPactText(root, agents, report, scanText);

  for (const a of agents) if (!report.failedFiles.has(a.file)) report.pass('agent', a.file);

  // The copy set is printed only for a stage that passed, so nothing can be
  // read as approved for install from a failed run.
  if (report.failed) return;
  const sorted = installs
    .filter(i => safePath(i.file))
    .map(i => ({ ...i, hash: sha256(readFileSync(join(root, ...i.file.split('/')))) }))
    .sort((x, y) => (x.dest < y.dest ? -1 : x.dest > y.dest ? 1 : 0));
  for (const { file, dest, hash } of sorted) {
    // @@TEST-INSTALL-HOOK@@
    report.lines.push(`INSTALL ${hash} ${file} ${dest}`);
  }
  // The overlay is merged, not copied. Its hash binds the merge to the bytes checked here.
  // @@TEST-SETTINGS-HOOK@@
  report.lines.push(`SETTINGS ${settingsHash} ${OVERLAY}`);
}

function main(argv) {
  const report = new Report();
  try {
    if (argv.length !== 1 || argv[0] === '' || argv[0].startsWith('-')) report.fail('usage', null, null, 'usage: node seam-a.mjs <stage root>');
    else run(argv[0], report);
  } catch {
    // Never a pass, and never the error's text: it can quote a file.
    report.fail('internal', null, null, 'the check itself failed');
  }
  report.lines.push(`RESULT: ${report.failed ? 'fail' : 'pass'}`);
  process.stdout.write(`${report.lines.join('\n')}\n`);
  process.exitCode = report.failed ? 1 : 0;
}

main(process.argv.slice(2));
