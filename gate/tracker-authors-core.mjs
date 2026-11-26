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
// name as a JSON string and an insiders' PR as pull:<n>@<head sha>, joined by
// single spaces; "none" when no flag is true. A pending review, unsubmitted
// and seen only by its author, is left out.
//
// With an agent app pinned (#599, S4 and S9.7), the pinned owner's account is
// the owner and a pinned app's PR can be insiders' code. An app counts as
// pinned only when ~/.pact/github.json exists and the switch's helper,
// ~/.pact/tools/gh-app.mjs, is installed; the command line reads both
// and hands them to check() as { text, helper }. Without both, nothing here
// changes. The pin is checked against GitHub's own records on every run, under
// the owner's own gh login with no token variable in gh's environment.
//
// Node 24 or later, ESM, node: built-ins only, so the two files run on their
// own from a temporary folder. The pin's constants below are a copy of
// claude/tools/gh-app.mjs's, which a test holds equal.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const SLUG = 'mephistopheles4/the-pact';
const KINDS = ['issue', 'pr'];
const NUMBER = /^[1-9][0-9]{0,8}$/;
const SHA = /^[0-9a-f]{40}$/;
const PER_PAGE = 100;
const MAX_COMMITS = 250;
const MAX_REVIEWS = 100;

// ---------------------------------------------------------------- gh

/** gh's arguments for one GET, with the host pinned. */
export const ghArgs = path => ['api', '--hostname', 'github.com', '--method', 'GET', path];

// What gh reads from the environment that could swap the account a read runs as.
const TOKEN_VARS = new Set(['GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']);

/** The environment gh runs with: the caller's, without GH_DEBUG or DEBUG in any case, and with `strip` set, without the token and host variables too. */
export function ghEnv(env, strip = false) {
  const out = {};
  for (const [k, v] of Object.entries(env ?? {})) {
    const upper = k.toUpperCase();
    if (upper !== 'GH_DEBUG' && upper !== 'DEBUG' && !(strip && TOKEN_VARS.has(upper))) out[k] = v;
  }
  return out;
}

/** The spawn options for one gh call from `folder`: no shell, nothing on standard input. */
export const ghOptions = folder => ({ cwd: folder, shell: false, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });

/**
 * A gh runner: each call runs gh from a new, empty folder under `tmp`, removed
 * afterwards, so a file planted in the caller's folder can't run as gh.
 * `spawn` stands in for the process call in tests. `strip` drops the token and
 * host variables, for a run with an app pinned. Returns { ok, stdout }.
 * gh's standard error is never returned.
 */
export function makeRun({ env, tmp, spawn = spawnSync, strip = false }) {
  const clean = ghEnv(env, strip);
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

// ---------------------------------------------------------------- the pin

// A copy of claude/tools/gh-app.mjs's constants: this file runs alone, so it can't import them.
export const APP_PROVIDERS = Object.freeze(['claude', 'codex', 'antigravity']);
export const APP_PERMISSIONS = Object.freeze({ contents: 'write', pull_requests: 'write', issues: 'write', workflows: 'write', actions: 'read', checks: 'read', statuses: 'read', metadata: 'read' });
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38})$/;
const isId = v => Number.isSafeInteger(v) && v > 0;
const sameLogin = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const sameKeys = (o, keys) => isObject(o) && Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));

/** The pin file's two facts, read behind a seam: its text (null when absent, '' when unreadable) and whether the switch's helper is installed. */
export function pinInputFrom({ home, fs }) {
  const dir = join(home, '.pact');
  let text = null;
  try {
    text = fs.readFileSync(join(dir, 'github.json'), 'utf8');
  } catch (e) {
    text = e?.code === 'ENOENT' ? null : '';
  }
  return { text, helper: fs.existsSync(join(dir, 'tools', 'gh-app.mjs')) };
}

/** Whether an app counts as pinned: the file is there and the helper is installed. */
export const isPinned = pinInput => isObject(pinInput) && typeof pinInput.text === 'string' && pinInput.helper === true;

/**
 * The command line's whole run: the home's pin input, a gh runner that drops
 * the token variables when an app is pinned, and check(). `spawn` stands in for
 * the process call in tests.
 */
export function checkAtHome({ argv, env, home, fs, tmp, spawn }) {
  const pinInput = pinInputFrom({ home, fs });
  return check(argv, makeRun({ env, tmp, spawn, strip: isPinned(pinInput) }), pinInput);
}

/** The pin file's parsed, checked shape: exactly the fields the helper writes. A stop otherwise, and never the parse error. */
function parsePin(text) {
  let pin;
  try {
    pin = JSON.parse(text);
  } catch {
    throw new Stop('stop/pin');
  }
  if (!sameKeys(pin, ['owner', 'apps']) || !sameKeys(pin.owner, ['login', 'id']) || !LOGIN_RE.test(pin.owner.login ?? '') || !isId(pin.owner.id) || !isObject(pin.apps)) throw new Stop('stop/pin');
  for (const [p, a] of Object.entries(pin.apps)) {
    if (!APP_PROVIDERS.includes(p) || !sameKeys(a, ['app_id', 'slug', 'bot_login', 'bot_id'])) throw new Stop('stop/pin');
    if (!isId(a.app_id) || !isId(a.bot_id) || typeof a.slug !== 'string' || !SLUG_RE.test(a.slug) || a.bot_login !== `${a.slug}[bot]`) throw new Stop('stop/pin');
  }
  return pin;
}

const samePermissions = (got, want) => isObject(got) && Object.keys(got).length === Object.keys(want).length && Object.entries(want).every(([k, v]) => got[k] === v);

/**
 * The pin against GitHub's own records, read through `run`. `who` is the
 * `user` record. A /user other than the pin's owner stops (stop/owner), and so
 * does a slug whose bot is not the pinned one (stop/bot). An app record whose
 * id, owner, permissions or events differ from the pin drops that app: its PRs
 * are outsiders' code, and a note says so. Returns { apps, notes }.
 */
function checkPin(run, pin, who) {
  if (who.id !== pin.owner.id || !sameLogin(who.login, pin.owner.login)) throw new Stop('stop/owner');
  const apps = [];
  const notes = [];
  for (const [provider, a] of Object.entries(pin.apps)) {
    const rec = item(run, `apps/${a.slug}`);
    const bot = item(run, `users/${a.bot_login}`);
    if (bot.id !== a.bot_id || bot.type !== 'Bot' || !sameLogin(bot.login, a.bot_login)) throw new Stop('stop/bot');
    if (rec.id === a.app_id && rec.owner?.id === pin.owner.id && samePermissions(rec.permissions, APP_PERMISSIONS) && Array.isArray(rec.events) && rec.events.length === 0) apps.push({ provider, bot_id: a.bot_id });
    else notes.push(`NOTE: the ${provider} app is not counted: its record does not match the pin`);
  }
  return { apps, notes };
}

/**
 * Every read for `kind` and `number`, through `run(path)`, the `user` read
 * included. With `pinInput` ({ text, helper }) naming a pinned app, the pin is
 * parsed before any call and checked after the `user` read. Returns { owner,
 * records, apps, notes } or { stop }. The stops for a call fire as it returns;
 * the cap and the counts after the last read.
 */
export function read(kind, number, run, pinInput) {
  const repo = `repos/${SLUG}`;
  try {
    const pin = isPinned(pinInput) ? parsePin(pinInput.text) : null;
    const who = item(run, 'user');
    if (typeof who.login !== 'string' || who.login === '') throw new Stop('stop/shape');
    const owner = who.login;
    const { apps, notes } = pin ? checkPin(run, pin, who) : { apps: [], notes: [] };
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
      // The head commit goes into the SUMMARY as the commit to check out, so it must be one.
      if (typeof pull.head?.sha !== 'string' || !SHA.test(pull.head.sha)) throw new Stop('stop/shape');
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
    return { owner, records, apps, notes };
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

/** Whether a comment or review is hidden: null where REST carries no minimized field. */
const hiddenOf = x => ('minimized' in x ? x.minimized !== null : null);

/** One comment or review comment. Without both its times, the edit check can't run, so the read stops. */
function commentRecord(kind, c, owner) {
  if (typeof c.created_at !== 'string' || typeof c.updated_at !== 'string') throw new Stop('stop/shape');
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
    hidden: hiddenOf(c),
    owner_unedited: why.length === 0,
    why,
    body: c.body ?? '',
  };
}

/** An issue, PR or review body: REST shows no editor, so the owner's is never unedited. Only a review can be hidden. */
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
    hidden: kind === 'review' ? hiddenOf(b) : false,
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

/** Whether an account is the owner's, or a pinned app's: by id and type Bot, never by login, name or email. */
const insider = (u, owner, apps) => login(u) === owner || (isObject(u) && u.type === 'Bot' && apps.some(a => a.bot_id === u.id));

/**
 * The PR as code: insiders' only when the owner or a pinned app opened it from
 * this repo, with every commit theirs and the last one its head. The reason ids
 * opener-not-owner and commit-not-owner stand for "not the owner or a pinned
 * app", and stay as they were.
 */
function pullRecord(pull, commits, owner, apps) {
  const why = [];
  if (!insider(pull.user, owner, apps)) why.push('opener-not-owner');
  if (pull.head?.repo?.full_name !== SLUG) why.push('cross-repo');
  if (commits.some(c => !insider(c.author, owner, apps) || !insider(c.committer, owner, apps))) why.push('commit-not-owner');
  if (commits.at(-1)?.sha !== pull.head?.sha) why.push('head-mismatch');
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

/** The verdicts on one read's records, as plain records. `apps` are the pinned apps, { bot_id }. Pure. */
export function decide(kind, records, owner, apps = []) {
  if (kind === 'issue') {
    const { issue, comments, events } = records;
    return [bodyRecord('issue-body', issue, issue.created_at, owner), ...comments.map(c => commentRecord('comment', c, owner)), ...labelRecords(issue, events, owner)];
  }
  const { pull, commits, reviews, reviewComments, comments } = records;
  return [
    pullRecord(pull, commits, owner, apps),
    bodyRecord('pull-body', pull, pull.created_at, owner),
    ...reviews.filter(r => r.state !== 'PENDING').map(r => bodyRecord('review', r, r.submitted_at, owner)),
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

/** A record's id in the SUMMARY: a PR's names the head commit it was judged at, the one to check out. */
const summaryId = r => `${r.kind}:${typeof r.id === 'string' ? JSON.stringify(r.id) : r.id}${r.kind === 'pull' ? `@${r.head_sha}` : ''}`;

/** The checker's answer; every line escaped as above, the SUMMARY with the records. */
function result(code, lines, fails = []) {
  return { code, fails, last: lines[lines.length - 1], out: escape(`${lines.join('\n')}\n`) };
}

const USAGE = 'usage: node tracker-authors.mjs issue|pr <n>';

/**
 * Validate `argv`, read through `run(path)` and decide. `pinInput` is { text,
 * helper } from pinInputFrom(); without it, or without both facts, no app is
 * pinned. Returns { code, fails, last, out }: code 2 on bad input before any
 * call, 1 on a stop, 0 with the records, any NOTE lines for a pinned app not
 * counted, the SUMMARY and RESULT: pass.
 */
export function check(argv, run, pinInput) {
  if (argv.length !== 2 || !KINDS.includes(argv[0]) || !NUMBER.test(argv[1])) return result(2, ['FAIL usage', USAGE, 'RESULT: fail'], ['usage']);
  const [kind, number] = argv;
  let got;
  try {
    got = read(kind, number, run, pinInput);
    if (!got.stop) got.verdicts = decide(kind, got.records, got.owner, got.apps);
  } catch {
    // A record whose fields aren't the shape decide() reads: never a pass, and never the error's text.
    got = { stop: 'stop/shape' };
  }
  if (got.stop) return result(1, [`FAIL ${got.stop}`, 'RESULT: fail'], [got.stop]);
  const trues = got.verdicts.filter(flag).map(summaryId);
  return result(0, [JSON.stringify(got.verdicts, null, 2), ...got.notes, `SUMMARY: ${kind} ${number} as ${got.owner}; true: ${trues.length ? trues.join(' ') : 'none'}`, 'RESULT: pass']);
}

/**
 * The tests' adapter over decide(): judges only the records whose kind is in
 * `kinds`. `input` is { kind, owner, records }, decide()'s arguments. code 1,
 * with the reason ids as fails, when any judged record has a reason, and
 * `flag-mismatch` among them when a record's flag isn't true exactly when it
 * has none, since the SUMMARY prints the flag.
 */
export function tableCheck(kinds, input) {
  const judged = decide(input.kind, input.records, input.owner, input.apps).filter(r => kinds.includes(r.kind));
  const mismatch = judged.some(r => flag(r) !== (r.why.length === 0)) ? ['flag-mismatch'] : [];
  const fails = [...new Set([...judged.flatMap(r => r.why), ...mismatch])].sort();
  return fails.length ? result(1, [...fails.map(f => `FAIL ${f}`), 'RESULT: fail'], fails) : result(0, ['RESULT: pass']);
}
