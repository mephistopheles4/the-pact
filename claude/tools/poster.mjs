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

// The whole HTML5 named character reference table: every name that ends in
// `;`, written without it, then a colon and its value's code points in
// lowercase hex joined by `+`, sorted by name and joined by commas (#394).
// Generated from Python's html.entities.html5 by the command in ADR 0122; a
// test pins its digest. The HTML standard says the table will not change.
export const NAMED_TABLE = [
  'AElig:c6,AMP:26,Aacute:c1,Abreve:102,Acirc:c2,Acy:410,Afr:1d504,Agrave:c0,Alpha:391,Amacr:100',
  ',And:2a53,Aogon:104,Aopf:1d538,ApplyFunction:2061,Aring:c5,Ascr:1d49c,Assign:2254,Atilde:c3',
  ',Auml:c4,Backslash:2216,Barv:2ae7,Barwed:2306,Bcy:411,Because:2235,Bernoullis:212c,Beta:392',
  ',Bfr:1d505,Bopf:1d539,Breve:2d8,Bscr:212c,Bumpeq:224e,CHcy:427,COPY:a9,Cacute:106,Cap:22d2',
  ',CapitalDifferentialD:2145,Cayleys:212d,Ccaron:10c,Ccedil:c7,Ccirc:108,Cconint:2230,Cdot:10a',
  ',Cedilla:b8,CenterDot:b7,Cfr:212d,Chi:3a7,CircleDot:2299,CircleMinus:2296,CirclePlus:2295',
  ',CircleTimes:2297,ClockwiseContourIntegral:2232,CloseCurlyDoubleQuote:201d,CloseCurlyQuote:2019',
  ',Colon:2237,Colone:2a74,Congruent:2261,Conint:222f,ContourIntegral:222e,Copf:2102,Coproduct:2210',
  ',CounterClockwiseContourIntegral:2233,Cross:2a2f,Cscr:1d49e,Cup:22d3,CupCap:224d,DD:2145',
  ',DDotrahd:2911,DJcy:402,DScy:405,DZcy:40f,Dagger:2021,Darr:21a1,Dashv:2ae4,Dcaron:10e,Dcy:414',
  ',Del:2207,Delta:394,Dfr:1d507,DiacriticalAcute:b4,DiacriticalDot:2d9,DiacriticalDoubleAcute:2dd',
  ',DiacriticalGrave:60,DiacriticalTilde:2dc,Diamond:22c4,DifferentialD:2146,Dopf:1d53b,Dot:a8',
  ',DotDot:20dc,DotEqual:2250,DoubleContourIntegral:222f,DoubleDot:a8,DoubleDownArrow:21d3',
  ',DoubleLeftArrow:21d0,DoubleLeftRightArrow:21d4,DoubleLeftTee:2ae4,DoubleLongLeftArrow:27f8',
  ',DoubleLongLeftRightArrow:27fa,DoubleLongRightArrow:27f9,DoubleRightArrow:21d2',
  ',DoubleRightTee:22a8,DoubleUpArrow:21d1,DoubleUpDownArrow:21d5,DoubleVerticalBar:2225',
  ',DownArrow:2193,DownArrowBar:2913,DownArrowUpArrow:21f5,DownBreve:311,DownLeftRightVector:2950',
  ',DownLeftTeeVector:295e,DownLeftVector:21bd,DownLeftVectorBar:2956,DownRightTeeVector:295f',
  ',DownRightVector:21c1,DownRightVectorBar:2957,DownTee:22a4,DownTeeArrow:21a7,Downarrow:21d3',
  ',Dscr:1d49f,Dstrok:110,ENG:14a,ETH:d0,Eacute:c9,Ecaron:11a,Ecirc:ca,Ecy:42d,Edot:116,Efr:1d508',
  ',Egrave:c8,Element:2208,Emacr:112,EmptySmallSquare:25fb,EmptyVerySmallSquare:25ab,Eogon:118',
  ',Eopf:1d53c,Epsilon:395,Equal:2a75,EqualTilde:2242,Equilibrium:21cc,Escr:2130,Esim:2a73,Eta:397',
  ',Euml:cb,Exists:2203,ExponentialE:2147,Fcy:424,Ffr:1d509,FilledSmallSquare:25fc',
  ',FilledVerySmallSquare:25aa,Fopf:1d53d,ForAll:2200,Fouriertrf:2131,Fscr:2131,GJcy:403,GT:3e',
  ',Gamma:393,Gammad:3dc,Gbreve:11e,Gcedil:122,Gcirc:11c,Gcy:413,Gdot:120,Gfr:1d50a,Gg:22d9',
  ',Gopf:1d53e,GreaterEqual:2265,GreaterEqualLess:22db,GreaterFullEqual:2267,GreaterGreater:2aa2',
  ',GreaterLess:2277,GreaterSlantEqual:2a7e,GreaterTilde:2273,Gscr:1d4a2,Gt:226b,HARDcy:42a',
  ',Hacek:2c7,Hat:5e,Hcirc:124,Hfr:210c,HilbertSpace:210b,Hopf:210d,HorizontalLine:2500,Hscr:210b',
  ',Hstrok:126,HumpDownHump:224e,HumpEqual:224f,IEcy:415,IJlig:132,IOcy:401,Iacute:cd,Icirc:ce',
  ',Icy:418,Idot:130,Ifr:2111,Igrave:cc,Im:2111,Imacr:12a,ImaginaryI:2148,Implies:21d2,Int:222c',
  ',Integral:222b,Intersection:22c2,InvisibleComma:2063,InvisibleTimes:2062,Iogon:12e,Iopf:1d540',
  ',Iota:399,Iscr:2110,Itilde:128,Iukcy:406,Iuml:cf,Jcirc:134,Jcy:419,Jfr:1d50d,Jopf:1d541',
  ',Jscr:1d4a5,Jsercy:408,Jukcy:404,KHcy:425,KJcy:40c,Kappa:39a,Kcedil:136,Kcy:41a,Kfr:1d50e',
  ',Kopf:1d542,Kscr:1d4a6,LJcy:409,LT:3c,Lacute:139,Lambda:39b,Lang:27ea,Laplacetrf:2112,Larr:219e',
  ',Lcaron:13d,Lcedil:13b,Lcy:41b,LeftAngleBracket:27e8,LeftArrow:2190,LeftArrowBar:21e4',
  ',LeftArrowRightArrow:21c6,LeftCeiling:2308,LeftDoubleBracket:27e6,LeftDownTeeVector:2961',
  ',LeftDownVector:21c3,LeftDownVectorBar:2959,LeftFloor:230a,LeftRightArrow:2194',
  ',LeftRightVector:294e,LeftTee:22a3,LeftTeeArrow:21a4,LeftTeeVector:295a,LeftTriangle:22b2',
  ',LeftTriangleBar:29cf,LeftTriangleEqual:22b4,LeftUpDownVector:2951,LeftUpTeeVector:2960',
  ',LeftUpVector:21bf,LeftUpVectorBar:2958,LeftVector:21bc,LeftVectorBar:2952,Leftarrow:21d0',
  ',Leftrightarrow:21d4,LessEqualGreater:22da,LessFullEqual:2266,LessGreater:2276,LessLess:2aa1',
  ',LessSlantEqual:2a7d,LessTilde:2272,Lfr:1d50f,Ll:22d8,Lleftarrow:21da,Lmidot:13f',
  ',LongLeftArrow:27f5,LongLeftRightArrow:27f7,LongRightArrow:27f6,Longleftarrow:27f8',
  ',Longleftrightarrow:27fa,Longrightarrow:27f9,Lopf:1d543,LowerLeftArrow:2199,LowerRightArrow:2198',
  ',Lscr:2112,Lsh:21b0,Lstrok:141,Lt:226a,Map:2905,Mcy:41c,MediumSpace:205f,Mellintrf:2133',
  ',Mfr:1d510,MinusPlus:2213,Mopf:1d544,Mscr:2133,Mu:39c,NJcy:40a,Nacute:143,Ncaron:147,Ncedil:145',
  ',Ncy:41d,NegativeMediumSpace:200b,NegativeThickSpace:200b,NegativeThinSpace:200b',
  ',NegativeVeryThinSpace:200b,NestedGreaterGreater:226b,NestedLessLess:226a,NewLine:a,Nfr:1d511',
  ',NoBreak:2060,NonBreakingSpace:a0,Nopf:2115,Not:2aec,NotCongruent:2262,NotCupCap:226d',
  ',NotDoubleVerticalBar:2226,NotElement:2209,NotEqual:2260,NotEqualTilde:2242+338,NotExists:2204',
  ',NotGreater:226f,NotGreaterEqual:2271,NotGreaterFullEqual:2267+338,NotGreaterGreater:226b+338',
  ',NotGreaterLess:2279,NotGreaterSlantEqual:2a7e+338,NotGreaterTilde:2275,NotHumpDownHump:224e+338',
  ',NotHumpEqual:224f+338,NotLeftTriangle:22ea,NotLeftTriangleBar:29cf+338',
  ',NotLeftTriangleEqual:22ec,NotLess:226e,NotLessEqual:2270,NotLessGreater:2278',
  ',NotLessLess:226a+338,NotLessSlantEqual:2a7d+338,NotLessTilde:2274',
  ',NotNestedGreaterGreater:2aa2+338,NotNestedLessLess:2aa1+338,NotPrecedes:2280',
  ',NotPrecedesEqual:2aaf+338,NotPrecedesSlantEqual:22e0,NotReverseElement:220c',
  ',NotRightTriangle:22eb,NotRightTriangleBar:29d0+338,NotRightTriangleEqual:22ed',
  ',NotSquareSubset:228f+338,NotSquareSubsetEqual:22e2,NotSquareSuperset:2290+338',
  ',NotSquareSupersetEqual:22e3,NotSubset:2282+20d2,NotSubsetEqual:2288,NotSucceeds:2281',
  ',NotSucceedsEqual:2ab0+338,NotSucceedsSlantEqual:22e1,NotSucceedsTilde:227f+338',
  ',NotSuperset:2283+20d2,NotSupersetEqual:2289,NotTilde:2241,NotTildeEqual:2244',
  ',NotTildeFullEqual:2247,NotTildeTilde:2249,NotVerticalBar:2224,Nscr:1d4a9,Ntilde:d1,Nu:39d',
  ',OElig:152,Oacute:d3,Ocirc:d4,Ocy:41e,Odblac:150,Ofr:1d512,Ograve:d2,Omacr:14c,Omega:3a9',
  ',Omicron:39f,Oopf:1d546,OpenCurlyDoubleQuote:201c,OpenCurlyQuote:2018,Or:2a54,Oscr:1d4aa',
  ',Oslash:d8,Otilde:d5,Otimes:2a37,Ouml:d6,OverBar:203e,OverBrace:23de,OverBracket:23b4',
  ',OverParenthesis:23dc,PartialD:2202,Pcy:41f,Pfr:1d513,Phi:3a6,Pi:3a0,PlusMinus:b1',
  ',Poincareplane:210c,Popf:2119,Pr:2abb,Precedes:227a,PrecedesEqual:2aaf,PrecedesSlantEqual:227c',
  ',PrecedesTilde:227e,Prime:2033,Product:220f,Proportion:2237,Proportional:221d,Pscr:1d4ab,Psi:3a8',
  ',QUOT:22,Qfr:1d514,Qopf:211a,Qscr:1d4ac,RBarr:2910,REG:ae,Racute:154,Rang:27eb,Rarr:21a0',
  ',Rarrtl:2916,Rcaron:158,Rcedil:156,Rcy:420,Re:211c,ReverseElement:220b,ReverseEquilibrium:21cb',
  ',ReverseUpEquilibrium:296f,Rfr:211c,Rho:3a1,RightAngleBracket:27e9,RightArrow:2192',
  ',RightArrowBar:21e5,RightArrowLeftArrow:21c4,RightCeiling:2309,RightDoubleBracket:27e7',
  ',RightDownTeeVector:295d,RightDownVector:21c2,RightDownVectorBar:2955,RightFloor:230b',
  ',RightTee:22a2,RightTeeArrow:21a6,RightTeeVector:295b,RightTriangle:22b3,RightTriangleBar:29d0',
  ',RightTriangleEqual:22b5,RightUpDownVector:294f,RightUpTeeVector:295c,RightUpVector:21be',
  ',RightUpVectorBar:2954,RightVector:21c0,RightVectorBar:2953,Rightarrow:21d2,Ropf:211d',
  ',RoundImplies:2970,Rrightarrow:21db,Rscr:211b,Rsh:21b1,RuleDelayed:29f4,SHCHcy:429,SHcy:428',
  ',SOFTcy:42c,Sacute:15a,Sc:2abc,Scaron:160,Scedil:15e,Scirc:15c,Scy:421,Sfr:1d516',
  ',ShortDownArrow:2193,ShortLeftArrow:2190,ShortRightArrow:2192,ShortUpArrow:2191,Sigma:3a3',
  ',SmallCircle:2218,Sopf:1d54a,Sqrt:221a,Square:25a1,SquareIntersection:2293,SquareSubset:228f',
  ',SquareSubsetEqual:2291,SquareSuperset:2290,SquareSupersetEqual:2292,SquareUnion:2294,Sscr:1d4ae',
  ',Star:22c6,Sub:22d0,Subset:22d0,SubsetEqual:2286,Succeeds:227b,SucceedsEqual:2ab0',
  ',SucceedsSlantEqual:227d,SucceedsTilde:227f,SuchThat:220b,Sum:2211,Sup:22d1,Superset:2283',
  ',SupersetEqual:2287,Supset:22d1,THORN:de,TRADE:2122,TSHcy:40b,TScy:426,Tab:9,Tau:3a4,Tcaron:164',
  ',Tcedil:162,Tcy:422,Tfr:1d517,Therefore:2234,Theta:398,ThickSpace:205f+200a,ThinSpace:2009',
  ',Tilde:223c,TildeEqual:2243,TildeFullEqual:2245,TildeTilde:2248,Topf:1d54b,TripleDot:20db',
  ',Tscr:1d4af,Tstrok:166,Uacute:da,Uarr:219f,Uarrocir:2949,Ubrcy:40e,Ubreve:16c,Ucirc:db,Ucy:423',
  ',Udblac:170,Ufr:1d518,Ugrave:d9,Umacr:16a,UnderBar:5f,UnderBrace:23df,UnderBracket:23b5',
  ',UnderParenthesis:23dd,Union:22c3,UnionPlus:228e,Uogon:172,Uopf:1d54c,UpArrow:2191',
  ',UpArrowBar:2912,UpArrowDownArrow:21c5,UpDownArrow:2195,UpEquilibrium:296e,UpTee:22a5',
  ',UpTeeArrow:21a5,Uparrow:21d1,Updownarrow:21d5,UpperLeftArrow:2196,UpperRightArrow:2197,Upsi:3d2',
  ',Upsilon:3a5,Uring:16e,Uscr:1d4b0,Utilde:168,Uuml:dc,VDash:22ab,Vbar:2aeb,Vcy:412,Vdash:22a9',
  ',Vdashl:2ae6,Vee:22c1,Verbar:2016,Vert:2016,VerticalBar:2223,VerticalLine:7c',
  ',VerticalSeparator:2758,VerticalTilde:2240,VeryThinSpace:200a,Vfr:1d519,Vopf:1d54d,Vscr:1d4b1',
  ',Vvdash:22aa,Wcirc:174,Wedge:22c0,Wfr:1d51a,Wopf:1d54e,Wscr:1d4b2,Xfr:1d51b,Xi:39e,Xopf:1d54f',
  ',Xscr:1d4b3,YAcy:42f,YIcy:407,YUcy:42e,Yacute:dd,Ycirc:176,Ycy:42b,Yfr:1d51c,Yopf:1d550',
  ',Yscr:1d4b4,Yuml:178,ZHcy:416,Zacute:179,Zcaron:17d,Zcy:417,Zdot:17b,ZeroWidthSpace:200b',
  ',Zeta:396,Zfr:2128,Zopf:2124,Zscr:1d4b5,aacute:e1,abreve:103,ac:223e,acE:223e+333,acd:223f',
  ',acirc:e2,acute:b4,acy:430,aelig:e6,af:2061,afr:1d51e,agrave:e0,alefsym:2135,aleph:2135',
  ',alpha:3b1,amacr:101,amalg:2a3f,amp:26,and:2227,andand:2a55,andd:2a5c,andslope:2a58,andv:2a5a',
  ',ang:2220,ange:29a4,angle:2220,angmsd:2221,angmsdaa:29a8,angmsdab:29a9,angmsdac:29aa',
  ',angmsdad:29ab,angmsdae:29ac,angmsdaf:29ad,angmsdag:29ae,angmsdah:29af,angrt:221f,angrtvb:22be',
  ',angrtvbd:299d,angsph:2222,angst:c5,angzarr:237c,aogon:105,aopf:1d552,ap:2248,apE:2a70',
  ',apacir:2a6f,ape:224a,apid:224b,apos:27,approx:2248,approxeq:224a,aring:e5,ascr:1d4b6,ast:2a',
  ',asymp:2248,asympeq:224d,atilde:e3,auml:e4,awconint:2233,awint:2a11,bNot:2aed,backcong:224c',
  ',backepsilon:3f6,backprime:2035,backsim:223d,backsimeq:22cd,barvee:22bd,barwed:2305',
  ',barwedge:2305,bbrk:23b5,bbrktbrk:23b6,bcong:224c,bcy:431,bdquo:201e,becaus:2235,because:2235',
  ',bemptyv:29b0,bepsi:3f6,bernou:212c,beta:3b2,beth:2136,between:226c,bfr:1d51f,bigcap:22c2',
  ',bigcirc:25ef,bigcup:22c3,bigodot:2a00,bigoplus:2a01,bigotimes:2a02,bigsqcup:2a06,bigstar:2605',
  ',bigtriangledown:25bd,bigtriangleup:25b3,biguplus:2a04,bigvee:22c1,bigwedge:22c0,bkarow:290d',
  ',blacklozenge:29eb,blacksquare:25aa,blacktriangle:25b4,blacktriangledown:25be',
  ',blacktriangleleft:25c2,blacktriangleright:25b8,blank:2423,blk12:2592,blk14:2591,blk34:2593',
  ',block:2588,bne:3d+20e5,bnequiv:2261+20e5,bnot:2310,bopf:1d553,bot:22a5,bottom:22a5,bowtie:22c8',
  ',boxDL:2557,boxDR:2554,boxDl:2556,boxDr:2553,boxH:2550,boxHD:2566,boxHU:2569,boxHd:2564',
  ',boxHu:2567,boxUL:255d,boxUR:255a,boxUl:255c,boxUr:2559,boxV:2551,boxVH:256c,boxVL:2563',
  ',boxVR:2560,boxVh:256b,boxVl:2562,boxVr:255f,boxbox:29c9,boxdL:2555,boxdR:2552,boxdl:2510',
  ',boxdr:250c,boxh:2500,boxhD:2565,boxhU:2568,boxhd:252c,boxhu:2534,boxminus:229f,boxplus:229e',
  ',boxtimes:22a0,boxuL:255b,boxuR:2558,boxul:2518,boxur:2514,boxv:2502,boxvH:256a,boxvL:2561',
  ',boxvR:255e,boxvh:253c,boxvl:2524,boxvr:251c,bprime:2035,breve:2d8,brvbar:a6,bscr:1d4b7',
  ',bsemi:204f,bsim:223d,bsime:22cd,bsol:5c,bsolb:29c5,bsolhsub:27c8,bull:2022,bullet:2022',
  ',bump:224e,bumpE:2aae,bumpe:224f,bumpeq:224f,cacute:107,cap:2229,capand:2a44,capbrcup:2a49',
  ',capcap:2a4b,capcup:2a47,capdot:2a40,caps:2229+fe00,caret:2041,caron:2c7,ccaps:2a4d,ccaron:10d',
  ',ccedil:e7,ccirc:109,ccups:2a4c,ccupssm:2a50,cdot:10b,cedil:b8,cemptyv:29b2,cent:a2,centerdot:b7',
  ',cfr:1d520,chcy:447,check:2713,checkmark:2713,chi:3c7,cir:25cb,cirE:29c3,circ:2c6,circeq:2257',
  ',circlearrowleft:21ba,circlearrowright:21bb,circledR:ae,circledS:24c8,circledast:229b',
  ',circledcirc:229a,circleddash:229d,cire:2257,cirfnint:2a10,cirmid:2aef,cirscir:29c2,clubs:2663',
  ',clubsuit:2663,colon:3a,colone:2254,coloneq:2254,comma:2c,commat:40,comp:2201,compfn:2218',
  ',complement:2201,complexes:2102,cong:2245,congdot:2a6d,conint:222e,copf:1d554,coprod:2210',
  ',copy:a9,copysr:2117,crarr:21b5,cross:2717,cscr:1d4b8,csub:2acf,csube:2ad1,csup:2ad0,csupe:2ad2',
  ',ctdot:22ef,cudarrl:2938,cudarrr:2935,cuepr:22de,cuesc:22df,cularr:21b6,cularrp:293d,cup:222a',
  ',cupbrcap:2a48,cupcap:2a46,cupcup:2a4a,cupdot:228d,cupor:2a45,cups:222a+fe00,curarr:21b7',
  ',curarrm:293c,curlyeqprec:22de,curlyeqsucc:22df,curlyvee:22ce,curlywedge:22cf,curren:a4',
  ',curvearrowleft:21b6,curvearrowright:21b7,cuvee:22ce,cuwed:22cf,cwconint:2232,cwint:2231',
  ',cylcty:232d,dArr:21d3,dHar:2965,dagger:2020,daleth:2138,darr:2193,dash:2010,dashv:22a3',
  ',dbkarow:290f,dblac:2dd,dcaron:10f,dcy:434,dd:2146,ddagger:2021,ddarr:21ca,ddotseq:2a77,deg:b0',
  ',delta:3b4,demptyv:29b1,dfisht:297f,dfr:1d521,dharl:21c3,dharr:21c2,diam:22c4,diamond:22c4',
  ',diamondsuit:2666,diams:2666,die:a8,digamma:3dd,disin:22f2,div:f7,divide:f7,divideontimes:22c7',
  ',divonx:22c7,djcy:452,dlcorn:231e,dlcrop:230d,dollar:24,dopf:1d555,dot:2d9,doteq:2250',
  ',doteqdot:2251,dotminus:2238,dotplus:2214,dotsquare:22a1,doublebarwedge:2306,downarrow:2193',
  ',downdownarrows:21ca,downharpoonleft:21c3,downharpoonright:21c2,drbkarow:2910,drcorn:231f',
  ',drcrop:230c,dscr:1d4b9,dscy:455,dsol:29f6,dstrok:111,dtdot:22f1,dtri:25bf,dtrif:25be,duarr:21f5',
  ',duhar:296f,dwangle:29a6,dzcy:45f,dzigrarr:27ff,eDDot:2a77,eDot:2251,eacute:e9,easter:2a6e',
  ',ecaron:11b,ecir:2256,ecirc:ea,ecolon:2255,ecy:44d,edot:117,ee:2147,efDot:2252,efr:1d522,eg:2a9a',
  ',egrave:e8,egs:2a96,egsdot:2a98,el:2a99,elinters:23e7,ell:2113,els:2a95,elsdot:2a97,emacr:113',
  ',empty:2205,emptyset:2205,emptyv:2205,emsp:2003,emsp13:2004,emsp14:2005,eng:14b,ensp:2002',
  ',eogon:119,eopf:1d556,epar:22d5,eparsl:29e3,eplus:2a71,epsi:3b5,epsilon:3b5,epsiv:3f5',
  ',eqcirc:2256,eqcolon:2255,eqsim:2242,eqslantgtr:2a96,eqslantless:2a95,equals:3d,equest:225f',
  ',equiv:2261,equivDD:2a78,eqvparsl:29e5,erDot:2253,erarr:2971,escr:212f,esdot:2250,esim:2242',
  ',eta:3b7,eth:f0,euml:eb,euro:20ac,excl:21,exist:2203,expectation:2130,exponentiale:2147',
  ',fallingdotseq:2252,fcy:444,female:2640,ffilig:fb03,fflig:fb00,ffllig:fb04,ffr:1d523,filig:fb01',
  ',fjlig:66+6a,flat:266d,fllig:fb02,fltns:25b1,fnof:192,fopf:1d557,forall:2200,fork:22d4',
  ',forkv:2ad9,fpartint:2a0d,frac12:bd,frac13:2153,frac14:bc,frac15:2155,frac16:2159,frac18:215b',
  ',frac23:2154,frac25:2156,frac34:be,frac35:2157,frac38:215c,frac45:2158,frac56:215a,frac58:215d',
  ',frac78:215e,frasl:2044,frown:2322,fscr:1d4bb,gE:2267,gEl:2a8c,gacute:1f5,gamma:3b3,gammad:3dd',
  ',gap:2a86,gbreve:11f,gcirc:11d,gcy:433,gdot:121,ge:2265,gel:22db,geq:2265,geqq:2267',
  ',geqslant:2a7e,ges:2a7e,gescc:2aa9,gesdot:2a80,gesdoto:2a82,gesdotol:2a84,gesl:22db+fe00',
  ',gesles:2a94,gfr:1d524,gg:226b,ggg:22d9,gimel:2137,gjcy:453,gl:2277,glE:2a92,gla:2aa5,glj:2aa4',
  ',gnE:2269,gnap:2a8a,gnapprox:2a8a,gne:2a88,gneq:2a88,gneqq:2269,gnsim:22e7,gopf:1d558,grave:60',
  ',gscr:210a,gsim:2273,gsime:2a8e,gsiml:2a90,gt:3e,gtcc:2aa7,gtcir:2a7a,gtdot:22d7,gtlPar:2995',
  ',gtquest:2a7c,gtrapprox:2a86,gtrarr:2978,gtrdot:22d7,gtreqless:22db,gtreqqless:2a8c,gtrless:2277',
  ',gtrsim:2273,gvertneqq:2269+fe00,gvnE:2269+fe00,hArr:21d4,hairsp:200a,half:bd,hamilt:210b',
  ',hardcy:44a,harr:2194,harrcir:2948,harrw:21ad,hbar:210f,hcirc:125,hearts:2665,heartsuit:2665',
  ',hellip:2026,hercon:22b9,hfr:1d525,hksearow:2925,hkswarow:2926,hoarr:21ff,homtht:223b',
  ',hookleftarrow:21a9,hookrightarrow:21aa,hopf:1d559,horbar:2015,hscr:1d4bd,hslash:210f,hstrok:127',
  ',hybull:2043,hyphen:2010,iacute:ed,ic:2063,icirc:ee,icy:438,iecy:435,iexcl:a1,iff:21d4,ifr:1d526',
  ',igrave:ec,ii:2148,iiiint:2a0c,iiint:222d,iinfin:29dc,iiota:2129,ijlig:133,imacr:12b,image:2111',
  ',imagline:2110,imagpart:2111,imath:131,imof:22b7,imped:1b5,in:2208,incare:2105,infin:221e',
  ',infintie:29dd,inodot:131,int:222b,intcal:22ba,integers:2124,intercal:22ba,intlarhk:2a17',
  ',intprod:2a3c,iocy:451,iogon:12f,iopf:1d55a,iota:3b9,iprod:2a3c,iquest:bf,iscr:1d4be,isin:2208',
  ',isinE:22f9,isindot:22f5,isins:22f4,isinsv:22f3,isinv:2208,it:2062,itilde:129,iukcy:456,iuml:ef',
  ',jcirc:135,jcy:439,jfr:1d527,jmath:237,jopf:1d55b,jscr:1d4bf,jsercy:458,jukcy:454,kappa:3ba',
  ',kappav:3f0,kcedil:137,kcy:43a,kfr:1d528,kgreen:138,khcy:445,kjcy:45c,kopf:1d55c,kscr:1d4c0',
  ',lAarr:21da,lArr:21d0,lAtail:291b,lBarr:290e,lE:2266,lEg:2a8b,lHar:2962,lacute:13a,laemptyv:29b4',
  ',lagran:2112,lambda:3bb,lang:27e8,langd:2991,langle:27e8,lap:2a85,laquo:ab,larr:2190,larrb:21e4',
  ',larrbfs:291f,larrfs:291d,larrhk:21a9,larrlp:21ab,larrpl:2939,larrsim:2973,larrtl:21a2,lat:2aab',
  ',latail:2919,late:2aad,lates:2aad+fe00,lbarr:290c,lbbrk:2772,lbrace:7b,lbrack:5b,lbrke:298b',
  ',lbrksld:298f,lbrkslu:298d,lcaron:13e,lcedil:13c,lceil:2308,lcub:7b,lcy:43b,ldca:2936,ldquo:201c',
  ',ldquor:201e,ldrdhar:2967,ldrushar:294b,ldsh:21b2,le:2264,leftarrow:2190,leftarrowtail:21a2',
  ',leftharpoondown:21bd,leftharpoonup:21bc,leftleftarrows:21c7,leftrightarrow:2194',
  ',leftrightarrows:21c6,leftrightharpoons:21cb,leftrightsquigarrow:21ad,leftthreetimes:22cb',
  ',leg:22da,leq:2264,leqq:2266,leqslant:2a7d,les:2a7d,lescc:2aa8,lesdot:2a7f,lesdoto:2a81',
  ',lesdotor:2a83,lesg:22da+fe00,lesges:2a93,lessapprox:2a85,lessdot:22d6,lesseqgtr:22da',
  ',lesseqqgtr:2a8b,lessgtr:2276,lesssim:2272,lfisht:297c,lfloor:230a,lfr:1d529,lg:2276,lgE:2a91',
  ',lhard:21bd,lharu:21bc,lharul:296a,lhblk:2584,ljcy:459,ll:226a,llarr:21c7,llcorner:231e',
  ',llhard:296b,lltri:25fa,lmidot:140,lmoust:23b0,lmoustache:23b0,lnE:2268,lnap:2a89,lnapprox:2a89',
  ',lne:2a87,lneq:2a87,lneqq:2268,lnsim:22e6,loang:27ec,loarr:21fd,lobrk:27e6,longleftarrow:27f5',
  ',longleftrightarrow:27f7,longmapsto:27fc,longrightarrow:27f6,looparrowleft:21ab',
  ',looparrowright:21ac,lopar:2985,lopf:1d55d,loplus:2a2d,lotimes:2a34,lowast:2217,lowbar:5f',
  ',loz:25ca,lozenge:25ca,lozf:29eb,lpar:28,lparlt:2993,lrarr:21c6,lrcorner:231f,lrhar:21cb',
  ',lrhard:296d,lrm:200e,lrtri:22bf,lsaquo:2039,lscr:1d4c1,lsh:21b0,lsim:2272,lsime:2a8d,lsimg:2a8f',
  ',lsqb:5b,lsquo:2018,lsquor:201a,lstrok:142,lt:3c,ltcc:2aa6,ltcir:2a79,ltdot:22d6,lthree:22cb',
  ',ltimes:22c9,ltlarr:2976,ltquest:2a7b,ltrPar:2996,ltri:25c3,ltrie:22b4,ltrif:25c2,lurdshar:294a',
  ',luruhar:2966,lvertneqq:2268+fe00,lvnE:2268+fe00,mDDot:223a,macr:af,male:2642,malt:2720',
  ',maltese:2720,map:21a6,mapsto:21a6,mapstodown:21a7,mapstoleft:21a4,mapstoup:21a5,marker:25ae',
  ',mcomma:2a29,mcy:43c,mdash:2014,measuredangle:2221,mfr:1d52a,mho:2127,micro:b5,mid:2223',
  ',midast:2a,midcir:2af0,middot:b7,minus:2212,minusb:229f,minusd:2238,minusdu:2a2a,mlcp:2adb',
  ',mldr:2026,mnplus:2213,models:22a7,mopf:1d55e,mp:2213,mscr:1d4c2,mstpos:223e,mu:3bc',
  ',multimap:22b8,mumap:22b8,nGg:22d9+338,nGt:226b+20d2,nGtv:226b+338,nLeftarrow:21cd',
  ',nLeftrightarrow:21ce,nLl:22d8+338,nLt:226a+20d2,nLtv:226a+338,nRightarrow:21cf,nVDash:22af',
  ',nVdash:22ae,nabla:2207,nacute:144,nang:2220+20d2,nap:2249,napE:2a70+338,napid:224b+338',
  ',napos:149,napprox:2249,natur:266e,natural:266e,naturals:2115,nbsp:a0,nbump:224e+338',
  ',nbumpe:224f+338,ncap:2a43,ncaron:148,ncedil:146,ncong:2247,ncongdot:2a6d+338,ncup:2a42,ncy:43d',
  ',ndash:2013,ne:2260,neArr:21d7,nearhk:2924,nearr:2197,nearrow:2197,nedot:2250+338,nequiv:2262',
  ',nesear:2928,nesim:2242+338,nexist:2204,nexists:2204,nfr:1d52b,ngE:2267+338,nge:2271,ngeq:2271',
  ',ngeqq:2267+338,ngeqslant:2a7e+338,nges:2a7e+338,ngsim:2275,ngt:226f,ngtr:226f,nhArr:21ce',
  ',nharr:21ae,nhpar:2af2,ni:220b,nis:22fc,nisd:22fa,niv:220b,njcy:45a,nlArr:21cd,nlE:2266+338',
  ',nlarr:219a,nldr:2025,nle:2270,nleftarrow:219a,nleftrightarrow:21ae,nleq:2270,nleqq:2266+338',
  ',nleqslant:2a7d+338,nles:2a7d+338,nless:226e,nlsim:2274,nlt:226e,nltri:22ea,nltrie:22ec',
  ',nmid:2224,nopf:1d55f,not:ac,notin:2209,notinE:22f9+338,notindot:22f5+338,notinva:2209',
  ',notinvb:22f7,notinvc:22f6,notni:220c,notniva:220c,notnivb:22fe,notnivc:22fd,npar:2226',
  ',nparallel:2226,nparsl:2afd+20e5,npart:2202+338,npolint:2a14,npr:2280,nprcue:22e0,npre:2aaf+338',
  ',nprec:2280,npreceq:2aaf+338,nrArr:21cf,nrarr:219b,nrarrc:2933+338,nrarrw:219d+338',
  ',nrightarrow:219b,nrtri:22eb,nrtrie:22ed,nsc:2281,nsccue:22e1,nsce:2ab0+338,nscr:1d4c3',
  ',nshortmid:2224,nshortparallel:2226,nsim:2241,nsime:2244,nsimeq:2244,nsmid:2224,nspar:2226',
  ',nsqsube:22e2,nsqsupe:22e3,nsub:2284,nsubE:2ac5+338,nsube:2288,nsubset:2282+20d2,nsubseteq:2288',
  ',nsubseteqq:2ac5+338,nsucc:2281,nsucceq:2ab0+338,nsup:2285,nsupE:2ac6+338,nsupe:2289',
  ',nsupset:2283+20d2,nsupseteq:2289,nsupseteqq:2ac6+338,ntgl:2279,ntilde:f1,ntlg:2278',
  ',ntriangleleft:22ea,ntrianglelefteq:22ec,ntriangleright:22eb,ntrianglerighteq:22ed,nu:3bd,num:23',
  ',numero:2116,numsp:2007,nvDash:22ad,nvHarr:2904,nvap:224d+20d2,nvdash:22ac,nvge:2265+20d2',
  ',nvgt:3e+20d2,nvinfin:29de,nvlArr:2902,nvle:2264+20d2,nvlt:3c+20d2,nvltrie:22b4+20d2,nvrArr:2903',
  ',nvrtrie:22b5+20d2,nvsim:223c+20d2,nwArr:21d6,nwarhk:2923,nwarr:2196,nwarrow:2196,nwnear:2927',
  ',oS:24c8,oacute:f3,oast:229b,ocir:229a,ocirc:f4,ocy:43e,odash:229d,odblac:151,odiv:2a38',
  ',odot:2299,odsold:29bc,oelig:153,ofcir:29bf,ofr:1d52c,ogon:2db,ograve:f2,ogt:29c1,ohbar:29b5',
  ',ohm:3a9,oint:222e,olarr:21ba,olcir:29be,olcross:29bb,oline:203e,olt:29c0,omacr:14d,omega:3c9',
  ',omicron:3bf,omid:29b6,ominus:2296,oopf:1d560,opar:29b7,operp:29b9,oplus:2295,or:2228,orarr:21bb',
  ',ord:2a5d,order:2134,orderof:2134,ordf:aa,ordm:ba,origof:22b6,oror:2a56,orslope:2a57,orv:2a5b',
  ',oscr:2134,oslash:f8,osol:2298,otilde:f5,otimes:2297,otimesas:2a36,ouml:f6,ovbar:233d,par:2225',
  ',para:b6,parallel:2225,parsim:2af3,parsl:2afd,part:2202,pcy:43f,percnt:25,period:2e,permil:2030',
  ',perp:22a5,pertenk:2031,pfr:1d52d,phi:3c6,phiv:3d5,phmmat:2133,phone:260e,pi:3c0,pitchfork:22d4',
  ',piv:3d6,planck:210f,planckh:210e,plankv:210f,plus:2b,plusacir:2a23,plusb:229e,pluscir:2a22',
  ',plusdo:2214,plusdu:2a25,pluse:2a72,plusmn:b1,plussim:2a26,plustwo:2a27,pm:b1,pointint:2a15',
  ',popf:1d561,pound:a3,pr:227a,prE:2ab3,prap:2ab7,prcue:227c,pre:2aaf,prec:227a,precapprox:2ab7',
  ',preccurlyeq:227c,preceq:2aaf,precnapprox:2ab9,precneqq:2ab5,precnsim:22e8,precsim:227e',
  ',prime:2032,primes:2119,prnE:2ab5,prnap:2ab9,prnsim:22e8,prod:220f,profalar:232e,profline:2312',
  ',profsurf:2313,prop:221d,propto:221d,prsim:227e,prurel:22b0,pscr:1d4c5,psi:3c8,puncsp:2008',
  ',qfr:1d52e,qint:2a0c,qopf:1d562,qprime:2057,qscr:1d4c6,quaternions:210d,quatint:2a16,quest:3f',
  ',questeq:225f,quot:22,rAarr:21db,rArr:21d2,rAtail:291c,rBarr:290f,rHar:2964,race:223d+331',
  ',racute:155,radic:221a,raemptyv:29b3,rang:27e9,rangd:2992,range:29a5,rangle:27e9,raquo:bb',
  ',rarr:2192,rarrap:2975,rarrb:21e5,rarrbfs:2920,rarrc:2933,rarrfs:291e,rarrhk:21aa,rarrlp:21ac',
  ',rarrpl:2945,rarrsim:2974,rarrtl:21a3,rarrw:219d,ratail:291a,ratio:2236,rationals:211a',
  ',rbarr:290d,rbbrk:2773,rbrace:7d,rbrack:5d,rbrke:298c,rbrksld:298e,rbrkslu:2990,rcaron:159',
  ',rcedil:157,rceil:2309,rcub:7d,rcy:440,rdca:2937,rdldhar:2969,rdquo:201d,rdquor:201d,rdsh:21b3',
  ',real:211c,realine:211b,realpart:211c,reals:211d,rect:25ad,reg:ae,rfisht:297d,rfloor:230b',
  ',rfr:1d52f,rhard:21c1,rharu:21c0,rharul:296c,rho:3c1,rhov:3f1,rightarrow:2192',
  ',rightarrowtail:21a3,rightharpoondown:21c1,rightharpoonup:21c0,rightleftarrows:21c4',
  ',rightleftharpoons:21cc,rightrightarrows:21c9,rightsquigarrow:219d,rightthreetimes:22cc,ring:2da',
  ',risingdotseq:2253,rlarr:21c4,rlhar:21cc,rlm:200f,rmoust:23b1,rmoustache:23b1,rnmid:2aee',
  ',roang:27ed,roarr:21fe,robrk:27e7,ropar:2986,ropf:1d563,roplus:2a2e,rotimes:2a35,rpar:29',
  ',rpargt:2994,rppolint:2a12,rrarr:21c9,rsaquo:203a,rscr:1d4c7,rsh:21b1,rsqb:5d,rsquo:2019',
  ',rsquor:2019,rthree:22cc,rtimes:22ca,rtri:25b9,rtrie:22b5,rtrif:25b8,rtriltri:29ce,ruluhar:2968',
  ',rx:211e,sacute:15b,sbquo:201a,sc:227b,scE:2ab4,scap:2ab8,scaron:161,sccue:227d,sce:2ab0',
  ',scedil:15f,scirc:15d,scnE:2ab6,scnap:2aba,scnsim:22e9,scpolint:2a13,scsim:227f,scy:441',
  ',sdot:22c5,sdotb:22a1,sdote:2a66,seArr:21d8,searhk:2925,searr:2198,searrow:2198,sect:a7,semi:3b',
  ',seswar:2929,setminus:2216,setmn:2216,sext:2736,sfr:1d530,sfrown:2322,sharp:266f,shchcy:449',
  ',shcy:448,shortmid:2223,shortparallel:2225,shy:ad,sigma:3c3,sigmaf:3c2,sigmav:3c2,sim:223c',
  ',simdot:2a6a,sime:2243,simeq:2243,simg:2a9e,simgE:2aa0,siml:2a9d,simlE:2a9f,simne:2246',
  ',simplus:2a24,simrarr:2972,slarr:2190,smallsetminus:2216,smashp:2a33,smeparsl:29e4,smid:2223',
  ',smile:2323,smt:2aaa,smte:2aac,smtes:2aac+fe00,softcy:44c,sol:2f,solb:29c4,solbar:233f',
  ',sopf:1d564,spades:2660,spadesuit:2660,spar:2225,sqcap:2293,sqcaps:2293+fe00,sqcup:2294',
  ',sqcups:2294+fe00,sqsub:228f,sqsube:2291,sqsubset:228f,sqsubseteq:2291,sqsup:2290,sqsupe:2292',
  ',sqsupset:2290,sqsupseteq:2292,squ:25a1,square:25a1,squarf:25aa,squf:25aa,srarr:2192,sscr:1d4c8',
  ',ssetmn:2216,ssmile:2323,sstarf:22c6,star:2606,starf:2605,straightepsilon:3f5,straightphi:3d5',
  ',strns:af,sub:2282,subE:2ac5,subdot:2abd,sube:2286,subedot:2ac3,submult:2ac1,subnE:2acb',
  ',subne:228a,subplus:2abf,subrarr:2979,subset:2282,subseteq:2286,subseteqq:2ac5,subsetneq:228a',
  ',subsetneqq:2acb,subsim:2ac7,subsub:2ad5,subsup:2ad3,succ:227b,succapprox:2ab8,succcurlyeq:227d',
  ',succeq:2ab0,succnapprox:2aba,succneqq:2ab6,succnsim:22e9,succsim:227f,sum:2211,sung:266a',
  ',sup:2283,sup1:b9,sup2:b2,sup3:b3,supE:2ac6,supdot:2abe,supdsub:2ad8,supe:2287,supedot:2ac4',
  ',suphsol:27c9,suphsub:2ad7,suplarr:297b,supmult:2ac2,supnE:2acc,supne:228b,supplus:2ac0',
  ',supset:2283,supseteq:2287,supseteqq:2ac6,supsetneq:228b,supsetneqq:2acc,supsim:2ac8,supsub:2ad4',
  ',supsup:2ad6,swArr:21d9,swarhk:2926,swarr:2199,swarrow:2199,swnwar:292a,szlig:df,target:2316',
  ',tau:3c4,tbrk:23b4,tcaron:165,tcedil:163,tcy:442,tdot:20db,telrec:2315,tfr:1d531,there4:2234',
  ',therefore:2234,theta:3b8,thetasym:3d1,thetav:3d1,thickapprox:2248,thicksim:223c,thinsp:2009',
  ',thkap:2248,thksim:223c,thorn:fe,tilde:2dc,times:d7,timesb:22a0,timesbar:2a31,timesd:2a30',
  ',tint:222d,toea:2928,top:22a4,topbot:2336,topcir:2af1,topf:1d565,topfork:2ada,tosa:2929',
  ',tprime:2034,trade:2122,triangle:25b5,triangledown:25bf,triangleleft:25c3,trianglelefteq:22b4',
  ',triangleq:225c,triangleright:25b9,trianglerighteq:22b5,tridot:25ec,trie:225c,triminus:2a3a',
  ',triplus:2a39,trisb:29cd,tritime:2a3b,trpezium:23e2,tscr:1d4c9,tscy:446,tshcy:45b,tstrok:167',
  ',twixt:226c,twoheadleftarrow:219e,twoheadrightarrow:21a0,uArr:21d1,uHar:2963,uacute:fa,uarr:2191',
  ',ubrcy:45e,ubreve:16d,ucirc:fb,ucy:443,udarr:21c5,udblac:171,udhar:296e,ufisht:297e,ufr:1d532',
  ',ugrave:f9,uharl:21bf,uharr:21be,uhblk:2580,ulcorn:231c,ulcorner:231c,ulcrop:230f,ultri:25f8',
  ',umacr:16b,uml:a8,uogon:173,uopf:1d566,uparrow:2191,updownarrow:2195,upharpoonleft:21bf',
  ',upharpoonright:21be,uplus:228e,upsi:3c5,upsih:3d2,upsilon:3c5,upuparrows:21c8,urcorn:231d',
  ',urcorner:231d,urcrop:230e,uring:16f,urtri:25f9,uscr:1d4ca,utdot:22f0,utilde:169,utri:25b5',
  ',utrif:25b4,uuarr:21c8,uuml:fc,uwangle:29a7,vArr:21d5,vBar:2ae8,vBarv:2ae9,vDash:22a8',
  ',vangrt:299c,varepsilon:3f5,varkappa:3f0,varnothing:2205,varphi:3d5,varpi:3d6,varpropto:221d',
  ',varr:2195,varrho:3f1,varsigma:3c2,varsubsetneq:228a+fe00,varsubsetneqq:2acb+fe00',
  ',varsupsetneq:228b+fe00,varsupsetneqq:2acc+fe00,vartheta:3d1,vartriangleleft:22b2',
  ',vartriangleright:22b3,vcy:432,vdash:22a2,vee:2228,veebar:22bb,veeeq:225a,vellip:22ee,verbar:7c',
  ',vert:7c,vfr:1d533,vltri:22b2,vnsub:2282+20d2,vnsup:2283+20d2,vopf:1d567,vprop:221d,vrtri:22b3',
  ',vscr:1d4cb,vsubnE:2acb+fe00,vsubne:228a+fe00,vsupnE:2acc+fe00,vsupne:228b+fe00,vzigzag:299a',
  ',wcirc:175,wedbar:2a5f,wedge:2227,wedgeq:2259,weierp:2118,wfr:1d534,wopf:1d568,wp:2118,wr:2240',
  ',wreath:2240,wscr:1d4cc,xcap:22c2,xcirc:25ef,xcup:22c3,xdtri:25bd,xfr:1d535,xhArr:27fa',
  ',xharr:27f7,xi:3be,xlArr:27f8,xlarr:27f5,xmap:27fc,xnis:22fb,xodot:2a00,xopf:1d569,xoplus:2a01',
  ',xotime:2a02,xrArr:27f9,xrarr:27f6,xscr:1d4cd,xsqcup:2a06,xuplus:2a04,xutri:25b3,xvee:22c1',
  ',xwedge:22c0,yacute:fd,yacy:44f,ycirc:177,ycy:44b,yen:a5,yfr:1d536,yicy:457,yopf:1d56a',
  ',yscr:1d4ce,yucy:44e,yuml:ff,zacute:17a,zcaron:17e,zcy:437,zdot:17c,zeetrf:2128,zeta:3b6',
  ',zfr:1d537,zhcy:436,zigrarr:21dd,zopf:1d56b,zscr:1d4cf,zwj:200d,zwnj:200c',
].join('');

/** The table as a frozen lookup from a name, without its `;`, to its value. */
export const NAMED_REFS = Object.freeze(
  Object.assign(
    Object.create(null),
    Object.fromEntries(NAMED_TABLE.split(',').map(entry => {
      const [name, hex] = entry.split(':');
      return [name, String.fromCodePoint(...hex.split('+').map(h => parseInt(h, 16)))];
    })),
  ),
);

// The 106 names an HTML parser also reads with no semicolon, by longest
// prefix, as GitHub's page does inside an HTML block; each has the value its
// name with `;` has, and none is a prefix of another. Sorted and joined by
// commas; generated and pinned as the table above is.
export const LEGACY_TABLE = [
  'AElig,AMP,Aacute,Acirc,Agrave,Aring,Atilde,Auml,COPY,Ccedil,ETH,Eacute,Ecirc,Egrave,Euml,GT',
  ',Iacute,Icirc,Igrave,Iuml,LT,Ntilde,Oacute,Ocirc,Ograve,Oslash,Otilde,Ouml,QUOT,REG,THORN,Uacute',
  ',Ucirc,Ugrave,Uuml,Yacute,aacute,acirc,acute,aelig,agrave,amp,aring,atilde,auml,brvbar,ccedil',
  ',cedil,cent,copy,curren,deg,divide,eacute,ecirc,egrave,eth,euml,frac12,frac14,frac34,gt,iacute',
  ',icirc,iexcl,igrave,iquest,iuml,laquo,lt,macr,micro,middot,nbsp,not,ntilde,oacute,ocirc,ograve',
  ',ordf,ordm,oslash,otilde,ouml,para,plusmn,pound,quot,raquo,reg,sect,shy,sup1,sup2,sup3,szlig',
  ',thorn,times,uacute,ucirc,ugrave,uml,uuml,yacute,yen,yuml',
].join('');
const LEGACY = new Set(LEGACY_TABLE.split(','));
const LEGACY_LONGEST = Math.max(...[...LEGACY].map(name => name.length));

/** References decoded by the old list, the floor's decoder, frozen as it stood before #394: `NAMED` above, case-insensitive, and numbers of at most seven decimal or six hex digits. */
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
 * References decoded as the page decodes them (#394): every name in the
 * table, with its case and its semicolon; else the longest legacy name the
 * text starts with, the rest left as written; and numbers of any length, with
 * or without the closing semicolon.
 */
function decodeAll(s) {
  return s.replace(/&(?:#([0-9]+);?|#[xX]([0-9A-Fa-f]+);?|([A-Za-z][A-Za-z0-9]{0,31})(;?))/g, (all, dec, hex, name, semi) => {
    if (name !== undefined) {
      if (semi && Object.hasOwn(NAMED_REFS, name)) return NAMED_REFS[name];
      for (let n = Math.min(name.length, LEGACY_LONGEST); n > 0; n -= 1) {
        if (LEGACY.has(name.slice(0, n))) return NAMED_REFS[name.slice(0, n)] + name.slice(n) + semi;
      }
      return all;
    }
    const cp = dec !== undefined ? Number(dec) : parseInt(hex, 16);
    if (!(cp > 0 && cp <= 0x10ffff) || (cp >= 0xd800 && cp <= 0xdfff)) return all;
    return String.fromCodePoint(cp);
  });
}

// Every control character but tab, line feed and carriage return. GitHub's
// comments show most of them as U+FFFD and a form feed as a space, and its
// plain markdown mode drops the C0 ones; stripping them only adds refusals.
const CONTROL_RE = /[\0-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;

// Raw HTML as the GFM spec's section 6.10 reads it, matched in one
// left-to-right scan: a backslash escape or a code span is kept as written, so
// nothing inside it is read as a tag; an open or closing tag, a comment, a
// processing instruction, a declaration or a CDATA section is removed.
// Anything else stays, an unclosed comment and a tag the grammar rejects
// included, as the page shows them as text. Spacing inside a tag is ASCII
// only (section 2.1), and a tag named in section 6.11's filter, in any case,
// stays too: GitHub escapes its `<`, so the page shows the rest as text.
const SPACE = '[ \\t\\n\\v\\f\\r]';
const FILTERED = ['title', 'textarea', 'style', 'xmp', 'iframe', 'noembed', 'noframes', 'script', 'plaintext']
  .map(name => [...name].map(c => `[${c}${c.toUpperCase()}]`).join(''))
  .join('|');
const TAG_NAME = `(?!(?:${FILTERED})(?![A-Za-z0-9-]))[A-Za-z][A-Za-z0-9-]*`;
const ATTRIBUTE = String.raw`${SPACE}+[A-Za-z_:][A-Za-z0-9_.:-]*(?:${SPACE}*=${SPACE}*(?:[^ \t\n\v\f\r"'=<>${'`'}]+|'[^']*'|"[^"]*"))?`;
const PAGE_RE = new RegExp(
  [
    String.raw`(?<kept>\\[!-/:-@[-${'`'}{-~]|(?<run>${'`'}+)(?!${'`'})[\s\S]*?(?<!${'`'})\k<run>(?!${'`'})|${'`'}+)`,
    String.raw`<${TAG_NAME}(?:${ATTRIBUTE})*${SPACE}*\/?>`,
    String.raw`<\/${TAG_NAME}${SPACE}*>`,
    String.raw`<!-->|<!--->|<!--[\s\S]*?-->`,
    // A processing instruction or CDATA section is raw HTML only with its
    // closer, but the page's HTML parser ends it at its first `>` and shows
    // what follows (#394 C24), so only that much is removed and the scan goes
    // on from there.
    String.raw`<\?(?=[\s\S]*?\?>)[^>]*>`,
    String.raw`<![A-Za-z][^>]*>`,
    String.raw`<!\[CDATA\[(?=[\s\S]*?\]\]>)[^>]*>`,
  ].join('|'),
  'g',
);

// The page pattern of #394's first build, frozen: Unicode spacing in a tag,
// no tag filter, read over the whole text. It reads a tag the HTML parser
// takes inside an HTML block where the inline grammar doesn't, such as one
// with a no-break space before `=` (#394 C26), and, as one more copy, can
// only add refusals.
const WIDE_ATTRIBUTE = String.raw`\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:[^\s"'=<>${'`'}]+|'[^']*'|"[^"]*"))?`;
const WIDE_RE = new RegExp(
  [
    String.raw`(?<kept>\\[!-/:-@[-${'`'}{-~]|(?<run>${'`'}+)(?!${'`'})[\s\S]*?(?<!${'`'})\k<run>(?!${'`'})|${'`'}+)`,
    String.raw`<[A-Za-z][A-Za-z0-9-]*(?:${WIDE_ATTRIBUTE})*\s*\/?>`,
    String.raw`<\/[A-Za-z][A-Za-z0-9-]*\s*>`,
    String.raw`<!-->|<!--->|<!--[\s\S]*?-->`,
    String.raw`<\?[\s\S]*?\?>`,
    String.raw`<![A-Za-z][^>]*>`,
    String.raw`<!\[CDATA\[[\s\S]*?\]\]>`,
  ].join('|'),
  'g',
);

/** `s` read further until nothing changes, at most five rounds: markdown escapes removed, references decoded as the page decodes them, invisible and control characters stripped, and NFKC applied. No tag or comment is removed. */
function settle(s) {
  let out = s;
  for (let round = 0; round < 5; round += 1) {
    const next = decodeAll(out.replace(ESCAPE_RE, '').replace(INVISIBLE_RE, '').replace(CONTROL_RE, '')).replace(INVISIBLE_RE, '').replace(CONTROL_RE, '').normalize('NFKC');
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * The normalised copies of a text, which the scan, the table check and the
 * edit checks all read (#394), in this order:
 * - the floor, two copies built by `normalise` as before #394, one without
 *   HTML comments and one with their contents kept, so no form refused then
 *   passes now;
 * - the page copy: the source's own raw HTML removed once, as the page's
 *   parser reads it (`PAGE_RE`), then settled, so text that decoding makes
 *   tag-shaped stays, as the page shows it;
 * - the bare copy: settled with nothing removed, for a tag the page shows as
 *   text where the page copy reads the source otherwise;
 * - the wide copy: the source's raw HTML removed once by `WIDE_RE`, then
 *   settled.
 */
function copies(text) {
  return [normalise(text), normalise(text, true), settle(readPage(text)), settle(text), settle(text.replace(WIDE_RE, (m, kept) => kept ?? ''))];
}

// A blank line: a line ending, then a line of nothing but spaces and tabs.
const BLANK_LINE_RE = /((?:\r\n|\r|\n)[ \t]*(?:\r\n|\r|\n))/;
// Block-quote markers at the start of a line.
const QUOTE_MARKS_RE = /^(?:[ ]{0,3}>[ \t]?)+/gm;

/**
 * `text` with its raw HTML removed by `PAGE_RE`, block by block: no tag, code
 * span or comment the page reads spans a blank line. Block-quote markers go
 * first, as the page strips them before it reads a tag carried onto the next
 * line (#394 C25), so a line holding only markers is a blank line.
 */
function readPage(text) {
  return text
    .replace(QUOTE_MARKS_RE, '')
    .split(BLANK_LINE_RE)
    .map((part, i) => (i % 2 ? part : part.replace(PAGE_RE, (m, kept) => kept ?? '')))
    .join('');
}

const LINK_PLAIN_RE = /!?\[([^[\]]*)\](?:\([^()]*\)|\[[^[\]]*\])?/g;
const LINK_NESTED_RE = /!?\[([^[\]]*)\](?:\((?:[^()"']|\([^()]*\)|"[^"]*"|'[^']*')*\)|\[[^[\]]*\])?/g;
const MARKS_RE = /[*_`~[\]]/g;
// The scan keeps `_`, which several secret shapes hold and CommonMark never reads as emphasis inside a word.
const SCAN_MARKS_RE = /[*`~[\]]/g;

/**
 * `s` with each link folded to its text and the marks `marks` matches
 * removed, two ways: one link form whose address holds no parenthesis (any
 * quote is an address character), and one whose address may hold one level of
 * parentheses and a quoted title; each alternative starts on its own
 * character, so neither match can backtrack without bound.
 */
function folds(s, marks = MARKS_RE) {
  const fold = re => s.replace(re, '$1').replace(marks, '');
  return [fold(LINK_PLAIN_RE), fold(LINK_NESTED_RE)];
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
 * [{ rule, where }]. Each field is scanned as is, as its normalised copies
 * (`copies`), and as the page copy with its marks folded away but for `_`.
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
    const normalised = copies(text);
    for (const norm of new Set([...normalised, ...folds(normalised[2], SCAN_MARKS_RE)])) {
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
 * text is read as written and as the normalised copies `scan` reads
 * (`copies`, #394), so a form that renders as the word is matched (#392) and
 * a word the page hides in a comment or tag still is; each copy is also read
 * with its links folded to their text, both ways `folds` gives (#396), and
 * its emphasis and code span marks dropped, which can split the word on the
 * page. A finding that quotes the withheld text after other words is not
 * matched.
 */
function withheldAfter(cell, state) {
  const after = cell.slice(state.length);
  const normalised = copies(after);
  return [after.replace(/\p{Cf}/gu, ''), ...normalised, ...normalised.flatMap(c => folds(c))].some(view => {
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

/** Text with its closed HTML comments dropped, again until none is left, so a nested opener such as `<!<!---->--` leaves no comment behind. */
function dropComments(text) {
  for (let prev; prev !== text;) {
    prev = text;
    text = text.replace(CLOSED_COMMENT_RE, '');
  }
  return text;
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
  const spansFirst = signedIn(dropComments(lines.map(blankCodeSpans).join('\n')));
  const commentsFirst = signedIn(dropComments(lines.join('\n')));
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

/** The views of a text the edit checks read: as written without format characters, its normalised copies (`copies`, #394), and each of those folded. */
function views(text) {
  const normalised = copies(text);
  return [text.replace(/\p{Cf}/gu, ''), ...normalised, ...normalised.flatMap(c => folds(c))];
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
  // Another account's item is read no further, so its text never reaches the slow readers (#394 C27); an own item in the wrong place is still read, so a leak in it is still told.
  if (item.user.login !== login) return { unusable: false, refusals };
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
