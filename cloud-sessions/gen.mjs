#!/usr/bin/env node
// Generates the cloud-session copy of the pact (#179, #181) through the same
// render and the same gate (seam A) a home install uses.
//
//   node cloud-sessions/gen.mjs            regenerate the three outputs
//   node cloud-sessions/gen.mjs --check    write nothing; exit 1 naming each stale output
//
// Run it with NODE_OPTIONS cleared, as for the install script: it refuses to run
// while NODE_OPTIONS is set, so no gate check runs with outside Node options.
//
// The outputs are CLAUDE.cloud.md, cloud-setup.sh and cloud-setup-wrapper.sh,
// in this folder. The cloud environment's setup field holds the wrapper, which
// runs under sh, as root, before a cloud session starts.
//
// generate(root, options) builds all three in memory:
//
//   1. List the payload: the files `git ls-files` lists under claude/,
//      familiars/ and AGENTS.md in `root`, so untracked and
//      ignored files are never read. It reads their working-tree bytes once.
//      It refuses a link, a non-plain index entry or a case clash
//      (cloud/not-plain), and a private path (cloud/private).
//   2. Render claude/CLAUDE.md with no configuration (renderNoConfig).
//   3. Stage the payload with the render in place of claude/CLAUDE.md and run
//      seam A on it. The copy set is exactly seam A's INSTALL lines, the review
//      procedure file included; each staged file is re-hashed against its
//      line, and the overlay against SETTINGS. The cloud copy is the default
//      render as it stands: the cloud edits to the parallel-session text went
//      with that text (#261).
//   4. Assemble both scripts from the templates in this folder (assemble), then
//      run the form checks and the gate's character scan on every output.
//
// The gate's modules and allow-lists come from this generator's own repo, and
// the templates from its own folder, whatever `root` is. It never reads the
// live ~/.claude or the owner's configuration. `options` is for the tests only:
// `home`, a render home folder in place of a new empty one.
//
// Every refusal is a CloudRefusal with its rule id. A message names a file only
// by its repo-relative path and never relays a caught error's text.
//
// Node 20 or later, ESM, node: built-ins and the gate's own modules only.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { check as renderCheck } from '../gate/render-core.mjs';
import { check as seamCheck } from '../gate/seam-a-core.mjs';
import { Report, readStrictJson, scanText } from '../gate/shared.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(HERE);

// The pact commands the cloud copy installs, passed to seam A as its
// --commands (#203, S9). Never written as a configuration, so the render stays
// "CONFIG none". Empty for now: a cloud session also takes a command from a
// queued message and a print-mode run, and neither has been tried (#203,
// step 0's adversarial-lens F2). Turning /make-it-so and /finis on later is
// this one list.
export const CLOUD_COMMANDS = Object.freeze([]);
// The pact tools the cloud copy installs, passed to seam A as its --tools
// (#280). Empty, and frozen: the published root setup script never installs
// code that posts as the owner. A cloud poster waits for its own trigger.
export const CLOUD_TOOLS = Object.freeze([]);

// The Node block's pins (#183), one shell variable each, written as plain
// assignments at the top of the block. Bump them only by the procedure in
// ADR 0088: each comes from a signature checked against a committed key.
export const CLOUD_PINS = Object.freeze({
  MISE_VERSION: '2026.10.2',
  MISE_SHA256: '79a2bf0ffc9b8a9a6391344e875b3c3679c15053fda3e8728ddf1790d63db788',
  NODE_VERSION: '24.22.0',
  NODE_TAR_SHA256: '28ea0a438de9a13bd7891fd758eee6c7819ee8af5442dfd8d45bd65e56d4228c',
  NODE_BIN_SHA256: '67ca5783febb8bf85736c79fcdd92c8d6d465a0eb2a082672bcdfa76a506751c',
});

// The third-party repos the setup fetches (#183 T3), each pinned by commit:
// the key is owner/repo, the value its 40-hex commit. assemble() writes them as
// one read-only bash array, REPO_PIN. Bump them only by the procedure in
// ADR 0091: each new commit is confirmed on its upstream and its diff read.
export const CLOUD_REPO_PINS = Object.freeze({
  'anthropics/claude-plugins-official': 'ea10b213686c90bb1984b2016937310e05336cf3',
  'cloudflare/skills': '86505e44f87d801aa1864a3c4109e9a8ae5c409f',
  'humanlayer/skills': '653b6411c1f70c275a18e37673b042ff99f67ceb',
  'mattpocock/skills': '49dd158d1076134a641b33efb035946536778336',
  'mephistopheles4/grimoire': '9a625fd5bca96a8b094f42b8b9a0edd81b8cad72',
  'typesafe-ai/skills': '65a39f393687675ce170e6094757de20370365b9',
});

/** Seam A's --commands or --tools value for a list: none, or the names joined by commas. */
export function commandsArg(list) {
  return list.length ? list.join(',') : 'none';
}

export const OUTPUTS = Object.freeze({
  rules: 'cloud-sessions/CLAUDE.cloud.md',
  setup: 'cloud-sessions/cloud-setup.sh',
  wrapper: 'cloud-sessions/cloud-setup-wrapper.sh',
});
export const TEMPLATES = Object.freeze({
  setupHead: 'tpl-setup-head.sh',
  configHead: 'tpl-config-head.sh',
  configTail: 'tpl-config-tail.sh',
  setupTail: 'tpl-setup-tail.sh',
});

const PAYLOAD = Object.freeze(['claude', 'familiars', 'AGENTS.md']);
const RULES_SOURCE = 'claude/CLAUDE.md';
const OVERLAY = 'claude/settings.overlay.json';
const RENDER_NAME = 'CLAUDE.md';
const PLAIN_MODES = new Set(['100644', '100755']);

export const CONFIG_DELIM = '__CLAUDE_CONFIG_EOF__';
export const SETUP_DELIM = '__CLOUD_SETUP_SH_EOF__';
const WRAPPER_HEAD = '# Setup-field wrapper: runs under sh, hands the real script to bash.\n';
const WRAPPER_OPEN = `cat > /tmp/cloud-setup.sh <<'${SETUP_DELIM}'\n`;
const WRAPPER_CLOSE = `${SETUP_DELIM}\nbash /tmp/cloud-setup.sh\n`;
const PH = Object.freeze({
  overlay: '__SETTINGS_OVERLAY__',
  count: '__EXPECTED_COUNT__',
  hashes: '__EXPECTED_HASHES__',
  marker: '__PACT_CLOUD_MARKER__',
  pins: '__CLOUD_PINS__',
  repoPins: '__CLOUD_REPO_PINS__',
});
// A pin's shape: a version is dot-separated numbers, a hash 64 lowercase hex.
const PIN_SHAPE = Object.freeze({
  MISE_VERSION: /^[0-9]+(?:\.[0-9]+)*$/,
  MISE_SHA256: /^[0-9a-f]{64}$/,
  NODE_VERSION: /^[0-9]+(?:\.[0-9]+)*$/,
  NODE_TAR_SHA256: /^[0-9a-f]{64}$/,
  NODE_BIN_SHA256: /^[0-9a-f]{64}$/,
});
// A repo pin's shape: the key owner/repo, the value a 40-hex commit.
const REPO_KEY_RE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
// A template line that writes REPO_PIN: an assignment, an element assignment
// or an append, or the name after a declaring builtin, printf -v, read -a,
// mapfile or readarray. Only the two lines assemble() writes may.
const REPO_PIN_WRITE = /(?:^|[\s;&|(])REPO_PIN(?:\[[^\]]*\])?\+?=|\b(?:declare|typeset|local|readonly|export|unset|mapfile|readarray)\b.*\bREPO_PIN\b|\bprintf\b.*\s-v\s*\S*\bREPO_PIN\b|\bread\b.*\s-[A-Za-z]*a[A-Za-z]*\s*\S*\bREPO_PIN\b/;
// An expansion of REPO_PIN that defaults, assigns, substitutes or tests.
const REPO_PIN_DEFAULT = /\$\{REPO_PIN\[[^\]]*\]:?[-=+?]/;
// A destination is held to these characters on top of seam A's safe-path rule,
// and single-quoted anyway.
const DEST_RE = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;

export class CloudRefusal extends Error {
  constructor(rule, reason) {
    super(`${rule}: ${reason}`);
    this.rule = rule;
  }
}

const refuse = (rule, reason) => {
  throw new CloudRefusal(rule, reason);
};

const sha256 = buf => createHash('sha256').update(buf).digest('hex');

/** Count of non-overlapping occurrences of `needle` in `hay`. */
function count(hay, needle) {
  return hay.split(needle).length - 1;
}

/** Run `fn`, turning any error that is not a refusal into an internal one, so no caught text escapes. */
function guarded(what, fn) {
  try {
    return fn();
  } catch (e) {
    if (e instanceof CloudRefusal) throw e;
    refuse('cloud/internal', `${what} failed`);
  }
}

function tempFolder() {
  return mkdtempSync(join(tmpdir(), 'pact-cloud-'));
}

// ---------------------------------------------------------------- git

/** git's environment: this process's own, minus every GIT_ variable, as the test runner does. */
function gitEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^GIT_/i.test(k)) env[k] = v;
  return env;
}

function git(root, args) {
  const r = spawnSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.quotePath=false', ...args], {
    cwd: root,
    env: gitEnv(),
    encoding: 'buffer',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) refuse('cloud/internal', `git ${args[0]} failed`);
  return r.stdout.toString('utf8');
}

/**
 * The payload as { path, mode, buf }, in index order, from `git ls-files -s`.
 * Refuses a non-plain entry, a link or non-file on disk and a case clash
 * (cloud/not-plain), and a private path (cloud/private).
 */
export function listPayload(root) {
  const out = git(root, ['ls-files', '-s', '-z', '--', ...PAYLOAD]);
  const entries = [];
  for (const rec of out.split('\0')) {
    if (rec === '') continue;
    const m = /^([0-7]{6}) [0-9a-f]+ ([0-3])\t(.+)$/s.exec(rec);
    if (!m) refuse('cloud/not-plain', 'an index entry git listed in an unexpected form');
    entries.push({ mode: m[1], stage: m[2], path: m[3] });
  }
  const seen = new Map();
  for (const e of entries) {
    // A path is shown only once it is made of safe characters.
    const shown = DEST_RE.test(e.path) ? e.path : 'a payload path';
    if (e.path.split('/').some(s => s === 'private') || e.path.endsWith('.private.md')) refuse('cloud/private', `${shown} is a private path`);
    if (!PLAIN_MODES.has(e.mode) || e.stage !== '0') refuse('cloud/not-plain', `${shown} is not a plain file in the index`);
    const k = e.path.toLowerCase();
    if (seen.has(k)) refuse('cloud/not-plain', `${shown} differs only in case from another payload path`);
    seen.set(k, e.path);
  }
  return entries.map(e => {
    const shown = DEST_RE.test(e.path) ? e.path : 'a payload path';
    const full = join(root, ...e.path.split('/'));
    let st;
    try {
      st = lstatSync(full);
    } catch {
      refuse('cloud/not-plain', `${shown} is listed but missing on disk`);
    }
    if (st.isSymbolicLink() || !st.isFile()) refuse('cloud/not-plain', `${shown} is a link or not a regular file on disk`);
    return { path: e.path, mode: e.mode, buf: guarded(`reading ${shown}`, () => readFileSync(full)) };
  });
}

/** The payload paths whose working-tree bytes differ from HEAD, repo-relative. */
export function changedFromHead(root) {
  return git(root, ['diff', '--name-only', '-z', 'HEAD', '--', ...PAYLOAD])
    .split('\0')
    .filter(Boolean);
}

// ---------------------------------------------------------------- step 2: render

/**
 * Render the rules file at `source` with no configuration, through the
 * renderer's own check, with `home` (default: a new empty folder) as the
 * Claude home folder. Returns the rendered bytes.
 */
export function renderNoConfig(source, { home } = {}) {
  const tmp = tempFolder();
  try {
    const out = join(tmp, 'out');
    mkdirSync(out);
    let h = home;
    if (h === undefined) {
      h = join(tmp, 'home');
      mkdirSync(h);
    }
    const r = renderCheck([source, out, h]);
    if (r.failed || r.lines[r.lines.length - 1] !== 'RESULT: pass') refuse('cloud/render', 'the renderer refused the rules file');
    if (!r.lines.includes('CONFIG none')) refuse('cloud/render', 'the render applied a configuration; the cloud copy takes none');
    if (r.lines.some(l => l.startsWith('DIGEST ') || l.startsWith('VALUE '))) refuse('cloud/render', 'the render carries a digest or a value');
    const buf = guarded('reading the render', () => readFileSync(join(out, RENDER_NAME)));
    if (!r.lines.includes(`RENDERED ${sha256(buf)}`)) refuse('cloud/render', 'the render does not match its RENDERED hash');
    return buf;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- step 3: seam A

/**
 * Stage `files` (path -> bytes) in a new folder and run seam A on it. Returns
 * the copy set, [{ source, dest, buf }] in seam A's order, and the overlay's
 * bytes, each checked against seam A's INSTALL and SETTINGS hashes.
 */
function seamA(files) {
  const stage = tempFolder();
  try {
    for (const [rel, buf] of files) {
      const p = join(stage, ...rel.split('/'));
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, buf, { flag: 'wx' });
    }
    const r = seamCheck([stage, '--commands', commandsArg(CLOUD_COMMANDS), '--tools', commandsArg(CLOUD_TOOLS)]);
    if (r.failed || r.lines[r.lines.length - 1] !== 'RESULT: pass') {
      const rules = [...new Set(r.lines.map(l => /^FAIL ([a-z][a-z0-9-]*):/.exec(l)?.[1]).filter(Boolean))];
      refuse('cloud/seam-a', `seam A refused the stage (${rules.join(', ') || 'no rule named'})`);
    }
    return readCopySet(r.lines, files);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

/**
 * Read seam A's passing output `lines` into the copy set, checking each
 * INSTALL and SETTINGS hash against the staged bytes in `files` (path -> bytes).
 */
export function readCopySet(lines, files) {
  const copy = [];
  let settings = null;
  for (const l of lines) {
    let m = /^INSTALL ([0-9a-f]{64}) (\S+) (\S+)$/.exec(l);
    if (m) {
      const [, hash, source, dest] = m;
      const buf = files.get(source);
      if (!buf || sha256(buf) !== hash) refuse('cloud/seam-a', `${source} does not match its INSTALL hash`);
      copy.push({ source, dest, buf });
      continue;
    }
    m = /^SETTINGS ([0-9a-f]{64}) (\S+)$/.exec(l);
    if (m) {
      if (m[2] !== OVERLAY || settings !== null) refuse('cloud/seam-a', 'an unexpected SETTINGS line');
      const buf = files.get(OVERLAY);
      if (!buf || sha256(buf) !== m[1]) refuse('cloud/seam-a', `${OVERLAY} does not match its SETTINGS hash`);
      settings = buf;
    }
  }
  if (copy.length === 0 || settings === null) refuse('cloud/seam-a', 'seam A printed no copy set');
  if (copy[0].dest !== 'CLAUDE.md' || copy[0].source !== RULES_SOURCE) refuse('cloud/seam-a', 'the copy set does not start with the rules file');
  return { copy, overlay: settings };
}

// ---------------------------------------------------------------- step 4: assemble

/** Read the four templates from `dir` (default: this folder) as text. */
export function readTemplates(dir = HERE) {
  const t = {};
  for (const [k, name] of Object.entries(TEMPLATES)) t[k] = guarded(`reading ${name}`, () => readFileSync(join(dir, name), 'utf8'));
  return t;
}

/** Check one embedded body's form, naming it by `name`. */
function checkBody(name, text) {
  if (text.includes('\r')) refuse('cloud/body', `${name} holds a carriage return`);
  if (!text.endsWith('\n')) refuse('cloud/body', `${name} has no trailing newline`);
  const lines = text.split('\n');
  if (lines.includes(CONFIG_DELIM) || lines.includes(SETUP_DELIM)) refuse('cloud/delimiter', `${name} holds a line equal to a delimiter`);
}

/** Splice `value` for the one `placeholder` in `text`: split and join, never String.prototype.replace. */
function fill(text, placeholder, value, name) {
  const parts = text.split(placeholder);
  if (parts.length !== 2) refuse('cloud/form', `${name} must hold ${placeholder} exactly once`);
  return parts.join(value);
}

const lineCount = (text, pred) => text.split('\n').filter(pred).length;

/** Check `pins` against PIN_SHAPE: the same names, each value in its shape (cloud/pin). Returns the assignment lines. */
function pinLines(pins) {
  if (pins === null || typeof pins !== 'object') refuse('cloud/pin', 'the pins are missing');
  const names = Object.keys(PIN_SHAPE);
  if (Object.keys(pins).length !== names.length || names.some(k => !Object.hasOwn(pins, k))) refuse('cloud/pin', `the pins must be exactly ${names.join(', ')}`);
  for (const k of names) {
    // `$` in a JS regex also matches before a final line break, so the value is checked for one first.
    if (typeof pins[k] !== 'string' || /[\r\n]/.test(pins[k]) || !PIN_SHAPE[k].test(pins[k])) refuse('cloud/pin', `${k} is not in its shape`);
  }
  return names.map(k => `${k}=${pins[k]}`).join('\n');
}

/**
 * In `text`, each pin is set once, by its plain assignment line, and its value
 * appears only there; no line defaults or reassigns it (cloud/pin).
 */
function checkPins(name, text, pins) {
  for (const [k, v] of Object.entries(pins)) {
    if (count(text, v) !== 1) refuse('cloud/pin', `${name} must hold ${k}'s value exactly once`);
    if (lineCount(text, l => l === `${k}=${v}`) !== 1) refuse('cloud/pin', `${name} must set ${k} once, as a plain assignment`);
    if (lineCount(text, l => new RegExp(`(?:^|[\\s;&|(])${k}=`).test(l)) !== 1) refuse('cloud/pin', `${name} assigns ${k} more than once`);
    if (new RegExp(`\\$\\{${k}:?[-=+?]`).test(text)) refuse('cloud/pin', `${name} defaults or tests ${k} in an expansion`);
  }
}

/**
 * The repos the setup head fetches: each SKILLS entry's repo, and the first
 * argument of each install_plugins call.
 */
function reposUsed(head) {
  const used = new Set();
  const lines = head.split('\n');
  const from = lines.findIndex(l => /^SKILLS=\($/.test(l));
  if (from >= 0) {
    for (let i = from + 1; i < lines.length && lines[i] !== ')'; i += 1) {
      const m = /^\s*"(\S+) \S+"$/.exec(lines[i]);
      if (m) used.add(m[1]);
    }
  }
  for (const l of lines) {
    const m = /^\s*install_plugins\s+(\S+)/.exec(l);
    if (m) used.add(m[1]);
  }
  return used;
}

/**
 * Check `repoPins` (cloud/pin): each key and value in its shape, a pin for
 * every repo the head uses and no other, and no template line that writes
 * REPO_PIN or defaults it in an expansion. Returns the two lines that set it.
 */
function repoPinLines(repoPins, templates) {
  if (repoPins === null || typeof repoPins !== 'object') refuse('cloud/pin', 'the repo pins are missing');
  for (const [k, v] of Object.entries(repoPins)) {
    // A line break is checked first, as for CLOUD_PINS.
    if (/[\r\n]/.test(k) || !REPO_KEY_RE.test(k)) refuse('cloud/pin', 'a repo pin\'s key is not owner/repo');
    if (typeof v !== 'string' || /[\r\n]/.test(v) || !COMMIT_RE.test(v)) refuse('cloud/pin', `${k}'s pin is not a 40-hex commit`);
  }
  const used = reposUsed(templates.setupHead);
  for (const r of used) if (!Object.hasOwn(repoPins, r)) refuse('cloud/pin', `${REPO_KEY_RE.test(r) ? r : 'a repo'} is fetched but has no pin`);
  for (const k of Object.keys(repoPins)) if (!used.has(k)) refuse('cloud/pin', `${k} is pinned but no entry or call uses it`);
  // The pins are the head's first code line, so no line can make the name
  // read-only before the generated declare and keep its own values.
  const headLines = templates.setupHead.split('\n');
  const at = headLines.indexOf(PH.repoPins);
  if (at < 0 || headLines.slice(0, at).some(l => !/^[ \t]*(#|$)/.test(l))) refuse('cloud/pin', `${TEMPLATES.setupHead} runs a line before the repo pins`);
  for (const [key, name] of Object.entries(TEMPLATES)) {
    for (const l of templates[key].split('\n')) {
      if (REPO_PIN_WRITE.test(l)) refuse('cloud/pin', `${name} writes REPO_PIN`);
      if (REPO_PIN_DEFAULT.test(l)) refuse('cloud/pin', `${name} defaults or tests REPO_PIN in an expansion`);
    }
  }
  const pairs = Object.entries(repoPins).map(([k, v]) => `["${k}"]=${v}`);
  return `unset REPO_PIN\ndeclare -rA REPO_PIN=( ${pairs.join(' ')}${pairs.length ? ' ' : ''})`;
}

/**
 * Build both scripts from `templates` and the copy set. `files` is
 * [{ dest, buf }] with the rules file first; `overlay` the settings overlay's
 * bytes; `pins` the Node block's pins (CLOUD_PINS); `repoPins` the
 * third-party repos' commits (CLOUD_REPO_PINS). Returns { setup, wrapper, marker }, all checked.
 */
export function assemble({ files, overlay, templates, pins, repoPins = CLOUD_REPO_PINS }) {
  const pinned = pinLines(pins);
  for (const [k, name] of Object.entries(TEMPLATES)) {
    if (typeof templates[k] !== 'string') refuse('cloud/form', `${name} is missing`);
    checkBody(name, templates[k]);
  }
  const repoPinned = repoPinLines(repoPins, templates);
  const ov = Buffer.isBuffer(overlay) ? overlay.toString('utf8') : overlay;
  if (ov.includes("'")) refuse('cloud/overlay', `${OVERLAY} holds a single quote`);
  try {
    readStrictJson(Buffer.from(ov, 'utf8'), OVERLAY);
  } catch {
    refuse('cloud/overlay', `${OVERLAY} is not valid JSON`);
  }
  checkBody(OVERLAY, ov);

  let config = templates.configHead;
  const checks = [];
  for (const f of files) {
    if (!DEST_RE.test(f.dest) || f.dest.split('/').some(s => s === '.' || s === '..')) refuse('cloud/form', 'a destination holds a character the setup script will not quote');
    const body = Buffer.isBuffer(f.buf) ? f.buf.toString('utf8') : f.buf;
    checkBody(f.dest, body);
    config += `write_config '${f.dest}' <<'${CONFIG_DELIM}'\n${body}${CONFIG_DELIM}\n\n`;
    checks.push(`check_hash ${sha256(Buffer.from(body, 'utf8'))} '${f.dest}'`);
  }
  config += fill(templates.configTail, PH.overlay, ov, TEMPLATES.configTail);

  let tail = templates.setupTail;
  tail = fill(tail, PH.count, String(files.length + 1), TEMPLATES.setupTail); // every file, plus the settings merge
  tail = fill(tail, PH.hashes, checks.join('\n'), TEMPLATES.setupTail);
  const head = fill(fill(templates.setupHead, PH.pins, pinned, TEMPLATES.setupHead), PH.repoPins, repoPinned, TEMPLATES.setupHead);
  const unmarked = head + config + tail;
  const marker = sha256(Buffer.from(unmarked, 'utf8')).slice(0, 12);
  const setup = fill(unmarked, PH.marker, marker, 'cloud-setup.sh');
  const wrapper = WRAPPER_HEAD + WRAPPER_OPEN + setup + WRAPPER_CLOSE;

  checkForm({ setup, wrapper, files, overlay: ov });
  checkPins(OUTPUTS.setup, setup, pins);
  checkPins(OUTPUTS.wrapper, wrapper, pins);
  for (const [name, text] of [
    [OUTPUTS.setup, setup],
    [OUTPUTS.wrapper, wrapper],
  ]) {
    for (const [k, v] of Object.entries(repoPins)) if (count(text, v) !== 1) refuse('cloud/pin', `${name} must hold ${k}'s pin exactly once`);
  }
  for (const [name, text] of [
    [OUTPUTS.setup, setup],
    [OUTPUTS.wrapper, wrapper],
  ]) {
    const report = new Report();
    if (scanText(Buffer.from(text, 'utf8'), name, report) === null) {
      const rules = [...new Set(report.lines.map(l => /^FAIL ([a-z][a-z0-9-]*):/.exec(l)?.[1]).filter(Boolean))];
      refuse('cloud/chars', `${name} holds a refused character (${rules.join(', ')})`);
    }
  }
  return { setup, wrapper, marker };
}

/** The output form checks (cloud/form). */
function checkForm({ setup, wrapper, files, overlay }) {
  const n = files.length;
  if (lineCount(wrapper, l => l === WRAPPER_OPEN.slice(0, -1)) !== 1 || lineCount(wrapper, l => l === SETUP_DELIM) !== 1) refuse('cloud/form', 'the wrapper must open and close its body exactly once');
  if (wrapper.slice(WRAPPER_HEAD.length + WRAPPER_OPEN.length, wrapper.length - WRAPPER_CLOSE.length) !== setup) refuse('cloud/form', "the wrapper's body is not cloud-setup.sh");
  for (const [name, text] of [
    [OUTPUTS.setup, setup],
    [OUTPUTS.wrapper, wrapper],
  ]) {
    if (lineCount(text, l => l.startsWith('write_config ')) !== n) refuse('cloud/form', `${name} must write each embedded file once`);
    if (lineCount(text, l => l === CONFIG_DELIM) !== n) refuse('cloud/form', `${name} must close each embedded file once`);
    if (lineCount(text, l => l.startsWith('check_hash ')) !== n) refuse('cloud/form', `${name} must check each written file's hash once`);
    const at = text.indexOf("SETTINGS_OVERLAY='");
    if (at < 0 || count(text, "SETTINGS_OVERLAY='") !== 1) refuse('cloud/form', `${name} must set SETTINGS_OVERLAY once`);
    const from = at + "SETTINGS_OVERLAY='".length;
    if (text.slice(from, text.indexOf("'", from)) !== overlay) refuse('cloud/form', `${name}'s SETTINGS_OVERLAY is not the overlay byte for byte`);
    for (const p of Object.values(PH)) if (text.includes(p)) refuse('cloud/form', `${name} still holds ${p}`);
  }
}

// ---------------------------------------------------------------- the pipeline

/**
 * Generate the three outputs from the payload in `root`. Returns
 * { files: { <repo-relative output path>: text }, marker }.
 */
export function generate(root, options = {}) {
  if (process.env.NODE_OPTIONS) refuse('cloud/env', 'NODE_OPTIONS is set; clear it first');
  return guarded('the generator', () => {
    const payload = listPayload(root);
    const files = new Map(payload.map(p => [p.path, p.buf]));
    if (!files.has(RULES_SOURCE) || !files.has(OVERLAY)) refuse('cloud/not-plain', 'the payload lacks the rules file or the settings overlay');

    // Render the bytes listed above, from a copy, so what is rendered is what was read.
    const src = tempFolder();
    let rendered;
    try {
      const p = join(src, RENDER_NAME);
      writeFileSync(p, files.get(RULES_SOURCE), { flag: 'wx' });
      rendered = renderNoConfig(p, { home: options.home });
    } finally {
      rmSync(src, { recursive: true, force: true });
    }

    files.set(RULES_SOURCE, rendered);
    const checked = seamA(files);

    const { setup, wrapper, marker } = assemble({
      files: checked.copy.map(c => ({ dest: c.dest, buf: c.buf })),
      overlay: checked.overlay,
      templates: readTemplates(),
      pins: CLOUD_PINS,
      repoPins: CLOUD_REPO_PINS,
    });
    const rules = rendered.toString('utf8');
    const report = new Report();
    if (scanText(rendered, OUTPUTS.rules, report) === null) refuse('cloud/chars', `${OUTPUTS.rules} holds a refused character`);
    return {
      files: { [OUTPUTS.rules]: rules, [OUTPUTS.setup]: setup, [OUTPUTS.wrapper]: wrapper },
      marker,
    };
  });
}

// ---------------------------------------------------------------- the command line

function main(argv) {
  const say = s => process.stdout.write(`${s}\n`);
  if (process.env.NODE_OPTIONS) {
    say('gen: cloud/env: NODE_OPTIONS is set; clear it first');
    return 2;
  }
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== '--check')) {
    say('usage: node cloud-sessions/gen.mjs [--check]');
    return 2;
  }
  const checkOnly = argv[0] === '--check';
  let result;
  try {
    for (const p of changedFromHead(REPO)) say(`differs from HEAD: ${DEST_RE.test(p) ? p : 'a payload path'}`);
    result = generate(REPO);
  } catch (e) {
    say(e instanceof CloudRefusal ? `gen: ${e.message}` : 'gen: cloud/internal: the generator failed');
    return 1;
  }
  const stale = [];
  for (const [rel, text] of Object.entries(result.files)) {
    let now = null;
    try {
      now = readFileSync(join(REPO, ...rel.split('/')), 'utf8');
    } catch {
      // A missing output is stale.
    }
    if (now !== text) stale.push(rel);
  }
  if (checkOnly) {
    for (const rel of stale) say(`stale: ${rel}`);
    say(stale.length ? 'out of date: run node cloud-sessions/gen.mjs' : `up to date: pact cloud copy ${result.marker}`);
    return stale.length ? 1 : 0;
  }
  for (const [rel, text] of Object.entries(result.files)) writeFileSync(join(REPO, ...rel.split('/')), text);
  for (const rel of stale) say(`wrote ${rel}`);
  if (stale.includes(OUTPUTS.wrapper)) say(`once this merges, paste ${OUTPUTS.wrapper} into the cloud environment's setup field again`);
  say(`pact cloud copy ${result.marker}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
