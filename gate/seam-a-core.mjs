// seam-a-core.mjs (#155): the check itself, for seam A, the static check.
// seam-a.mjs is its command line: it calls check() with its arguments, prints
// the lines and sets the exit code. Importing this file does nothing: no file,
// process, environment or OS user read until check() is called, and check()
// never prints or exits.
//
// Seam A: the pact's own static check, run by the install (gate/install-run.mjs)
// on a staged copy of what it is about to install. Zero dependencies.
//
//   node seam-a.mjs <stage root> --commands <none | name,name,...>
//
// The stage root holds claude/, familiars/ and AGENTS.md as the commit has
// them. Seam A checks install mechanics only (#262, the pact is vetted like a
// skill): it decides what each file is and where it goes, reads each agent's
// frontmatter so the file still parses with a name that matches its stem, runs
// the text scanner on every installed text file, holds
// the settings overlay to its allow-list, and prints the exact copy set as
// INSTALL lines, one per (staged path, live path) pair. What a file says, and
// which tools an agent holds, is not its question. The install copies those
// files and nothing else, and refuses unless its own reading of the stage agrees.
//
// --commands names the pact commands the configuration turns on, as the
// renderer's COMMANDS line gives them (#203). It is required, exactly once;
// an unknown name, a repeat, and a name with no file in the stage refuse.
// Only a named command is listed for install.
// It also holds the settings overlay to gate/settings-allowlist.json, and
// prints its hash as one SETTINGS line, which the install's merge must match.
//
// Exit 0 and a last line "RESULT: pass", or exit 1 and "RESULT: fail". The
// output names files, rules and line numbers. It never echoes a file's
// content: no value, no key, no name. The only text it prints from the stage
// is a file's path, and only once the path is made of safe characters.
//
// The strict JSON reader, the text scanner, the safe-path test, the name
// filter and the report and refusal types live in shared.mjs (#91).
//
// Node 20 or later, ESM, node: built-ins and the gate's own modules only.

import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILDER_KIT, PACT_COMMANDS, Refused, Report, inKit, readStrictJson, safePath, scanText, shown } from './shared.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SETTINGS_ALLOWLIST = join(HERE, 'settings-allowlist.json');
const OVERLAY = 'claude/settings.overlay.json';
// The review procedure file (#261): one file, by exact path, to one fixed live path.
const REVIEW_FILE = 'claude/review.md';
const REVIEW_DEST = 'pact/review.md';
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
// Paths the overlay must set. A set must hold every allowed entry. Since
// #265 the overlay sets no ask rules: the allow-list holds no ask list, so an
// overlay that sets one fails as unlisted.
const SETTINGS_REQUIRED = Object.freeze(['permissions.defaultMode']);
const TOP_KEY_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const META_KEY_RE = /^[a-z][a-z0-9-]*$/;
const SETTINGS_KEY_RE = /^[A-Za-z0-9_]+$/;
const SETTINGS_PATH_RE = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)?$/;
// A flow-list item YAML reads as plain text: a letter first, then no flow
// punctuation, quote or comment sign.
const TOOL_ITEM_RE = /^[A-Za-z][^,[\]{}#'"&!|>%@`]*$/;
// An agent's name: letters and digits in hyphen-joined runs, as the files use.
const AGENT_NAME_RE = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const NAME_MAX = 64;

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

/**
 * `[A, B]`: the tool names, in order. Which tools an agent holds, and how the
 * list is written (`A, B` or `[A, B]`, as Claude Code takes either), is not
 * the gate's question (#262): only that the line reads as plain text.
 */
function parseFlow(raw) {
  if (!raw.endsWith(']')) throw new Refused('value', 'a flow list that does not close on its line');
  const inner = raw.slice(1, -1);
  if (inner.trim() === '') return [];
  return inner.split(',').map(part => {
    const item = part.trim();
    if (!TOOL_ITEM_RE.test(item) || yamlReadsAsNonText(item)) {
      throw new Refused('value', 'a flow list item that is not a plain tool name');
    }
    return item;
  });
}

/** One value after "key: ". Returns { kind: 'text' | 'flow' | 'true', value?, items? }. */
function parseValue(raw, key) {
  if (raw.startsWith(' ')) throw new Refused('value', 'more than one space after the colon');
  if (raw[0] === '"' || raw[0] === "'") {
    return { kind: 'text', value: parseQuoted(raw) };
  }
  if (raw[0] === '[') {
    if (key !== 'tools') throw new Refused('value', 'a flow list for a key that takes text');
    return { kind: 'flow', items: parseFlow(raw) };
  }
  return { kind: 'text', value: parsePlain(raw) };
}

// ---------------------------------------------------------------- the strict reader

/**
 * Read an agent file's frontmatter with a strict subset reader. Records every
 * failure in `report` and returns { top, metadata } or null. `top` maps key ->
 * { line, kind, value?, items? }. A file must mean the same thing to this
 * reader and to Claude Code, so anything outside the subset fails.
 */
function readAgent(buf, file, report) {
  const text = scanText(buf, file, report);
  if (text === null) return null;
  return readFrontmatter(text, file, report);
}

/** The frontmatter of scanned `text`, as readAgent reads it. */
function readFrontmatter(text, file, report) {
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

/**
 * What each staged file is. Returns { agents, installs } where each agent is
 * { file, stem, dest } and each install is { file, dest }. Matching
 * is exact and case-sensitive: `x.CONTRACT.md` is an agent, not a contract.
 */
function classify(root, report) {
  const agents = [];
  const commands = [];
  const installs = [];
  const kit = [];
  let overlay = false;
  const files = [...walk(root, 'claude', report), ...walk(root, 'familiars', report)];
  // The builder kit (#203 S6): builder/ whole, and the kit's files elsewhere, each installed under pact/builder/ with /scriptorium.
  for (const rel of [...walk(root, 'builder', report), ...BUILDER_KIT.filter(rel => !/^(builder|claude)\//.test(rel)).flatMap(rel => walk(root, rel, report))]) {
    if (!safePath(rel)) report.fail('path', rel, null, "a path with characters outside letters, digits, '.', '_' and '-'");
    else if (!inKit(rel)) report.fail('unclassified', rel, null, 'a builder file the builder kit does not list');
    else kit.push({ file: rel, dest: `pact/builder/${rel}` });
  }
  for (const rel of files) {
    if (!safePath(rel)) {
      report.fail('path', rel, null, "a path with characters outside letters, digits, '.', '_' and '-'");
      continue;
    }
    const seg = rel.split('/');
    if (seg[0] === 'claude') {
      if (inKit(rel)) kit.push({ file: rel, dest: `pact/builder/${rel}` });
      if (rel === 'claude/CLAUDE.md') {
        installs.push({ file: rel, dest: 'CLAUDE.md' });
      } else if (rel === 'claude/rules.source.md') {
        // The unrendered rules, copied by the install for the builder kit only.
      } else if (rel === REVIEW_FILE) {
        installs.push({ file: rel, dest: REVIEW_DEST, review: true });
      } else if (rel === OVERLAY) {
        overlay = true;
      } else if (seg.length === 3 && seg[1] === 'agents' && seg[2].endsWith('.md')) {
        const a = { file: rel, stem: seg[2].slice(0, -3), dest: `agents/${seg[2]}` };
        agents.push(a);
        installs.push(a);
      } else if (seg[1] === 'commands') {
        // A pact command (#203): exactly claude/commands/<name>.md, the name on PACT_COMMANDS.
        const stem = seg.length === 3 && seg[2].endsWith('.md') ? seg[2].slice(0, -3) : null;
        if (seg.length !== 3) report.fail('command-path', rel, null, 'a subfolder in claude/commands; a command is claude/commands/<name>.md');
        else if (!PACT_COMMANDS.some(c => c === stem)) report.fail('command-file-name', rel, null, 'a file in claude/commands that is not a pact command; the gate lists them');
        else commands.push({ file: rel, stem, dest: `commands/${seg[2]}` });
      } else report.fail('unclassified', rel, null, 'a payload file of no known kind');
      continue;
    }
    // familiars/: each agent's contract, kept as its record, and nothing installed.
    if (seg.length !== 2) report.fail('unclassified', rel, null, 'a subfolder in familiars');
    else if (!(seg[1] === '.gitkeep' || seg[1].endsWith('.contract.md') || seg[1].endsWith('.practice-test.md'))) report.fail('unclassified', rel, null, 'a file in familiars of no known kind');
  }
  if (!installs.some(i => i.review)) report.fail('review-file', REVIEW_FILE, null, 'the review procedure file is missing');
  return { agents, commands, installs, kit, overlay };
}

// ---------------------------------------------------------------- the rules

function checkAgent(a, parsed, report) {
  const { top } = parsed;
  const name = top.get('name');
  if (!name) report.fail('name', a.file, null, 'no name');
  else if (name.kind === 'text') {
    if (name.value.length > NAME_MAX || !AGENT_NAME_RE.test(name.value)) report.fail('name', a.file, name.line, 'a name outside letters, digits and single hyphens, 1-64 long');
    if (name.value !== a.stem) report.fail('name-stem', a.file, name.line, 'the name differs from the file stem');
    a.name = name.value;
  }
  const desc = top.get('description');
  if (!desc) report.fail('description', a.file, null, 'no description');
  else if (desc.kind === 'text' && desc.value.trim() === '') report.fail('description', a.file, desc.line, 'an empty description');
}

function run(root, listed, report) {
  // @@TEST-CRASH-HOOK@@
  const settingsAllow = loadSettingsAllowlist(report);
  const { agents, commands, installs, kit, overlay } = classify(root, report);
  let settingsHash = checkSettings(root, overlay, settingsAllow, report);

  for (const a of agents) {
    const parsed = readAgent(readFileSync(join(root, ...a.file.split('/'))), a.file, report);
    if (parsed) checkAgent(a, parsed, report);
  }

  // Only those --commands names are installed, and the builder kit with /scriptorium.
  for (const c of commands) if (listed.includes(c.stem)) installs.push(c);
  if (listed.includes('scriptorium')) installs.push(...kit);
  // Every other installed text file passes the text scanner: valid UTF-8, no
  // hidden or control characters, so what a reader sees is what the model reads.
  for (const file of new Set([...installs, ...commands, ...kit].map(i => i.file))) if (!agents.some(a => a.file === file)) scanText(readFileSync(join(root, ...file.split('/'))), file, report);
  for (const name of listed) {
    if (!commands.some(c => c.stem === name)) report.fail('commands-not-in-pact', null, null, `--commands names ${name}, but the stage holds no claude/commands/${name}.md: it is not in this pact`);
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

/**
 * The command line: the stage root, then --commands exactly once, with none
 * or pact command names joined by commas, each once. Returns { root,
 * commands }, or undefined after recording the refusal. A name it prints is
 * PACT_COMMANDS' own constant, never the argument's text.
 */
function parseArgs(argv, report) {
  const usage = () => report.fail('usage', null, null, 'usage: node seam-a.mjs <stage root> --commands <none | name,name,...>');
  if (argv.length === 0 || argv[0] === '' || argv[0].startsWith('-')) return usage();
  let given = 0;
  let value;
  for (let i = 1; i < argv.length; i += 2) {
    if (argv[i] !== '--commands') return usage();
    given += 1;
    value = argv[i + 1];
  }
  if (given !== 1) return report.fail('commands-arg', null, null, given ? '--commands is given more than once' : 'no --commands: give none, or the pact commands to install');
  if (value === undefined) return report.fail('commands-arg', null, null, '--commands needs a value: none, or pact command names joined by commas');
  if (value === 'none') return { root: argv[0], commands: [] };
  const names = value.split(',');
  if (names.some(n => !PACT_COMMANDS.some(c => c === n))) return report.fail('commands-name', null, null, `--commands names something that is not a pact command; only ${PACT_COMMANDS.join(', ')} are`);
  if (new Set(names).size !== names.length) return report.fail('commands-repeat', null, null, '--commands names one command twice');
  return { root: argv[0], commands: names };
}

/**
 * Run the check on `argv`. Returns the report's lines, with the RESULT line
 * last, and whether it failed. Any throw is an `internal` failure, never a pass.
 */
export function check(argv) {
  const report = new Report();
  try {
    const args = parseArgs(argv, report);
    if (args) run(args.root, args.commands, report);
  } catch {
    // Never a pass, and never the error's text: it can quote a file.
    report.fail('internal', null, null, 'the check itself failed');
  }
  report.lines.push(`RESULT: ${report.failed ? 'fail' : 'pass'}`);
  return { lines: report.lines, failed: report.failed };
}
