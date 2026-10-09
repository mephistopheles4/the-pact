#!/usr/bin/env node
// Generates the cloud-session copy of the pact (#179, #181) through the same
// render and the same gate (seam A) a home install uses.
//
//   node cloud-sessions/gen.mjs            regenerate the three outputs
//   node cloud-sessions/gen.mjs --check    write nothing; exit 1 naming each stale output
//
// Run it with NODE_OPTIONS cleared, as for the cross script: it refuses to run
// while NODE_OPTIONS is set, so seam A's pinned grimoire child inherits no Node
// options.
//
// The outputs are CLAUDE.cloud.md, cloud-setup.sh and cloud-setup-wrapper.sh,
// in this folder. The cloud environment's setup field holds the wrapper, which
// runs under sh, as root, before a cloud session starts.
//
// generate(root, options) builds all three in memory:
//
//   1. List the payload: the files `git ls-files` lists under claude/,
//      familiars/, cross/cross.mjs and AGENTS.md in `root`, so untracked and
//      ignored files are never read. It reads their working-tree bytes once.
//      It refuses a link, a non-plain index entry or a case clash
//      (cloud/not-plain), and a private path (cloud/private).
//   2. Render claude/CLAUDE.md with no configuration (renderNoConfig).
//   3. Stage the payload with the render in place of claude/CLAUDE.md and run
//      seam A on it. The copy set is exactly seam A's INSTALL lines; each staged
//      file is re-hashed against its line, and the overlay against SETTINGS.
//   4. Apply the cloud edits, E1 and E2, to the render (applyEdits).
//   5. Re-stage with the edited rules file and run seam A again. Every embedded
//      file matches an INSTALL hash from this second run.
//   6. Assemble both scripts from the templates in this folder (assemble), then
//      run the form checks and the gate's character scan on every output.
//
// The gate's modules and allow-lists come from this generator's own repo, and
// the templates from its own folder, whatever `root` is. It never reads the
// live ~/.claude or the owner's configuration. `options` is for the tests only:
// `home`, a render home folder in place of a new empty one, and `edits`, an
// edit list in place of EDITS.
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

const PAYLOAD = Object.freeze(['claude', 'familiars', 'cross/cross.mjs', 'AGENTS.md']);
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
});
// A destination is held to these characters on top of seam A's safe-path rule,
// and single-quoted anyway.
const DEST_RE = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;

export const SECTION = '## When parallel sessions work one chain';
const GATED_RE = /^ *<!-- pact:(begin|end) ([a-z][a-z0-9-]*) -->$/;

// The cloud edits (#179, spec v3, S3). Each anchor is a paragraph's opening
// lines as the pact has them; the freshness test pins this list by its ids and
// editsDigest().
export const EDITS = Object.freeze([
  Object.freeze({
    id: 'E1',
    anchor:
      '**Check for a live session before claiming.** Call\n' +
      '`mcp__ccd_session_mgmt__list_sessions` and match candidates **on worktree name**.\n',
    replacement:
      '**Check for a live session before claiming.** If the desktop session tools\n' +
      '(`mcp__ccd_session_mgmt__*`) are available, call `list_sessions` and match\n' +
      'candidates **on worktree name**. In a cloud session,\n' +
      '`mcp__Claude_Code_Remote__list_sessions` lists my cloud sessions by title only.\n' +
      'It cannot see local desktop sessions and cannot message any session. So a\n' +
      'ticket assigned in the last hour that no listed session clearly owns counts as\n' +
      'live: ask me before claiming it.\n',
  }),
  Object.freeze({
    id: 'E2',
    anchor:
      "**Message the session, don't guess.** Use\n" +
      '`mcp__ccd_session_mgmt__send_message` to ask the other session whether it is\n' +
      'done, rather than inferring from a stale transcript or an idle-looking process.\n',
    replacement:
      "**Message the session, don't guess.** If the desktop session tools are\n" +
      'available, use `mcp__ccd_session_mgmt__send_message` to ask the other session\n' +
      'whether it is done; otherwise ask me. Never infer it from a stale transcript or\n' +
      'an idle-looking process.\n',
  }),
]);

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

/** The sha256 of an edit list: each id, anchor and replacement, NUL-separated. */
export function editsDigest(edits = EDITS) {
  return sha256(edits.map(e => `${e.id}\0${e.anchor}\0${e.replacement}\0`).join(''));
}

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

// ---------------------------------------------------------------- step 1: render

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

// ---------------------------------------------------------------- steps 3 and 5: seam A

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
    const r = seamCheck([stage]);
    if (r.failed || r.lines[r.lines.length - 1] !== 'RESULT: pass') {
      const rules = [...new Set(r.lines.map(l => /^FAIL ([a-z][a-z0-9-]*):/.exec(l)?.[1]).filter(Boolean))];
      refuse('cloud/seam-a', `seam A refused the stage (${rules.join(', ') || 'no rule named'})`);
    }
    const copy = [];
    let settings = null;
    for (const l of r.lines) {
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
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- step 4: the cloud edits

/** The gated clauses of `text`, each from its begin line through its end line, as [start, end) offsets and text. */
export function gatedClauses(text) {
  const out = [];
  const open = new Map();
  let off = 0;
  for (const line of text.split('\n')) {
    const m = GATED_RE.exec(line);
    if (m) {
      if (m[1] === 'begin') open.set(m[2], off);
      else if (open.has(m[2])) {
        const start = open.get(m[2]);
        open.delete(m[2]);
        const end = off + line.length + 1;
        out.push({ name: m[2], start, end, text: text.slice(start, end) });
      }
    }
    off += line.length + 1;
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The [start, end) offsets of the section headed SECTION, up to the next level-2 heading. */
function sectionRange(text) {
  const head = `\n${SECTION}\n`;
  const at = text.indexOf(head);
  if (at < 0 || count(text, head) !== 1) return null;
  const start = at + 1;
  const next = text.indexOf('\n## ', start + SECTION.length);
  return [start, next < 0 ? text.length : next + 1];
}

/**
 * Apply `edits` (default EDITS) to the rendered rules text, in order. Every
 * mark left in a no-configuration render is gated, so each one is a clause no
 * edit may touch.
 */
export function applyEdits(text, edits = EDITS) {
  const clauses = gatedClauses(text);
  let out = text;
  for (const e of edits) {
    if (count(out, e.anchor) !== 1) refuse('cloud/anchor-missing', `${e.id}'s anchor must appear exactly once`);
    const start = out.indexOf(e.anchor);
    const end = start + e.anchor.length;
    if (gatedClauses(out).some(c => start < c.end && end > c.start)) refuse('cloud/anchor-gated', `${e.id}'s anchor overlaps a gated clause`);
    const section = sectionRange(out);
    if (!section || start < section[0] || end > section[1]) refuse('cloud/anchor-section', `${e.id}'s anchor is not inside the section "${SECTION}"`);
    out = out.slice(0, start) + e.replacement + out.slice(end);
  }
  let from = 0;
  for (const c of clauses) {
    const at = out.indexOf(c.text, from);
    if (count(out, c.text) !== 1 || at < 0) refuse('cloud/gated-moved', `the gated clause ${c.name} is not once, word for word and in order`);
    from = at + c.text.length;
  }
  return out;
}

// ---------------------------------------------------------------- step 5: assemble

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

/**
 * Build both scripts from `templates` and the copy set. `files` is
 * [{ dest, buf }] with the rules file first; `overlay` the settings overlay's
 * bytes. Returns { setup, wrapper, marker }, all checked.
 */
export function assemble({ files, overlay, templates }) {
  for (const [k, name] of Object.entries(TEMPLATES)) {
    if (typeof templates[k] !== 'string') refuse('cloud/form', `${name} is missing`);
    checkBody(name, templates[k]);
  }
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
  const unmarked = templates.setupHead + config + tail;
  const marker = sha256(Buffer.from(unmarked, 'utf8')).slice(0, 12);
  const setup = fill(unmarked, PH.marker, marker, 'cloud-setup.sh');
  const wrapper = WRAPPER_HEAD + WRAPPER_OPEN + setup + WRAPPER_CLOSE;

  checkForm({ setup, wrapper, files, overlay: ov });
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
    const first = seamA(files);
    const edited = Buffer.from(applyEdits(rendered.toString('utf8'), options.edits ?? EDITS), 'utf8');
    files.set(RULES_SOURCE, edited);
    const second = seamA(files);
    if (second.copy.map(c => `${c.source} ${c.dest}`).join('\n') !== first.copy.map(c => `${c.source} ${c.dest}`).join('\n')) refuse('cloud/seam-a', 'the copy set changed between the two seam A runs');

    const { setup, wrapper, marker } = assemble({
      files: second.copy.map(c => ({ dest: c.dest, buf: c.buf })),
      overlay: second.overlay,
      templates: readTemplates(),
    });
    const rules = edited.toString('utf8');
    const report = new Report();
    if (scanText(edited, OUTPUTS.rules, report) === null) refuse('cloud/chars', `${OUTPUTS.rules} holds a refused character`);
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
  say(`pact cloud copy ${result.marker}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
