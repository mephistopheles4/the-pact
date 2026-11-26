#!/usr/bin/env node
// The poster (#246, its core built in #253). It posts free text to GitHub
// through one fixed gh api call per surface, reads back what landed by the id
// the answer carried, and exits non-zero unless what landed is what was sent.
// A port of gh-post.ts, github-post.ts and github-body.ts from stacks, the
// owner's other repository, read as text.
//
//   node poster.mjs <surface> --post <file> [--dry-run]
//   node poster.mjs schema
//
// A post is one JSON document (#524), checked against a strict schema that
// `schema` prints: an unknown field, a wrong type, a pattern miss or an
// over-length value is refused, and nothing is sent. The surfaces:
//
//     issue, pull-request, issue-comment, pull-request-review, review-thread-reply
//     the edits (#413): issue-edit, pull-request-edit, issue-comment-edit,
//                       review-thread-reply-edit
//
// Each create post names its `kind`, and a kind of an issue, pull request, spec
// or decision carries the owner's `quote` and the session's `intent`, so a
// reader can check the read-back against the owner's words. The poster builds
// the body from fixed parts: the ask and intent blocks, the session's body from
// the file the post names (`body_file`, in the post file's own folder), the
// `Signed:` line and, on an edit, the reason lines. The post's text fields are
// unverified: they catch accidents, and are not a control.
//
// An edit reads the item first and refuses one its login didn't write, one
// not signed with the post's signer, a review record, a decision mark, an item
// holding a leak the scan finds, and a body that drops, forges or hides an
// earlier reason line. It carries the item's reason lines forward and adds
// `Edited: <reason> (<signer>)`. An item that opens with the owner's ask and the
// read-back is an ask item (#524): its edit carries `quote` and `intent`, which
// must be the item's own (edit/ask), and may move the read-back from pending to
// confirmed or corrected by citing the decision comment that heard the owner
// (edit/status, edit/confirm). A status edit (`issue-comment-edit` signed
// `status-<n>`, n the issue) is the one exception: it carries none, so only the
// newest is kept (#503).
//
// Every piece of free text comes from a file, so no prose reaches a command
// line. Before anything is sent it checks every field and file, and scans the
// exact text it would send for a live environment secret's value and hidden
// text; it refuses no token shape, email address, path or session id (#326,
// #364, #366, #441).
// Then it checks the shape of any Lens dispositions table in the body against
// the review procedure's template (#280, T2), and refuses a body whose prose is
// hard-wrapped, whose link has no scheme (#317, text/hard-wrap and
// link/relative) or that leaves a fence open (#401, fence/unclosed); it never
// rewrites a body. The owner's quote is skipped by the prose check. Before it
// posts, it checks that the repo's owner is the gh login, by name and again by
// what GitHub returns for the repo (owner/repo, owner/github), and reads each
// tracker comment a quote cites (post/tracker). The scans are a backstop for
// accidents, not a guard against a session that sets out to get past them.
//
// App mode (#599, T3, PACT-104): with an app pinned in ~/.pact/github.json
// and gh-app.mjs beside this file, `postAsApp` posts as the pinned app whose bot
// login is the post's `as` (else as `claude`, when it is pinned) on a token
// the helper mints, checks the pin against GitHub's records first, and reads as
// the owner's own gh. `post` is the owner's run, unchanged and synchronous. See
// docs/poster.md, Posting as an agent app.
//
// The last line is always a RESULT line on stdout, except for `schema`, which
// prints the schema and nothing else:
//   0  RESULT: verified <surface> <url> as <login>
//   1  RESULT: mismatch <url>     posted, but a field differs
//   1  RESULT: unverified <url>   posted, but the read-back failed or was unusable
//   2  RESULT: refused <count>    a usage fault or a content refusal; nothing sent
//   3  RESULT: failed             the post call failed; it may or may not have landed
//   4  RESULT: unavailable        a read before posting failed, or the poster
//                                 itself failed before sending; nothing sent
//   0  RESULT: dry-run <surface>
// Exits 1 and 3 also print one NEXT: line, straight above the RESULT line,
// that says what the session does next (#294). An old option is refused with
// one fixed NEXT: line that names the new form (#524). Exit 2 prints one NEXT:
// line for each rule it refuses but the owner/ and as/ rules (PACT-48, PACT-52).
// Output names rules, fields, positions and sizes, never the text itself; the
// NEXT: line holds fixed words, a page and a login. It never retries.
//
// Node 24 or later, ESM, node: built-ins only. Every rule is an exported
// function that takes gh and the environment as inputs, so its tests need no
// gh and no network. Only main reads the real values, and main runs only when
// this file is the entry script.

import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, lstatSync, mkdtempSync, openSync, readSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- the surfaces

const FLAGS = new Set(['dry-run']);
const OPTIONS = new Set(['post', 'dry-run']);

const REQ = 'req';
const OPT = 'opt';
const BYKIND = 'kind';
const COMMON_FIELDS = { repo: REQ, as: OPT, signer: REQ, body_file: REQ };
const CREATE_FIELDS = { kind: REQ, quote: BYKIND, intent: BYKIND, intent_skip: BYKIND, intent_none: BYKIND, start_none: BYKIND };
/** An edit's ask, its quote passages or its no-owner-words reasons, with its reading (`intent` or `intent_skip`), or none of them; the item decides which (S6.1). */
const EDIT_ASK = { quote: OPT, intent: OPT, intent_skip: OPT, intent_none: OPT, start_none: OPT };

/**
 * Each surface's own post fields: `req` is required, `opt` optional, `kind`
 * decided by the post's kind. A field the schema knows and a surface leaves out
 * is refused `post/field` there (#524, S3.1).
 */
export const SURFACES = Object.freeze({
  issue: { ...CREATE_FIELDS, title: REQ, labels: OPT },
  'pull-request': { ...CREATE_FIELDS, title: REQ, head: REQ, base: REQ, draft: OPT },
  'issue-comment': { ...CREATE_FIELDS, issue: REQ, answers: OPT },
  'pull-request-review': { ...CREATE_FIELDS, pr: REQ },
  'review-thread-reply': { ...CREATE_FIELDS, pr: REQ, comment: REQ },
  'issue-edit': { issue: REQ, ...EDIT_ASK },
  'pull-request-edit': { pr: REQ, ...EDIT_ASK },
  'issue-comment-edit': { issue: REQ, comment: REQ, ...EDIT_ASK },
  'review-thread-reply-edit': { pr: REQ, comment: REQ, ...EDIT_ASK },
});

/** The fields a surface takes: the common ones and its own. */
const fieldsOf = surface => ({ ...COMMON_FIELDS, ...SURFACES[surface] });

/** The surfaces that edit a body the poster's login already posted (#413). */
const EDITS = new Set(['issue-edit', 'pull-request-edit', 'issue-comment-edit', 'review-thread-reply-edit']);
export const isEdit = surface => EDITS.has(surface);

/**
 * Each kind of create post: the surfaces it goes to, and whether it carries
 * the owner's quote and the read-back (S4). A `roles` kind sorts its quote into
 * the words that started the intent and the words that started the task, or
 * says there are none (PACT-77).
 */
export const KINDS = Object.freeze({
  issue: { surfaces: ['issue'], quoted: true, roles: true },
  'pull-request': { surfaces: ['pull-request'], quoted: true, roles: true },
  spec: { surfaces: ['issue-comment'], quoted: true, roles: true },
  decision: { surfaces: ['issue-comment'], quoted: true },
  status: { surfaces: ['issue-comment'], quoted: false },
  'lens-report': { surfaces: ['issue-comment', 'pull-request-review'], quoted: false },
  note: { surfaces: ['issue-comment'], quoted: false },
  review: { surfaces: ['pull-request-review'], quoted: false },
  reply: { surfaces: ['review-thread-reply'], quoted: false },
});

const FILE_MAX = 256 * 1024;
const BODY_MAX = 65536;

// ---------------------------------------------------------------- the input rules

const LOGIN_RE = /^[A-Za-z0-9-]{1,39}$/;
/** The `as` field: a login, or an app's bot login, `<slug>[bot]` (#599, S8). */
const AS_SOURCE = '^[A-Za-z0-9-]{1,39}(?:\\[bot\\])?$';
const REPO_RE = /^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/;
const NUMBER_RE = /^[1-9][0-9]{0,15}$/;
const BRANCH_RE = /^[A-Za-z0-9._/-]{1,255}$/;
const LABEL_RE = /^[A-Za-z0-9 :._-]{1,50}$/;
const LABEL_SOURCE = '[a-z0-9][a-z0-9-]{0,49}';
// The one upper-case shape a signer takes (#580): `pr-<KEY>-<n>`, the key a team's, the number the item's. No other upper-case label opens.
const KEYED_SOURCE = 'pr-[A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,15}';
/** A signer as a signature line holds it, without anchors or capturing groups. */
const SIGNER_SOURCE = `(?:${LABEL_SOURCE}|${KEYED_SOURCE})`;
const SIGNED_RE = new RegExp(`^${SIGNER_SOURCE}$`);
const VIA_RE = new RegExp(`^${LABEL_SOURCE}$`);
const HEAD_RE = /^(?:[A-Za-z0-9-]{1,39}:)?[A-Za-z0-9._/-]{1,255}$/;
const ANSWERS_RE = /^(?:issue|pull request|comment) [1-9][0-9]{0,15}$/;
const BODY_FILE_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/;
const WHEN_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const TITLE_RE_SOURCE = '^\\S(?:[^\\r\\n\\u2028\\u2029]*\\S)?$';

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
 * A text file read strictly: a regular file, not a link, at most 256 KiB.
 * Valid UTF-8, with no byte-order mark, and not empty. Returns { text } or
 * { rule }.
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

// ---------------------------------------------------------------- the schema (#524)

const ID = Object.freeze({ type: 'integer', minimum: 1 });

/**
 * The post document's schema, JSON Schema draft 2020-12, as `node poster.mjs
 * schema` prints it. The validator below checks only the keywords this object
 * uses. The rules that need code are named in the top-level description.
 */
export const SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'A post for the pact poster',
  description:
    'One JSON document per post, strict: an unknown field, a wrong type, a pattern miss or an over-length value is refused. ' +
    'Code beside the schema decides what a schema cannot: which fields each surface takes (post/field, post/missing), ' +
    'the kind table (post/kind, post/signer, post/status), the quote rules (post/tracker, post/when, post/field), ' +
    'the intent rules (post/status, post/owned-line, text/hidden-line), the edit rules once the item is read (edit/ask, edit/status, edit/confirm), ' +
    'and the body file (file rules, post/owned-line). ' +
    'The surfaces: issue, pull-request, issue-comment, pull-request-review, review-thread-reply, and the four edits ' +
    '(issue-edit, pull-request-edit, issue-comment-edit, review-thread-reply-edit).',
  type: 'object',
  additionalProperties: false,
  required: ['repo', 'signer', 'body_file'],
  properties: {
    repo: { type: 'string', maxLength: 140, pattern: REPO_RE.source },
    as: { type: 'string', pattern: AS_SOURCE },
    kind: { enum: Object.keys(KINDS) },
    title: { type: 'string', minLength: 1, maxLength: 120, pattern: TITLE_RE_SOURCE },
    labels: { type: 'array', maxItems: 10, items: { type: 'string', pattern: LABEL_RE.source } },
    answers: { type: 'string', maxLength: 40, pattern: ANSWERS_RE.source },
    head: { type: 'string', maxLength: 300, pattern: HEAD_RE.source },
    base: { type: 'string', maxLength: 300, pattern: BRANCH_RE.source },
    draft: { type: 'boolean' },
    issue: ID,
    pr: ID,
    comment: ID,
    signer: { type: 'string', pattern: SIGNED_RE.source },
    quote: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'source', 'when'],
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 4000 },
          source: { enum: ['chat', 'relayed', 'tracker'] },
          // Which of the two quotes the passage is (PACT-77): the words that started the intent, the words that started the task, or one passage for both.
          role: { enum: ['intent', 'start', 'both'] },
          comment: ID,
          via: { type: 'string', pattern: VIA_RE.source },
          when: { type: 'string', pattern: WHEN_RE.source, 'x-rule': 'post/when' },
        },
      },
    },
    intent: {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'status'],
      properties: {
        text: { type: 'string', minLength: 1, maxLength: 2000 },
        status: { enum: ['pending', 'confirmed', 'corrected'] },
        comment: ID,
        corrected: { type: 'string', minLength: 1, maxLength: 2000 },
      },
    },
    // The one-line reason a post carries no Understood intent: its own field, never part of `intent` (PACT-48).
    // No leading or trailing space: the item is read back as a skipped one only from `Skipped: ` and a non-space (PACT-48).
    intent_skip: { type: 'string', minLength: 1, maxLength: 200, pattern: '^\\S(?:[^\\r\\n\\u2028\\u2029]*\\S)?$' },
    // The one-line reason no owner words started the intent, or the task (PACT-77), in place of that quote's passages; the form of `intent_skip`.
    intent_none: { type: 'string', minLength: 1, maxLength: 200, pattern: '^\\S(?:[^\\r\\n\\u2028\\u2029]*\\S)?$' },
    start_none: { type: 'string', minLength: 1, maxLength: 200, pattern: '^\\S(?:[^\\r\\n\\u2028\\u2029]*\\S)?$' },
    body_file: { type: 'string', pattern: BODY_FILE_RE.source },
  },
});

/** The documented post for each surface, as the post file's own JSON. */
export const EXAMPLES = Object.freeze({
  issue: {
    repo: 'you/your-repo',
    kind: 'issue',
    title: 'A clear one-line title',
    labels: ['bug'],
    signer: 'plan-12',
    quote: [{ text: 'The words the owner said, exactly.', source: 'chat', when: '2026-11-11', role: 'both' }],
    intent: { text: 'What the session took those words to mean.', status: 'pending' },
    body_file: 'body.md',
  },
  'pull-request': {
    repo: 'you/your-repo',
    kind: 'pull-request',
    title: 'A clear one-line title',
    head: 'my-branch',
    base: 'main',
    draft: true,
    signer: 'pr-12',
    quote: [{ text: 'The words the owner said, exactly.', source: 'chat', when: '2026-11-11', role: 'both' }],
    intent: { text: 'What the session took those words to mean.', status: 'pending' },
    body_file: 'body.md',
  },
  'issue-comment': { repo: 'you/your-repo', kind: 'note', issue: 12, as: 'you', signer: 'build-12', body_file: 'comment.md' },
  'pull-request-review': { repo: 'you/your-repo', kind: 'review', pr: 34, signer: 'review-34', body_file: 'review.md' },
  'review-thread-reply': { repo: 'you/your-repo', kind: 'reply', pr: 34, comment: 5678, signer: 'build-34', body_file: 'reply.md' },
  'issue-edit': { repo: 'you/your-repo', issue: 12, signer: 'build-12', body_file: 'body.md' },
  'pull-request-edit': { repo: 'you/your-repo', pr: 34, signer: 'pr-34', body_file: 'body.md' },
  'issue-comment-edit': { repo: 'you/your-repo', issue: 12, comment: 4321, signer: 'build-12', body_file: 'comment.md' },
  'review-thread-reply-edit': { repo: 'you/your-repo', pr: 34, comment: 8765, signer: 'build-34', body_file: 'reply.md' },
});

// ---------------------------------------------------------------- the command line

const OPTION_RE = /^--[a-z][a-z-]{0,30}$/;

/** The fixed line after an old option (S5.5): no argument the session gave reaches it. */
export const OLD_OPTION_NEXT = 'NEXT: the poster takes a JSON post now: <surface> --post <file>. See node poster.mjs schema and the Posting section of ~/.pact/review.md; never post with plain gh.';

/**
 * The surface and options from an argument list, with every usage fault as a
 * refusal: an unknown surface or option (every option but `--post <file>` and
 * `--dry-run`), a word that is no option, a missing value, a repeated option,
 * and a missing `--post`. `schema` takes no option. An option whose value is
 * missing is kept as null, so it is not also reported missing.
 */
export function parseArgs(argv) {
  const refusals = [];
  const options = new Map();
  const [surface, ...rest] = argv;
  const isSchema = surface === 'schema';
  if (surface === undefined || (!isSchema && !Object.hasOwn(SURFACES, surface))) {
    refusals.push({ rule: 'usage/surface', where: 'argument 1' });
    return { surface: null, options, refusals };
  }
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    const at = `argument ${i + 2}`;
    if (!token.startsWith('--')) {
      refusals.push({ rule: 'usage/argument', where: at });
      continue;
    }
    const name = token.slice(2);
    if (isSchema || !OPTION_RE.test(token) || !OPTIONS.has(name)) {
      // Its value, if it has one, goes with it: one fault, not two.
      refusals.push({ rule: 'usage/unknown-option', where: at });
      if (rest[i + 1] !== undefined && !rest[i + 1].startsWith('--')) i += 1;
      continue;
    }
    if (options.has(name)) {
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
      options.set(name, null);
      continue;
    }
    i += 1;
    options.set(name, value);
  }
  if (!isSchema && !options.has('post')) refusals.push({ rule: 'usage/missing-option', where: 'option --post' });
  return { surface, options, refusals };
}

// ---------------------------------------------------------------- the validator

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const joinPath = (path, key) => (path === '' ? key : `${path}.${key}`);
/** An unknown key is named by its path only when it can't carry text; else by its position among the keys. */
const KEY_NAME_RE = /^[a-z_]{1,30}$/;

/**
 * Check `value` against `schema`, adding { rule, where } to `out`. The keywords
 * it reads are the ones SCHEMA uses: type, required, properties,
 * additionalProperties, enum, minLength, maxLength, pattern, minItems,
 * maxItems, items and minimum. A wrong type is `post/type`; a missing
 * required field `post/missing`; an enum or pattern miss `post/pattern` (or
 * the schema's own `x-rule`); a length miss `post/length`; an unknown key
 * `post/unknown`. Each `where` is a JSON path, never a value.
 */
function validate(schema, value, path, out) {
  const bad = rule => out.push({ rule, where: path });
  if (schema.type === 'string' || (schema.enum && schema.enum.every(e => typeof e === 'string'))) {
    if (typeof value !== 'string') return bad('post/type');
  }
  if (schema.enum) {
    if (!schema.enum.includes(value)) bad('post/pattern');
    return;
  }
  switch (schema.type) {
    case 'string': {
      const n = chars(value);
      if ((schema.minLength !== undefined && n < schema.minLength) || (schema.maxLength !== undefined && n > schema.maxLength)) return bad('post/length');
      if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) bad(schema['x-rule'] ?? 'post/pattern');
      return;
    }
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) return bad('post/type');
      if ((schema.minimum !== undefined && value < schema.minimum) || !Number.isSafeInteger(value) || !isNumber(String(value))) bad('post/pattern');
      return;
    case 'boolean':
      if (typeof value !== 'boolean') bad('post/type');
      return;
    case 'array': {
      if (!Array.isArray(value)) return bad('post/type');
      if ((schema.minItems !== undefined && value.length < schema.minItems) || (schema.maxItems !== undefined && value.length > schema.maxItems)) return bad('post/length');
      if (schema.items) value.forEach((item, i) => validate(schema.items, item, `${path}[${i}]`, out));
      return;
    }
    case 'object': {
      if (!isObject(value)) return bad('post/type');
      const keys = Object.keys(value);
      for (const name of schema.required ?? []) if (!Object.hasOwn(value, name)) out.push({ rule: 'post/missing', where: joinPath(path, name) });
      keys.forEach((key, n) => {
        if (!Object.hasOwn(schema.properties, key)) {
          if (schema.additionalProperties === false) out.push({ rule: 'post/unknown', where: joinPath(path, KEY_NAME_RE.test(key) ? key : `$.${n + 1}`) });
          return;
        }
        validate(schema.properties[key], value[key], joinPath(path, key), out);
      });
      return;
    }
    default:
      throw new TypeError('no such type');
  }
}

// ---------------------------------------------------------------- the post's own rules

/** The date, `YYYY-MM-DD`, of a Date in UTC. */
const utcDate = d => d.toISOString().slice(0, 10);

/** Whether `when` names a real calendar day no later than `now`'s UTC date plus one day. */
function realDay(when, now) {
  if (!WHEN_RE.test(when)) return false;
  const [y, m, d] = when.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) return false;
  return when <= utcDate(new Date(now.getTime() + 86400000));
}

const LEFT_OUT = '[left out]';
const TRACKER_FLOOR = 20;
const TRACKER_SPANS = 3;

/** A tracker passage's text as the parts around its `[left out]` spans, and how many spans it holds. */
function spansOf(text) {
  const parts = text.replace(/\r\n|\r/g, '\n').split(LEFT_OUT);
  return { parts, spans: parts.length - 1 };
}

/**
 * The refusals a tracker passage's text earns without a read (P27): fewer
 * than 20 characters outside its `[left out]` spans, two spans that touch, or
 * more than three spans.
 */
function trackerShape(text) {
  const { parts, spans } = spansOf(text);
  const outside = parts.reduce((n, p) => n + chars(p), 0);
  const touching = parts.slice(1, -1).some(p => p === '');
  return outside < TRACKER_FLOOR || touching || spans > TRACKER_SPANS;
}

/** Whether every part of `text` around its spans appears in `comment` in order, each by a plain substring search (P20, P25). */
function inComment(text, comment) {
  const body = comment.replace(/\r\n|\r/g, '\n');
  let at = 0;
  for (const part of spansOf(text).parts) {
    if (part === '') continue;
    const found = body.indexOf(part, at);
    if (found < 0) return false;
    at = found + part.length;
  }
  return true;
}

const allChat = quote => quote.every(q => q.source === 'chat');

/** The lines a field may not hold (S3.3, S5.3): each is read as the page shows it. */
const FIXED_START = [
  /^read-back:/,
  /^answers:/,
  /^corrected read-back:/,
  /^said in this session's chat/,
  /^relayed by /,
  /^from the owner's comment/,
  /^no owner words started the (?:intent|task):/,
  /^relayed owner words/,
  /^heard in chat by /,
  /^#{1,6}[ \t]*(?:the ask|understood intent)[ \t]*#*$/,
];
const OWNED_SIGNATURE_RE = /^(?:signed: [a-z0-9][a-z0-9-]{0,49}|posted by [a-z0-9][a-z0-9-]{0,49}\.)$/;
const HTML_HEADING_RE = /<h[1-6][\s/>]/i;
const MARKER_RE = /^[ \t]*(?:>|[-*+](?=[ \t])|[0-9]{1,9}[.)](?=[ \t]))[ \t]*/;
const OPENER_RE = /^(?:`{3,}|~{3,})/;

/** One view of a line as the owned lines are matched: leading quote and list markers removed, a curly apostrophe straightened, trimmed, in lower case. */
function pageLine(view) {
  let s = view.replace(/[‘’]/g, "'");
  for (let prev = null; prev !== s;) {
    prev = s;
    s = s.replace(MARKER_RE, '');
  }
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Whether a line is an owned line (S5.3) in any of its views. */
function isOwnedLine(line) {
  return views(line).some(v => {
    const s = pageLine(v);
    return OWNED_SIGNATURE_RE.test(s) || FIXED_START.some(re => re.test(s)) || s.includes(DECISION);
  });
}

/** Whether a line is a heading, a fence opener or an HTML heading, in any view, once its leading markers are gone. */
function isHeadingLine(line) {
  return views(line).some(v => {
    const s = pageLine(v);
    return HEADING_RE.test(s) || OPENER_RE.test(s) || HTML_HEADING_RE.test(v);
  });
}

/**
 * Whether a read-back field holds an owned line, a heading (ATX, setext or
 * HTML), or a fence-opening run (P7, P17, P28). Every line counts, fenced or
 * not, since a fence opener is itself refused.
 */
function intentOwned(text) {
  const lines = linesOf(text);
  return lines.some((line, i) => {
    if (isOwnedLine(line) || isHeadingLine(line)) return true;
    return line.trim() !== '' && SETEXT_RE.test(lines[i + 1] ?? '');
  });
}

/** Whether the session's body file holds an owned line outside a fence (S5.3). */
function bodyOwned(text) {
  return unfenced(linesOf(text)).some(isOwnedLine);
}

/**
 * A create post of a kind that sorts its quote (PACT-77): the words that started
 * the intent and the words that started the task are each a passage with that
 * role, or a reason in `intent_none` / `start_none`, never both for one. A
 * passage with no role gets its own refusal, so the two sides aren't counted then.
 */
function rolesRules(doc, out) {
  const passages = Array.isArray(doc.quote) ? doc.quote : [];
  if (!passages.every(q => isObject(q) && typeof q.role === 'string')) return;
  for (const side of ['intent', 'start']) {
    const none = `${side}_none`;
    const covered = passages.some(q => q.role === side || q.role === 'both');
    if (covered && Object.hasOwn(doc, none)) out.push({ rule: 'post/field', where: none });
    else if (!covered && !Object.hasOwn(doc, none)) out.push({ rule: 'post/missing', where: `quote.${side}` });
  }
}

/**
 * The refusals for the shape of a post that parsed against the schema: the
 * fields a surface takes, the kind table, the signer, the quote, and the
 * intent. `now` is the poster's own clock.
 */
function postRules(doc, surface, now) {
  const out = [];
  const has = name => Object.hasOwn(doc, name);
  const fields = fieldsOf(surface);
  for (const name of Object.keys(SCHEMA.properties)) {
    const rule = fields[name];
    if (rule === undefined) {
      if (has(name)) out.push({ rule: 'post/field', where: name });
    } else if (rule === REQ && !has(name) && !SCHEMA.required.includes(name)) {
      out.push({ rule: 'post/missing', where: name });
    }
  }
  const edit = isEdit(surface);
  const kind = doc.kind;
  // The reading of the owner's words, or the reason there is none: one of the two, never both (PACT-48).
  const reading = has('intent') || has('intent_skip');
  if (has('intent') && has('intent_skip')) out.push({ rule: 'post/field', where: 'intent_skip' });
  // The ask: passages, or the reasons a quote has none (PACT-77).
  const asked = has('quote') || has('intent_none') || has('start_none');
  if (edit) {
    // An edit carries the ask with its reading, or neither; whether it may is the item's to say (S6.1).
    if (reading && !asked) out.push({ rule: 'post/missing', where: 'quote' });
    if (asked && !reading) out.push({ rule: 'post/missing', where: 'intent' });
  } else {
    const row = typeof kind === 'string' && Object.hasOwn(KINDS, kind) ? KINDS[kind] : null;
    if (row && !row.surfaces.includes(surface)) out.push({ rule: 'post/kind', where: 'kind' });
    if (!row || !row.surfaces.includes(surface)) return out;
    if (row.quoted) {
      if (row.roles) rolesRules(doc, out);
      else {
        if (!has('quote')) out.push({ rule: 'post/missing', where: 'quote' });
        for (const name of ['intent_none', 'start_none']) if (has(name)) out.push({ rule: 'post/field', where: name });
      }
      if (!reading) out.push({ rule: 'post/missing', where: 'intent' });
      // A decision's reading is a read-back the owner answers, so it never skips one.
      if (kind === 'decision' && has('intent_skip')) out.push({ rule: 'post/field', where: 'intent_skip' });
    } else {
      for (const name of ['quote', 'intent', 'intent_skip', 'intent_none', 'start_none']) if (has(name)) out.push({ rule: 'post/field', where: name });
    }
    if (has('answers') && kind !== 'decision' && fields.answers !== undefined) out.push({ rule: 'post/field', where: 'answers' });
    if (typeof doc.signer === 'string') {
      const status = kind === 'status' ? typeof doc.issue === 'number' && doc.signer === `status-${doc.issue}` : !doc.signer.startsWith('status-');
      if (!status) out.push({ rule: 'post/signer', where: 'signer' });
    }
    if (!row.quoted) return out;
  }
  for (const name of ['intent_skip', 'intent_none', 'start_none']) {
    if (typeof doc[name] === 'string' && intentOwned(doc[name])) out.push({ rule: 'post/owned-line', where: name });
  }
  const passages = Array.isArray(doc.quote) ? doc.quote : [];
  passages.forEach((q, i) => {
    const at = `quote[${i}]`;
    if (!isObject(q)) return;
    // A role sorts a passage into the intent's words or the task's; a create post of a kind that sorts needs one, any other kind takes none, and an edit's item says whether it holds one (PACT-77).
    if (!edit && Object.hasOwn(q, 'role') !== Boolean(KINDS[kind]?.roles)) out.push({ rule: Object.hasOwn(q, 'role') ? 'post/field' : 'post/missing', where: `${at}.role` });
    if (q.source === 'tracker') {
      if (!Object.hasOwn(q, 'comment')) out.push({ rule: 'post/missing', where: `${at}.comment` });
      else if (typeof q.text === 'string' && trackerShape(q.text)) out.push({ rule: 'post/tracker', where: `${at}.text` });
    } else if (Object.hasOwn(q, 'comment')) out.push({ rule: 'post/field', where: `${at}.comment` });
    if (q.source === 'relayed' && !Object.hasOwn(q, 'via')) out.push({ rule: 'post/missing', where: `${at}.via` });
    else if (q.source !== 'relayed' && Object.hasOwn(q, 'via')) out.push({ rule: 'post/field', where: `${at}.via` });
    if (typeof q.when === 'string' && WHEN_RE.test(q.when) && !realDay(q.when, now)) out.push({ rule: 'post/when', where: `${at}.when` });
  });

  const { intent } = doc;
  if (!isObject(intent)) return out;
  if (edit) {
    // On an edit the read-back's move is the item's to judge (S6.2); the corrected text belongs to the corrected status alone, and that status needs it.
    if (intent.status === 'corrected' && !Object.hasOwn(intent, 'corrected')) out.push({ rule: 'post/missing', where: 'intent.corrected' });
    if (intent.status !== 'corrected' && Object.hasOwn(intent, 'corrected')) out.push({ rule: 'post/field', where: 'intent.corrected' });
  } else {
    if (intent.status === 'corrected') out.push({ rule: 'post/status', where: 'intent.status' });
    if (Object.hasOwn(intent, 'comment')) out.push({ rule: 'post/field', where: 'intent.comment' });
    if (Object.hasOwn(intent, 'corrected')) out.push({ rule: 'post/field', where: 'intent.corrected' });
    const chat = passages.length > 0 && passages.every(q => isObject(q) && q.source === 'chat');
    if (intent.status === 'confirmed' && !chat) out.push({ rule: 'post/status', where: 'intent.status' });
    if (kind === 'decision' && chat && intent.status === 'pending') out.push({ rule: 'post/status', where: 'intent.status' });
  }
  for (const name of ['text', 'corrected']) {
    if (typeof intent[name] === 'string' && intentOwned(intent[name])) out.push({ rule: 'post/owned-line', where: `intent.${name}` });
  }
  return out;
}

// Block-quote markers at the start of a line.
const QUOTE_RE = /^(?:[ ]{0,3}>[ ]?)+/;

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

/** Whether a text opens an HTML comment or a fold it doesn't close, which would hide what follows it on the page. */
function hidesAhead(text) {
  const before = linesOf(text).map(blankCodeSpans).join('\n');
  if (before.lastIndexOf('<!--') > before.lastIndexOf('-->')) return true;
  // On the page a comment opened on a quoted line ends where the quote does, so its closer must sit in the same run of quoted lines (#524).
  let run = [];
  for (const line of [...before.split('\n'), '']) {
    if (QUOTE_RE.test(line)) run.push(line);
    else {
      const joined = run.join('\n');
      if (joined.lastIndexOf('<!--') > joined.lastIndexOf('-->')) return true;
      run = [];
    }
  }
  const count = re => (before.match(re) ?? []).length;
  return count(/<details\b/gi) > count(/<\/details\s*>/gi);
}

// ---------------------------------------------------------------- rendering (S5)

const MARK_CHAT = 'Owner decision, from chat.';
const MARK_RELAYED = 'Relayed owner words, not a decision mark.';
/** The line an app's decision from chat opens with, in place of the owner's mark (#599, S8): the session heard it, the owner did not write it. */
const heardMark = signer => `Heard in chat by ${signer}.`;
const HEARD_RE = new RegExp(`^Heard in chat by (${SIGNER_SOURCE})\\.$`);
const HEARD_START_RE = /^heard in chat by /;
const quoteLines = (text, blank) => text.split(LINE_END_RE).map(l => (blank ? '' : l === '' ? '>' : `> ${l}`)).join('\n');
/** What a passage's role adds to its source line (PACT-77); a passage with none, as in an older item, adds nothing. */
const ROLE_LINE = { intent: ' Started the intent.', start: ' Started the task.', both: ' Started the intent and the task.' };
const sourceLine = q => {
  const role = q.role === undefined ? '' : ROLE_LINE[q.role];
  if (q.source === 'chat') return `Said in this session's chat, ${q.when}.${role}`;
  if (q.source === 'relayed') return `Relayed by ${q.via} from its chat, ${q.when}.${role}`;
  return `From the owner's comment ${q.comment}, ${q.when}.${role}`;
};
const readBack = intent => {
  if (intent.status === 'corrected') return `Read-back: corrected in comment ${intent.comment}.`;
  if (intent.status === 'confirmed') return intent.comment === undefined ? "Read-back: confirmed in this session's chat." : `Read-back: confirmed in comment ${intent.comment}.`;
  return 'Read-back: not yet confirmed.';
};
/** The intent block (S5.1 3): a corrected one shows the original struck through, paragraph by paragraph, then the correction. */
const intentBlock = intent => {
  // Line ends are made LF first, so a CRLF paragraph break still ends its strike span and the item reads the same whichever line ends the session wrote.
  const original = lf(intent.text);
  const text = intent.status === 'corrected' ? `${original.split(/\n{2,}/).map(p => `~~${p}~~`).join('\n\n')}\n\nCorrected read-back:\n\n${lf(intent.corrected)}` : original;
  return `## Understood intent\n\n${text}\n\n${readBack(intent)}`;
};

/** The intent block of a post that skips the reading (PACT-48): the heading and the reason, with no read-back line. */
const skippedBlock = reason => `## Understood intent\n\nSkipped: ${reason}`;

/**
 * The parts of a body that hold the owner's ask, each with the field it names
 * (S5.1 1 to 3): the decision mark and `Answers:` line, `## The ask` with each
 * passage, and the intent block. A create post's mark comes from its kind; an
 * edit's comes from the item (`p.mark`, `p.answers`), so the item's own lines
 * are carried forward as they stand (S6.1).
 */
function askSegments(p, blankQuotes = false) {
  const segments = [];
  const chatMark = p.heard ? heardMark(p.signer) : MARK_CHAT;
  const mark = p.mark ?? (p.kind === 'decision' ? (allChat(p.quote) ? chatMark : MARK_RELAYED) : undefined);
  if (mark !== undefined) {
    segments.push({ where: 'mark', text: mark });
    if (p.answers !== undefined) segments.push({ where: 'answers', text: `Answers: ${p.answers}.` });
  }
  if (p.quote !== undefined || p.intentNone !== undefined || p.startNone !== undefined) {
    segments.push({ where: 'quote', text: '## The ask' });
    (p.quote ?? []).forEach((q, i) => segments.push({ where: `quote[${i}]`, text: `${quoteLines(q.text, blankQuotes)}\n\n${sourceLine(q)}` }));
    // The side with no owner words says so plainly (PACT-77).
    if (p.intentNone !== undefined) segments.push({ where: 'intent_none', text: `No owner words started the intent: ${p.intentNone}` });
    if (p.startNone !== undefined) segments.push({ where: 'start_none', text: `No owner words started the task: ${p.startNone}` });
    segments.push({ where: 'intent', text: p.intentSkip === undefined ? intentBlock(p.intent) : skippedBlock(p.intentSkip) });
  }
  return segments;
}

/**
 * The body the poster sends, built from fixed parts, one blank line between
 * each (S5.1): the decision mark and `Answers:` line, the ask block, the
 * intent block, the session's body file, and `Signed:`.
 * With `blankQuotes`, each quote line is empty, so a check that skips the
 * owner's words reads the same lines at the same positions.
 */
export function renderBody(p, blankQuotes = false) {
  const parts = askSegments(p, blankQuotes).map(s => s.text);
  parts.push(p.sessionPart.replace(/(?:\r?\n)+$/, ''));
  parts.push(`Signed: ${p.signer}`);
  return parts.join('\n\n');
}

/**
 * What the command line asks to post, checked: the post file read strictly
 * and parsed, its shape checked against the schema and the poster's own
 * rules, and its body file read from the post file's own folder. Returns
 * { plan, refusals }; the plan is whole only when there are no refusals.
 */
export function buildPlan(parsed, now = new Date(), heard = false) {
  const { surface, options } = parsed;
  const refusals = [];
  // `heard`: app mode, where a chat decision is marked "Heard in chat by", never with the owner's mark (#599, S8).
  const plan = { surface, labels: [], draft: false, dryRun: options.get('dry-run') === true, heard };
  const file = options.get('post');
  const r = readText(file);
  if (r.rule) return { plan, refusals: [{ rule: r.rule, where: 'post file' }] };
  let doc;
  try {
    doc = JSON.parse(r.text);
  } catch {
    return { plan, refusals: [{ rule: 'post/json', where: 'post file' }] };
  }
  if (!isObject(doc)) return { plan, refusals: [{ rule: 'post/json', where: 'post file' }] };

  validate(SCHEMA, doc, '', refusals);
  refusals.push(...postRules(doc, surface, now));
  const bodyName = typeof doc.body_file === 'string' && BODY_FILE_RE.test(doc.body_file) && doc.body_file !== '.' && doc.body_file !== '..' ? doc.body_file : null;
  if (typeof doc.body_file === 'string' && bodyName === null && !refusals.some(x => x.where === 'body_file')) refusals.push({ rule: 'post/pattern', where: 'body_file' });
  if (typeof doc.head === 'string' && !refusals.some(x => x.where === 'head')) {
    const colon = doc.head.indexOf(':');
    const branch = colon < 0 ? doc.head : doc.head.slice(colon + 1);
    if (!isBranch(branch)) refusals.push({ rule: 'post/pattern', where: 'head' });
  }
  if (typeof doc.base === 'string' && !isBranch(doc.base) && !refusals.some(x => x.where === 'base')) refusals.push({ rule: 'post/pattern', where: 'base' });
  const repo = typeof doc.repo === 'string' ? parseRepo(doc.repo) : null;
  if (typeof doc.repo === 'string' && !repo && !refusals.some(x => x.where === 'repo')) refusals.push({ rule: 'post/pattern', where: 'repo' });
  if (typeof doc.head === 'string' && repo && !refusals.some(x => x.where === 'head')) {
    const colon = doc.head.indexOf(':');
    if (colon >= 0 && !isLogin(doc.head.slice(0, colon))) refusals.push({ rule: 'post/pattern', where: 'head' });
    else if (colon >= 0 && doc.head.slice(0, colon) !== repo.owner) refusals.push({ rule: 'owner/head', where: 'head' });
  }
  if (refusals.length) return { plan, refusals };

  plan.repo = repo;
  if (doc.as !== undefined) plan.as = doc.as;
  for (const name of ['issue', 'pr', 'comment']) if (doc[name] !== undefined) plan[name] = String(doc[name]);
  if (doc.base !== undefined) plan.base = doc.base;
  if (doc.head !== undefined) {
    const colon = doc.head.indexOf(':');
    plan.head = { sent: doc.head, branch: colon < 0 ? doc.head : doc.head.slice(colon + 1) };
  }
  if (doc.labels !== undefined) plan.labels = [...doc.labels];
  if (doc.draft !== undefined) plan.draft = doc.draft;
  if (doc.title !== undefined) plan.title = doc.title;
  if (doc.kind !== undefined) plan.kind = doc.kind;
  if (doc.answers !== undefined) plan.answers = doc.answers;
  if (doc.quote !== undefined) plan.quote = doc.quote;
  if (doc.intent !== undefined) plan.intent = doc.intent;
  if (doc.intent_skip !== undefined) plan.intentSkip = doc.intent_skip;
  if (doc.intent_none !== undefined) plan.intentNone = doc.intent_none;
  if (doc.start_none !== undefined) plan.startNone = doc.start_none;
  plan.signer = doc.signer;

  // The body file sits beside the post file and is read as strictly.
  const body = readText(join(dirname(file), bodyName));
  if (body.rule) return { plan, refusals: [{ rule: body.rule, where: 'body_file' }] };
  const trimmed = body.text.replace(/(?:\r?\n)+$/, '');
  if (trimmed.trim() === '') return { plan, refusals: [{ rule: 'file/empty', where: 'body_file' }] };
  if (chars(body.text) > BODY_MAX) return { plan, refusals: [{ rule: 'text/body-length', where: 'body_file' }] };
  // These refusals are held with the scan's, so one run tells every one of them.
  plan.late = [];
  if (bodyOwned(body.text)) plan.late.push({ rule: 'post/owned-line', where: 'body_file' });
  if (hidesAhead(body.text)) plan.late.push({ rule: 'text/hidden-line', where: 'body_file' });
  if (isObject(doc.intent)) {
    for (const name of ['text', 'corrected']) if (typeof doc.intent[name] === 'string' && hidesAhead(doc.intent[name])) plan.late.push({ rule: 'text/hidden-line', where: `intent.${name}` });
  }
  for (const name of ['intent_skip', 'intent_none', 'start_none']) {
    if (typeof doc[name] === 'string' && hidesAhead(doc[name])) plan.late.push({ rule: 'text/hidden-line', where: name });
  }

  plan.sessionPart = body.text;
  plan.body = renderBody(plan);
  if (chars(plan.body) > BODY_MAX) return { plan, refusals: [{ rule: 'text/body-length', where: 'body' }] };
  // Nothing before the signature may hide it on the page (P19); the named fields were told above.
  if (!plan.late.some(x => x.rule === 'text/hidden-line') && hidesAhead(plan.body.slice(0, plan.body.lastIndexOf('\n\nSigned: ')))) plan.late.push({ rule: 'text/hidden-line', where: 'body' });
  return { plan, refusals };
}

// ---------------------------------------------------------------- the scan

// The two content refusals: a live environment secret's value, and hidden
// text. The token-shape, URL-password and email refusals went with #441.
const RULE = Object.freeze({
  env: 'secret/env',
  hidden: 'text/hidden',
});

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
  for (const [name, val] of envSecrets(ctx.env)) add(RULE.env, indexesOf(text, val).map(index => ({ index })), name);
  // The app's installation token, in app mode: never in the environment, so named here (#599, S8).
  for (const val of ctx.secrets ?? []) if (typeof val === 'string' && val !== '') add(RULE.env, indexesOf(text, val).map(index => ({ index })), 'app token');
  add(RULE.hidden, hiddenHits(text));
  return hits.sort((a, b) => a.index - b.index);
}

const NAMED = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: String.fromCharCode(0xa0),
  lowbar: '_', hyphen: '-', dash: '-', period: '.', colon: ':', semi: ';', sol: '/', bsol: '\\',
  commat: '@', num: '#', excl: '!', equals: '=', plus: '+', percnt: '%', dollar: '$', tilde: '~',
  grave: '`', lpar: '(', rpar: ')', lsqb: '[', rsqb: ']', lcub: '{', rcub: '}', verbar: '|',
  ast: '*', quest: '?', tab: '\t', newline: '\n', zwj: '', zwnj: '', shy: '',
  // Every name in the HTML5 named character reference table (Python's
  // html.entities.html5) whose value holds a character `HIDDEN_RE` matches, so
  // none of them splits a secret unseen. In lower case, as `decodeEntities`
  // looks a name up; `vsubnE` and `vsupnE` share a key with their lower-case
  // forms, which hold such a character too.
  applyfunction: cp(0x2061), af: cp(0x2061), invisiblecomma: cp(0x2063), ic: cp(0x2063), invisibletimes: cp(0x2062), it: cp(0x2062),
  nobreak: cp(0x2060), zerowidthspace: cp(0x200b), negativemediumspace: cp(0x200b), negativethickspace: cp(0x200b),
  negativethinspace: cp(0x200b), negativeverythinspace: cp(0x200b),
  caps: cp(0x2229, 0xfe00), cups: cp(0x222a, 0xfe00), gesl: cp(0x22db, 0xfe00), lesg: cp(0x22da, 0xfe00),
  gvertneqq: cp(0x2269, 0xfe00), gvne: cp(0x2269, 0xfe00), lvertneqq: cp(0x2268, 0xfe00), lvne: cp(0x2268, 0xfe00),
  lates: cp(0x2aad, 0xfe00), smtes: cp(0x2aac, 0xfe00), sqcaps: cp(0x2293, 0xfe00), sqcups: cp(0x2294, 0xfe00),
  varsubsetneq: cp(0x228a, 0xfe00), varsubsetneqq: cp(0x2acb, 0xfe00), varsupsetneq: cp(0x228b, 0xfe00), varsupsetneqq: cp(0x2acc, 0xfe00),
  vsubne: cp(0x228a, 0xfe00), vsupne: cp(0x228b, 0xfe00),
});

/** References decoded by name from `NAMED` above, case-insensitive, and numbers of at most seven decimal or six hex digits. */
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
// Every control character but tab, line feed and carriage return. GitHub's
// comments show most of them as U+FFFD and a form feed as a space, and its
// plain markdown mode drops the C0 ones; stripping them only adds refusals.
const CONTROL_RE = /[\0-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;

/** `s` without its invisible and control characters. */
const stripUnseen = s => s.replace(INVISIBLE_RE, '').replace(CONTROL_RE, '');

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
 * The text as a reader sees it: invisible and control characters, markdown
 * escapes and inline tags removed, entities decoded and NFKC applied, repeated until
 * nothing changes, at most five rounds. HTML comments are removed with their
 * contents, as the page shows them; with `keepComments`, only their markers
 * go, as the source shows them.
 */
export function normalise(text, keepComments = false) {
  let s = text;
  for (let round = 0; round < 5; round += 1) {
    const unmarked = removeAll(stripUnseen(s), keepComments ? COMMENT_MARK_RE : COMMENT_RE);
    const next = stripUnseen(decodeEntities(removeAll(unmarked.replace(ESCAPE_RE, ''), TAG_RE))).normalize('NFKC');
    if (next === s) break;
    s = next;
  }
  return s;
}

/** The normalised copies of a text, which the scan reads: its HTML comments removed with their contents, and with only their markers removed. */
function copies(text) {
  return [normalise(text), normalise(text, true)];
}

const LINK_PLAIN_RE = /!?\[([^[\]]*)\](?:\([^()]*\)|\[[^[\]]*\])?/g;
const LINK_NESTED_RE = /!?\[([^[\]]*)\](?:\((?:[^()"']|\([^()]*\)|"[^"]*"|'[^']*')*\)|\[[^[\]]*\])?/g;
// The scan keeps `_`, which several secret shapes hold and CommonMark never reads as emphasis inside a word.
const SCAN_MARKS_RE = /[*`~[\]]/g;

/**
 * `s` with each link folded to its text and the marks `SCAN_MARKS_RE` matches
 * removed, two ways: one link form whose address holds no parenthesis (any
 * quote is an address character), and one whose address may hold one level of
 * parentheses and a quoted title; each alternative starts on its own
 * character, so neither match can backtrack without bound.
 */
function folds(s) {
  const fold = re => s.replace(re, '$1').replace(SCAN_MARKS_RE, '');
  return [fold(LINK_PLAIN_RE), fold(LINK_NESTED_RE)];
}

/**
 * Line and column, from 1, of `index` in `text`; the column in characters.
 * A line ends at a line feed, a carriage return or both, as CommonMark ends it.
 */
function lineCol(text, index) {
  const lines = text.slice(0, index).split(/\r\n|\r|\n/);
  return `${lines.length}:${chars(lines.at(-1)) + 1}`;
}

/**
 * Every content refusal in the fields to send ([{ field, text }]), as
 * [{ rule, where }]. Each field is scanned as is, as its normalised copies
 * (`copies`), and as the first of them with its marks folded away but for `_`.
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
    for (const norm of new Set([...normalised, ...folds(normalised[0])])) {
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
 * that trips a scan rule, such as one holding a live environment secret's
 * value, is withheld and only the rule is named. The scan reads the whole
 * line, so a secret longer than the cap, or across it, is still seen.
 */
export function saidLine(stderr, ctx) {
  const whole = String(stderr ?? '').split(/\r?\n/)[0];
  const line = whole.slice(0, 300);
  const rules = [...new Set(scan([{ field: 'stderr', text: whole }], { ...ctx, surface: null }).map(r => r.rule))];
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

/** The two signature lines, whole: `Signed: <label>` and `Posted by <label>.` */
const SIGNATURE_RE = new RegExp(`^(?:Signed: (${SIGNER_SOURCE})|Posted by (${SIGNER_SOURCE})\\.)$`);
const HEADING_RE = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const SETEXT_RE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const CLOSED_COMMENT_RE = /<!--[\s\S]*?--!?>/g;
const DECISION = 'owner decision';
// A line ends at a line feed, a carriage return, or both, as CommonMark reads it.
const LINE_END_RE = /\r\n|\r|\n/;

// A fence as CommonMark reads it: a run of three or more backticks or tildes,
// indented by at most three spaces. A backtick run whose info string holds a
// backtick opens no fence. It closes on a run of the same character at least
// as long, with nothing after it but spaces or tabs. The info string matches
// any character, so the end of the line is always reached and a long run is
// never tried again shorter.
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})([^]*)$/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/** A body's lines, ended at a line feed, a carriage return or both, as CommonMark ends them. */
const linesOf = text => text.split(LINE_END_RE);

/** The lines outside fences. */
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

/** The views of a text the edit and owned-line checks read: as written without format characters, and that after NFKC. */
function views(text) {
  const plain = text.replace(/\p{Cf}/gu, '');
  return [plain, plain.normalize('NFKC')];
}

/** Whether a body holds the decision mark, "owner decision", in any case or spacing. */
export function hasDecision(body) {
  return views(body).some(v => v.replace(/\s+/g, ' ').toLowerCase().includes(DECISION));
}

/** Whether a body holds a line that opens "Heard in chat by", an app's decision mark, in any view (#599, S8). */
export function hasHeard(body) {
  return linesOf(body).some(line => views(line).some(v => HEARD_START_RE.test(pageLine(v))));
}

/** The refusals a body earns as the text an edit leaves, `where` naming whose body it is. */
function bodyRules(body, label, where) {
  const out = [];
  const signed = signatures(body);
  if (!signed.includes(label) || signed.some(l => l !== label)) out.push({ rule: 'edit/unsigned', where });
  if (hasDecision(body) || hasHeard(body)) out.push({ rule: 'edit/decision', where });
  return out;
}

/** The checks on the body as far as the post file builds it, before gh is called (S6.1a, stage one). */
export function editBodyChecks(plan) {
  return bodyRules(plan.body, plan.signer, 'body_file');
}

/**
 * The checks on the item GitHub returned, as { unusable, refusals }. An
 * answer that isn't an object, or whose author or target field has the wrong
 * type, is unusable; a null body counts as empty.
 */
export function editItemChecks(plan, item, login) {
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
  // Another account's item is read no further, so its text never reaches the readers (#394 C27); an own item in the wrong place is still read, so a body rule it breaks is still told.
  if (item.user.login !== login) return { unusable: false, refusals };
  const body = item.body ?? '';
  refusals.push(...bodyRules(body, plan.signer, 'item'));
  return { unusable: false, refusals, body };
}

// ---------------------------------------------------------------- ask items (S6.1, S6.2)

const ANSWERS_LINE_RE = /^Answers: ((?:issue|pull request|comment) [1-9][0-9]{0,15})\.$/;
const READBACK_RE = /^Read-back: (?:not yet confirmed|confirmed in this session's chat|confirmed in comment [1-9][0-9]{0,15}|corrected in comment [1-9][0-9]{0,15})\.$/;
const READBACK_COMMENT_RE = /(?:confirmed|corrected) in comment ([1-9][0-9]{0,15})\.$/;
/** Line ends made `\n`, on both sides of each comparison (P24). */
const lf = s => s.replace(/\r\n?/g, '\n');

/**
 * What a body is as an ask item (S6.1), or null when it is not one: it opens
 * with the optional mark line and, after a mark, at most one `Answers:` line,
 * then `## The ask` and `## Understood intent`, and a read-back line follows
 * before any fence. Returns { text, mark, answers, status, comment, corrected,
 * intent }: the body with LF line ends, the mark line and the answers it
 * holds, the read-back's status and comment, the corrected text of a
 * corrected one, and the span from the line after the intent heading to the
 * blank line before the read-back line.
 */
export function askItem(body) {
  const text = lf(body);
  const lines = text.split('\n');
  let i = 0;
  let mark;
  let answers;
  if (lines[0] === MARK_CHAT || lines[0] === MARK_RELAYED || HEARD_RE.test(lines[0])) {
    if (lines[1] !== '') return null;
    mark = lines[0];
    i = 2;
    const m = ANSWERS_LINE_RE.exec(lines[i] ?? '');
    if (m) {
      if (lines[i + 1] !== '') return null;
      answers = m[1];
      i += 2;
    }
  }
  if (lines[i] !== '## The ask' || lines[i + 1] !== '') return null;
  const h = lines.indexOf('## Understood intent', i + 2);
  if (h < 0 || lines[h + 1] !== '') return null;
  let r = -1;
  for (let j = h + 2; j < lines.length && r < 0; j += 1) {
    if (READBACK_RE.test(lines[j])) r = j;
    else if (FENCE_OPEN_RE.test(lines[j])) break;
  }
  // A skipped item (PACT-48): the heading, its one-line reason, a blank line, and no read-back line before the first fence or the end, so a reading that opens with "Skipped:" is never one.
  if (r < 0 && /^Skipped: \S/.test(lines[h + 2] ?? '') && lines[h + 3] === '') {
    return { text, mark, answers, status: 'skipped', comment: undefined, corrected: undefined, intent: lines[h + 2].slice('Skipped: '.length) };
  }
  if (r < 0 || lines[r - 1] !== '') return null;
  const status = lines[r].includes('not yet') ? 'pending' : lines[r].includes('corrected in') ? 'corrected' : 'confirmed';
  let corrected;
  if (status === 'corrected') {
    const c = lines.indexOf('Corrected read-back:', h + 2);
    if (c < 0 || c >= r || lines[c - 1] !== '' || lines[c + 1] !== '') return null;
    corrected = lines.slice(c + 2, r - 1).join('\n');
  }
  return { text, mark, answers, status, comment: READBACK_COMMENT_RE.exec(lines[r])?.[1], corrected, intent: lines.slice(h + 2, r - 1).join('\n') };
}

/**
 * The checks of an ask-item edit against the item (S6.1, S6.2): the status
 * move or kept status first (`edit/status`), then the ask as the item holds it
 * (`edit/ask`), byte for byte but for line ends, naming the part that
 * differs. Returns { refusals, move }.
 */
function askChecks(plan, ask) {
  const { intent } = plan;
  // A skipped item stays as it is: the edit must carry its own skip reason, and an item with a reading takes no skip reason (PACT-48).
  if (ask.status === 'skipped' || plan.intentSkip !== undefined) {
    if (ask.status !== 'skipped' || plan.intentSkip === undefined) return { refusals: [{ rule: 'edit/ask', where: 'intent' }] };
    let at = 0;
    for (const seg of askSegments({ ...plan, mark: ask.mark, answers: ask.answers })) {
      const want = lf(seg.text);
      if (!ask.text.startsWith(want, at) || !ask.text.startsWith('\n\n', at + want.length)) return { refusals: [{ rule: 'edit/ask', where: seg.where }] };
      at += want.length + 2;
    }
    return { refusals: [], move: false };
  }
  const comment = intent.comment === undefined ? undefined : String(intent.comment);
  const kept = intent.status === ask.status;
  const status = [];
  if (kept) {
    if (comment !== ask.comment) status.push({ rule: 'edit/status', where: 'intent.comment' });
    else if (ask.status === 'corrected' && lf(intent.corrected) !== ask.corrected) status.push({ rule: 'edit/status', where: 'intent.corrected' });
  } else if (ask.status === 'pending' && (intent.status === 'confirmed' || intent.status === 'corrected')) {
    if (comment === undefined) status.push({ rule: 'edit/status', where: 'intent.comment' });
  } else {
    status.push({ rule: 'edit/status', where: 'intent.status' });
  }
  if (status.length) return { refusals: status };
  // The ask as it stands in the item, at the item's own status.
  const was = kept ? intent : { text: intent.text, status: ask.status };
  let pos = 0;
  for (const seg of askSegments({ ...plan, mark: ask.mark, answers: ask.answers, intent: was })) {
    const want = lf(seg.text);
    if (!ask.text.startsWith(want, pos) || !ask.text.startsWith('\n\n', pos + want.length)) return { refusals: [{ rule: 'edit/ask', where: seg.where }] };
    pos += want.length + 2;
  }
  return { refusals: [], move: !kept };
}

/**
 * The decision a read-back move cites (S6.2a), read from the repo and checked.
 * Returns { label }, the decision's single signature, { refusals }, or { lines }
 * for an `unavailable` result. No text from the comment reaches output, and a
 * comment by another author is read no further. `who` names the logins:
 * `owner` wrote an owner's decision, and in app mode `bot` wrote a "Heard in
 * chat by" decision (#599, S8); each is read by its own mark and no other.
 */
function confirmChecks(plan, ask, who, io, ctx) {
  const refusals = [{ rule: 'edit/confirm', where: 'intent.comment' }];
  // The item's own number, and the line a decision answering it carries. A review thread reply is no ask item, so no decision answers one: refused before any read.
  const own = { 'issue-edit': ['issue', plan.issue], 'pull-request-edit': ['pull request', plan.pr], 'issue-comment-edit': ['comment', plan.comment] }[plan.surface];
  if (own === undefined) return { refusals };
  const read = reader(io)(ghArgs('GET', `repos/${plan.repo.owner}/${plan.repo.name}/issues/comments/${plan.intent.comment}`, false));
  if (!read.ok) return { lines: [saidLine(read.stderr, ctx), 'RESULT: unavailable'] };
  const item = parseJson(read.stdout);
  const usable = isObject(item) && typeof item.user?.login === 'string' && typeof item.issue_url === 'string' && (item.body === null || typeof item.body === 'string');
  if (!usable) return { lines: ['the cited comment read could not be read', 'RESULT: unavailable'] };
  const byOwner = item.user.login === who.owner;
  const byBot = who.bot !== undefined && item.user.login === who.bot;
  if (!byOwner && !byBot) return { refusals };
  const number = plan.surface === 'pull-request-edit' ? plan.pr : plan.issue;
  if (item.issue_url.toLowerCase() !== `https://api.github.com/repos/${plan.repo.owner}/${plan.repo.name}/issues/${number}`.toLowerCase()) return { refusals };
  const body = item.body ?? '';
  const d = askItem(body);
  const labels = signatures(body);
  const heard = d?.mark === undefined ? undefined : HEARD_RE.exec(d.mark)?.[1];
  // The owner's own account carries the owner's mark; the bot carries the heard mark, and names the signature that heard it.
  const marked = byOwner ? d?.mark === MARK_CHAT : heard !== undefined && heard === labels[0];
  if (!d || !marked || d.status !== 'confirmed' || d.comment !== undefined || d.answers !== `${own[0]} ${own[1]}` || labels.length !== 1) return { refusals };
  const fits = plan.intent.status === 'confirmed' ? d.intent === ask.intent : d.intent === lf(plan.intent.corrected) && d.intent !== ask.intent;
  return fits ? { label: labels[0], heard: byBot } : { refusals };
}

/** An ask-item edit's checks after the item read (S6.1a): { refusals } or { lines } when one fails, else {}. Sets what the render needs on `plan`. */
function askEdit(plan, ask, who, io, ctx) {
  const asked = plan.quote !== undefined || plan.intentNone !== undefined || plan.startNone !== undefined;
  if (ask === null && !asked) return {};
  if (ask === null || !asked) {
    const rule = ask === null ? 'post/field' : 'post/missing';
    return { refusals: [{ rule, where: 'quote' }, { rule, where: 'intent' }] };
  }
  const a = askChecks(plan, ask);
  if (a.refusals.length) return a;
  plan.mark = ask.mark;
  plan.answers = ask.answers;
  if (a.move) {
    const d = confirmChecks(plan, ask, who, io, ctx);
    if (d.label === undefined) return d;
  }
  if ((plan.quote ?? []).some(q => q.source === 'tracker')) {
    const t = trackerChecks(plan, who.owner, io, ctx);
    if (t.lines || t.refusals.length) return t;
  }
  return {};
}

/** The checks on the whole body an edit will send, once the item is read (S6.1a, S6.3): its size, its signature and a decision mark. */
export function editFinalChecks(plan, body) {
  const out = [];
  if (chars(body) > BODY_MAX) out.push({ rule: 'text/body-length', where: 'body' });
  out.push(...bodyRules(body, plan.signer, 'body_file'));
  return out;
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
const editFailedNext = url => `NEXT: the edit may have landed. Compare the body at ${url} with the body you sent before anything else. If they match, never send it again: tell the owner its link. If they don't, tell the owner, and send it again only on their word. If you can't tell, tell the owner, and don't send it.`;

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
function editItem(plan, p, args, who, io, ctx, setPhase) {
  const url = p.near;
  const login = who.post;
  const get = reader(io);
  const read = get(ghArgs('GET', p.path, false));
  if (!read.ok) return { code: 4, lines: [saidLine(read.stderr, ctx), 'RESULT: unavailable'] };
  const c = editItemChecks(plan, parseJson(read.stdout), login);
  if (c.unusable) return { code: 4, lines: ['the item read could not be read', 'RESULT: unavailable'] };
  if (c.refusals.length) return refused(c.refusals);
  const ask = askEdit(plan, askItem(c.body), who, io, ctx);
  if (ask.lines) return { code: 4, lines: ask.lines };
  if (ask.refusals?.length) return refused(ask.refusals);

  // The second stage (S6.1a): the whole body, with the item's mark and answers, is built and checked before the PATCH.
  plan.body = renderBody(plan);
  p.request = { body: plan.body };
  const final = [
    ...scan([{ field: 'body', text: plan.body }], { ...ctx, surface: plan.surface }),
    ...editFinalChecks(plan, plan.body),
  ];
  if (final.length) return refused(final);

  setPhase('sending');
  const sent = io.gh(args, JSON.stringify(p.request));
  if (!sent.ok) return { code: 3, lines: [saidLine(sent.stderr, ctx), editFailedNext(url), 'RESULT: failed'] };
  setPhase('sent');
  const again = get(ghArgs('GET', p.path, false));
  if (!again.ok) return { code: 1, lines: [saidLine(again.stderr, ctx), EDIT_LANDED_LINK, `RESULT: unverified ${url}`] };
  const back = compare(plan, p.request, parseJson(again.stdout), login, p.id, p.key);
  if (back.unusable.length) return { code: 1, lines: [`the read-back could not be read: ${back.unusable.join(', ')}`, EDIT_LANDED_LINK, `RESULT: unverified ${url}`] };
  if (back.mismatches.length) return { code: 1, lines: [...back.mismatches, ...back.notes, EDIT_LANDED_MISMATCH, `RESULT: mismatch ${url}`] };
  return { code: 0, lines: [...back.notes, `RESULT: verified ${plan.surface} ${url} as ${login}`] };
}

const DRY_TRACKER = 'dry-run: no tracker comment was read; post/tracker did not run';
const DRY_EDIT = 'dry-run: the item was not read; edit/ask, edit/status, edit/confirm, post/tracker and the content scan of the full body did not run';

/**
 * The tracker comments a quote cites, read before the post goes (S3.2): each
 * must sit in this repo, be the login's own, and hold the passage's text.
 * Returns { refusals } or, when a read fails or gives nothing usable,
 * { lines } for an `unavailable` result. No text from a comment reaches output.
 */
function trackerChecks(plan, login, io, ctx) {
  const refusals = [];
  const seen = new Map();
  const prefix = `https://api.github.com/repos/${plan.repo.owner}/${plan.repo.name}/issues/`.toLowerCase();
  for (const [i, q] of plan.quote.entries()) {
    if (q.source !== 'tracker') continue;
    let item = seen.get(q.comment);
    if (item === undefined) {
      const read = reader(io)(ghArgs('GET', `repos/${plan.repo.owner}/${plan.repo.name}/issues/comments/${q.comment}`, false));
      if (!read.ok) return { lines: [saidLine(read.stderr, ctx), 'RESULT: unavailable'] };
      item = parseJson(read.stdout);
      const usable = isObject(item) && typeof item.user?.login === 'string' && typeof item.issue_url === 'string' && (item.body === null || typeof item.body === 'string');
      if (!usable) return { lines: ['the tracker comment read could not be read', 'RESULT: unavailable'] };
      seen.set(q.comment, item);
    }
    const url = item.issue_url.toLowerCase();
    const sits = url.startsWith(prefix) && isNumber(url.slice(prefix.length));
    // Another author's comment, or one in another repo, is read no further.
    if (item.user.login !== login || !sits) refusals.push({ rule: 'post/tracker', where: `quote[${i}].comment` });
    else if (!inComment(q.text, item.body ?? '')) refusals.push({ rule: 'post/tracker', where: `quote[${i}].text` });
  }
  return { refusals };
}

/**
 * The one NEXT line each edit refusal and each content-scan refusal earns
 * (PACT-48): what the session does instead, in fixed words. It names no field
 * value, path or text, so a refusal's output still carries none.
 */
export const NEXT_FOR = Object.freeze({
  'edit/author': 'NEXT: the poster edits only an item its own login wrote. Post a new comment instead, or ask the owner to edit the item by hand.',
  'edit/target': "NEXT: the item isn't where the post says. Check the issue, pull request and comment numbers against the item's page and post again with the right ones. An issue number that is a pull request's, or a thread's first comment, can't be edited here.",
  'edit/unsigned': 'NEXT: the item and the new body must each carry exactly one `Signed: <signer>` line for this post\'s signer. Edit only an item you signed with that signer. For an item posted unsigned, post a new comment, or ask the owner to type the fix on GitHub.',
  'edit/decision': 'NEXT: a body holding the words "owner decision" is never edited, even a quote of them. Post a new comment instead.',
  'edit/ask': "NEXT: an ask item's quote and intent must be the item's own, word for word. Rebuild them from the posted item, never from a kept file, or post a new comment instead.",
  'edit/status': "NEXT: a read-back moves only from pending to confirmed or corrected, and the move names the owner's decision comment in intent.comment. To leave it, send the item's own status, comment and corrected text unchanged.",
  'edit/confirm': "NEXT: intent.comment must be this login's own decision comment on this item's issue or pull request, an ask item the owner confirmed in chat that names this item in Answers:. Post that decision first, then edit.",
  'post/missing intent': "NEXT: a post with a quote needs its Understood intent: give `intent` ({ text, status }), what you took the owner's words to mean. If there is nothing to read into them, give `intent_skip` instead, one line saying why, and no `intent`.",
  'post/field intent_skip': 'NEXT: give `intent` or `intent_skip`, never both, and no `intent_skip` on a decision or on a post with no quote. Keep the one that fits and post again.',
  'post/missing quote.intent': "NEXT: an issue, pull request or spec carries the owner's words that started the intent. Give a passage with `role` `intent` (or `both`), or, if no owner words started it, `intent_none`: one line of why, such as \"it came from a session's note\". It shows as \"No owner words started the intent: <why>\".",
  'post/missing quote.start': "NEXT: an issue, pull request or spec carries the owner's words that started this task. Give a passage with `role` `start` (or `both`), or, if no owner words started it, `start_none`: one line of why, such as \"it came from a session's note\". It shows as \"No owner words started the task: <why>\".",
  'post/missing quote[n].role': 'NEXT: each passage of an issue, pull request or spec says which quote it is: `role` is `intent`, `start` or `both`.',
  'post/field intent_none': 'NEXT: give the intent a passage or `intent_none`, never both, and no `intent_none` on a decision or on a kind that takes no quote (a note, status, review, reply or lens report). Keep the one that fits and post again.',
  'post/field start_none': 'NEXT: give the task a passage or `start_none`, never both, and no `start_none` on a decision or on a kind that takes no quote (a note, status, review, reply or lens report). Keep the one that fits and post again.',
  'secret/env': "NEXT: remove the value from the named field and post again; the line names the variable, never the value. A lens report stays as it is: tell the owner where it is, in chat, and don't post it.",
  'text/hidden': 'NEXT: remove the hidden character from the named field and post again. A lens report stays as it is: tell the owner where it is, in chat, and don\'t post it.',
  // PACT-52: the usage, field, file and text rules (usage/unknown-option has OLD_OPTION_NEXT).
  'usage/surface': 'NEXT: give a surface first: issue, pull-request, issue-comment, pull-request-review, review-thread-reply, issue-edit, pull-request-edit, issue-comment-edit or review-thread-reply-edit, then `--post <file>`. `schema` prints the fields.',
  'usage/argument': 'NEXT: the only arguments are `<surface> --post <file>` and `--dry-run`. Remove the stray word and run again.',
  'usage/repeated': 'NEXT: give `--post <file>` and `--dry-run` once each. Remove the repeat and run again.',
  'usage/missing-value': "NEXT: `--post` takes the post file's name straight after it. Add the file name and run again.",
  'usage/missing-option': 'NEXT: a post needs `--post <file>`, the JSON post file. Add it and run again; `schema` prints the fields.',
  'post/json': 'NEXT: the post file must hold one JSON object. Write it as `schema` prints it and run again.',
  'post/unknown': 'NEXT: remove the named field: a post takes only the fields `schema` prints.',
  'post/field': "NEXT: the named field isn't allowed on this surface or kind. Remove it, or check the surface and kind against `schema`.",
  'post/missing': 'NEXT: add the named field; `schema` prints the fields each surface requires.',
  'post/type': 'NEXT: give the named field the type `schema` prints for it, such as a string, a whole number or an object.',
  'post/pattern': 'NEXT: the named field misses the form `schema` prints for it, such as `owner/name` for a repo or a whole number for an issue. Fix the value and run again.',
  'post/length': 'NEXT: the named field is empty or over its length limit; `schema` prints the bounds. Fix it and run again.',
  'post/kind': 'NEXT: each surface takes only some kinds, and `schema` lists them. Pick a kind this surface takes, or change the surface.',
  'post/signer': "NEXT: a `status` post signs `status-<issue>`, with the number of the issue it sits on; every other kind signs your session's label, never one starting `status-`.",
  'post/status': "NEXT: a new post's read-back can't be `corrected`, and is `confirmed` only when there is a quote and every quote is from chat; a decision from chat is posted `confirmed`, never `pending`. Fix `intent.status` and run again.",
  'post/when': "NEXT: a passage's `when` is a real date as `YYYY-MM-DD`, with no time of day, and no later than tomorrow in UTC.",
  'post/tracker': "NEXT: a `tracker` passage quotes this login's own comment in this repo, word for word, with at least 20 characters outside its `[left out]` spans, no touching spans and at most three. Fix the passage, or give its source as chat or relayed.",
  'post/owned-line': "NEXT: take the poster's own line (a signature, a decision mark or a heading of the ask) out of the named field; the poster writes them. The read-back fields take no heading or fence either.",
  'file/unreadable': "NEXT: the named file can't be read. Check its name and that you may read it; a body file sits in the post file's folder. Then run again.",
  'file/link': 'NEXT: a post file or body file may not be a link. Copy its text into a regular file and name that.',
  'file/not-regular': 'NEXT: the named file must be a regular file, not a folder or device, and must not change while it is read. Name a plain file.',
  'file/size': 'NEXT: the named file is over 256 KiB. Cut it down, or split the text into several posts.',
  'file/utf8': "NEXT: the named file isn't valid UTF-8. Save it as UTF-8 and run again.",
  'file/bom': 'NEXT: the named file starts with a byte-order mark. Save it as UTF-8 without one.',
  'file/empty': 'NEXT: the named file is empty. Write the text into it, or drop the post.',
  'text/body-length': 'NEXT: the text is over 65,536 characters. Cut it down, or split it into several posts.',
  'text/hidden-line': "NEXT: the text opens an HTML comment or a fold it doesn't close, which hides what follows it. Close it, or remove it.",
});

/** A refused run: exit 2, a REFUSED line for each refusal, one NEXT line for each rule, straight above RESULT. */
const refused = refusals => {
  // An old command line is told its one fixed line, which already covers the missing --post.
  const old = refusals.some(r => r.rule === 'usage/unknown-option');
  const next = [...new Set(refusals.filter(r => !(old && r.rule === 'usage/missing-option')).map(r => NEXT_FOR[`${r.rule} ${r.where}`] ?? NEXT_FOR[`${r.rule} ${r.where.replace(/\[\d+\]/g, '[n]')}`] ?? NEXT_FOR[r.rule]).filter(Boolean))];
  return {
    code: 2,
    lines: [...refusals.map(r => `REFUSED ${r.rule} ${r.where}`), ...next, ...(old ? [OLD_OPTION_NEXT] : []), `RESULT: refused ${refusals.length}`],
  };
};

/** The runner for reads: the owner's own gh in app mode, where `io.gh` carries the app's token, else the one gh (#599, S1). */
const reader = io => io.read ?? io.gh;

const DRY_APP = 'dry-run: the pin check and the token mint did not run';

/**
 * The first stage of a run: the arguments, the plan, the scans and the dry run,
 * with nothing read from GitHub. `app` is null in owner mode, else { bot, owner }
 * from the pin (#599, S8). Returns { result }, a finished run, or the plan and
 * what the second stage needs.
 */
function prepare(argv, io, app) {
  try {
    const parsed = parseArgs(argv);
    if (parsed.refusals.length) return { result: refused(parsed.refusals) };
    if (parsed.surface === 'schema') return { result: { code: 0, lines: [JSON.stringify(SCHEMA, null, 2)] } };
    const { plan, refusals } = buildPlan(parsed, io.now ?? new Date(), app !== null);
    if (refusals.length) return { result: refused(refusals) };
    // Each text field is scanned as its own field too, so a refusal names it (S5.3).
    const fields = [];
    if (plan.title !== undefined) fields.push({ field: 'title', text: plan.title });
    plan.labels.forEach((text, i) => fields.push({ field: `labels[${i}]`, text }));
    (plan.quote ?? []).forEach((q, i) => fields.push({ field: `quote[${i}].text`, text: q.text }));
    if (plan.intent !== undefined) {
      fields.push({ field: 'intent.text', text: plan.intent.text });
      if (plan.intent.corrected !== undefined) fields.push({ field: 'intent.corrected', text: plan.intent.corrected });
    }
    if (plan.intentSkip !== undefined) fields.push({ field: 'intent_skip', text: plan.intentSkip });
    if (plan.intentNone !== undefined) fields.push({ field: 'intent_none', text: plan.intentNone });
    if (plan.startNone !== undefined) fields.push({ field: 'start_none', text: plan.startNone });
    fields.push({ field: 'body', text: plan.body });
    const ctx = { env: io.env };
    // In app mode a post goes out `as` the app's bot login and no other (#599, S8).
    const notApp = app !== null && plan.as !== app.bot ? [{ rule: 'as/not-app', where: 'as' }] : [];
    const hits = [...plan.late, ...notApp, ...scan(fields, { ...ctx, surface: plan.surface })];
    if (hits.length) return { result: refused(hits) };
    const edit = isEdit(plan.surface);
    if (edit) {
      const own = editBodyChecks(plan);
      if (own.length) return { result: refused(own) };
    }

    const p = postOf(plan);
    const args = ghArgs(edit ? 'PATCH' : 'POST', p.path, true);
    const tracked = (plan.quote ?? []).some(q => q.source === 'tracker');
    if (plan.dryRun) {
      // A dry run reads nothing, so what needs a read did not run, and it says so (S3.2, S6.1a).
      const skipped = edit ? DRY_EDIT : tracked ? DRY_TRACKER : null;
      return { result: { code: 0, lines: [`gh ${args.join(' ')}`, `request: ${JSON.stringify(sizes(p.request))}`, ...(skipped ? [skipped] : []), ...(app ? [DRY_APP] : []), `RESULT: dry-run ${plan.surface}`] } };
    }
    return { plan, p, args, edit, tracked, fields, ctx };
  } catch {
    return { result: { code: 4, lines: ['the poster failed before sending', 'RESULT: unavailable'] } };
  }
}

/**
 * The second stage: the identity checks, the reads and the one write. `io.gh`
 * is the runner that writes. In app mode `app` is { bot, owner, token }, the
 * pin's and the minted token's, and `io.read` is the owner's own gh, which does
 * every read; the app's login is the poster's, the pinned owner's the
 * owner's (#599, S8). Returns { code, lines }.
 */
function send(s, io, app) {
  const { plan, p, args, edit, tracked } = s;
  let phase = 'before';
  let near = p.near;
  // Held out here for the catch. The login is set only once it has passed every check, the link only once the post's id is read.
  let checkedLogin = null;
  let linked = false;
  try {
    // The app's token is a secret too: nothing may carry it out in a field or a line of gh's.
    const ctx = app ? { ...s.ctx, secrets: [app.token] } : s.ctx;
    if (app) {
      const again = scan(s.fields, { ...ctx, surface: plan.surface });
      if (again.length) return refused(again);
    }
    const get = reader(io);
    let login;
    let who;
    if (app) {
      login = app.bot;
      who = { post: login, owner: app.owner.login, bot: login };
      if (plan.repo.owner !== app.owner.login) return refused([{ rule: 'owner/repo', where: 'repo' }]);
    } else {
      const token = envValue(io.env, 'GH_TOKEN') || envValue(io.env, 'GITHUB_TOKEN');
      if (token && plan.as === undefined) return refused([{ rule: 'as/missing', where: 'as' }]);

      const me = io.gh(ghArgs('GET', 'user', false));
      login = me.ok ? parseJson(me.stdout)?.login : undefined;
      if (!isLogin(login)) return { code: 4, lines: [...(me.ok ? ['the login read gave no login'] : [saidLine(me.stderr, ctx)]), 'RESULT: unavailable'] };
      const wrong = [];
      if (plan.as !== undefined && plan.as !== login) wrong.push({ rule: 'as/differs', where: 'as' });
      if (plan.repo.owner !== login) wrong.push({ rule: 'owner/repo', where: 'repo' });
      if (wrong.length) return refused(wrong);
      who = { post: login, owner: login };
    }

    // The owner GitHub gives for the repo, which follows a rename or a
    // transfer, so a name the login once owned can't carry a post elsewhere.
    // In app mode the owner is the pinned one, by id.
    const repoRead = get(ghArgs('GET', `repos/${plan.repo.owner}/${plan.repo.name}`, false));
    const repoOwner = repoRead.ok ? parseJson(repoRead.stdout)?.owner : undefined;
    const owner = app ? repoOwner?.id : repoOwner?.login;
    if (app ? !Number.isSafeInteger(owner) : !isLogin(owner)) return { code: 4, lines: [...(repoRead.ok ? ['the repo read gave no owner'] : [saidLine(repoRead.stderr, ctx)]), 'RESULT: unavailable'] };
    if (owner !== (app ? app.owner.id : login)) return refused([{ rule: 'owner/github', where: 'repo' }]);
    checkedLogin = login;
    if (edit) return editItem(plan, p, args, who, io, ctx, st => { phase = st; });
    if (tracked) {
      const t = trackerChecks(plan, who.owner, io, ctx);
      if (t.lines) return { code: 4, lines: t.lines };
      if (t.refusals.length) return refused(t.refusals);
    }

    phase = 'sending';
    const sent = io.gh(args, JSON.stringify(p.request));
    if (!sent.ok) return { code: 3, lines: [saidLine(sent.stderr, ctx), failedNext(near, checkedLogin), 'RESULT: failed'] };
    phase = 'sent';
    const id = idText(parseJson(sent.stdout)?.[p.key]);
    if (id === null) return { code: 1, lines: [`the answer carried no usable ${p.key}`, LANDED_PAGE, `RESULT: unverified ${near}`] };
    const url = p.url(id);
    near = url;
    linked = true;
    const read = get(ghArgs('GET', p.read(id), false));
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

/**
 * One run of the poster as the owner: `argv` after the script's name, and `io`
 * holding gh(args, input) => { ok, stdout, stderr }, env, home, tmp, user and
 * host. Returns { code, lines }; the last line is always the RESULT line.
 * Synchronous, and unchanged by an app: `postAsApp` is the run that may post as
 * one (#599, S8).
 */
export function post(argv, io) {
  const s = prepare(argv, io, null);
  return s.result ?? send(s, io, null);
}

// ---------------------------------------------------------------- app mode (#599, S8)

/** Where the pin file sits under `home`: the helper's `pinPath`, held equal by a test, so the check that an app is pinned never reads another file than the helper does. */
export const pinFile = home => join(home, '.pact', 'github.json');

/** The fixed words a helper refusal is told in: its id when it has the helper's shape, never its message. */
const idOf = e => (typeof e?.id === 'string' && /^[a-z]{1,12}(?:\/[a-z]{1,12})?$/.test(e.id) ? e.id : 'unknown');

const stoppedApp = (rule, e) => ({
  code: 2,
  lines: [`REFUSED ${rule} ${rule === 'pin/check' ? 'pin' : 'token'}`, `NOTE: gh-app said ${idOf(e)}; nothing was sent, and nothing was posted as the owner`, 'RESULT: refused 1'],
});

/** The post file's `as`, or undefined when it can't be read or isn't a string; `prepare` refuses such a file on its own read (PACT-104). */
function postedAs(argv) {
  try {
    const parsed = parseArgs(argv);
    const file = parsed.options.get('post');
    if (parsed.refusals.length || typeof file !== 'string') return undefined;
    const r = readText(file);
    const as = r.rule ? undefined : JSON.parse(r.text)?.as;
    return typeof as === 'string' ? as : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The provider a post goes out as (PACT-104): the first, in the helper's provider
 * order, whose pinned bot login is `as` exactly; else `claude` when it is pinned,
 * else the first pinned provider, whose `as/not-app` check then refuses the
 * mismatch; null, the owner's mode, only when no app is pinned. The pick binds
 * nothing: `prepare` checks `as` against the picked bot again.
 */
export function pickProvider(pin, providers, as) {
  const named = as === undefined ? undefined : providers.find(p => pin.apps[p]?.bot_login === as);
  if (named !== undefined) return named;
  if (pin.apps.claude !== undefined) return 'claude';
  return providers.find(p => pin.apps[p] !== undefined) ?? null;
}

/**
 * One run of the poster that posts as the pinned app the post's `as` names, and refuses any other post while an app is pinned (S8, PACT-104).
 * `io` is `post`'s, with `io.app`: has() says whether `github.json`, the helper
 * the install put under the home folder and the helper beside the poster all
 * exist, load() imports the helper, helperIo(mod)
 * is the helper's own io, and makeGh(env) is a gh runner for that environment.
 * With no `io.app`, or any file absent, or no app in the pin, it is `post`. Otherwise the pin is checked against GitHub's own records and a
 * `post`-set token minted, both before anything is sent; a pin that fails, or a
 * check that cannot run, stops the run, and the run never falls back to the
 * owner. Every await and the import sit inside the one catch, which tells only
 * the helper's refusal id.
 */
export async function postAsApp(argv, io) {
  if (!io.app || !io.app.has()) return post(argv, io);
  let mod;
  let rule = 'pin/check';
  try {
    mod = await io.app.load();
    const hio = io.app.helperIo(mod);
    const pin = mod.readPin(hio);
    const provider = pickProvider(pin, mod.PROVIDERS, postedAs(argv));
    if (provider === null) return post(argv, io);
    const entry = pin.apps[provider];
    const app = { bot: entry.bot_login, owner: pin.owner };
    const s = prepare(argv, io, app);
    if (s.result) return s.result;
    mod.checkPin(hio, pin, provider);
    rule = 'app/token';
    const token = await mod.mintToken({ provider, repo: s.plan.repo, set: 'post' }, hio);
    if (typeof token !== 'string' || token === '') throw new TypeError('no token');
    const clean = mod.cleanEnv(io.env);
    const write = io.app.makeGh({ ...clean, GH_TOKEN: token });
    const read = io.app.makeGh(clean);
    return send(s, { ...io, gh: write, read }, { ...app, token });
  } catch (e) {
    return stoppedApp(rule, mod && e instanceof mod.Refusal ? e : null);
  }
}

// ---------------------------------------------------------------- main

/** The real parts of app mode: the files beside the poster and under the home folder, the helper by dynamic import, and a runner of the real gh. App mode needs the pin and the helper the install put in the home folder (S4), so a checkout's copy, which always has a helper beside it, stays the owner's with the switch off. */
function realApp(env, tmp) {
  const home = homedir();
  return {
    has: () => existsSync(pinFile(home)) && existsSync(join(home, '.pact', 'tools', 'gh-app.mjs')) && existsSync(join(dirname(fileURLToPath(import.meta.url)), 'gh-app.mjs')),
    load: () => import('./gh-app.mjs'),
    helperIo: mod => mod.realIo({ env }),
    makeGh: e => makeGh({ env: e, tmp }),
  };
}

async function main() {
  const env = { ...process.env };
  const tmp = tmpdir();
  const r = await postAsApp(process.argv.slice(2), { gh: makeGh({ env, tmp }), env, app: realApp(env, tmp) });
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

if (isEntry()) {
  main().catch(() => {
    process.stdout.write('the poster failed before sending\nRESULT: unavailable\n');
    process.exitCode = 4;
  });
}
