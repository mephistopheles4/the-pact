#!/usr/bin/env node
// The coverage hint (spec 0011). An opt-in pact tool: for one security finding
// it asks a decision model two questions about each entry of the project's
// threat model and one about each out-of-scope paragraph, and prints a hint.
// The hint is advisory: it rules nothing, and no rule reads it back.
//
//   node coverage.mjs entries (--repo-dir <dir> --base <ref> | <file>)   print the draft entries file; sends nothing
//   node coverage.mjs ask --finding <file> --repo-dir <dir> --base <ref> [--ref <record>]
//                                                                       print the JSON line, the hint line and a result line
//   node coverage.mjs status                                            show the backend and whether it is ready
//
// Run it from a scratch folder outside every repo, never from a repo.
//
// What leaves the machine: nothing with a local Clef, the default. With `jev`,
// chosen by `decision-model` in the user's own ~/.pact/config.json, and only
// for the repos their ~/.pact/coverage.json lists: the finding's text and the
// entries file's `entries` and `scope` maps, to one fixed host. The key is read
// from TYPESAFE_API_KEY and travels only in the Authorization header.
//
// Output is fixed words, names from the entries file and numbers. A refusal is
// one line `REFUSED <word>: <reason>` and the last line is a RESULT line; no
// reason holds matched text, an answer's body or an error's own words:
//   0  RESULT: pass            a hint, or no threat model
//   1  RESULT: fail <word>     the hint is unavailable (clef-<state>, status-<code>, timeout, network, answer)
//   2  RESULT: refused <word>  coverage/usage, /config, /home, /finding, /git, /draft, /entries, /size,
//                              /not-listed, /tls, /cloud, /key, /secret, /personal or /internal
// `entries` prints the file alone, so it can be redirected into one.
//
// Node 24 or later, ESM, node: built-ins only. Every rule is an exported
// function that takes what it needs as parameters; only main reads the real
// values, and main runs only when this file is the entry script. No flag, file
// or variable reaches the `fetch` it sends with.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, appendFileSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { basename, dirname, join, posix, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- limits and words

/** A deciding answer above YES is "likely covered"; from UNSURE to YES, "unsure"; below, "no entry found". */
export const YES = 0.75;
export const UNSURE = 0.5;
const NAMED = 3;
const MAX_ENTRIES = 64;
const MAX_TEXT = 4000;
const MAX_SOURCE = 200;
const MAX_FINDING = 8000;
const MAX_REQUEST = 30_000;
const TIMEOUT_MS = 60_000;
const LOG_ROLL = 1024 * 1024;
const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
const JEV_MODEL = 'jev-latest';

const ID_RE = /^[a-z0-9_]{1,48}$/;
const MODEL_RE = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const BASE_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const REF_RE = /^[A-Za-z0-9#._/-]{1,80}$/;
const REPO_RE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const ORIGIN_RE = /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9-]+\/[A-Za-z0-9._-]+?)(?:\.git)?$/;
const LOOPBACK_RE = /^http:\/\/127\.0\.0\.1:[0-9]{1,5}$/;
const CLEF_STATES = ['starting', 'not-set-up', 'failed'];
const VARIANTS = ['flash', 'full'];

const ENTRIES_PATH = 'docs/threat-entries.json';
const MODEL_PATH = 'docs/threat-model.md';

/** A refusal: a fixed word and a reason that holds no matched text. */
export class Refused extends Error {
  constructor(word, reason) {
    super(reason);
    this.word = word;
  }
}
const refuse = (word, reason) => {
  throw new Refused(word, reason);
};

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const unit = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
/** A map with no prototype, so an id such as `__proto__` is an ordinary key. */
const bare = (pairs = []) => {
  const out = Object.create(null);
  for (const [k, v] of pairs) out[k] = v;
  return out;
};

// ---------------------------------------------------------------- the draft (S2)

const FENCE_RE = /^\s*(`{3,}|~{3,})/;
const HEADING_OPEN_RE = /^ {0,3}(#{1,6})(?!\S)/;
const ITEM_RE = /^(\s*)(?:[-*+]|\d{1,9}[.)])\s+(.*)$/;
const CLASS_RE = /accepted threat classes|accepted risks/i;
const plain = s => s.replace(/\*|`/g, '');
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);

/** A heading line's level and text, or null. No regex runs over the line's tail, so no line's length slows it. */
function headingOf(line) {
  const open = HEADING_OPEN_RE.exec(line);
  if (!open) return null;
  const rest = line.slice(open[0].length).trim();
  let end = rest.length;
  while (end > 0 && rest[end - 1] === '#') end -= 1;
  // A closing run of # is dropped only when a space sets it off, or it is the whole of the rest.
  const closes = end === 0 || /\s/.test(rest[end - 1]);
  return { level: open[1].length, text: closes ? rest.slice(0, end).trimEnd() : rest };
}

/**
 * The text of a Markdown file as blocks: headings, paragraphs and top-level
 * list items, fenced blocks left out. An item holds its continuation lines and
 * sub-bullets, a blank line between them or not.
 */
function blocks(markdown) {
  const out = [];
  let open = null;
  let fence = null;
  let blank = false;
  // A line or paragraph separator reads as a space: a regex dot skips both, which let a crafted line stall a match.
  for (const line of markdown.replace(/^\uFEFF/, '').replace(/[\u2028\u2029]/g, ' ').split(/\r\n|\r|\n/)) {
    if (fence !== null) {
      const close = FENCE_RE.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length && line.trim() === close[1]) fence = null;
      continue;
    }
    const f = FENCE_RE.exec(line);
    if (f) {
      fence = f[1];
      open = null;
      continue;
    }
    if (line.trim() === '') {
      blank = true;
      if (open?.kind === 'paragraph') open = null;
      continue;
    }
    const heading = headingOf(line);
    const item = ITEM_RE.exec(line);
    const indented = /^\s/.test(line);
    if (heading) {
      out.push({ kind: 'heading', ...heading });
      open = null;
    } else if (item && !(open?.kind === 'item' && item[1].length > open.indent)) {
      open = { kind: 'item', indent: item[1].length, bullet: !/^\s*\d/.test(line), lines: [item[2].trim()] };
      out.push(open);
    } else if (open?.kind === 'item' && (indented || !blank)) {
      open.lines.push(line.trim());
    } else if (open?.kind === 'paragraph') {
      open.lines.push(line.trim());
    } else {
      open = { kind: 'paragraph', lines: [line.trim()] };
      out.push(open);
    }
    blank = false;
  }
  return out;
}

/** The draft's `entries` and `scope` maps, built by S2's fixed rule from a threat model's text. */
export function draftEntries(markdown) {
  const entries = bare();
  const scope = bare();
  const add = (id, text) => {
    if (id === '') refuse('coverage/draft', 'a bold lead gives no id');
    if (id in entries) refuse('coverage/draft', `two entries have the id ${id}`);
    entries[id] = text;
  };
  const all = blocks(markdown);
  const start = all.findIndex(b => b.kind === 'heading' && CLASS_RE.test(b.text));
  let end = start;
  if (start >= 0) for (end = start + 1; end < all.length && !(all[end].kind === 'heading' && all[end].level <= all[start].level); end += 1);
  let n = 0;
  all.forEach((b, i) => {
    if (b.kind === 'heading') return;
    const joined = b.lines.join(' ');
    if (start >= 0 && i > start && i < end) {
      if (b.kind !== 'item' || !b.bullet || b.indent > 1) return;
      const lead = /^(\*\*|__)(.+?)\1/.exec(joined);
      if (!lead) refuse('coverage/draft', 'a class bullet has no bold lead');
      add(slug(lead[2]), plain(joined));
    } else if (/out of scope/i.test(plain(joined))) {
      n += 1;
      add(`out_of_scope_${n}`, plain(joined));
      scope[`out_${n}`] = plain(joined);
    }
  });
  return { entries: { ...entries }, scope: { ...scope } };
}

// ---------------------------------------------------------------- the entries file (S2)

/** The file, checked: its shape, ids and lengths. Maps come back with no prototype. */
export function checkEntries(doc) {
  const bad = why => refuse('coverage/entries', why);
  if (!isObj(doc)) bad('the file is not one JSON object');
  for (const k of Object.keys(doc)) if (!['v', 'source', 'entries', 'scope', 'from'].includes(k)) bad('a key outside v, source, entries, scope and from');
  if (doc.v !== 1) bad('v is not 1');
  if (typeof doc.source !== 'string' || doc.source.length > MAX_SOURCE) bad(`source is not a string of at most ${MAX_SOURCE} characters`);
  const map = (name, min, value) => {
    const m = doc[name];
    if (!isObj(m)) bad(`${name} is not a map`);
    const pairs = Object.entries(m);
    if (pairs.length < min || pairs.length > MAX_ENTRIES) bad(`${name} holds ${min} to ${MAX_ENTRIES}`);
    for (const [id, v] of pairs) {
      if (!ID_RE.test(id)) bad(`an id in ${name} is not 1 to 48 of a-z, 0-9 and _`);
      if (!value(v)) bad(`a value in ${name} has the wrong type or length`);
    }
    return bare(pairs);
  };
  const text = v => typeof v === 'string' && v.length >= 1 && v.length <= MAX_TEXT;
  const entries = map('entries', 1, text);
  const scope = map('scope', 0, text);
  let from;
  if (Object.hasOwn(doc, 'from')) {
    if (!isObj(doc.from)) bad('from is not a map');
    const values = new Set(Object.values(doc.from));
    for (const [k, v] of Object.entries(doc.from)) {
      if (!(k in entries) && !(k in scope)) bad('a from key names no entry or scope paragraph');
      if (typeof v !== 'string' || !ID_RE.test(v)) bad('a from value is not an id');
      if (values.has(k)) bad('a from key is also a from value');
    }
    from = bare(Object.entries(doc.from));
  }
  return { v: 1, source: doc.source, entries, scope, from };
}

/** An entries file's text, parsed and checked. */
export function parseEntries(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    refuse('coverage/entries', 'the file is not JSON');
  }
  return checkEntries(doc);
}

// ---------------------------------------------------------------- git (S5)

const GIT_VARS = new Set(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'TYPESAFE_API_KEY']);

/** git's environment: the caller's, without the variables that point git elsewhere and without the key. */
export function gitEnv(env) {
  const out = Object.fromEntries(Object.entries(env ?? {}).filter(([k, v]) => typeof v === 'string' && !GIT_VARS.has(k.toUpperCase())));
  return { ...out, GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: 'none' };
}

/** git's absolute path, found by walking PATH's full entries: never a bare name, which Windows looks up in the current folder first. */
export function findGit(env, platform = process.platform) {
  const win = platform === 'win32';
  const path = Object.entries(env ?? {}).find(([k]) => k.toUpperCase() === 'PATH')?.[1] ?? '';
  for (const raw of path.split(win ? ';' : ':')) {
    const dir = raw.replace(/^"(.*)"$/, '$1');
    if (!(win ? /^[A-Za-z]:[\\/]/.test(dir) : dir.startsWith('/'))) continue;
    const file = join(dir, win ? 'git.exe' : 'git');
    try {
      if (!statSync(file).isFile()) continue;
      if (!win) accessSync(file, constants.X_OK);
      return file;
    } catch {
      // not here
    }
  }
  return null;
}

/**
 * A reader of the repo in `dir` through three git calls and no other. Every
 * call runs from the scratch folder, with a cleaned environment.
 */
function repoReader({ dir, base, env, cwd, spawn, platform }) {
  const git = findGit(env, platform);
  if (git === null) refuse('coverage/git', 'no git found on PATH');
  const run = args => {
    const r = spawn(git, ['-C', dir, '-c', 'core.fsmonitor=false', ...args], { cwd, env: gitEnv(env), maxBuffer: 16 * 1024 * 1024, windowsHide: true, shell: false });
    if (r.error) refuse('coverage/git', 'git did not run to its end');
    return { ok: r.status === 0, out: String(r.stdout ?? '') };
  };
  return {
    /** `owner/name` from origin's URL, or null when there is none or it isn't a GitHub one. */
    origin() {
      const r = run(['config', '--get', 'remote.origin.url']);
      return r.ok ? (ORIGIN_RE.exec(r.out.replace(/\r?\n$/, ''))?.[1] ?? null) : null;
    },
    /** The base's short hash; a base that names no commit or object refuses. */
    shortHash() {
      if (!BASE_RE.test(base)) refuse('coverage/git', 'the base is not a plain ref name');
      const r = run(['rev-parse', '--short', '--end-of-options', base]);
      const hash = r.out.trim().split(/\r?\n/).at(-1) ?? '';
      if (!r.ok || !/^[0-9a-f]{4,64}$/.test(hash)) refuse('coverage/git', 'the base does not resolve in a git repository at that folder');
      return hash;
    },
    /** A file's text at the base, or null when the base holds none. */
    file(path) {
      const r = run(['cat-file', 'blob', `${base}:${path}`]);
      return r.ok ? r.out : null;
    },
  };
}

/** The checked entries file `ask` uses: the reviewed one at the base, else the draft from the model there, else null. */
function entriesAt(reader) {
  const hash = reader.shortHash();
  const reviewed = reader.file(ENTRIES_PATH);
  if (reviewed !== null) return { ...parseEntries(reviewed.replace(/^\uFEFF/, '')), source: `${ENTRIES_PATH}@${hash}` };
  const model = reader.file(MODEL_PATH);
  if (model === null) return null;
  return checkEntries({ v: 1, source: `${MODEL_PATH}@${hash}`, ...draftEntries(model) });
}

// ---------------------------------------------------------------- the finding and the questions (S3)

/** A finding file's text in its fixed form: the headline, one newline, the evidence, each trimmed. */
export function findingText(raw) {
  const all = raw.replace(/\r\n?/g, '\n').trim();
  const at = all.indexOf('\n');
  const text = at < 0 ? all : `${all.slice(0, at).trim()}\n${all.slice(at + 1).trim()}`;
  if (text === '') refuse('coverage/finding', 'the finding is empty');
  if (text.length > MAX_FINDING) refuse('coverage/finding', `the finding is longer than ${MAX_FINDING} characters`);
  return text;
}

const noul = (instructions, yes, no) => ({ type: 'noul', instructions, criteria: { true: yes, false: no } });

/** Q1, the step. */
const q1 = x => noul(
  `Does \`entries.${x}\` name the kind of step the attacker takes in \`finding.text\`?`,
  `\`entries.${x}\` describes this kind of step itself, for example "text a session reads moves it" for a path where a planted issue comment makes a session run a command.`,
  `\`entries.${x}\` is about a different kind of step, for example a path that starts with a stolen token, checked against an entry about text steering a session.`,
);
/** Q2, the harm. */
const q2 = x => noul(
  `Does \`entries.${x}\` accept the harm described in \`finding.text\`, in the place it happens?`,
  `\`entries.${x}\` names this kind of harm and where it happens, for example an entry accepting that a secret can reach a public post, for a finding where a secret reaches a public post.`,
  `\`entries.${x}\` is about a different harm or a different place, for example an entry about programs on the local machine, for a finding where a secret leaks into a public post.`,
);
/** The scope question, once per paragraph. */
const inScope = p => noul(
  `Does what \`finding.text\` describes happen inside what \`scope.${p}\` lists?`,
  `The harm in \`finding.text\` happens wholly within something \`scope.${p}\` names, for example a program already running on the owner's machine changes a file there, checked against a scope that puts the machine's programs out of scope.`,
  `The harm in \`finding.text\` happens somewhere \`scope.${p}\` does not name, for example a secret posted to a public issue, checked against a scope that puts only the local machine out of scope.`,
);

/** The requests for one finding, in order: Q1, Q2, and the scope questions when there is a paragraph. */
export function requestsFor(text, doc) {
  const each = (map, q) => bare(Object.keys(map).map(id => [id, q(id)]));
  const state = { finding: { text }, entries: doc.entries };
  const out = [
    { name: 'q1', state, questions: each(doc.entries, q1) },
    { name: 'q2', state, questions: each(doc.entries, q2) },
  ];
  if (Object.keys(doc.scope).length) out.push({ name: 'scope', state: { finding: { text }, scope: doc.scope }, questions: each(doc.scope, inScope) });
  return out;
}

// ---------------------------------------------------------------- the rule and the hint (S4)

/** A scope paragraph is named by its entry twin, so the owner can find it in the threat model. */
const twin = id => (id.startsWith('out_of_scope_') || !id.startsWith('out_') ? id : `out_of_scope_${id.slice('out_'.length)}`);

/**
 * The finding's state from the answers: the deciding answer is the highest of
 * each entry's lower answer and each scope answer.
 */
export function judge(doc, answers) {
  const entries = Object.keys(doc.entries).map(id => ({ id, q1: answers.q1[id], q2: answers.q2[id] }));
  const paragraphs = Object.keys(doc.scope).map(id => ({ id, score: answers.scope[id] }));
  const scores = [...entries.map(e => ({ name: e.id, score: Math.min(e.q1, e.q2) })), ...paragraphs.map(p => ({ name: twin(p.id), score: p.score }))].sort((a, b) => b.score - a.score);
  const deciding = scores[0].score;
  const state = deciding > YES ? 'likely covered' : deciding >= UNSURE ? 'unsure' : 'no entry found';
  const names = keep => [...new Set(scores.filter(s => keep(s.score)).map(s => s.name))];
  const covers = names(s => s > YES);
  const unsure = names(s => s >= UNSURE && s <= YES).filter(n => !covers.includes(n));
  const named = (state === 'likely covered' ? covers : state === 'unsure' ? unsure : []).slice(0, NAMED);
  const widest = [...paragraphs].sort((a, b) => b.score - a.score)[0];
  const top = [...entries].sort((a, b) => Math.min(b.q1, b.q2) - Math.min(a.q1, a.q2)).slice(0, NAMED);
  return { state, deciding, covers, unsure, named, scope: widest ? { max: widest.score, from: widest.id } : null, top };
}

/** The hint line: no number, and each name as `entry <id>`, so no id reads like a ruling. */
export function hintLine(backend, verdict) {
  const head = `> Coverage hint (${backend}, not a ruling; a failed control is never covered): `;
  const names = verdict.named.map(n => `\`entry ${n}\``).join(', ');
  if (verdict.state === 'likely covered') return `${head}likely covered by ${names}.`;
  if (verdict.state === 'unsure') return `${head}unsure: ${names}.`;
  return `${head}no entry found.`;
}

// ---------------------------------------------------------------- the scans (S7)

// The poster's secret rule and hidden-character list, copied: a test runs both on one table.
const ENV_WORDS = ['TOKEN', 'SECRET', 'KEY', 'PASSWORD', 'PASSWD', 'PWD', 'PAT', 'AUTH', 'CREDENTIAL', 'CREDENTIALS', 'COOKIE'];
const ENV_SKIP = new Set(['PWD', 'OLDPWD', 'SSH_AUTH_SOCK']);
const ENV_MIN = 8;

/** The environment's secret values: each variable whose name has a part that is, or ends in, a secret word, with a value of 8 characters or more. */
export function envSecrets(env) {
  const out = [];
  for (const [name, val] of Object.entries(env ?? {})) {
    const upper = name.toUpperCase();
    if (ENV_SKIP.has(upper) || typeof val !== 'string' || val.length < ENV_MIN) continue;
    if (upper.split('_').some(part => ENV_WORDS.some(w => part.endsWith(w)))) out.push([name, val]);
  }
  return out;
}

const cp = String.fromCodePoint;
const HIDDEN_RE = new RegExp(
  `[${cp(0xe0000)}-${cp(0xe007f)}${cp(0xe0100)}-${cp(0xe01ef)}${cp(0x202a)}-${cp(0x202e)}${cp(0x2066)}-${cp(0x2069)}` +
    `${cp(0x200b)}${cp(0x2060)}-${cp(0x2064)}${cp(0xfe00)}-${cp(0xfe0d)}${cp(0xfeff)}]`,
  'gu',
);
// A subdivision flag, such as Scotland's: the black flag, tag letters, and the cancel tag.
const FLAG_RE = new RegExp(`${cp(0x1f3f4)}[${cp(0xe0020)}-${cp(0xe007e)}]{1,8}${cp(0xe007f)}`, 'gu');

/** What a secret scan of `texts`, as written, finds first: a variable's name or a code point, never the text; or null. */
export function secretIn(texts, env) {
  const secrets = envSecrets(env);
  for (const text of texts) {
    const found = secrets.find(([, val]) => text.includes(val));
    if (found) return `the value of ${found[0].replace(/[^A-Za-z0-9_]/g, '?')}`;
    const flags = [...text.matchAll(FLAG_RE)].map(m => [m.index, m.index + m[0].length]);
    const hit = [...text.matchAll(HIDDEN_RE)].find(h => !flags.some(([s, e]) => h.index >= s && h.index < e));
    if (hit) return `the hidden character U+${hit[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return null;
}

/** Which personal detail `texts` hold, ignoring case: "home folder", with either slash, or "user name"; or null. */
export function personalIn(texts, { homeDir, userName }) {
  const flat = s => s.toLowerCase().replaceAll('\\', '/');
  const home = homeDir ? flat(homeDir).replace(/\/+$/, '') : '';
  const user = typeof userName === 'string' && userName.length >= 3 ? userName.toLowerCase() : null;
  if (home !== '' && texts.some(t => flat(t).includes(home))) return 'home folder';
  if (user !== null && texts.some(t => t.toLowerCase().includes(user))) return 'user name';
  return null;
}

// ---------------------------------------------------------------- the choice (S5)

const MODELS = ['clef-flash', 'clef-full', 'jev'];

/** One of the user's own files under ~/.pact, as an object, or null when there is none. */
function userFile(home, name) {
  const bad = why => refuse('coverage/config', `~/.pact/${name} ${why}`);
  let text;
  try {
    text = readFileSync(join(home, '.pact', name), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    bad('cannot be read');
  }
  let doc;
  try {
    doc = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    bad('is not JSON');
  }
  if (!isObj(doc)) bad('is not one JSON object');
  return doc;
}

/**
 * The user's choice, from two files of their own and never a repo file:
 * `decision-model` in config.json, whose other keys are the installer's, and
 * `jev_repos` in coverage.json. `model` is null when none is named, which
 * means the local Clef as it is set up.
 */
export function readChoice(home) {
  const pact = userFile(home, 'config.json');
  let model = null;
  if (pact !== null && Object.hasOwn(pact, 'decision-model')) {
    model = pact['decision-model'];
    if (!MODELS.includes(model)) refuse('coverage/config', `decision-model in ~/.pact/config.json is not ${MODELS.join(', ')}`);
  }
  const own = userFile(home, 'coverage.json') ?? {};
  if (Object.keys(own).some(k => k !== 'jev_repos')) refuse('coverage/config', '~/.pact/coverage.json holds a key other than jev_repos');
  const { jev_repos: jevRepos = [] } = own;
  if (!Array.isArray(jevRepos) || !jevRepos.every(r => typeof r === 'string' && REPO_RE.test(r))) refuse('coverage/config', 'jev_repos is not a list of owner/name');
  return { model, jevRepos };
}

// ---------------------------------------------------------------- the backends (S5)

/** A reason the hint is unavailable: one word, never an answer's body. */
export class Unavailable extends Error {
  constructor(word) {
    super(word);
    this.word = word;
  }
}
const unavailable = word => {
  throw new Unavailable(word);
};

/** One POST: the parsed body of a 200 answer, or Unavailable. No redirect is followed. */
async function post(fetch, url, headers, body, timeoutMs) {
  let text;
  const signal = AbortSignal.timeout(timeoutMs);
  // Node's timeout signal holds no process open; this keeps it alive until the answer or the limit.
  const alive = setTimeout(() => {}, timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'manual', signal });
    if (res.status !== 200) {
      res.body?.cancel().catch(() => {});
      unavailable(`status-${res.status >= 100 && res.status <= 599 ? res.status : 0}`);
    }
    text = await res.text();
  } catch (e) {
    if (e instanceof Unavailable) throw e;
    unavailable(signal.aborted || e?.name === 'TimeoutError' ? 'timeout' : 'network');
  } finally {
    clearTimeout(alive);
  }
  try {
    return JSON.parse(text);
  } catch {
    return unavailable('answer');
  }
}

/** The answers, checked: for each id sent and no other, a `noul` from 0 to 1. */
export function checkAnswers(questions, answers) {
  const ids = Object.keys(questions);
  if (!isObj(answers) || Object.keys(answers).length !== ids.length) unavailable('answer');
  return bare(ids.map(id => {
    if (!Object.hasOwn(answers, id) || !isObj(answers[id]) || !unit(answers[id].noul)) unavailable('answer');
    return [id, answers[id].noul];
  }));
}

/** The local Clef adapter: `(state, questions)` to answers, through the supervisor at `url`. */
export function clefAdapter({ url, fetch, timeoutMs = TIMEOUT_MS }) {
  return async (state, questions) => ({ answers: checkAnswers(questions, await post(fetch, `${url}/v1/systemone`, { 'Content-Type': 'application/json' }, { state, questions }, timeoutMs)) });
}

/** The Jev adapter: `(state, questions)` to answers, with the model and the usage numbers the answer reports. */
export function jevAdapter({ key, fetch, timeoutMs = TIMEOUT_MS }) {
  return async (state, questions) => {
    const body = await post(fetch, JEV_URL, { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, { model: JEV_MODEL, state, questions }, timeoutMs);
    if (!isObj(body) || typeof body.model !== 'string' || !MODEL_RE.test(body.model)) unavailable('answer');
    const usage = isObj(body.usage) ? Object.fromEntries(Object.entries(body.usage).filter(([k, v]) => ID_RE.test(k) && Number.isFinite(v))) : {};
    return { answers: checkAnswers(questions, body.answers), model: body.model, usage };
  };
}

/** The installed clef.mjs, beside this script. */
const clefScript = () => join(dirname(fileURLToPath(import.meta.url)), 'clef.mjs');

/** Whether `variant`, from clef's status, is one that may answer for the chosen `model`. */
const serves = (variant, model) => VARIANTS.includes(variant) && (model === null || model === `clef-${variant}`);
const variantIn = status => /^variant: (\S+)\r?$/m.exec(status)?.[1];

/** clef.mjs's environment: the caller's, without the key, which only a jev request carries. */
const clefEnv = env => Object.fromEntries(Object.entries(env).filter(([k]) => k.toUpperCase() !== 'TYPESAFE_API_KEY'));

/**
 * Asks the installed clef.mjs for a ready local server: `ensure --wait 60`,
 * then `status`. It never runs setup or starts a download.
 */
function startClef({ model: chosen, execPath, env, cwd, spawn }) {
  const script = clefScript();
  if (!existsSync(script)) unavailable('clef-missing');
  const childEnv = clefEnv(env);
  const run = (args, timeout) => String(spawn(execPath, [script, ...args], { cwd, env: childEnv, encoding: 'utf8', timeout, windowsHide: true, shell: false }).stdout ?? '');
  let ensured = null;
  try {
    ensured = JSON.parse(run(['ensure', '--wait', '60'], 90_000).trim().split(/\r?\n/).at(-1));
  } catch {
    // no JSON line: clef refused or died
  }
  if (ensured?.state !== 'ready') unavailable(`clef-${CLEF_STATES.includes(ensured?.state) ? ensured.state : 'failed'}`);
  if (typeof ensured.url !== 'string' || !LOOPBACK_RE.test(ensured.url)) unavailable('clef-failed');
  const status = run(['status'], 30_000);
  const variant = variantIn(status);
  if (!serves(variant, chosen)) unavailable('clef-variant');
  const model = /^model: ([0-9a-f]{1,64})\r?$/m.exec(status)?.[1] ?? null;
  return { url: ensured.url, backend: `clef-${variant}`, model };
}

// ---------------------------------------------------------------- the log (S8)

const insideOf = (child, parent, win) => {
  const P = win ? win32 : posix;
  const rel = P.relative(P.resolve(parent), P.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !P.isAbsolute(rel));
};

/**
 * The log's folder, under the Claude home folder, found as clef finds its own:
 * CLAUDE_CONFIG_DIR only as an absolute path, and never one inside the folder
 * the command started from, since a cloned repo's settings can set it.
 */
export function logFolder({ env, account, cwd, platform = process.platform }) {
  const win = platform === 'win32';
  const set = env.CLAUDE_CONFIG_DIR;
  if (set && !(win ? /^[A-Za-z]:[\\/]/.test(set) : posix.isAbsolute(set))) refuse('coverage/home', 'CLAUDE_CONFIG_DIR is set but is not an absolute path');
  const dir = join(set ? resolve(set) : join(account, '.claude'), 'pact-coverage');
  if (set) {
    // Judged with links resolved, on the nearest folder that exists, before anything is made.
    let at = dir;
    while (!existsSync(at) && dirname(at) !== at) at = dirname(at);
    let real;
    try {
      real = join(realpathSync.native(at), (win ? win32 : posix).relative(at, dir));
      if (insideOf(real, realpathSync.native(cwd), win)) real = null;
    } catch {
      real = null;
    }
    if (real === null) refuse('coverage/home', 'the Claude home folder lies inside the folder the command was started from, or does not resolve');
  }
  return dir;
}

/** Appends one line in one write; at 1 MB the file becomes log.1.jsonl, replacing an older one. */
export function appendLog(dir, line) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, 'log.jsonl');
  let size = 0;
  try {
    size = statSync(file).size;
  } catch {
    // no log yet
  }
  if (size >= LOG_ROLL) renameSync(file, join(dir, 'log.1.jsonl'));
  appendFileSync(file, `${JSON.stringify(line)}\n`, { mode: 0o600 });
}

// ---------------------------------------------------------------- the modes

const FLAGS = Object.freeze({ entries: ['--repo-dir', '--base'], ask: ['--finding', '--repo-dir', '--base', '--ref'], status: [] });

function parseArgs([mode, ...rest]) {
  const bad = why => refuse('coverage/usage', why);
  if (!Object.hasOwn(FLAGS, mode ?? '')) bad('the modes are entries, ask and status');
  const options = {};
  const words = [];
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (!a.startsWith('-')) words.push(a);
    else if (!FLAGS[mode].includes(a)) bad(`${mode} takes ${FLAGS[mode].join(', ') || 'no options'}`);
    else if (rest[i + 1] === undefined || Object.hasOwn(options, a)) bad(`${a} takes one value, once`);
    else options[a] = rest[(i += 1)];
  }
  if (mode === 'ask' && (words.length || !['--finding', '--repo-dir', '--base'].every(f => Object.hasOwn(options, f)))) bad('ask takes --finding, --repo-dir and --base, and an optional --ref');
  if (mode === 'ask' && Object.hasOwn(options, '--ref') && !REF_RE.test(options['--ref'])) bad('--ref is at most 80 of letters, digits and # . _ / -');
  if (mode === 'status' && words.length) bad('status takes nothing');
  const pair = ['--repo-dir', '--base'].filter(f => Object.hasOwn(options, f)).length;
  if (mode === 'entries' && !(pair === 2 && words.length === 0) && !(pair === 0 && words.length === 1)) bad('entries takes --repo-dir and --base, or one file');
  return { mode, options, words };
}

const readUtf8 = (path, word, what) => {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(path));
  } catch {
    return refuse(word, `${what} cannot be read as UTF-8`);
  }
};

/** `entries`: the draft from the threat model at a base, or from a file as it stands. */
function entriesMode({ options, words }, io) {
  let source;
  let markdown;
  if (words.length) {
    markdown = readUtf8(resolve(io.cwd, words[0]), 'coverage/draft', 'the threat model');
    source = `${words[0].replaceAll('\\', '/')}@uncommitted`.slice(-MAX_SOURCE);
  } else {
    const reader = repoReader({ dir: options['--repo-dir'], base: options['--base'], ...io });
    const hash = reader.shortHash();
    markdown = reader.file(MODEL_PATH);
    if (markdown === null) refuse('coverage/draft', `the base holds no ${MODEL_PATH}`);
    source = `${MODEL_PATH}@${hash}`;
  }
  io.out(JSON.stringify({ v: 1, source, ...draftEntries(markdown) }, null, 2));
  return 0;
}

/** Sends one finding's requests and prints the hint; `entry` gathers what the log keeps. */
async function ask({ options }, io, entry) {
  const { env, out } = io;
  const choice = readChoice(io.account);
  entry.backend = choice.model ?? 'clef';
  const raw = readUtf8(resolve(io.cwd, options['--finding']), 'coverage/finding', 'the finding file');
  // A byte-order mark at the file's start is the encoding's, not the finding's.
  const written = raw.replace(/^\uFEFF/, '');
  const text = findingText(written);
  entry.finding = createHash('sha256').update(text).digest('hex');
  const reader = repoReader({ dir: options['--repo-dir'], base: options['--base'], ...io });
  reader.shortHash();
  entry.repo = reader.origin();
  const doc = entriesAt(reader);
  if (doc === null) {
    entry.state = 'no threat model';
    out('> Coverage hint: no threat model.');
    return;
  }
  entry.source = doc.source;
  const requests = requestsFor(text, doc);
  if (requests.some(r => JSON.stringify(r.state).length + JSON.stringify(r.questions).length > MAX_REQUEST)) refuse('coverage/size', `a request's state and questions pass ${MAX_REQUEST} characters`);

  let backend;
  let send;
  if (choice.model === 'jev') {
    if (entry.repo === null || !choice.jevRepos.includes(entry.repo)) refuse('coverage/not-listed', "this folder's origin is not a repo listed in jev_repos");
    if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') refuse('coverage/tls', 'NODE_TLS_REJECT_UNAUTHORIZED turns certificate checks off');
    if (env.CLAUDE_CODE_REMOTE) refuse('coverage/cloud', 'a cloud session sends nothing to jev');
    const key = env.TYPESAFE_API_KEY;
    if (!key) refuse('coverage/key', 'TYPESAFE_API_KEY is not set');
    const sent = [written, text, ...[doc.entries, doc.scope].flatMap(m => [...Object.keys(m), ...Object.values(m)])];
    const secret = secretIn(sent, env);
    if (secret !== null) refuse('coverage/secret', `the finding or the entries hold ${secret}`);
    const personal = personalIn(sent, io);
    if (personal !== null) refuse('coverage/personal', `the finding or the entries hold the ${personal}`);
    backend = 'jev';
    send = jevAdapter({ key, fetch: io.fetch, timeoutMs: io.timeoutMs });
  } else {
    const clef = startClef({ model: choice.model, execPath: io.execPath, env, cwd: io.cwd, spawn: io.spawn });
    backend = clef.backend;
    entry.backend = backend;
    entry.model = clef.model;
    send = clefAdapter({ url: clef.url, fetch: io.fetch, timeoutMs: io.timeoutMs });
  }

  const answers = { q1: bare(), q2: bare(), scope: bare() };
  for (const r of requests) {
    const got = await send(r.state, r.questions);
    answers[r.name] = got.answers;
    if (got.model) entry.model = got.model;
    if (got.usage) (entry.usage ??= []).push(got.usage);
    if (r.name === 'scope') entry.scope = got.answers;
    else for (const [id, n] of Object.entries(got.answers)) (entry.entries[id] ??= {})[r.name] = n;
  }
  const verdict = judge(doc, answers);
  entry.state = verdict.state;
  const { state, deciding, covers, unsure, scope, top } = verdict;
  out(JSON.stringify({ backend, model: entry.model, state, deciding, covers, unsure, scope, top, repo: entry.repo }));
  out(hintLine(backend, verdict));
}

/** `ask`, with its one log line, whatever the outcome. */
async function askMode(args, io) {
  const dir = logFolder(io);
  const ref = args.options['--ref'] ?? null;
  const entry = { time: new Date().toISOString(), ref, finding: null, repo: null, source: null, backend: null, model: null, usage: null, entries: bare(), scope: bare(), state: null, reason: null };
  const done = (code, ...last) => {
    try {
      appendLog(dir, entry);
    } catch {
      io.out('log: not written');
    }
    for (const l of last) io.out(l);
    return code;
  };
  try {
    await ask(args, io, entry);
    return done(0, 'RESULT: pass');
  } catch (e) {
    if (e instanceof Unavailable) {
      entry.reason = e.word;
      return done(1, `> Coverage hint: unavailable (${e.word}).`, `RESULT: fail ${e.word}`);
    }
    const r = e instanceof Refused ? e : new Refused('coverage/internal', 'the run failed');
    entry.reason = r.word;
    return done(2, `REFUSED ${r.word}: ${r.message}`, `RESULT: refused ${r.word}`);
  }
}

function statusMode(io) {
  const choice = readChoice(io.account);
  const dir = logFolder(io);
  const out = [`backend: ${choice.model ?? 'clef'}`];
  if (choice.model === 'jev') {
    const key = io.env.TYPESAFE_API_KEY ? 'set' : 'missing';
    const ready = key === 'set' && choice.jevRepos.length > 0 && io.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' && !io.env.CLAUDE_CODE_REMOTE;
    out.push(`ready: ${ready ? 'yes' : 'no'}`, `key: ${key}`, ...(choice.jevRepos.length ? choice.jevRepos.map(r => `repo: ${r}`) : ['repos: none']));
  } else {
    const script = clefScript();
    let ready = 'no (clef-missing)';
    if (existsSync(script)) {
      // `status` starts nothing; `ask` starts a set-up clef that is stopped.
      const text = String(io.spawn(io.execPath, [script, 'status'], { cwd: io.cwd, env: clefEnv(io.env), encoding: 'utf8', timeout: 30_000, windowsHide: true, shell: false }).stdout ?? '');
      const run = /^run: (ready|starting|stopped)\r?$/m.exec(text)?.[1];
      const variant = variantIn(text);
      if (/^setup: none\r?$/m.test(text)) ready = 'no (clef-not-set-up)';
      else if (variant !== undefined && !serves(variant, choice.model)) ready = 'no (clef-variant)';
      else ready = run === 'ready' ? 'yes' : `no (clef-${run ?? 'failed'})`;
    }
    out.push(`ready: ${ready}`);
  }
  let count = 0;
  try {
    count = readFileSync(join(dir, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).length;
  } catch {
    // no log yet
  }
  for (const l of [...out, `log: ${count} lines`, 'RESULT: pass']) io.out(l);
  return 0;
}

/** The account's home folder from the account record, never from HOME or USERPROFILE, which a cloned repo's settings can set. */
function accountHome() {
  try {
    return userInfo().homedir || homedir();
  } catch {
    return homedir();
  }
}
const userNameOf = () => {
  try {
    return userInfo().username;
  } catch {
    return '';
  }
};

/** Runs one mode and returns the exit code. Every input is a parameter, so a test hands in its own. */
export async function main(argv, { env = process.env, cwd = process.cwd(), platform = process.platform, execPath = process.execPath, out = l => process.stdout.write(`${l}\n`), fetch = globalThis.fetch, spawn = spawnSync, account = accountHome(), homeDir = homedir(), userName = userNameOf(), timeoutMs = TIMEOUT_MS } = {}) {
  const io = { env, cwd, platform, execPath, out, fetch, spawn, account, homeDir, userName, timeoutMs };
  try {
    const args = parseArgs(argv);
    if (args.mode === 'ask') return await askMode(args, io);
    if (args.mode === 'entries') return entriesMode(args, io);
    return statusMode(io);
  } catch (e) {
    const r = e instanceof Refused ? e : new Refused('coverage/internal', 'the run failed');
    out(`REFUSED ${r.word}: ${r.message}`);
    out(`RESULT: refused ${r.word}`);
    return 2;
  }
}

/** True when this file is the script node was started with, compared by real path (macOS reaches /var through /private/var). */
const startedAsScript = () => {
  try {
    const self = fileURLToPath(import.meta.url);
    if (!process.argv[1]) return false;
    if (resolve(process.argv[1]) === self) return true;
    // Only a script of this file's name is looked up on disk, so an importer touches no file.
    return basename(process.argv[1]) === basename(self) && realpathSync(process.argv[1]) === realpathSync(self);
  } catch {
    return false;
  }
};
if (startedAsScript()) {
  process.exitCode = await main(process.argv.slice(2));
}
