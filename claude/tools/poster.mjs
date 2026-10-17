#!/usr/bin/env node
// The poster (#246, its core built in #253). It posts free text to GitHub
// through one fixed gh api call per surface, reads back what landed by the id
// the answer carried, and exits non-zero unless what landed is what was sent.
// A port of gh-post.ts, github-post.ts and github-body.ts from stacks, the
// owner's other repository, read as text.
//
//   node poster.mjs <surface> --repo <owner/name> --body <file> [--as <login>] [options]
//
//     issue                 --title-file <file> [--label <name>]...
//     pull-request          --title-file <file> --head <branch> --base <branch> [--draft]
//     issue-comment         --issue <n>
//     pull-request-review   --pr <n>
//     review-thread-reply   --pr <n> --comment <review comment id>
//
//   everywhere: --dry-run   prints the gh arguments and the request's sizes, sends nothing
//
// Every piece of free text comes from a file, so no prose reaches a command
// line. Before anything is sent it checks every option and file, and scans the
// exact text it would send for credential shapes, environment secrets, local
// paths, session ids, email addresses and hidden text. Then it checks the
// shape of any Lens dispositions table in the body against the review
// procedure's template (#280, T2). Before it posts, it checks that the repo's
// owner is the gh login, by name and again by what GitHub returns for the repo
// (owner/repo, owner/github). The scans are a backstop for accidents, not a
// guard against a session that sets out to get past them.
//
// The last line is always a RESULT line on stdout:
//   0  RESULT: verified <surface> <url> as <login>
//   1  RESULT: mismatch <url>     posted, but a field differs
//   1  RESULT: unverified <url>   posted, but the read-back failed or was unusable
//   2  RESULT: refused <count>    a usage fault or a content refusal; nothing sent
//   3  RESULT: failed             the post call failed; it may or may not have landed
//   4  RESULT: unavailable        a read before posting failed, or the poster
//                                 itself failed before sending; nothing sent
//   0  RESULT: dry-run <surface>
// Exits 1 and 3 also print one NEXT: line, straight above the RESULT line,
// that says what the session does next (#294).
// Output names rules, fields, positions and sizes, never the text itself; the
// NEXT: line holds fixed words, a page and a login. It never retries.
//
// Node 24 or later, ESM, node: built-ins only. Every rule is an exported
// function that takes gh, the environment, the home and temp folders, the user
// and the host as inputs, so its tests need no gh and no network. Only main
// reads the real values, and main runs only when this file is the entry
// script.

import { spawnSync } from 'node:child_process';
import { closeSync, fstatSync, lstatSync, mkdtempSync, openSync, readSync, realpathSync, rmSync } from 'node:fs';
import { homedir, hostname, tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- the surfaces

const COMMON = Object.freeze(['repo', 'body', 'as', 'dry-run']);
const FLAGS = new Set(['draft', 'dry-run']);
const REPEATABLE = new Set(['label']);

/** Each surface's own options, and which of them it needs. */
export const SURFACES = Object.freeze({
  issue: { options: ['title-file', 'label'], needs: ['title-file'] },
  'pull-request': { options: ['title-file', 'head', 'base', 'draft'], needs: ['title-file', 'head', 'base'] },
  'issue-comment': { options: ['issue'], needs: ['issue'] },
  'pull-request-review': { options: ['pr'], needs: ['pr'] },
  'review-thread-reply': { options: ['pr', 'comment'], needs: ['pr', 'comment'] },
});

/** The documented command line for each surface, after `node poster.mjs`. */
export const EXAMPLES = Object.freeze({
  issue: 'issue --repo you/your-repo --title-file title.txt --body body.md --label bug',
  'pull-request': 'pull-request --repo you/your-repo --title-file title.txt --body body.md --head my-branch --base main --draft',
  'issue-comment': 'issue-comment --repo you/your-repo --body comment.md --issue 12 --as you',
  'pull-request-review': 'pull-request-review --repo you/your-repo --body review.md --pr 34',
  'review-thread-reply': 'review-thread-reply --repo you/your-repo --body reply.md --pr 34 --comment 5678',
});

/** The surfaces whose body may end with the harness's attribution trailer. edit-pull-request arrives with the edit surfaces (S4, T2). */
const TRAILER_SURFACES = new Set(['pull-request', 'edit-pull-request']);

const FILE_MAX = 256 * 1024;
const BODY_MAX = 65536;
const TITLE_MAX = 256;

// ---------------------------------------------------------------- the command line

const OPTION_RE = /^--[a-z][a-z-]{0,30}$/;

/**
 * The surface and options from an argument list, with every usage fault as a
 * refusal: an unknown surface or option, a word that is no option, a missing
 * value, a repeated single-value option, and a missing option the surface
 * needs. An option whose value is missing is kept as null, so it is not
 * also reported missing.
 */
export function parseArgs(argv) {
  const refusals = [];
  const options = new Map();
  const [surface, ...rest] = argv;
  if (surface === undefined || !Object.hasOwn(SURFACES, surface)) {
    refusals.push({ rule: 'usage/surface', where: 'argument 1' });
    return { surface: null, options, refusals };
  }
  const known = new Set([...COMMON, ...SURFACES[surface].options]);
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    const at = `argument ${i + 2}`;
    if (!token.startsWith('--')) {
      refusals.push({ rule: 'usage/argument', where: at });
      continue;
    }
    const name = token.slice(2);
    if (!OPTION_RE.test(token) || !known.has(name)) {
      // Its value, if it has one, goes with it: one fault, not two.
      refusals.push({ rule: 'usage/unknown-option', where: at });
      if (rest[i + 1] !== undefined && !rest[i + 1].startsWith('--')) i += 1;
      continue;
    }
    if (options.has(name) && !REPEATABLE.has(name)) {
      refusals.push({ rule: 'usage/repeated', where: `option --${name}` });
      if (!FLAGS.has(name) && rest[i + 1] !== undefined && !rest[i + 1].startsWith('--')) i += 1;
      continue;
    }
    if (FLAGS.has(name)) {
      options.set(name, true);
      continue;
    }
    const value = rest[i + 1];
    if (value === undefined || value.startsWith('--')) {
      refusals.push({ rule: 'usage/missing-value', where: `option --${name}` });
      if (!options.has(name)) options.set(name, REPEATABLE.has(name) ? [] : null);
      continue;
    }
    i += 1;
    if (REPEATABLE.has(name)) options.set(name, [...(options.get(name) ?? []), value]);
    else options.set(name, value);
  }
  for (const name of ['repo', 'body', ...SURFACES[surface].needs]) {
    if (!options.has(name)) refusals.push({ rule: 'usage/missing-option', where: `option --${name}` });
  }
  return { surface, options, refusals };
}

// ---------------------------------------------------------------- the input rules

const LOGIN_RE = /^[A-Za-z0-9-]{1,39}$/;
const REPO_RE = /^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/;
const NUMBER_RE = /^[1-9][0-9]{0,15}$/;
const BRANCH_RE = /^[A-Za-z0-9._/-]{1,255}$/;
const LABEL_RE = /^[A-Za-z0-9 :._-]{1,50}$/;

/** An owner and a name, or null. */
export function parseRepo(s) {
  const m = typeof s === 'string' ? s.match(REPO_RE) : null;
  if (!m || m[2] === '.' || m[2] === '..') return null;
  return { owner: m[1], name: m[2] };
}

export const isLogin = s => typeof s === 'string' && LOGIN_RE.test(s);
export const isNumber = s => typeof s === 'string' && NUMBER_RE.test(s) && Number.isSafeInteger(Number(s));
export const isBranch = s => typeof s === 'string' && BRANCH_RE.test(s) && !s.startsWith('-') && !s.includes('..');
export const isLabel = s => typeof s === 'string' && LABEL_RE.test(s);

/** An id from an answer, as text, when it is a safe positive integer that passes the number rule; else null. */
export function idText(v) {
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) return null;
  const s = String(v);
  return isNumber(s) ? s : null;
}

/** The length of a text in characters (code points), never in lines or UTF-16 units. */
const chars = s => [...s].length;

/**
 * A text file read strictly: a regular file, not a link, at most 256 KiB,
 * checked before it is read and again on the open descriptor, so a file
 * swapped between the two is refused. Valid UTF-8, with no byte-order mark,
 * and not empty. Returns { text } or { rule }.
 */
export function readText(path) {
  let before;
  try {
    before = lstatSync(path, { bigint: true });
  } catch {
    return { rule: 'file/unreadable' };
  }
  if (before.isSymbolicLink()) return { rule: 'file/link' };
  if (!before.isFile()) return { rule: 'file/not-regular' };
  if (before.size > BigInt(FILE_MAX)) return { rule: 'file/size' };
  let fd;
  try {
    fd = openSync(path, 'r');
  } catch {
    return { rule: 'file/unreadable' };
  }
  let bytes;
  try {
    const after = fstatSync(fd, { bigint: true });
    if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino) return { rule: 'file/not-regular' };
    const buf = Buffer.alloc(FILE_MAX + 1);
    let got = 0;
    for (;;) {
      const n = readSync(fd, buf, got, buf.length - got, null);
      if (n === 0) break;
      got += n;
      if (got === buf.length) break;
    }
    if (got > FILE_MAX) return { rule: 'file/size' };
    bytes = buf.subarray(0, got);
  } catch {
    return { rule: 'file/unreadable' };
  } finally {
    closeSync(fd);
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { rule: 'file/utf8' };
  }
  if (text.charCodeAt(0) === 0xfeff) return { rule: 'file/bom' };
  if (text === '') return { rule: 'file/empty' };
  return { text };
}

/**
 * What the command line asks to post, checked: the repo, login, numbers,
 * branches and labels by their rules, and the body and title files read
 * strictly. A title file may end with one line break, which is not part of
 * the title. Returns { plan, refusals }; the plan is whole only when there
 * are no refusals.
 */
export function buildPlan(parsed) {
  const { surface, options } = parsed;
  const refusals = [];
  const plan = { surface, labels: [], draft: options.get('draft') === true, dryRun: options.get('dry-run') === true };
  const value = name => (typeof options.get(name) === 'string' ? options.get(name) : null);
  const refuse = (rule, name) => refusals.push({ rule, where: `option --${name}` });

  if (value('repo') !== null) {
    plan.repo = parseRepo(value('repo'));
    if (!plan.repo) refuse('input/repo', 'repo');
  }
  if (value('as') !== null) {
    if (isLogin(value('as'))) plan.as = value('as');
    else refuse('input/login', 'as');
  }
  for (const name of ['issue', 'pr', 'comment']) {
    if (value(name) === null) continue;
    if (isNumber(value(name))) plan[name] = value(name);
    else refuse('input/number', name);
  }
  if (value('base') !== null) {
    if (isBranch(value('base'))) plan.base = value('base');
    else refuse('input/branch', 'base');
  }
  if (value('head') !== null) {
    const head = value('head');
    const colon = head.indexOf(':');
    const owner = colon < 0 ? null : head.slice(0, colon);
    const branch = colon < 0 ? head : head.slice(colon + 1);
    if (!isBranch(branch) || (owner !== null && !isLogin(owner))) refuse('input/branch', 'head');
    else if (owner !== null && plan.repo && owner !== plan.repo.owner) refuse('owner/head', 'head');
    else plan.head = { sent: head, branch };
  }
  for (const label of options.get('label') ?? []) {
    if (isLabel(label)) plan.labels.push(label);
    else refuse('input/label', 'label');
  }
  if (value('body') !== null) {
    const r = readText(value('body'));
    if (r.rule) refuse(r.rule, 'body');
    else if (chars(r.text) > BODY_MAX) refuse('text/body-length', 'body');
    else plan.body = r.text;
  }
  if (value('title-file') !== null) {
    const r = readText(value('title-file'));
    if (r.rule) refuse(r.rule, 'title-file');
    else {
      const title = r.text.replace(/\r?\n$/, '');
      if (title === '') refuse('file/empty', 'title-file');
      else if (/[\r\n]/.test(title)) refuse('text/title-lines', 'title-file');
      else if (chars(title) > TITLE_MAX) refuse('text/title-length', 'title-file');
      else plan.title = title;
    }
  }
  return { plan, refusals };
}

// ---------------------------------------------------------------- the scan

const RULE = Object.freeze({
  token: 'secret/token',
  userinfo: 'secret/url-userinfo',
  env: 'secret/env',
  local: 'path/local',
  machine: 'path/machine',
  session: 'id/session',
  email: 'personal/email',
  hidden: 'text/hidden',
});

const TOKEN_RES = [
  /gh[pousr]_[A-Za-z0-9]{36}/g,
  /github_pat_[A-Za-z0-9_]{82}/g,
  /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/g,
  /(?:sk|rk)_live_[A-Za-z0-9]{10,}/g,
  /npm_[A-Za-z0-9]{36}/g,
  /glpat-[A-Za-z0-9_-]{20}/g,
  /AIza[0-9A-Za-z_-]{35}/g,
  /(?<![A-Z0-9])(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}(?![A-Z0-9])/g,
  /xox[abposr]-[A-Za-z0-9-]{10,}/g,
  /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g,
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/g,
  /(?:AccountKey|Password)=[^;\s'"`<>]+/gi,
];
// A password in a URL's user part: after an optional scheme, two slashes and a
// user name that may be empty. The lookbehind starts a scheme only where one
// can start, so a long run of text is tried once, not from every character.
const USERINFO_RE = /(?<![A-Za-z0-9+.-])(?:[A-Za-z][A-Za-z0-9+.-]*:)?\/\/[^\s/@:]*:[^\s/@]+@/g;
const LOCAL_RES = [
  /(?<![A-Za-z])[A-Za-z]:[\\/]/g,
  /\\\\[A-Za-z0-9._$-]+\\/g,
  /(?<![A-Za-z0-9._~-])\/(?:Users|home)\/[^\s/]+/g,
  // A Windows home as Git Bash (/c/Users/...) or WSL (/mnt/c/Users/...) writes it.
  /(?<![A-Za-z0-9._~-])\/(?:mnt\/)?[A-Za-z]\/(?:Users|home)\/[^\s/]+/g,
];
const SESSION_RES = [
  /(?<![0-9A-Fa-f])[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}(?![0-9A-Fa-f])/g,
  /session_[A-Za-z0-9]{16,}/g,
  /claude\.ai\/code\/session_/g,
];
// An address may follow a colon, as in a mail link, but not the password in a
// URL's user part: the look back skips exactly the shape secret/url-userinfo
// refuses. It is capped, so a long word of colons costs a bounded step at each.
const EMAIL_RE = /(?<![A-Za-z0-9._%+/-])(?<!\/\/[^\s/@:]{0,64}:)[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const EMAIL_OK = addr => addr.toLowerCase().endsWith('@users.noreply.github.com') || addr.toLowerCase() === 'noreply@anthropic.com';

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

// The harness's attribution, which a pull request body may end with. The robot
// is built from its code point, so this source stays plain ASCII.
const ROBOT = String.fromCodePoint(0x1f916);
const TRAILER_RE = new RegExp(`(?:^|\\n)${ROBOT} Generated with \\[Claude Code\\]\\(https://claude\\.com/claude-code\\)\\r?\\n\\r?\\n(https://claude\\.ai/code/session_[A-Za-z0-9]{16,40})(?:\\r?\\n)?$`, 'u');

/** The span of the trailer's session link, when `text` ends with the exact trailer; else null. */
export function trailerLink(text) {
  const m = text.match(TRAILER_RE);
  if (!m) return null;
  const start = m.index + m[0].indexOf(m[1]);
  return { start, end: start + m[1].length };
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A path written with either separator, as a pattern: each separator matches / or \. */
const anySep = p => p.split(/[\\/]/).map(escapeRe).join('[\\\\/]');

const matches = (text, re) => [...text.matchAll(re)].map(m => ({ index: m.index, text: m[0] }));

// Where a path can start: after a space, a quote, a bracket, an equals sign, a
// comma, a bar, or markdown's emphasis marks. A local path then starts with a
// drive letter, one or two slashes or backslashes, or a tilde and a separator;
// a web link starts with its scheme.
const TOKEN_START_RE = /[\s"'`(<[{=,|*_]/;
const LOCAL_START_RE = /^(?:[A-Za-z]:[\\/]|[\\/]{1,2}(?![\\/])|~[\\/])/;

/**
 * A test of whether an index lies inside a local path: the word it sits in
 * starts like one. Asked about rising indexes, it walks the text once, so
 * many hits in one long word cost no more than one.
 */
function inLocalPath(text) {
  let pos = 0;
  let start = 0;
  return index => {
    for (; pos < index; pos += 1) if (TOKEN_START_RE.test(text[pos])) start = pos + 1;
    return LOCAL_START_RE.test(text.slice(start, Math.min(index, start + 3)));
  };
}

/**
 * This machine's home and temp folders as a path prefix, and its user and host
 * names as a path segment. A name after a backslash counts anywhere: web links
 * have none, and Windows writes an account as host, backslash, user. A name
 * after a forward slash counts only inside a local path, since the user name is
 * often also the login in the owner's own repo links. The host name counts
 * after two slashes anywhere, as a link's host. The home folder also counts in
 * the dash-joined form Claude gives a project's folder.
 */
function machineHits(text, ctx) {
  const out = [];
  for (const p of [ctx.home, ctx.tmp]) {
    const trimmed = typeof p === 'string' ? p.replace(/[\\/]+$/, '') : '';
    // macOS writes its temp folder behind /private as well.
    if (trimmed !== '') out.push(...matches(text, new RegExp(`(?:(?<![A-Za-z0-9._-])|(?<=\\/private))${anySep(trimmed)}[\\\\/][^\\s]`, 'gi')));
  }
  const home = typeof ctx.home === 'string' ? ctx.home.replace(/[\\/]+$/, '') : '';
  // Only for a home two folders deep, so /root can't match "non-root".
  if (/[\\/][^\\/]+[\\/][^\\/]/.test(home)) out.push(...matches(text, new RegExp(`(?<![A-Za-z0-9])${escapeRe(home.replace(/[:\\/]/g, '-'))}(?![A-Za-z0-9._])`, 'gi')));
  for (const [n, isHost] of [[ctx.user, false], [ctx.host, true]]) {
    if (typeof n !== 'string' || n === '') continue;
    const local = inLocalPath(text);
    const keep = h => text[h.index - 1] === '\\' || (isHost && text[h.index - 2] === '/') || local(h.index);
    out.push(...matches(text, new RegExp(`(?<=[\\\\/])${escapeRe(n)}(?![A-Za-z0-9._-])`, 'gi')).filter(keep));
  }
  return out;
}

// Characters that make a reader see other text than a model reads: the tag
// block (but for a subdivision flag), the direction embeddings, overrides and
// isolates, the zero-width space and word joiners, the rarer variation
// selectors, and a byte-order mark inside the text. The joiners U+200C and
// U+200D and the selectors U+FE0E and U+FE0F stay, since ordinary emoji and
// scripts use them. Built from code points, so this source stays plain ASCII.
const cp = String.fromCodePoint;
const HIDDEN_RE = new RegExp(
  `[${cp(0xe0000)}-${cp(0xe007f)}${cp(0xe0100)}-${cp(0xe01ef)}${cp(0x202a)}-${cp(0x202e)}${cp(0x2066)}-${cp(0x2069)}` +
    `${cp(0x200b)}${cp(0x2060)}-${cp(0x2064)}${cp(0xfe00)}-${cp(0xfe0d)}${cp(0xfeff)}]`,
  'gu',
);
// A subdivision flag, such as Scotland's: the black flag, tag letters, and the cancel tag.
const FLAG_RE = new RegExp(`${cp(0x1f3f4)}[${cp(0xe0020)}-${cp(0xe007e)}]{1,8}${cp(0xe007f)}`, 'gu');

/** The hidden characters in `text`, but for those inside a subdivision flag. */
function hiddenHits(text) {
  const flags = [...text.matchAll(FLAG_RE)].map(m => [m.index, m.index + m[0].length]);
  return matches(text, HIDDEN_RE).filter(h => !flags.some(([s, e]) => h.index >= s && h.index < e));
}

function indexesOf(text, s) {
  const out = [];
  for (let i = text.indexOf(s); i >= 0; i = text.indexOf(s, i + 1)) out.push(i);
  return out;
}

/** Every hit in `text`: { rule, index, note }. The trailer's link is exempt from id/session only, on the surfaces that allow it. */
function hitsIn(text, ctx, trailer) {
  const hits = [];
  const add = (rule, list, note) => {
    for (const h of list) hits.push({ rule, index: h.index, note });
  };
  for (const re of TOKEN_RES) add(RULE.token, matches(text, re));
  add(RULE.userinfo, matches(text, USERINFO_RE));
  for (const [name, val] of envSecrets(ctx.env)) add(RULE.env, indexesOf(text, val).map(index => ({ index })), name);
  for (const re of LOCAL_RES) add(RULE.local, matches(text, re));
  add(RULE.machine, machineHits(text, ctx));
  add(RULE.hidden, hiddenHits(text));
  const link = trailer ? trailerLink(text) : null;
  for (const re of SESSION_RES) add(RULE.session, matches(text, re).filter(h => !(link && h.index >= link.start && h.index < link.end)));
  add(RULE.email, matches(text, EMAIL_RE).filter(h => !EMAIL_OK(h.text)));
  return hits.sort((a, b) => a.index - b.index);
}

const NAMED = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: String.fromCharCode(0xa0),
  lowbar: '_', hyphen: '-', dash: '-', period: '.', colon: ':', semi: ';', sol: '/', bsol: '\\',
  commat: '@', num: '#', excl: '!', equals: '=', plus: '+', percnt: '%', dollar: '$', tilde: '~',
  grave: '`', lpar: '(', rpar: ')', lsqb: '[', rsqb: ']', lcub: '{', rcub: '}', verbar: '|',
  ast: '*', quest: '?', tab: '\t', newline: '\n', zwj: '', zwnj: '', shy: '',
});

function decodeEntities(s) {
  return s.replace(/&(?:#([0-9]{1,7});?|#[xX]([0-9A-Fa-f]{1,6});?|([A-Za-z][A-Za-z0-9]{1,31});)/g, (all, dec, hex, name) => {
    if (name !== undefined) {
      const key = name.toLowerCase();
      return Object.hasOwn(NAMED, key) ? NAMED[key] : all;
    }
    const cp = dec !== undefined ? Number(dec) : parseInt(hex, 16);
    if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return all;
    return String.fromCodePoint(cp);
  });
}

const INVISIBLE_RE = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;
// A comment ends at --> or, as HTML parsers also read it, --!>.
const COMMENT_RE = /<!--[\s\S]*?(?:--!?>|$)/g;
const COMMENT_MARK_RE = /<!--|--!?>/g;
const ESCAPE_RE = /\\(?=[!-/:-@[-`{-~])/g;
const TAG_RE = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/g;

/** `s` with every match of `re` removed, again until none is left, since a removal can join two pieces into a new match. At most 50 passes. */
function removeAll(s, re) {
  let out = s;
  for (let pass = 0; pass < 50; pass += 1) {
    const next = out.replace(re, '');
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * The text as a reader sees it: invisible characters, markdown escapes and
 * inline tags removed, entities decoded and NFKC applied, repeated until
 * nothing changes, at most five rounds. HTML comments are removed with their
 * contents, as the page shows them; with `keepComments`, only their markers
 * go, as the source shows them.
 */
export function normalise(text, keepComments = false) {
  let s = text;
  for (let round = 0; round < 5; round += 1) {
    const unmarked = removeAll(s.replace(INVISIBLE_RE, ''), keepComments ? COMMENT_MARK_RE : COMMENT_RE);
    const next = decodeEntities(removeAll(unmarked.replace(ESCAPE_RE, ''), TAG_RE)).replace(INVISIBLE_RE, '').normalize('NFKC');
    if (next === s) break;
    s = next;
  }
  return s;
}

/**
 * Line and column, from 1, of `index` in `text`; the column in characters.
 * A line ends at a line feed, a carriage return or both, as CommonMark and the
 * table check end it.
 */
function lineCol(text, index) {
  const lines = text.slice(0, index).split(/\r\n|\r|\n/);
  return `${lines.length}:${chars(lines.at(-1)) + 1}`;
}

/**
 * Every content refusal in the fields to send ([{ field, text }]), as
 * [{ rule, where }]. Each field is scanned as is and as two normalised
 * copies, one without its HTML comments and one with their contents kept.
 * Each rule is reported once per field, at its first hit; a rule only a copy
 * trips gives its line and column in that copy, which can differ from the
 * file's. `where` names the field, the line
 * and column, and for secret/env the variable's name, never the text.
 */
export function scan(fields, ctx) {
  const out = [];
  const trailer = TRAILER_SURFACES.has(ctx.surface);
  for (const { field, text } of fields) {
    const seen = new Set();
    const isBody = field === 'body';
    for (const h of hitsIn(text, ctx, trailer && isBody)) {
      const key = `${h.rule} ${h.note ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ rule: h.rule, where: `${field} ${lineCol(text, h.index)}${h.note ? ` (${h.note})` : ''}` });
    }
    for (const norm of new Set([normalise(text), normalise(text, true)])) {
      if (norm === text) continue;
      for (const h of hitsIn(norm, ctx, trailer && isBody)) {
        const key = `${h.rule} ${h.note ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ rule: h.rule, where: `${field} ${lineCol(norm, h.index)} in the normalised copy${h.note ? ` (${h.note})` : ''}` });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- the Lens dispositions table

/**
 * The Lens dispositions table's shape, as the review procedure gives it: the
 * header row, the words a Disposition cell starts with, what follows
 * `skipped`, and what may follow ` (auto`. A test holds them equal to the
 * review procedure's.
 */
export const DISPOSITIONS = Object.freeze({
  header: Object.freeze(['Finding', 'Lens', 'Disposition', 'Rerun']),
  words: Object.freeze(['fixed', 'taken', 'dismissed', 'skipped', 'open']),
  skipped: ', because',
  auto: ' (auto',
  afterAuto: Object.freeze([':', ')', ', reversed']),
});

/** How many table refusals one run lists; the rest are counted. */
const TABLE_LISTED = 50;

const TABLE = Object.freeze({
  header: 'table/header',
  cells: 'table/cells',
  disposition: 'table/disposition',
  skipped: 'table/skipped',
  auto: 'table/auto',
});

// A fence as CommonMark reads it: a run of three or more backticks or tildes,
// indented by at most three spaces. A backtick run whose info string holds a
// backtick opens no fence. It closes on a run of the same character at least
// as long, with nothing after it but spaces or tabs. The info string matches
// any character, so the end of the line is always reached and a long run is
// never tried again shorter.
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})([^]*)$/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
// A line ends at a line feed, a carriage return, or both, as CommonMark reads it.
const LINE_END_RE = /\r\n|\r|\n/;
const TABLE_LABEL_RE = /lens\s+dispositions/i;
const DELIMITER_RE = /^[ \t]*:?-+:?[ \t]*$/;
const LETTER_RE = /\p{L}/u;
const AUTO_WORD_END_RE = /[\p{L}-]/u;

/**
 * A table line's cells, split at each pipe no backslash escapes, each as
 * { text, col }: its column from 1, in characters, at its first character that
 * is not a space, or at its start when it is empty. A closing pipe ends the
 * last cell. Null for a line that doesn't start with a pipe after at most
 * three spaces. The column is counted as the loop goes, so a line costs no
 * more than its length.
 */
function tableCells(line) {
  const lead = line.match(/^ {0,3}\|/);
  if (!lead) return null;
  const out = [];
  let start = lead[0].length;
  // Characters before index i, and before the current cell; everything before the first cell is one code unit each.
  let before = start;
  let cellBefore = start;
  for (let i = start; i <= line.length; i += 1) {
    if (i === line.length || (line[i] === '|' && line[i - 1] !== '\\')) {
      const text = line.slice(start, i);
      const trimmed = text.trim();
      // Leading spaces are one code unit each, so their count is a count of characters.
      const pad = trimmed === '' ? 0 : text.length - text.trimStart().length;
      out.push({ text: trimmed, col: cellBefore + pad + 1 });
      start = i + 1;
      cellBefore = before + 1;
    }
    // A low surrogate ends a character its high surrogate already counted.
    if (i < line.length && (line.charCodeAt(i) & 0xfc00) !== 0xdc00) before += 1;
  }
  // A line that ends with a pipe leaves an empty piece after it.
  if (out.length > 1 && /(?:^|[^\\])\|[ \t]*$/.test(line)) out.pop();
  return out;
}

/** Whether a table line's cells are a delimiter row, as `| --- | :-: |`. */
const isDelimiter = cells => cells.every(c => DELIMITER_RE.test(c.text));

/**
 * The refusals one row's Disposition cell earns. ` (auto` is the auto mark
 * only where the word ends there, so reason text such as "(automatically)" is
 * left alone (q3 on #285).
 */
function dispositionRules(cell) {
  const out = [];
  const word = DISPOSITIONS.words.find(w => cell.startsWith(w) && !LETTER_RE.test(cell[w.length] ?? ''));
  if (word === undefined) out.push(TABLE.disposition);
  else if (word === 'skipped' && !cell.startsWith(DISPOSITIONS.skipped, word.length)) out.push(TABLE.skipped);
  for (let i = cell.indexOf(DISPOSITIONS.auto); i >= 0; i = cell.indexOf(DISPOSITIONS.auto, i + 1)) {
    const at = i + DISPOSITIONS.auto.length;
    if (AUTO_WORD_END_RE.test(cell[at] ?? '')) continue;
    if (!DISPOSITIONS.afterAuto.some(a => cell.startsWith(a, at))) {
      out.push(TABLE.auto);
      break;
    }
  }
  return out;
}

/**
 * Each place a Lens dispositions table in `body` breaks the review
 * procedure's template, as [{ rule, where }]. It reads every line outside a
 * fence, folds included, with lines ending as CommonMark ends them. A table's
 * header is the pipe line straight before a delimiter row, as GitHub reads
 * it, and only that line is the delimiter row. A table is checked when a
 * header cell reads `Disposition`, ignoring case and `**`, under an earlier
 * line naming "Lens dispositions". A header other than the template's is
 * refused, and its rows are not read. It reads nothing else: not the reason
 * text, not an empty Finding cell, not the Rerun cell, and no other table.
 * `where` names the line and column, never a cell. One pass over the lines,
 * with no pattern that can backtrack without bound.
 */
export function tableCheck(body) {
  const out = [];
  let fence = null;
  let label = false;
  let inTable = false;
  let checking = false;
  const lines = body.split(LINE_END_RE);
  // Each line's cells are read once, though a line is looked at twice: as the next line, then as itself.
  let peek = { n: -1, cells: null };
  const cellsAt = k => (peek.n === k ? peek.cells : (peek = { n: k, cells: k < lines.length ? tableCells(lines[k]) : null }).cells);
  for (let n = 0; n < lines.length; n += 1) {
    const line = lines[n];
    const refuse = (rule, col) => out.push({ rule, where: `body ${n + 1}:${col}` });
    if (fence !== null) {
      const close = line.match(FENCE_CLOSE_RE);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      continue;
    }
    const open = line.match(FENCE_OPEN_RE);
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
      fence = open[1];
      inTable = false;
      continue;
    }
    const cells = cellsAt(n);
    if (cells === null) {
      inTable = false;
      if (TABLE_LABEL_RE.test(line)) label = true;
      continue;
    }
    if (!inTable) {
      // A pipe line with no delimiter row after it is a paragraph line, not a table.
      const next = cellsAt(n + 1);
      if (next === null || !isDelimiter(next)) continue;
      inTable = true;
      n += 1;
      checking = label && cells.some(c => c.text.replaceAll('**', '').trim().toLowerCase() === 'disposition');
      if (!checking) continue;
      const names = cells.map(c => c.text.replace(/[ \t]+/g, ' ').toLowerCase());
      if (names.length !== DISPOSITIONS.header.length || names.some((x, i) => x !== DISPOSITIONS.header[i].toLowerCase())) {
        refuse(TABLE.header, 1);
        checking = false;
      }
      continue;
    }
    if (!checking) continue;
    if (cells.length !== DISPOSITIONS.header.length) {
      refuse(TABLE.cells, 1);
      continue;
    }
    if (cells[1].text === '') refuse(TABLE.cells, cells[1].col);
    for (const rule of dispositionRules(cells[2].text)) refuse(rule, cells[2].col);
  }
  return out;
}

// ---------------------------------------------------------------- gh

/** The environment gh runs with: the caller's, without GH_DEBUG or DEBUG in any case. */
export function ghEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env ?? {})) {
    const upper = k.toUpperCase();
    if (upper !== 'GH_DEBUG' && upper !== 'DEBUG') out[k] = v;
  }
  return out;
}

/** The value of `name` in `env`, matched without regard to case, as Windows reads it; '' when unset. */
function envValue(env, name) {
  for (const [k, v] of Object.entries(env ?? {})) if (k.toUpperCase() === name && typeof v === 'string' && v !== '') return v;
  return '';
}

/**
 * A gh runner: each call runs gh with `args` and `input` on standard input,
 * from a new, empty folder under `tmp` that is removed afterwards, so a file
 * planted in the caller's folder can't run as gh. `run` stands in for the
 * process call in tests. Returns { ok, stdout, stderr }.
 */
export function makeGh({ env, tmp, run }) {
  const clean = ghEnv(env);
  const call = run ?? ((args, opts) => spawnSync('gh', args, opts));
  return (args, input) => {
    const cwd = mkdtempSync(join(tmp, 'pact-poster-'));
    try {
      const r = call(args, { cwd, env: clean, input: input ?? '', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
      return { ok: !r.error && r.status === 0, stdout: typeof r.stdout === 'string' ? r.stdout : '', stderr: typeof r.stderr === 'string' ? r.stderr : '' };
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  };
}

const ghArgs = (method, path, withInput) => ['api', '--hostname', 'github.com', '--method', method, path, ...(withInput ? ['--input', '-'] : [])];

/**
 * gh's stderr as one line: its first line, JSON-escaped and capped. A line
 * that trips a scan rule, such as one naming a local config path, is withheld
 * and only the rule is named.
 */
export function saidLine(stderr, ctx) {
  const line = String(stderr ?? '').split(/\r?\n/)[0].slice(0, 300);
  const rules = [...new Set(scan([{ field: 'stderr', text: line }], { ...ctx, surface: null }).map(r => r.rule))];
  return rules.length ? `gh said: (withheld: ${rules.join(', ')})` : `gh said: ${JSON.stringify(line)}`;
}

/** A JSON answer, or undefined; never an error message, which would quote the answer. */
function parseJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- the NEXT line

/**
 * The line a session reads after exit 3, where the post may have landed: the
 * page to look at and the login the poster checked, both known before it
 * sent, never text from gh or the body.
 */
const failedNext = (page, login) => `NEXT: the post may have landed. Look at ${page} for a post by ${login} before anything else. If it is there, never post it again: tell the owner its link. If it isn't, tell the owner, and post again only on their word. If you can't tell, tell the owner, and don't post.`;

/** The line after exit 1, where the post landed: the form says what the address below it is, the post's link, or only the page it sits on. */
const landedNext = form => `NEXT: the post landed. Never post it again. Tell the owner, with ${form}.`;
const LANDED_LINK = landedNext('the link below');
const LANDED_PAGE = landedNext('the page below, where it sits');
const LANDED_MISMATCH = landedNext('the link below and the fields named above');

// ---------------------------------------------------------------- one post

/** The post call, the request it sends, and how its answer is read back and named. */
function postOf(plan) {
  const repo = `repos/${plan.repo.owner}/${plan.repo.name}`;
  const web = `https://github.com/${plan.repo.owner}/${plan.repo.name}`;
  switch (plan.surface) {
    case 'issue':
      return {
        path: `${repo}/issues`,
        request: { title: plan.title, body: plan.body, ...(plan.labels.length ? { labels: plan.labels } : {}) },
        key: 'number',
        read: id => `${repo}/issues/${id}`,
        url: id => `${web}/issues/${id}`,
        near: `${web}/issues`,
      };
    case 'pull-request':
      return {
        path: `${repo}/pulls`,
        request: { title: plan.title, body: plan.body, head: plan.head.sent, base: plan.base, draft: plan.draft },
        key: 'number',
        read: id => `${repo}/pulls/${id}`,
        url: id => `${web}/pull/${id}`,
        near: `${web}/pulls`,
      };
    case 'issue-comment':
      return {
        path: `${repo}/issues/${plan.issue}/comments`,
        request: { body: plan.body },
        key: 'id',
        read: id => `${repo}/issues/comments/${id}`,
        url: id => `${web}/issues/${plan.issue}#issuecomment-${id}`,
        near: `${web}/issues/${plan.issue}`,
      };
    case 'pull-request-review':
      return {
        path: `${repo}/pulls/${plan.pr}/reviews`,
        request: { body: plan.body, event: 'COMMENT' },
        key: 'id',
        read: id => `${repo}/pulls/${plan.pr}/reviews/${id}`,
        url: id => `${web}/pull/${plan.pr}#pullrequestreview-${id}`,
        near: `${web}/pull/${plan.pr}`,
      };
    case 'review-thread-reply':
      return {
        path: `${repo}/pulls/${plan.pr}/comments/${plan.comment}/replies`,
        request: { body: plan.body },
        key: 'id',
        read: id => `${repo}/pulls/comments/${id}`,
        url: id => `${web}/pull/${plan.pr}#discussion_r${id}`,
        near: `${web}/pull/${plan.pr}`,
      };
    default:
      throw new TypeError('no such surface');
  }
}

/** Where two texts first differ, and both sizes, in characters; null when they are equal. */
export function difference(sent, back) {
  if (sent === back) return null;
  const a = [...sent];
  const b = [...back];
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return `first difference at character ${i + 1}; sent ${a.length} characters, read back ${b.length} characters`;
}

/**
 * The read-back checked against what was sent: { unusable, mismatches, notes },
 * each a list of lines that name a field and never show its text. A field of
 * the wrong type makes the read-back unusable.
 */
export function compare(plan, request, back, login, id, key) {
  const mismatches = [];
  const notes = [];
  const unusable = [];
  const text = (field, sent, got) => {
    if (typeof got !== 'string') unusable.push(field);
    else {
      const d = difference(sent, got);
      if (d) mismatches.push(`MISMATCH ${field}: ${d}`);
    }
  };
  if (back === null || typeof back !== 'object' || Array.isArray(back)) return { unusable: ['answer'], mismatches, notes };
  if (idText(back[key]) !== id) mismatches.push(`MISMATCH ${key}: the read-back is another item`);
  text('body', request.body, back.body);
  text('author', login, back.user?.login);
  if ('title' in request) text('title', request.title, back.title);
  if (plan.surface === 'issue') {
    const got = Array.isArray(back.labels) ? back.labels.map(l => l?.name) : null;
    if (!got || got.some(n => typeof n !== 'string')) unusable.push('labels');
    else {
      const lower = new Set(got.map(n => n.toLowerCase()));
      const sentLower = new Set(plan.labels.map(n => n.toLowerCase()));
      const missing = plan.labels.filter(n => !lower.has(n.toLowerCase())).length;
      const extra = got.filter(n => !sentLower.has(n.toLowerCase())).length;
      if (missing || extra) mismatches.push(`MISMATCH labels: ${missing} sent missing, ${extra} not sent`);
      const recased = plan.labels.filter(n => lower.has(n.toLowerCase()) && !got.includes(n)).length;
      if (recased) notes.push(`NOTE labels: ${recased} came back in another capitalisation`);
    }
  }
  if (plan.surface === 'pull-request') {
    text('base', plan.base, back.base?.ref);
    text('head', plan.head.branch, back.head?.ref);
    // A repo name is matched without regard to case, as GitHub matches it; the owner was checked exactly before posting.
    const repo = back.head?.repo?.full_name;
    text('head repo', `${plan.repo.owner}/${plan.repo.name}`.toLowerCase(), typeof repo === 'string' ? repo.toLowerCase() : repo);
    if (typeof back.draft !== 'boolean') unusable.push('draft');
    else if (back.draft !== plan.draft) mismatches.push(`MISMATCH draft: sent ${plan.draft ? 'a draft' : 'not a draft'}, read back ${back.draft ? 'a draft' : 'not a draft'}`);
  }
  // Where it landed: the issue or pull request it sits on, the thread it
  // answers, and a review's state. Its API address is matched without regard
  // to case, as GitHub matches it.
  const repo = `/repos/${plan.repo.owner}/${plan.repo.name}`.toLowerCase();
  const on = (field, url, path) => {
    if (typeof url !== 'string') unusable.push(field);
    else if (!url.toLowerCase().endsWith(`${repo}/${path}`)) mismatches.push(`MISMATCH ${field}: it sits on another item`);
  };
  if (plan.surface === 'issue-comment') on('target', back.issue_url, `issues/${plan.issue}`);
  if (plan.surface === 'pull-request-review' || plan.surface === 'review-thread-reply') on('target', back.pull_request_url, `pulls/${plan.pr}`);
  if (plan.surface === 'pull-request-review') {
    if (typeof back.state !== 'string') unusable.push('state');
    else if (back.state !== 'COMMENTED') mismatches.push('MISMATCH state: the review is not a comment');
  }
  if (plan.surface === 'review-thread-reply' && idText(back.in_reply_to_id) !== plan.comment) mismatches.push('MISMATCH thread: it answers another comment');
  return { unusable, mismatches, notes };
}

/** The request with every text replaced by its size, for a dry run. */
function sizes(v) {
  if (typeof v === 'string') return `<${chars(v)} characters>`;
  if (Array.isArray(v)) return v.map(sizes);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sizes(x)]));
  return v;
}

const refused = refusals => ({ code: 2, lines: [...refusals.map(r => `REFUSED ${r.rule} ${r.where}`), `RESULT: refused ${refusals.length}`] });

/**
 * One run of the poster: `argv` after the script's name, and `io` holding
 * gh(args, input) => { ok, stdout, stderr }, env, home, tmp, user and host.
 * Returns { code, lines }; the last line is always the RESULT line.
 */
export function post(argv, io) {
  let phase = 'before';
  let near = '';
  // Held out here for the catch. The login is set only once it has passed every check, the link only once the post's id is read.
  let checkedLogin = null;
  let linked = false;
  try {
    const parsed = parseArgs(argv);
    if (parsed.refusals.length) return refused(parsed.refusals);
    const { plan, refusals } = buildPlan(parsed);
    if (refusals.length) return refused(refusals);
    const fields = [];
    if (plan.title !== undefined) fields.push({ field: 'title', text: plan.title });
    plan.labels.forEach((text, i) => fields.push({ field: `label ${i + 1}`, text }));
    fields.push({ field: 'body', text: plan.body });
    const ctx = { env: io.env, home: io.home, tmp: io.tmp, user: io.user, host: io.host };
    // The table check runs after the secret scan, on the body only. Past the
    // first fifty, its refusals are counted, not listed, so the result line
    // stays in view.
    const hits = scan(fields, { ...ctx, surface: plan.surface });
    const tables = tableCheck(plan.body);
    if (tables.length > TABLE_LISTED) {
      const r = refused([...hits, ...tables.slice(0, TABLE_LISTED)]);
      return { code: 2, lines: [...r.lines.slice(0, -1), `NOTE: ${tables.length - TABLE_LISTED} more table refusals not listed`, `RESULT: refused ${hits.length + tables.length}`] };
    }
    if (hits.length || tables.length) return refused([...hits, ...tables]);

    const p = postOf(plan);
    near = p.near;
    const args = ghArgs('POST', p.path, true);
    if (plan.dryRun) return { code: 0, lines: [`gh ${args.join(' ')}`, `request: ${JSON.stringify(sizes(p.request))}`, `RESULT: dry-run ${plan.surface}`] };

    const token = envValue(io.env, 'GH_TOKEN') || envValue(io.env, 'GITHUB_TOKEN');
    if (token && plan.as === undefined) return refused([{ rule: 'as/missing', where: 'option --as' }]);

    const who = io.gh(ghArgs('GET', 'user', false));
    const login = who.ok ? parseJson(who.stdout)?.login : undefined;
    if (!isLogin(login)) return { code: 4, lines: [...(who.ok ? ['the login read gave no login'] : [saidLine(who.stderr, ctx)]), 'RESULT: unavailable'] };
    const wrong = [];
    if (plan.as !== undefined && plan.as !== login) wrong.push({ rule: 'as/differs', where: 'option --as' });
    if (plan.repo.owner !== login) wrong.push({ rule: 'owner/repo', where: 'option --repo' });
    if (wrong.length) return refused(wrong);

    // The owner GitHub gives for the repo, which follows a rename or a
    // transfer, so a name the login once owned can't carry a post elsewhere.
    const repoRead = io.gh(ghArgs('GET', `repos/${plan.repo.owner}/${plan.repo.name}`, false));
    const owner = repoRead.ok ? parseJson(repoRead.stdout)?.owner?.login : undefined;
    if (!isLogin(owner)) return { code: 4, lines: [...(repoRead.ok ? ['the repo read gave no owner'] : [saidLine(repoRead.stderr, ctx)]), 'RESULT: unavailable'] };
    if (owner !== login) return refused([{ rule: 'owner/github', where: 'option --repo' }]);
    checkedLogin = login;

    phase = 'sending';
    const sent = io.gh(args, JSON.stringify(p.request));
    if (!sent.ok) return { code: 3, lines: [saidLine(sent.stderr, ctx), failedNext(near, login), 'RESULT: failed'] };
    phase = 'sent';
    const id = idText(parseJson(sent.stdout)?.[p.key]);
    if (id === null) return { code: 1, lines: [`the answer carried no usable ${p.key}`, LANDED_PAGE, `RESULT: unverified ${near}`] };
    const url = p.url(id);
    near = url;
    linked = true;
    const read = io.gh(ghArgs('GET', p.read(id), false));
    if (!read.ok) return { code: 1, lines: [saidLine(read.stderr, ctx), LANDED_LINK, `RESULT: unverified ${url}`] };
    const back = parseJson(read.stdout);
    const c = compare(plan, p.request, back, login, id, p.key);
    if (c.unusable.length) return { code: 1, lines: [`the read-back could not be read: ${c.unusable.join(', ')}`, LANDED_LINK, `RESULT: unverified ${url}`] };
    if (c.mismatches.length) return { code: 1, lines: [...c.mismatches, ...c.notes, LANDED_MISMATCH, `RESULT: mismatch ${url}`] };
    return { code: 0, lines: [...c.notes, `RESULT: verified ${plan.surface} ${url} as ${login}`] };
  } catch {
    if (phase === 'before') return { code: 4, lines: ['the poster failed before sending', 'RESULT: unavailable'] };
    if (phase === 'sending') return { code: 3, lines: ['the post call failed', failedNext(near, checkedLogin), 'RESULT: failed'] };
    return { code: 1, lines: ['the poster failed after sending', linked ? LANDED_LINK : LANDED_PAGE, `RESULT: unverified ${near}`] };
  }
}

// ---------------------------------------------------------------- main

function main() {
  let user = '';
  try {
    user = userInfo().username;
  } catch {
    user = '';
  }
  const env = { ...process.env };
  const tmp = tmpdir();
  const r = post(process.argv.slice(2), { gh: makeGh({ env, tmp }), env, home: homedir(), tmp, user, host: hostname() });
  process.stdout.write(`${r.lines.join('\n')}\n`);
  process.exitCode = r.code;
}

/** Whether this file is the entry script. Node added import.meta.main in 24.2; an earlier Node 24 compares the real paths instead. */
function isEntry() {
  if (typeof import.meta.main === 'boolean') return import.meta.main;
  try {
    return typeof process.argv[1] === 'string' && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntry()) main();
