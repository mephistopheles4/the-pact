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
//   the edits (#413), each with --reason <file> --signed <label>:
//     issue-edit                --issue <n>
//     pull-request-edit         --pr <n>
//     issue-comment-edit        --issue <n> --comment <id of the comment edited>
//     review-thread-reply-edit  --pr <n> --comment <id of the reply edited>
//
//   everywhere: --dry-run   prints the gh arguments and the request's sizes, sends nothing
//
// An edit reads the item first and refuses one its login didn't write, one
// not signed `Signed: <label>` or `Posted by <label>.`, a review record, a
// decision mark, an item holding a leak the scan finds, and a body that
// drops, forges or hides an earlier reason line. It sends the session's body
// with `Edited: <reason> (<label>)` after it.
//
// Every piece of free text comes from a file, so no prose reaches a command
// line. Before anything is sent it checks every option and file, and scans the
// exact text it would send for credential shapes, environment secrets, email
// addresses and hidden text; it refuses no path or session id (#326, #364,
// #366).
// Then it checks the shape of any Lens dispositions table in the body against
// the review procedure's template (#280, T2), and refuses a body whose prose is
// hard-wrapped, whose link has no scheme (#317, text/hard-wrap and
// link/relative) or that leaves a fence open (#401, fence/unclosed); it never
// rewrites a body. Before it posts, it checks that the repo's
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
// function that takes gh and the environment as inputs, so its tests need no
// gh and no network. Only main reads the real values, and main runs only when
// this file is the entry script.

import { spawnSync } from 'node:child_process';
import { closeSync, fstatSync, lstatSync, mkdtempSync, openSync, readSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  'issue-edit': { options: ['issue', 'reason', 'signed'], needs: ['issue', 'reason', 'signed'] },
  'pull-request-edit': { options: ['pr', 'reason', 'signed'], needs: ['pr', 'reason', 'signed'] },
  'issue-comment-edit': { options: ['issue', 'comment', 'reason', 'signed'], needs: ['issue', 'comment', 'reason', 'signed'] },
  'review-thread-reply-edit': { options: ['pr', 'comment', 'reason', 'signed'], needs: ['pr', 'comment', 'reason', 'signed'] },
});

/** The surfaces that edit a body the poster's login already posted (#413). */
const EDITS = new Set(['issue-edit', 'pull-request-edit', 'issue-comment-edit', 'review-thread-reply-edit']);
export const isEdit = surface => EDITS.has(surface);

/** The documented command line for each surface, after `node poster.mjs`. */
export const EXAMPLES = Object.freeze({
  issue: 'issue --repo you/your-repo --title-file title.txt --body body.md --label bug',
  'pull-request': 'pull-request --repo you/your-repo --title-file title.txt --body body.md --head my-branch --base main --draft',
  'issue-comment': 'issue-comment --repo you/your-repo --body comment.md --issue 12 --as you',
  'pull-request-review': 'pull-request-review --repo you/your-repo --body review.md --pr 34',
  'review-thread-reply': 'review-thread-reply --repo you/your-repo --body reply.md --pr 34 --comment 5678',
  'issue-edit': 'issue-edit --repo you/your-repo --body body.md --reason reason.txt --signed build-12 --issue 12',
  'pull-request-edit': 'pull-request-edit --repo you/your-repo --body body.md --reason reason.txt --signed build-12 --pr 34',
  'issue-comment-edit': 'issue-comment-edit --repo you/your-repo --body comment.md --reason reason.txt --signed build-12 --issue 12 --comment 4321',
  'review-thread-reply-edit': 'review-thread-reply-edit --repo you/your-repo --body reply.md --reason reason.txt --signed build-12 --pr 34 --comment 8765',
});

const FILE_MAX = 256 * 1024;
const BODY_MAX = 65536;
const TITLE_MAX = 256;
const REASON_MAX = 200;

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
const SIGNED_RE = /^[a-z0-9][a-z0-9-]{0,49}$/;

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
export const isSigned = s => typeof s === 'string' && SIGNED_RE.test(s);

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
  if (value('signed') !== null) {
    if (isSigned(value('signed'))) plan.signed = value('signed');
    else refuse('input/signed', 'signed');
  }
  if (value('reason') !== null) {
    const r = readText(value('reason'));
    if (r.rule) refuse(r.rule, 'reason');
    else {
      const reason = r.text.replace(/\r?\n$/, '');
      if (reason.replace(/\p{Cf}/gu, '').trim() === '') refuse('file/empty', 'reason');
      else if (/[\r\n]/.test(reason)) refuse('text/reason-lines', 'reason');
      else if (chars(reason) > REASON_MAX) refuse('text/reason-length', 'reason');
      else plan.reason = reason;
    }
  }
  // An edit sends the session's body with its reason line after it (#413);
  // the body as the session wrote it stays for the append-only check.
  if (isEdit(surface) && plan.body !== undefined && plan.reason !== undefined && plan.signed !== undefined) {
    plan.sessionBody = plan.body;
    plan.body = composeEdit(plan.body, plan.reason, plan.signed);
    if (chars(plan.body) > BODY_MAX) {
      refuse('text/body-length', 'body');
      delete plan.body;
    }
  }
  return { plan, refusals };
}

// ---------------------------------------------------------------- the scan

const RULE = Object.freeze({
  token: 'secret/token',
  userinfo: 'secret/url-userinfo',
  env: 'secret/env',
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

const matches = (text, re) => [...text.matchAll(re)].map(m => ({ index: m.index, text: m[0] }));

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

/** Every hit in `text`: { rule, index, note }. */
function hitsIn(text, ctx) {
  const hits = [];
  const add = (rule, list, note) => {
    for (const h of list) hits.push({ rule, index: h.index, note });
  };
  for (const re of TOKEN_RES) add(RULE.token, matches(text, re));
  add(RULE.userinfo, matches(text, USERINFO_RE));
  for (const [name, val] of envSecrets(ctx.env)) add(RULE.env, indexesOf(text, val).map(index => ({ index })), name);
  add(RULE.hidden, hiddenHits(text));
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
  for (const { field, text } of fields) {
    const seen = new Set();
    for (const h of hitsIn(text, ctx)) {
      const key = `${h.rule} ${h.note ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ rule: h.rule, where: `${field} ${lineCol(text, h.index)}${h.note ? ` (${h.note})` : ''}` });
    }
    for (const norm of new Set([normalise(text), normalise(text, true)])) {
      if (norm === text) continue;
      for (const h of hitsIn(norm, ctx)) {
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
 * header row, the state words a Finding cell starts with, the words a
 * Disposition cell starts with, what follows `skipped`, and what may follow
 * ` (auto`. A test holds them equal to the review procedure's.
 */
export const DISPOSITIONS = Object.freeze({
  header: Object.freeze(['Finding', 'Lens', 'Disposition', 'Rerun']),
  states: Object.freeze(['new', 'updated', 'unchanged', 'absent']),
  words: Object.freeze(['fixed', 'taken', 'dismissed', 'skipped', 'open', 'noted']),
  skipped: ', because',
  auto: ' (auto',
  afterAuto: Object.freeze([':', ')', ', reversed']),
});

/** The whole Finding cell of a row for a report kept local; it takes no state word (#336). */
const WITHHELD = 'withheld, see chat';

/** The whole Disposition cell a withheld row may have: one bare word, never `noted` (#336). */
const WITHHELD_WORDS = Object.freeze(['open', 'fixed', 'taken', 'dismissed']);

/** How many table refusals one run lists; the rest are counted. */
const TABLE_LISTED = 50;

const TABLE = Object.freeze({
  header: 'table/header',
  cells: 'table/cells',
  disposition: 'table/disposition',
  skipped: 'table/skipped',
  auto: 'table/auto',
  state: 'table/state',
});

// A fence as CommonMark reads it: a run of three or more backticks or tildes,
// indented by at most three spaces. A backtick run whose info string holds a
// backtick opens no fence. It closes on a run of the same character at least
// as long, with nothing after it but spaces or tabs. The info string matches
// any character, so the end of the line is always reached and a long run is
// never tried again shorter.
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})([^]*)$/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/** The fence `line` opens, as [run, info], or null. The table check and the fence check read fences through these two alone. */
function fenceOpens(line) {
  const open = line.match(FENCE_OPEN_RE);
  return open && !(open[1][0] === '`' && open[2].includes('`')) ? [open[1], open[2]] : null;
}

/** Whether `line` closes the fence opened by the run `fence`. */
function fenceCloses(fence, line) {
  const close = line.match(FENCE_CLOSE_RE);
  return close !== null && close[1][0] === fence[0] && close[1].length >= fence.length;
}

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

/** The word of `words` that `cell` starts with, ending at a character that isn't a letter or at the cell's end. */
const leadWord = (words, cell) => words.find(w => cell.startsWith(w) && !LETTER_RE.test(cell[w.length] ?? ''));

/**
 * Whether the text after a Finding cell's lead state word opens with the word
 * "withheld", whatever its case, spacing, punctuation or markup (#336). The
 * text is read as written and as the two normalised copies `scan` reads, so
 * a form that renders as the word is matched (#392) and a word the page
 * hides in a comment or tag still is; two more copies fold links to their
 * text, one each way below (#396), and drop emphasis and code span marks,
 * which can split the word on the page. A finding that quotes the withheld text after other words is not
 * matched.
 */
function withheldAfter(cell, state) {
  const after = cell.slice(state.length);
  const shown = normalise(after);
  // Two link folds, each bounded: one whose address holds no parenthesis (any quote is an address character), and one whose address may hold one level of parentheses and a quoted title; each alternative starts on its own character, so neither match can backtrack without bound.
  const fold = re => shown.replace(re, '$1').replace(/[*_`~[\]]/g, '');
  const plain = fold(/!?\[([^[\]]*)\](?:\([^()]*\)|\[[^[\]]*\])?/g);
  const nested = fold(/!?\[([^[\]]*)\](?:\((?:[^()"']|\([^()]*\)|"[^"]*"|'[^']*')*\)|\[[^[\]]*\])?/g);
  return [after.replace(/\p{Cf}/gu, ''), shown, normalise(after, true), plain, nested].some(view => {
    const rest = view.replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase();
    return rest.startsWith('withheld') && !LETTER_RE.test(rest['withheld'.length] ?? '');
  });
}

/**
 * The refusals one row's Disposition cell earns. ` (auto` is the auto mark
 * only where the word ends there, so reason text such as "(automatically)" is
 * left alone (q3 on #285).
 */
function dispositionRules(cell) {
  const out = [];
  const word = leadWord(DISPOSITIONS.words, cell);
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
 * refused, and its rows are not read. A Finding cell must start with a state
 * word, unless the row is `skipped` or the cell is exactly the withheld text,
 * and the word "withheld" never follows a state word, in any case or markup;
 * a withheld row's Disposition cell is one bare word, never `noted` (#336). It
 * reads nothing else: not the reason text, not a `skipped` row's Finding
 * cell, not the Rerun cell, and no other table.
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
      if (fenceCloses(fence, line)) fence = null;
      continue;
    }
    const open = fenceOpens(line);
    if (open) {
      fence = open[0];
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
    const finding = cells[0].text;
    const state = leadWord(DISPOSITIONS.states, finding);
    // A withheld row takes no state word: one there would tell readers whether the held-back item is at the base.
    if (leadWord(DISPOSITIONS.words, cells[2].text) !== 'skipped' && finding !== WITHHELD && (state === undefined || withheldAfter(finding, state))) refuse(TABLE.state, cells[0].col);
    if (cells[1].text === '') refuse(TABLE.cells, cells[1].col);
    const dispositions = dispositionRules(cells[2].text);
    for (const rule of dispositions) refuse(rule, cells[2].col);
    if (finding === WITHHELD && !dispositions.includes(TABLE.disposition) && !WITHHELD_WORDS.includes(cells[2].text)) refuse(TABLE.disposition, cells[2].col);
  }
  return out;
}

// A line no diagram holds: a fence run, or a fold's tag. In a `mermaid` fence it means the fence was left open.
const DIAGRAM_END_RE = /^ {0,3}(?:`{3,}|~{3,}|<\/?details[\s>])/i;

/**
 * A fence left open in `body`, as [{ rule, where }]: one fence/unclosed at
 * the line and column of its opening run, or nothing. A fence is left open
 * when the body ends inside it, or when a `mermaid` fence runs into a line no
 * diagram holds, another fence or a fold's tag. It reads fences as the table
 * check does, so a fence it reports is one that hid what followed it, folds
 * and table included, from that check and from the reader (#401).
 */
export function fenceCheck(body) {
  let fence = null;
  let diagram = false;
  let where = '';
  const lines = body.split(LINE_END_RE);
  for (let n = 0; n < lines.length; n += 1) {
    const line = lines[n];
    if (fence !== null) {
      if (fenceCloses(fence, line)) fence = null;
      else if (diagram && DIAGRAM_END_RE.test(line)) return [{ rule: 'fence/unclosed', where }];
      continue;
    }
    const open = fenceOpens(line);
    if (open) {
      fence = open[0];
      diagram = open[1].trim().split(/[ \t]/)[0].toLowerCase() === 'mermaid';
      where = `body ${n + 1}:${line.indexOf(fence[0]) + 1}`;
    }
  }
  return fence === null ? [] : [{ rule: 'fence/unclosed', where }];
}

// ---------------------------------------------------------------- the prose checks

const PROSE = Object.freeze({ wrap: 'text/hard-wrap', link: 'link/relative' });

// A fence for these checks: a run of three or more backticks or tildes at any
// indent, whatever follows it, closed by a run of the same character at least
// as long with nothing after it but spaces or tabs. Looser than the table
// check's twice over, so a fence-like line mostly means fewer refusals.
const PROSE_FENCE_OPEN_RE = /^[ \t]*(`{3,}|~{3,})/;
const PROSE_FENCE_CLOSE_RE = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;
const QUOTE_RE = /^(?:[ ]{0,3}>[ ]?)+/;
const OWN_BLOCK_RE = /^(?:[ ]{0,3}#{1,6}(?:[ \t]|$)|[ \t]*\||[ ]{0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$|[ \t]*<[A-Za-z/!]|[ ]{0,3}\[[^\]]*\]:|[ ]{0,3}\[!\w+\][ \t]*$)/;
const LIST_MARKER_RE = /^[ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
const REF_DEF_RE = /^[ ]{0,3}\[([^\]]*)\]:[ \t]*(<[^>]*>|\S*)/;
const HTML_ATTR_RE = /\b(?:href|src)[ \t]*=[ \t]*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gid;
// A scheme has two letters or more, so a drive letter such as D: is none (#364).
const SCHEME_RE = /^(?:[A-Za-z][A-Za-z0-9+.-]+:|\/\/|#)/;
// A line's end, past closing quotes, brackets and emphasis marks: one of `.!?:;`.
const SENTENCE_END_RE = /[.!?:;][)"'\]*_`\u2019\u201d\u00bb]*$/;
const BOLD_LABEL_RE = /^\*\*[^*]+(?::\*\*|\*\*:)/;

/** Whether a line's last word holds `http://` or `https://`: a link at its end. */
const endsInLink = t => {
  const word = t.slice(Math.max(t.lastIndexOf(' '), t.lastIndexOf('	')) + 1);
  return word.includes('http://') || word.includes('https://');
};

/** `line` with every code span replaced by spaces, matching backtick runs by length in one pass. */
function blankCodeSpans(line) {
  if (!line.includes('`')) return line;
  const runs = [];
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] !== '`') continue;
    let j = i;
    while (j < line.length && line[j] === '`') j += 1;
    runs.push({ at: i, len: j - i });
    i = j - 1;
  }
  // The next run of the same length after each run, from the right, once.
  const nextSame = new Array(runs.length).fill(-1);
  const seen = new Map();
  for (let k = runs.length - 1; k >= 0; k -= 1) {
    nextSame[k] = seen.get(runs[k].len) ?? -1;
    seen.set(runs[k].len, k);
  }
  const out = [];
  let from = 0;
  for (let k = 0; k < runs.length; k += 1) {
    if (nextSame[k] < 0) continue;
    const end = runs[nextSame[k]].at + runs[nextSame[k]].len;
    out.push(line.slice(from, runs[k].at), ' '.repeat(end - runs[k].at));
    from = end;
    // Runs inside the span are code; resume after its closing run.
    while (k + 1 < runs.length && runs[k + 1].at < end) k += 1;
  }
  out.push(line.slice(from));
  return out.join('');
}

/** The targets of the links in `line` (code spans and comments already blanked), as [{ target, at }]. */
function linkTargets(line) {
  const out = [];
  let p = line.indexOf('](');
  while (p >= 0) {
    let s = p + 2;
    while (line[s] === ' ' || line[s] === '\t') s += 1;
    let e = s;
    if (line[s] === '<') {
      s += 1;
      e = s;
      while (e < line.length && line[e] !== '>') e += 1;
    } else {
      while (e < line.length && !/[\s)\]]/.test(line[e])) e += 1;
    }
    if (e > s) out.push({ target: line.slice(s, e), at: s });
    p = line.indexOf('](', Math.max(e, p + 2));
  }
  const def = line.match(REF_DEF_RE);
  if (def && !def[1].startsWith('^') && def[2] !== '') {
    const raw = def[2];
    const angled = raw.startsWith('<');
    const target = angled ? raw.slice(1, -1) : raw;
    if (target !== '') out.push({ target, at: def[0].length - raw.length + (angled ? 1 : 0) });
  }
  for (const m of line.matchAll(HTML_ATTR_RE)) {
    const g = m[1] !== undefined ? 1 : m[2] !== undefined ? 2 : 3;
    if (m[g] !== '') out.push({ target: m[g], at: m.indices[g][0] });
  }
  return out;
}

/**
 * Each place the body's prose would land broken on GitHub, as
 * [{ rule, where }]: a hard-wrapped paragraph, list item or quote
 * (text/hard-wrap, a line that continues one that stopped mid-sentence), and a
 * link whose target has no scheme and is not an anchor (link/relative). Each
 * rule is reported once, at its first hit; `where` is the line and column,
 * never the text. Fences and HTML comments are not read, and a line broken on
 * purpose (two trailing spaces, a backslash, a bold label starting the next
 * line) is not a wrap. Lines end as CommonMark ends them. One pass over the
 * lines, each pattern anchored or bounded by a class that cannot overlap what
 * follows it.
 */
export function proseCheck(body) {
  let wrap = null;
  let relative = null;
  let fence = null;
  let comment = false;
  let open = false;
  let prev = '';
  const lines = body.split(LINE_END_RE);
  for (let n = 0; n < lines.length; n += 1) {
    const raw = lines[n];
    const quote = raw.match(QUOTE_RE);
    const off = quote ? quote[0].length : 0;
    let line = quote ? raw.slice(off) : raw;
    if (fence !== null) {
      const close = line.match(PROSE_FENCE_CLOSE_RE);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      continue;
    }
    const startedInComment = comment;
    if (!startedInComment) {
      const f = line.match(PROSE_FENCE_OPEN_RE);
      if (f) {
        fence = f[1];
        open = false;
        continue;
      }
    }
    // Blank the comments out, keeping every column.
    let hadComment = startedInComment;
    if (startedInComment || line.includes('<!--')) {
      const parts = [];
      let pos = 0;
      for (;;) {
        if (comment) {
          const j = line.indexOf('-->', pos);
          if (j < 0) {
            parts.push(' '.repeat(line.length - pos));
            pos = line.length;
            break;
          }
          parts.push(' '.repeat(j + 3 - pos));
          pos = j + 3;
          comment = false;
        } else {
          const j = line.indexOf('<!--', pos);
          if (j < 0) break;
          hadComment = true;
          parts.push(line.slice(pos, j));
          pos = j;
          comment = true;
          parts.push('    ');
          pos = j + 4;
        }
      }
      parts.push(line.slice(pos));
      line = parts.join('');
    }
    const text = line.trim();
    if (hadComment || text === '') {
      open = false;
      if (text === '') continue;
    }
    const indented = /^(?: {4}|\t)/.test(line);
    const ownBlock = OWN_BLOCK_RE.test(line);
    const codeLine = indented && !open && !LIST_MARKER_RE.test(line);
    if (!codeLine && relative === null) {
      for (const { target, at } of linkTargets(blankCodeSpans(line))) {
        if (SCHEME_RE.test(target)) continue;
        relative = { rule: PROSE.link, where: `body ${n + 1}:${[...(quote ? raw.slice(0, off) : '')].length + [...line.slice(0, at)].length + 1}` };
        break;
      }
    }
    if (hadComment || codeLine) {
      open = false;
      continue;
    }
    if (ownBlock) {
      open = false;
      continue;
    }
    if (LIST_MARKER_RE.test(line)) {
      open = true;
      prev = raw.slice(off);
      continue;
    }
    if (open && wrap === null && !SENTENCE_END_RE.test(prev.trimEnd()) && !endsInLink(prev.trimEnd()) && !/(?: {2}|[\\])$/.test(prev) && !BOLD_LABEL_RE.test(text)) {
      wrap = { rule: PROSE.wrap, where: `body ${n + 1}:1` };
    }
    open = true;
    prev = raw.slice(off);
  }
  return [wrap, relative].filter(Boolean);
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

// The line breaks JSON leaves raw: next line, line separator, paragraph separator. Escaped, so gh's text can't frame a second line for a reader that splits on them.
const LINE_BREAKS_RE = new RegExp(`[${cp(0x85)}${cp(0x2028)}${cp(0x2029)}]`, 'g');

/**
 * gh's stderr as one line: its first line, JSON-escaped and capped. A line
 * that trips a scan rule, such as one holding a token, is withheld and only
 * the rule is named.
 */
export function saidLine(stderr, ctx) {
  const line = String(stderr ?? '').split(/\r?\n/)[0].slice(0, 300);
  const rules = [...new Set(scan([{ field: 'stderr', text: line }], { ...ctx, surface: null }).map(r => r.rule))];
  return rules.length ? `gh said: (withheld: ${rules.join(', ')})` : `gh said: ${JSON.stringify(line).replace(LINE_BREAKS_RE, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}`;
}

/** A JSON answer, or undefined; never an error message, which would quote the answer. */
function parseJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- the edit checks (#413)

/** A reason line, whatever its label, as `linesOf` splits it. */
const REASON_LINE_RE = /^Edited: .+ \([a-z0-9][a-z0-9-]{0,49}\)$/;
/** A line that reads as a reason line on the page, whatever it hides: format characters out, trimmed. */
const REASON_SHAPE_RE = /^Edited:/;
/** The two signature lines, whole: `Signed: <label>` and `Posted by <label>.` */
const SIGNATURE_RE = /^(?:Signed: ([a-z0-9][a-z0-9-]{0,49})|Posted by ([a-z0-9][a-z0-9-]{0,49})\.)$/;
const HEADING_RE = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const SETEXT_RE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const LENS_WORD_RE = /[A-Za-z]-lens(?![A-Za-z0-9-])/;
const SUMMARY_RE = /<summary\b[^>]*>([\s\S]*?)(?:<\/summary\s*>|$)/gi;
const CLOSED_COMMENT_RE = /<!--[\s\S]*?--!?>/g;
const RECORD_HEADER = Object.freeze(['finding', 'lens', 'disposition', 'rerun']);
/** The review procedure's two data folds, by their summary's opening words; a continued part repeats them (#401). */
const RECORD_FOLD_RE = /^\s*(?:lens\s+dispositions|crossed\s+findings)\b/i;
const DECISION = 'owner decision';
/** Look-alikes, from Cyrillic, Greek, Armenian and Latin, of the letters of "owner decision", folded to those letters before the match. */
const LOOKALIKES = new Map([
  ...[0x43e, 0x41e, 0x3bf, 0x39f, 0x585].map(c => [cp(c), 'o']),
  ...[0x461, 0x51d, 0x51c].map(c => [cp(c), 'w']),
  ...[0x578, 0x39d].map(c => [cp(c), 'n']),
  ...[0x435, 0x415, 0x395, 0x4bd].map(c => [cp(c), 'e']),
  ...[0x433, 0x280].map(c => [cp(c), 'r']),
  ...[0x501, 0x500].map(c => [cp(c), 'd']),
  ...[0x441, 0x421, 0x3f2, 0x3f9].map(c => [cp(c), 'c']),
  ...[0x456, 0x406, 0x3b9, 0x399, 0x131, 0x4cf].map(c => [cp(c), 'i']),
  ...[0x455, 0x405].map(c => [cp(c), 's']),
]);

/** The session's body with its reason line after it: a line break if the body lacks one, a blank line, the line. The breaks are CRLF when the body holds one. */
export function composeEdit(body, reason, label) {
  const nl = body.includes('\r\n') ? '\r\n' : '\n';
  return `${body}${/\r?\n$/.test(body) ? '' : nl}${nl}Edited: ${reason} (${label})`;
}

/** A body's lines, ended at a line feed, a carriage return or both, as CommonMark and the table check end them. */
const linesOf = text => text.split(LINE_END_RE);

/** The lines outside fences, as the table check reads fences. */
function unfenced(lines) {
  const out = [];
  let fence = null;
  for (const line of lines) {
    if (fence) {
      const m = line.match(FENCE_CLOSE_RE);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      continue;
    }
    const m = line.match(FENCE_OPEN_RE);
    if (m && !(m[1][0] === '`' && m[2].includes('`'))) {
      fence = m[1];
      continue;
    }
    out.push(line);
  }
  return out;
}

/** The labels one reading of a body is signed with: each signature line outside a fence and a quote. A line straight after a quote line, with no blank line between, continues the quote on the page, so it is quoted too. */
function signedIn(text) {
  let quoted = false;
  return unfenced(text.split('\n')).flatMap(line => {
    if (line.trim() === '') quoted = false;
    else if (QUOTE_RE.test(line)) quoted = true;
    if (quoted) return [];
    const m = line.match(SIGNATURE_RE);
    return m ? [m[1] ?? m[2]] : [];
  });
}

/**
 * The labels a body is signed with: each signature line outside a fence, a
 * quote and a closed HTML comment, in both of two readings, so a line either
 * reading hides doesn't count. One blanks code spans before it drops closed
 * comments, so a comment named in a code span hides nothing; the other drops
 * closed comments first, so a code span the page doesn't see, such as one
 * opened by an escaped backtick, can't unhide a comment.
 */
export function signatures(body) {
  const lines = linesOf(body);
  const spansFirst = signedIn(lines.map(blankCodeSpans).join('\n').replace(CLOSED_COMMENT_RE, ''));
  const commentsFirst = signedIn(lines.join('\n').replace(CLOSED_COMMENT_RE, ''));
  const left = [...commentsFirst];
  return spansFirst.filter(l => {
    const i = left.indexOf(l);
    if (i < 0) return false;
    left.splice(i, 1);
    return true;
  });
}

/** The reason lines at a body's end, in order: the run of reason lines and blank lines it ends with. */
export function trailingReasons(body) {
  const lines = linesOf(body);
  const out = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].trim() === '') continue;
    if (!REASON_LINE_RE.test(lines[i])) break;
    out.unshift(lines[i]);
  }
  return out;
}

/**
 * Whether the session's body keeps its reason lines in plain sight: every line
 * outside a fence that reads as a reason line sits in the trailing run, and
 * nothing before the run opens an HTML comment or a fold it doesn't close,
 * which would hide the run on the page.
 */
function reasonsInSight(body) {
  const run = trailingReasons(body).length;
  const shaped = unfenced(linesOf(body)).filter(l => REASON_SHAPE_RE.test(l.replace(/\p{Cf}/gu, '').trim())).length;
  if (shaped !== run) return false;
  const lines = linesOf(body);
  let end = lines.length;
  for (let seen = 0; end > 0 && seen < run; end -= 1) if (REASON_LINE_RE.test(lines[end - 1])) seen += 1;
  const before = lines.slice(0, end).map(blankCodeSpans).join('\n');
  if (before.lastIndexOf('<!--') > before.lastIndexOf('-->')) return false;
  const count = re => (before.match(re) ?? []).length;
  return count(/<details\b/gi) <= count(/<\/details\s*>/gi);
}

/** Emphasis, code span and link marks folded away, two ways for links, as the table check reads a withheld row's state. */
function folds(s) {
  const fold = re => s.replace(re, '$1').replace(/[*_`~[\]]/g, '');
  return [fold(/!?\[([^[\]]*)\](?:\([^()]*\)|\[[^[\]]*\])?/g), fold(/!?\[([^[\]]*)\](?:\((?:[^()"']|\([^()]*\)|"[^"]*"|'[^']*')*\)|\[[^[\]]*\])?/g)];
}

/** The views of a text the edit checks read: as written without format characters, the two normalised views, and each of those folded. */
function views(text) {
  const shown = normalise(text);
  const kept = normalise(text, true);
  return [text.replace(/\p{Cf}/gu, ''), shown, kept, ...folds(shown), ...folds(kept)];
}

/** Whether one reading's lines hold a record shape: a heading (ATX or setext) naming a lens, or the Lens dispositions header row. */
function recordLine(line, i, all) {
  if (LENS_WORD_RE.test(line) && (HEADING_RE.test(line) || (line.trim() !== '' && SETEXT_RE.test(all[i + 1] ?? '')))) return true;
  const cells = tableCells(line);
  if (!cells) return false;
  const words = cells.map(c => c.text.replace(/[*_`~[\]]/g, '').trim().toLowerCase());
  return words.length === RECORD_HEADER.length && words.every((w, j) => w === RECORD_HEADER[j]);
}

/**
 * Whether a body is a review record: a heading (ATX or setext) or a fold's
 * summary naming a lens, a fold summary opening "Lens dispositions" or
 * "Crossed findings", or the Lens dispositions header row. A best-effort
 * backstop, not a control (q12 on #413): fences are skipped on each folded
 * view, the stricter of the readings the Test rounds tried, so a shape
 * quoted inside a fence can be refused, and a summary is read anywhere.
 */
export function isRecord(body) {
  const raw = body.replace(/\p{Cf}/gu, '');
  for (const m of raw.matchAll(SUMMARY_RE)) {
    if (views(m[1]).some(v => LENS_WORD_RE.test(v) || RECORD_FOLD_RE.test(v))) return true;
  }
  return views(raw).some(view => unfenced(linesOf(view)).some(recordLine));
}

/** Whether a body holds the decision mark, "owner decision", in any case, spacing, markup or folded look-alike letter. */
export function hasDecision(body) {
  return views(body).some(v => [...v].map(c => LOOKALIKES.get(c) ?? c).join('').replace(/\s+/g, ' ').toLowerCase().includes(DECISION));
}

/** The refusals a body earns as the text an edit leaves, `where` naming whose body it is. */
function bodyRules(body, label, where) {
  const out = [];
  const signed = signatures(body);
  if (!signed.includes(label) || signed.some(l => l !== label)) out.push({ rule: 'edit/unsigned', where });
  if (isRecord(body)) out.push({ rule: 'edit/record', where });
  if (hasDecision(body)) out.push({ rule: 'edit/decision', where });
  return out;
}

/** The checks on the composed body, before gh is called. */
export function editBodyChecks(plan) {
  const out = bodyRules(plan.body, plan.signed, 'option --body');
  if (!reasonsInSight(plan.body)) out.push({ rule: 'edit/reasons', where: 'option --body' });
  return out;
}

/**
 * The checks on the item GitHub returned, as { unusable, refusals }. An
 * answer that isn't an object, or whose author or target field has the wrong
 * type, is unusable; a null body counts as empty. An item whose text trips the
 * content scan is refused (`edit/leak`): an edit never removes text from
 * GitHub's history, so the owner is told instead.
 */
export function editItemChecks(plan, item, login, ctx = {}) {
  const bad = { unusable: true, refusals: [] };
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return bad;
  if (typeof item.user?.login !== 'string') return bad;
  if (item.body !== null && typeof item.body !== 'string') return bad;
  if (item.in_reply_to_id !== undefined && item.in_reply_to_id !== null && typeof item.in_reply_to_id !== 'number') return bad;
  if (item.pull_request !== undefined && item.pull_request !== null && (typeof item.pull_request !== 'object' || Array.isArray(item.pull_request))) return bad;
  const repo = `/repos/${plan.repo.owner}/${plan.repo.name}`.toLowerCase();
  const sits = (url, path) => url.toLowerCase().endsWith(`${repo}/${path}`);
  const refusals = [];
  if (item.user.login !== login) refusals.push({ rule: 'edit/author', where: 'item' });
  let target = true;
  if (plan.surface === 'issue-comment-edit') {
    if (typeof item.issue_url !== 'string') return bad;
    target = sits(item.issue_url, `issues/${plan.issue}`);
  }
  if (plan.surface === 'review-thread-reply-edit') {
    if (typeof item.pull_request_url !== 'string') return bad;
    target = sits(item.pull_request_url, `pulls/${plan.pr}`) && idText(item.in_reply_to_id) !== null;
  }
  if (plan.surface === 'issue-edit' && item.pull_request !== undefined && item.pull_request !== null) target = false;
  if (!target) refusals.push({ rule: 'edit/target', where: 'item' });
  const body = item.body ?? '';
  refusals.push(...bodyRules(body, plan.signed, 'item'));
  if (scan([{ field: 'item', text: body }], { ...ctx, surface: plan.surface }).length) refusals.push({ rule: 'edit/leak', where: 'item' });
  const kept = trailingReasons(plan.sessionBody);
  const had = trailingReasons(body);
  if (kept.length !== had.length || kept.some((l, i) => l !== had[i])) refusals.push({ rule: 'edit/reasons', where: 'option --body' });
  return { unusable: false, refusals };
}

// ---------------------------------------------------------------- the NEXT line

/**
 * The line a session reads after exit 3, where the post may have landed: the
 * page to look at and the login the poster checked, both known before it
 * sent, never text from gh or the body.
 */
const failedNext = (page, login) => `NEXT: the post may have landed. Look at ${page} for a post by ${login} before anything else. If it is there, never post it again: tell the owner its link. If it isn't, tell the owner, and post again only on their word. If you can't tell, tell the owner, and don't post.`;

/** The line after exit 1, where the post landed: the form says what the address below it is: the post's link, only the page it sits on, or, on a mismatch, the link with the fields named above. */
const landedNext = form => `NEXT: the post landed. Never post it again. Tell the owner, with ${form}.`;
const LANDED_LINK = landedNext('the link below');
const LANDED_PAGE = landedNext('the page below, where it sits');
const LANDED_MISMATCH = landedNext('the link below and the fields named above');
const editLanded = form => `NEXT: the edit landed. Never send it again. Tell the owner, with ${form}.`;
const EDIT_LANDED_LINK = editLanded('the link below');
const EDIT_LANDED_MISMATCH = editLanded('the link below and the fields named above');
const editFailedNext = url => `NEXT: the edit may have landed. Look at ${url} for its reason line before anything else. If it is there, never send it again: tell the owner its link. If it isn't, tell the owner, and send it again only on their word. If you can't tell, tell the owner, and don't send it.`;

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
    // An edit reads and writes the one item its options name, so its id and link are known before it sends.
    case 'issue-edit':
      return { path: `${repo}/issues/${plan.issue}`, request: { body: plan.body }, key: 'number', id: plan.issue, near: `${web}/issues/${plan.issue}` };
    case 'pull-request-edit':
      return { path: `${repo}/pulls/${plan.pr}`, request: { body: plan.body }, key: 'number', id: plan.pr, near: `${web}/pull/${plan.pr}` };
    case 'issue-comment-edit':
      return { path: `${repo}/issues/comments/${plan.comment}`, request: { body: plan.body }, key: 'id', id: plan.comment, near: `${web}/issues/${plan.issue}#issuecomment-${plan.comment}` };
    case 'review-thread-reply-edit':
      return { path: `${repo}/pulls/comments/${plan.comment}`, request: { body: plan.body }, key: 'id', id: plan.comment, near: `${web}/pull/${plan.pr}#discussion_r${plan.comment}` };
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
  if (plan.surface === 'issue-comment-edit') on('target', back.issue_url, `issues/${plan.issue}`);
  if (plan.surface === 'review-thread-reply-edit') on('target', back.pull_request_url, `pulls/${plan.pr}`);
  return { unusable, mismatches, notes };
}

/** The request with every text replaced by its size, for a dry run. */
function sizes(v) {
  if (typeof v === 'string') return `<${chars(v)} characters>`;
  if (Array.isArray(v)) return v.map(sizes);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sizes(x)]));
  return v;
}

/**
 * An edit, once the login and owner checks pass: read the item, check it,
 * send one PATCH, read it back. `setPhase` tells post() when the PATCH is on
 * its way and when it has been sent, so its catch names the right result.
 */
function editItem(plan, p, args, login, io, ctx, setPhase) {
  const url = p.near;
  const read = io.gh(ghArgs('GET', p.path, false));
  if (!read.ok) return { code: 4, lines: [saidLine(read.stderr, ctx), 'RESULT: unavailable'] };
  const c = editItemChecks(plan, parseJson(read.stdout), login, ctx);
  if (c.unusable) return { code: 4, lines: ['the item read could not be read', 'RESULT: unavailable'] };
  if (c.refusals.length) return refused(c.refusals);

  setPhase('sending');
  const sent = io.gh(args, JSON.stringify(p.request));
  if (!sent.ok) return { code: 3, lines: [saidLine(sent.stderr, ctx), editFailedNext(url), 'RESULT: failed'] };
  setPhase('sent');
  const again = io.gh(ghArgs('GET', p.path, false));
  if (!again.ok) return { code: 1, lines: [saidLine(again.stderr, ctx), EDIT_LANDED_LINK, `RESULT: unverified ${url}`] };
  const back = compare(plan, p.request, parseJson(again.stdout), login, p.id, p.key);
  if (back.unusable.length) return { code: 1, lines: [`the read-back could not be read: ${back.unusable.join(', ')}`, EDIT_LANDED_LINK, `RESULT: unverified ${url}`] };
  if (back.mismatches.length) return { code: 1, lines: [...back.mismatches, ...back.notes, EDIT_LANDED_MISMATCH, `RESULT: mismatch ${url}`] };
  return { code: 0, lines: [...back.notes, `RESULT: verified ${plan.surface} ${url} as ${login}`] };
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
  let edit = false;
  try {
    const parsed = parseArgs(argv);
    if (parsed.refusals.length) return refused(parsed.refusals);
    const { plan, refusals } = buildPlan(parsed);
    if (refusals.length) return refused(refusals);
    const fields = [];
    if (plan.title !== undefined) fields.push({ field: 'title', text: plan.title });
    plan.labels.forEach((text, i) => fields.push({ field: `label ${i + 1}`, text }));
    if (plan.reason !== undefined) fields.push({ field: 'reason', text: plan.reason });
    fields.push({ field: 'body', text: plan.body });
    const ctx = { env: io.env };
    // The table check and the prose checks run after the content scan, on the
    // body only. Past the first fifty, the table refusals are counted, not
    // listed, so the result line stays in view.
    const hits = scan(fields, { ...ctx, surface: plan.surface });
    const tables = tableCheck(plan.body);
    const prose = [...fenceCheck(plan.body), ...proseCheck(plan.body)];
    if (tables.length > TABLE_LISTED) {
      const r = refused([...hits, ...tables.slice(0, TABLE_LISTED), ...prose]);
      return { code: 2, lines: [...r.lines.slice(0, -1), `NOTE: ${tables.length - TABLE_LISTED} more table refusals not listed`, `RESULT: refused ${hits.length + tables.length + prose.length}`] };
    }
    if (hits.length || tables.length || prose.length) return refused([...hits, ...tables, ...prose]);
    edit = isEdit(plan.surface);
    if (edit) {
      const own = editBodyChecks(plan);
      if (own.length) return refused(own);
    }

    const p = postOf(plan);
    near = p.near;
    const args = ghArgs(edit ? 'PATCH' : 'POST', p.path, true);
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
    if (edit) return editItem(plan, p, args, login, io, ctx, s => { phase = s; });

    phase = 'sending';
    const sent = io.gh(args, JSON.stringify(p.request));
    if (!sent.ok) return { code: 3, lines: [saidLine(sent.stderr, ctx), failedNext(near, checkedLogin), 'RESULT: failed'] };
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
    if (edit && phase === 'sending') return { code: 3, lines: ['the edit call failed', editFailedNext(near), 'RESULT: failed'] };
    if (edit) return { code: 1, lines: ['the poster failed after sending', EDIT_LANDED_LINK, `RESULT: unverified ${near}`] };
    if (phase === 'sending') return { code: 3, lines: ['the post call failed', failedNext(near, checkedLogin), 'RESULT: failed'] };
    return { code: 1, lines: ['the poster failed after sending', linked ? LANDED_LINK : LANDED_PAGE, `RESULT: unverified ${near}`] };
  }
}

// ---------------------------------------------------------------- main

function main() {
  const env = { ...process.env };
  const tmp = tmpdir();
  const r = post(process.argv.slice(2), { gh: makeGh({ env, tmp }), env });
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
