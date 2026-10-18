// tracker-authors-core.mjs (#183, T2): the tracker author checker's reads and
// decisions. tracker-authors.mjs is its command line: it calls check() with its
// arguments and the real gh runner, prints, and sets the exit code. Importing
// this file does nothing: no file, process, environment or OS user read until
// a function is called, and no function here prints or exits.
//
// Where GraphQL is refused, as in a cloud thread, a session reads who wrote
// what on the tracker through this checker's REST reads, and takes its verdict
// from the SUMMARY line. It is not part of the install gate: the install
// stages it with the rest of gate/ and never runs it (ADR 0089).
//
//   node tracker-authors.mjs issue <n>
//   node tracker-authors.mjs pr <n>
//
// The repo is the constant SLUG. <n> is 1 to 9 digits with no leading zero.
// Anything else exits 2 before any call.
//
// Every run reads `user` first: its login is the owner's account for that run,
// and nothing else of that record is kept. Lists are read 100 a page, with an
// explicit page number, until a page holds fewer than 100; never --paginate,
// whose next-page links the cloud proxy refuses.
//
// A stop prints "FAIL stop/<id>" and "RESULT: fail", exits 1, and prints no
// content read and none of gh's output. On success it prints the records as
// one JSON array, then "SUMMARY: <kind> <n> as <login>; true: <ids>" and
// "RESULT: pass", and exits 0. The verdict is the SUMMARY line, never a
// record's flag: every body is an escaped JSON string, so no body can start a
// line of its own. Each id in the SUMMARY is <record kind>:<id>, a label's
// name as a JSON string, joined by single spaces; "none" when no flag is true.
//
// Node 24 or later, ESM, node: built-ins only, so the two files run on their
// own from a temporary folder.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const SLUG = 'mephistopheles4/the-pact';
const KINDS = ['issue', 'pr'];
const NUMBER = /^[1-9][0-9]{0,8}$/;
const PER_PAGE = 100;
const MAX_COMMITS = 250;
const MAX_REVIEWS = 100;

// ---------------------------------------------------------------- gh

/** gh's arguments for one GET, with the host pinned. */
export const ghArgs = path => ['api', '--hostname', 'github.com', '--method', 'GET', path];

/** The environment gh runs with: the caller's, without GH_DEBUG or DEBUG in any case. */
export function ghEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env ?? {})) {
    const upper = k.toUpperCase();
    if (upper !== 'GH_DEBUG' && upper !== 'DEBUG') out[k] = v;
  }
  return out;
}

/** The spawn options for one gh call from `folder`: no shell, nothing on standard input. */
export const ghOptions = folder => ({ cwd: folder, shell: false, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });

/**
 * A gh runner: each call runs gh from a new, empty folder under `tmp`, removed
 * afterwards, so a file planted in the caller's folder can't run as gh.
 * `spawn` stands in for the process call in tests. Returns { ok, stdout }.
 * gh's standard error is never returned.
 */
export function makeRun({ env, tmp, spawn = spawnSync }) {
  const clean = ghEnv(env);
  return path => {
    const cwd = mkdtempSync(join(tmp, 'pact-tracker-'));
    try {
      const r = spawn('gh', ghArgs(path), { ...ghOptions(cwd), env: clean });
      return { ok: !r.error && r.status === 0, stdout: typeof r.stdout === 'string' ? r.stdout : '' };
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  };
}

// ---------------------------------------------------------------- reads

/** A stop: the read ends here, with this id and nothing it read. */
class Stop {
  constructor(id) {
    this.id = id;
  }
}

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** One call's JSON, or a stop. Non-zero exit, then no output, then not JSON. */
function call(run, path) {
  const r = run(path);
  if (!r || !r.ok) throw new Stop('stop/gh');
  if (typeof r.stdout !== 'string' || r.stdout.trim() === '') throw new Stop('stop/empty');
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Stop('stop/shape');
  }
}

/** One record read on its own: an object, or a stop. */
function item(run, path) {
  const v = call(run, path);
  if (!isObject(v)) throw new Stop('stop/shape');
  return v;
}

/** Every page of a list, 100 a page; each page an array of objects, and no id twice. Stops early once more than `max` are read. */
function list(run, path, max = Infinity) {
  const out = [];
  const ids = new Set();
  for (let page = 1; ; page += 1) {
    const v = call(run, `${path}?per_page=${PER_PAGE}&page=${page}`);
    if (!Array.isArray(v) || !v.every(isObject)) throw new Stop('stop/shape');
    for (const x of v) {
      const id = x.id ?? x.sha;
      if (id !== undefined) {
        const key = JSON.stringify(id);
        if (ids.has(key)) throw new Stop('stop/repeat');
        ids.add(key);
      }
      out.push(x);
    }
    if (v.length < PER_PAGE || out.length > max) return out;
  }
}

/**
 * Every read for `kind` and `number`, through `run(path)`, the `user` read
 * included. Returns { owner, records } or { stop }. The stops for a call fire
 * as it returns; the cap and the counts after the last read.
 */
export function read(kind, number, run) {
  const repo = `repos/${SLUG}`;
  try {
    const who = item(run, 'user');
    if (typeof who.login !== 'string' || who.login === '') throw new Stop('stop/shape');
    const owner = who.login;
    let records;
    let counts;
    if (kind === 'issue') {
      const issue = item(run, `${repo}/issues/${number}`);
      const comments = list(run, `${repo}/issues/${number}/comments`);
      const events = list(run, `${repo}/issues/${number}/events`);
      records = { issue, comments, events };
      counts = [[comments.length, issue.comments]];
    } else {
      const pull = item(run, `${repo}/pulls/${number}`);
      const commits = list(run, `${repo}/pulls/${number}/commits`);
      const reviews = list(run, `${repo}/pulls/${number}/reviews`, MAX_REVIEWS);
      const reviewComments = list(run, `${repo}/pulls/${number}/comments`);
      const comments = list(run, `${repo}/issues/${number}/comments`);
      records = { pull, commits, reviews, reviewComments, comments };
      if (pull.commits > MAX_COMMITS || reviews.length > MAX_REVIEWS) throw new Stop('stop/cap');
      counts = [
        [comments.length, pull.comments],
        [reviewComments.length, pull.review_comments],
        [commits.length, pull.commits],
      ];
    }
    if (counts.some(([got, want]) => got !== want)) throw new Stop('stop/count');
    return { owner, records };
  } catch (e) {
    if (e instanceof Stop) return { stop: e.id };
    throw e;
  }
}

// ---------------------------------------------------------------- decisions: pure

/** Who wrote it, against the owner: [] when the owner's account, else the one reason that replaces the rest. */
function authorWhy(u, owner) {
  if (!isObject(u)) return ['no-account'];
  if (u.type === 'Bot') return ['bot'];
  if (u.login !== owner) return ['not-owner'];
  return [];
}

const login = u => (isObject(u) && typeof u.login === 'string' ? u.login : null);

/** One comment or review comment. `hidden` is null where REST carries no minimized field. */
function commentRecord(kind, c, owner) {
  const why = authorWhy(c.user, owner);
  if (why.length === 0 && c.updated_at !== c.created_at) why.push('edited');
  return {
    kind,
    id: c.id,
    url: c.html_url ?? null,
    author: login(c.user),
    author_type: c.user?.type ?? null,
    association: c.author_association ?? null,
    created_at: c.created_at ?? null,
    hidden: 'minimized' in c ? c.minimized !== null : null,
    owner_unedited: why.length === 0,
    why,
    body: c.body ?? '',
  };
}

/** An issue, PR or review body: REST shows no editor, so the owner's is never unedited. */
function bodyRecord(kind, b, created, owner) {
  const why = authorWhy(b.user, owner);
  if (why.length === 0) why.push('body-no-editor');
  return {
    kind,
    id: kind === 'review' ? b.id : b.number,
    url: b.html_url ?? null,
    author: login(b.user),
    author_type: b.user?.type ?? null,
    association: b.author_association ?? null,
    created_at: created ?? null,
    hidden: false,
    owner_unedited: false,
    why,
    body: b.body ?? '',
  };
}

/** One record per label the issue carries or its events name. */
function labelRecords(issue, events, owner) {
  const carried = new Set((issue.labels ?? []).map(l => (isObject(l) ? l.name : l)));
  const named = events.filter(e => (e.event === 'labeled' || e.event === 'unlabeled') && typeof e.label?.name === 'string');
  const names = [...new Set([...carried, ...named.map(e => e.label.name)])].filter(n => typeof n === 'string');
  return names.map(name => {
    const mine = named.filter(e => e.label.name === name);
    const last = mine.findLastIndex(e => e.event === 'labeled');
    const why = [];
    const applied = last >= 0 ? mine[last] : null;
    if (applied === null) {
      if (carried.has(name)) why.push('label-no-event');
    } else if (login(applied.actor) !== owner) why.push('label-not-owner');
    if ((applied !== null && mine.slice(last + 1).some(e => e.event === 'unlabeled')) || !carried.has(name)) why.push('label-removed');
    return {
      kind: 'label',
      id: name,
      url: null,
      author: applied ? login(applied.actor) : null,
      author_type: applied?.actor?.type ?? null,
      association: null,
      created_at: applied?.created_at ?? null,
      hidden: false,
      owner_applied: why.length === 0,
      why,
      body: null,
    };
  });
}

/** The PR as code: insiders' only when the owner opened it from this repo, with every commit the owner's and the last one its head. */
function pullRecord(pull, commits, owner) {
  const why = [];
  if (login(pull.user) !== owner) why.push('opener-not-owner');
  if (pull.head?.repo?.full_name !== SLUG) why.push('cross-repo');
  if (commits.some(c => login(c.author) !== owner || login(c.committer) !== owner)) why.push('commit-not-owner');
  if (commits.length === 0 || commits[commits.length - 1].sha !== pull.head?.sha) why.push('head-mismatch');
  return {
    kind: 'pull',
    id: pull.number,
    url: pull.html_url ?? null,
    author: login(pull.user),
    author_type: pull.user?.type ?? null,
    association: pull.author_association ?? null,
    created_at: pull.created_at ?? null,
    hidden: false,
    insiders: why.length === 0,
    head_sha: pull.head?.sha ?? null,
    why,
    body: null,
  };
}

/** The verdicts on one read's records, as plain records. Pure. */
export function decide(kind, records, owner) {
  if (kind === 'issue') {
    const { issue, comments, events } = records;
    return [bodyRecord('issue-body', issue, issue.created_at, owner), ...comments.map(c => commentRecord('comment', c, owner)), ...labelRecords(issue, events, owner)];
  }
  const { pull, commits, reviews, reviewComments, comments } = records;
  return [
    pullRecord(pull, commits, owner),
    bodyRecord('pull-body', pull, pull.created_at, owner),
    ...reviews.map(r => bodyRecord('review', r, r.submitted_at, owner)),
    ...reviewComments.map(c => commentRecord('review-comment', c, owner)),
    ...comments.map(c => commentRecord('comment', c, owner)),
  ];
}

/** The record's own flag: owner_unedited, owner_applied or insiders. */
const flag = r => r.owner_unedited ?? r.owner_applied ?? r.insiders;

// ---------------------------------------------------------------- output: pure

// What JSON leaves raw and a reader could take for a line break or reordered
// text: C1 controls, the line and paragraph separators, and every format
// character, astral ones included.
const RAW = /[\u0080-\u009f\u2028\u2029\p{Cf}]/gu;
const hex = n => `\\u${n.toString(16).padStart(4, '0')}`;
/** `text` with each such character as \u escapes, an astral one as its surrogate pair. */
export function escape(text) {
  return text.replace(RAW, ch => [...Array(ch.length).keys()].map(i => hex(ch.charCodeAt(i))).join(''));
}

const summaryId = r => `${r.kind}:${typeof r.id === 'string' ? JSON.stringify(r.id) : r.id}`;

/** The checker's answer; every line escaped as above, the SUMMARY with the records. */
function result(code, lines, fails = []) {
  return { code, fails, last: lines[lines.length - 1], out: escape(`${lines.join('\n')}\n`) };
}

const USAGE = 'usage: node tracker-authors.mjs issue|pr <n>';

/**
 * Validate `argv`, read through `run(path)` and decide. Returns { code, fails,
 * last, out }: code 2 on bad input before any call, 1 on a stop, 0 with the
 * records, SUMMARY and RESULT: pass.
 */
export function check(argv, run) {
  if (argv.length !== 2 || !KINDS.includes(argv[0]) || !NUMBER.test(argv[1])) return result(2, ['FAIL usage', USAGE, 'RESULT: fail'], ['usage']);
  const [kind, number] = argv;
  let got;
  try {
    got = read(kind, number, run);
    if (!got.stop) got.verdicts = decide(kind, got.records, got.owner);
  } catch {
    // A record whose fields aren't the shape decide() reads: never a pass, and never the error's text.
    got = { stop: 'stop/shape' };
  }
  if (got.stop) return result(1, [`FAIL ${got.stop}`, 'RESULT: fail'], [got.stop]);
  const trues = got.verdicts.filter(flag).map(summaryId);
  return result(0, [JSON.stringify(got.verdicts, null, 2), `SUMMARY: ${kind} ${number} as ${got.owner}; true: ${trues.length ? trues.join(' ') : 'none'}`, 'RESULT: pass']);
}

/**
 * The tests' adapter over decide(): judges only the records whose kind is in
 * `kinds`. `input` is { kind, owner, records }, decide()'s arguments. code 1,
 * with the reason ids as fails, when any judged record has a reason.
 */
export function tableCheck(kinds, input) {
  const judged = decide(input.kind, input.records, input.owner).filter(r => kinds.includes(r.kind));
  const fails = [...new Set(judged.flatMap(r => r.why))].sort();
  return fails.length ? result(1, [...fails.map(f => `FAIL ${f}`), 'RESULT: fail'], fails) : result(0, ['RESULT: pass']);
}
