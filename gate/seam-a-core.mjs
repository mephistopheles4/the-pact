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
// The stage root holds claude/, familiars/, cross/cross.mjs and AGENTS.md as
// the commit has them. Seam A decides what each file is, checks every agent
// the install would copy, every pact command file, the cross script's
// characters, the review procedure file's characters and hidden-text forms,
// and the pact's own text (pact-text.mjs), and prints the exact
// copy set as INSTALL lines, one per (staged path, live path) pair. The
// install copies those files and nothing else, and refuses unless its own
// reading of the stage agrees.
//
// --commands names the pact commands the configuration turns on, as the
// renderer's COMMANDS line gives them (#203). It is required, exactly once;
// an unknown name, a repeat, and a name with no file in the stage refuse.
// Every command file is checked, and only a named one is listed for install.
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

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPactText } from './pact-text.mjs';
import { AT_IMPORT_RE, PACT_COMMANDS, Refused, Report, readStrictJson, safePath, scanText, shown } from './shared.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PINNED = join(HERE, 'grimoire', 'check.mjs');
const PIN = join(HERE, 'grimoire', 'check.mjs.pin');
const ALLOWLIST = join(HERE, 'tool-allowlist.json');
const SETTINGS_ALLOWLIST = join(HERE, 'settings-allowlist.json');
const OVERLAY = 'claude/settings.overlay.json';
// The cross script (#35): one file, by exact path, to one fixed live path. The
// pact calls only the live copy. Nothing else in cross/ is ever installed.
const CROSS_FILES = Object.freeze([Object.freeze(['cross/cross.mjs', 'pact/cross.mjs'])]);
// The review procedure file (#261): one file, by exact path, to one fixed live
// path beside the cross script. The rules file tells a session to read it
// before any lens runs. The model reads it with the Read tool, which keeps
// text a rendered view hides, so hidden-text forms are refused in it.
const REVIEW_FILE = 'claude/review.md';
const REVIEW_DEST = 'pact/review.md';
const REVIEW_MAX = 64 * 1024;
// Hidden-text forms: an HTML comment, a link reference definition (a line
// CommonMark reads as a definition and never shows), and a raw HTML tag,
// autolinks included.
const REVIEW_HIDDEN = Object.freeze([
  [/<!--/, 'an HTML comment'],
  [/^ {0,3}\[[^\]]*\]:/, 'a link reference definition'],
  [/<[A-Za-z/!?]/, 'a raw HTML tag'],
]);

// Every agent gets these unless the allow-list names it. Hard-coded here, not
// read from the allow-list, so a broken allow-list cannot widen the default.
const DEFAULT_TOOLS = Object.freeze(['Read', 'Glob', 'Grep']);
// The frontmatter keys any installed agent may have. Everything else fails,
// whatever a contract's "Extra keys:" line says.
const ALLOWED_KEYS = new Set(['name', 'description', 'tools', 'model', 'effort', 'metadata']);
// The one wildcard tool name a flow list may hold.
const BROWSER_WILDCARD = 'mcp__Claude_Browser__*';
const MARK_KEYS = ['contract-version', 'familiar-digest', 'contract-digest'];
// The frontmatter keys a pact command file may have, and no other (#203). A
// command never grants a tool, a model or a hook. disable-model-invocation
// must be exactly true: it keeps the model from starting the command itself.
const COMMAND_KEYS = new Set(['description', 'disable-model-invocation']);
const INVOCATION_KEY = 'disable-model-invocation';
// The two forms Claude Code runs as shell when a command loads, read more
// strictly than it reads them, so a near miss fails too: an exclamation mark
// right before a backtick anywhere, and a run of three or more backticks or
// tildes anywhere on a line, at any indent or after any text, with an
// exclamation mark later on that line.
const INLINE_SHELL = '!`';
const FENCE_SHELL_RE = /(?:`{3}|~{3}).*!/;
// An argument placeholder, which splices typed text into the body before the
// shell pass: $ARGUMENTS, $ARGUMENTS[N] or $N. The pact commands take none.
const ARGUMENT_RE = /\$(?:ARGUMENTS|[0-9])/;

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
// The "ask" rules that guard the install (ADR 0049, #210): they ask on an
// apply, not on a mention. The overlay must hold them, whatever the allow-list
// says. Under Bash, whose case matching the docs leave open, each name drops
// its first letter, so a capitalised name still matches.
const SETTINGS_APPLY_ASK = Object.freeze([
  // The Node installer: its one apply flag, wherever the script is named, and
  // after each of its two names a word the rule can't read, or a quote right
  // after a dash, which is where a quote that splits the flag sits. Under
  // Bash, a doubled backslash backs up the single one, in case the matcher
  // reads a backslash before a star as an escape.
  'PowerShell(*--apply*)',
  'Bash(*--apply*)',
  'PowerShell(*install.mjs*--a*)',
  'PowerShell(*install.mjs*$*)',
  'PowerShell(*install.mjs*@*)',
  'PowerShell(*install.mjs*(*)',
  'PowerShell(*install.mjs*%*)',
  'PowerShell(*install.mjs*`*)',
  'PowerShell(*install.mjs*-"*)',
  "PowerShell(*install.mjs*-'*)",
  'PowerShell(*install-run.mjs*--a*)',
  'PowerShell(*install-run.mjs*$*)',
  'PowerShell(*install-run.mjs*@*)',
  'PowerShell(*install-run.mjs*(*)',
  'PowerShell(*install-run.mjs*%*)',
  'PowerShell(*install-run.mjs*`*)',
  'PowerShell(*install-run.mjs*-"*)',
  "PowerShell(*install-run.mjs*-'*)",
  'Bash(*nstall.mjs*--a*)',
  'Bash(*nstall.mjs*$*)',
  'Bash(*nstall.mjs*`*)',
  'Bash(*nstall.mjs*\\*)',
  'Bash(*nstall.mjs*\\\\*)',
  'Bash(*nstall.mjs*-"*)',
  "Bash(*nstall.mjs*-'*)",
  'Bash(*nstall-run.mjs*--a*)',
  'Bash(*nstall-run.mjs*$*)',
  'Bash(*nstall-run.mjs*`*)',
  'Bash(*nstall-run.mjs*\\*)',
  'Bash(*nstall-run.mjs*\\\\*)',
  'Bash(*nstall-run.mjs*-"*)',
  "Bash(*nstall-run.mjs*-'*)",
  // A dry run that writes the owner's rendered rules to a review folder: its
  // option wherever the script is named, and after the name its first letter.
  'PowerShell(*--review-folder*)',
  'Bash(*--review-folder*)',
  'PowerShell(*install.mjs*--r*)',
  'Bash(*nstall.mjs*--r*)',
  // The install record, the drift baseline, and the CI ruleset (S11): kept
  // broad, since a write to either has no closed set of spellings (#165, #210).
  'PowerShell(*.pact-install.json*)',
  'Bash(*.pact-install.json*)',
  'PowerShell(*gh*ruleset*)',
  'PowerShell(*gh*protection*)',
  'Bash(*gh*uleset*)',
  'Bash(*gh*rotection*)',
]);
// The "ask" rule on edits to the installed cross script's folder (#45). The
// overlay must hold it too, whatever the allow-list says.
const SETTINGS_CROSS_ASK = 'Edit(~/.claude/pact/**)';

const PINNED_TIMEOUT_MS = 60_000;

const PIN_RE = /^commit ([0-9a-f]{40})\nsha256 ([0-9a-f]{64})\n$/;
const TOP_KEY_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const META_KEY_RE = /^[a-z][a-z0-9-]*$/;
const SETTINGS_KEY_RE = /^[A-Za-z0-9_]+$/;
const SETTINGS_PATH_RE = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)?$/;
const TOOL_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
// An unmigrated agent's name: letters and digits in hyphen-joined runs, as
// today's files use (Explore keeps its capital). A familiar's stem must pass
// grimoire's own rule as well: lower case only.
const AGENT_NAME_RE = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const FAMILIAR_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NAME_MAX = 64;
const GRIMOIRE_RULE_RE = /^(?:FAIL|CANNOT-CHECK) ([a-z][a-z0-9-]*)(?::|$)/;

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

/** One value after "key: ". Returns { kind: 'text' | 'flow' | 'true', value?, items? }. */
function parseValue(raw, key) {
  if (raw.startsWith(' ')) throw new Refused('value', 'more than one space after the colon');
  // The one boolean the reader takes: a command's invocation key, as plain true.
  if (key === INVOCATION_KEY && raw === 'true') return { kind: 'true' };
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

/**
 * What each staged file is. Returns { agents, installs } where each agent is
 * { file, stem, dest, familiar } and each install is { file, dest }. Matching
 * is exact and case-sensitive: `x.CONTRACT.md` is an agent, not a contract.
 */
function classify(root, report) {
  const agents = [];
  const commands = [];
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
        report.note(
          'partly-checked',
          'claude/CLAUDE.md is the rendered rules file: the gate checks its pinned block word for word, its markers, its characters and that it imports no file, not its wording or meaning; line numbers count the rendered file',
        );
      } else if (rel === REVIEW_FILE) {
        installs.push({ file: rel, dest: REVIEW_DEST, review: true });
      } else if (rel === OVERLAY) {
        overlay = true;
      } else if (seg.length === 3 && seg[1] === 'agents' && seg[2].endsWith('.md')) {
        const a = { file: rel, stem: seg[2].slice(0, -3), dest: `agents/${seg[2]}`, familiar: false };
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
  if (!installs.some(i => i.review)) report.fail('review-file', REVIEW_FILE, null, 'the review procedure file is missing');
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
  return { agents, commands, installs, overlay };
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

/**
 * A pact command file (#203, S3): the two frontmatter keys, read by the
 * agents' strict reader, and a body that runs nothing when it loads and
 * includes no file or argument. Checks the whole file, its frontmatter included.
 */
function checkCommand(root, c, report) {
  const text = scanText(readFileSync(join(root, ...c.file.split('/'))), c.file, report);
  if (text === null) return;
  const parsed = readFrontmatter(text, c.file, report);
  if (parsed) {
    for (const [key, e] of parsed.top) {
      if (!COMMAND_KEYS.has(key)) report.fail('command-keys', c.file, e.line, 'a key a command may not have; only description and disable-model-invocation');
    }
    const desc = parsed.top.get('description');
    if (!desc) report.fail('command-description', c.file, null, 'no description');
    else if (desc.kind === 'text' && desc.value.trim() === '') report.fail('command-description', c.file, desc.line, 'an empty description');
    const inv = parsed.top.get(INVOCATION_KEY);
    if (!inv || inv.kind !== 'true') report.fail('command-invocation', c.file, inv ? inv.line : null, 'disable-model-invocation must be set to true, unquoted');
  }
  text.split('\n').forEach((line, i) => {
    if (line.includes(INLINE_SHELL)) report.fail('command-shell', c.file, i + 1, 'an exclamation mark before a backtick, which runs a shell command when the command loads');
    else if (FENCE_SHELL_RE.test(line)) report.fail('command-shell', c.file, i + 1, 'three backticks or tildes with an exclamation mark after them, which open a shell block when the command loads');
    if (AT_IMPORT_RE.test(line)) report.fail('command-include', c.file, i + 1, 'an @ followed by text, which Claude Code may read as a file include');
    if (ARGUMENT_RE.test(line)) report.fail('command-argument', c.file, i + 1, 'an argument placeholder, which splices typed text into the command; a pact command takes no argument');
  });
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
    else if (IMPORT_WORD_RE.test(line) && !NODE_IMPORT_RE.test(line)) report.fail('cross-imports', file, i + 1, 'an import or export that is not one whole-line import from node:crypto, node:fs or node:path');
  });
}

/**
 * The review procedure file (#261, S5): at most REVIEW_MAX bytes, the text
 * scanner's character rules, and none of the hidden-text forms. Its wording
 * is not checked.
 */
function checkReview(root, file, report) {
  const buf = readFileSync(join(root, ...file.split('/')));
  if (buf.length > REVIEW_MAX) {
    report.fail('review-size', file, null, 'larger than 64 KiB');
    return;
  }
  const text = scanText(buf, file, report);
  if (text === null) return;
  text.split('\n').forEach((line, i) => {
    for (const [re, what] of REVIEW_HIDDEN) if (re.test(line)) report.fail('review-hidden', file, i + 1, `${what}, which the model reads and a rendered view hides`);
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

function run(root, listed, report) {
  // @@TEST-CRASH-HOOK@@
  const pinned = verifyPin(report);
  const allow = loadAllowlist(report);
  const settingsAllow = loadSettingsAllowlist(report);
  const { agents, commands, installs, overlay } = classify(root, report);
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

  // Every command file is checked; only those --commands names are installed.
  for (const c of commands) {
    checkCommand(root, c, report);
    if (!report.failedFiles.has(c.file)) report.pass('command', c.file);
    if (listed.includes(c.stem)) installs.push(c);
  }
  for (const name of listed) {
    if (!commands.some(c => c.stem === name)) report.fail('commands-not-in-pact', null, null, `--commands names ${name}, but the stage holds no claude/commands/${name}.md: it is not in this pact`);
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

  for (const i of installs) if (i.review) checkReview(root, i.file, report);

  checkPactText(root, agents, report);

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
