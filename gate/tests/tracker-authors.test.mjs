// The tracker author checker (#183, T2): the REST reads a session runs where
// GraphQL is refused, and the decision on what counts. Every case but the
// child runs calls the core in-process with a fake gh, so no case reaches
// GitHub. Records are synthetic: the owner here is a made-up login, and only
// the repo's own slug is real, since the cross-repo check compares with it.
// Each bad case is a table row or a test naming its claim, #183 C3 to C8 and
// C12.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { SLUG, check, decide, ghArgs, ghEnv, ghOptions, makeRun, tableCheck } from '../tracker-authors-core.mjs';
import { table } from './tables.mjs';
import { GATE, lastLine } from './text.mjs';
import { tempDir } from './tree.mjs';

const MODULE = 'gate/tracker-authors-core.mjs';
const CLI = join(GATE, 'tracker-authors.mjs');
const OWNER = 'the-owner';
// Another account whose login starts with the owner's, so a loose match is caught.
const OTHER = 'the-owner-2';
const T = '2026-01-02T03:04:05Z';
const LATER = '2026-01-02T03:04:06Z';
const SHA = 'a'.repeat(40);
const R = `repos/${SLUG}`;

const user = (login, type = 'User') => ({ login, type });
const comment = (id, over = {}) => ({ id, html_url: `https://example.invalid/c/${id}`, user: user(OWNER), author_association: 'OWNER', created_at: T, updated_at: T, minimized: null, body: 'A comment.', ...over });
const review = (id, over = {}) => ({ id, html_url: `https://example.invalid/r/${id}`, user: user(OTHER), author_association: 'NONE', submitted_at: T, state: 'COMMENTED', body: 'A review.', ...over });
const commit = (sha, over = {}) => ({ sha, author: user(OWNER), committer: user(OWNER), ...over });
const labeled = (id, name, actor = OWNER, event = 'labeled') => ({ id, event, actor: user(actor), label: { name }, created_at: T });

/** An issue the owner opened, with one unedited owner comment and one label the owner applied. */
const issueRecords = () => ({
  issue: { number: 7, html_url: 'https://example.invalid/i/7', user: user(OWNER), author_association: 'OWNER', created_at: T, body: 'An issue.', comments: 1, labels: [{ name: 'tier:quick' }] },
  comments: [comment(101)],
  events: [labeled(201, 'tier:quick')],
});

/** An insiders' PR: the owner opened it from this repo, with one owner commit at its head, one owner comment and one owner review comment. */
const prRecords = () => ({
  pull: { number: 7, html_url: 'https://example.invalid/p/7', user: user(OWNER), author_association: 'OWNER', created_at: T, body: 'A PR.', comments: 1, review_comments: 1, commits: 1, head: { sha: SHA, repo: { full_name: SLUG } } },
  commits: [commit(SHA)],
  reviews: [],
  reviewComments: [comment(301)],
  comments: [comment(101)],
});

// ------------------------------------------------------------ decide(), through the tests' adapter

/** A table base: one decide() input as JSON. */
const input = (kind, records) => ({ 'input.json': JSON.stringify({ kind, owner: OWNER, records }) });
/** A plant that edits the records in place. */
const edit = fn => tree => {
  const v = JSON.parse(tree['input.json']);
  fn(v.records, v);
  return { 'input.json': JSON.stringify(v) };
};
/** Judges `kinds`, or the input's own `kinds` where a row sets them. */
const judge = kinds => tree => {
  const v = JSON.parse(tree['input.json']);
  return tableCheck(v.kinds ?? kinds, v);
};

// #183 C3
for (const c of table('tracker authors comments', {
  module: MODULE,
  base: () => input('issue', issueRecords()),
  run: judge(['comment']),
  rows: [
    { id: 'edited', plant: edit(r => (r.comments[0].updated_at = LATER)), fails: ['edited'], why: 'an owner comment edited after it was posted, by an editor REST cannot show' },
    { id: 'bot', plant: edit(r => (r.comments[0].user = user('helper[bot]', 'Bot'))), fails: ['bot'], why: 'a bot account' },
    { id: 'deleted-account', plant: edit(r => (r.comments[0].user = null)), fails: ['no-account'], why: 'a deleted account shows no user' },
    { id: 'other-account', plant: edit(r => (r.comments[0].user = user(OTHER))), fails: ['not-owner'], why: 'another account' },
  ],
})) test(c.name, c.fn);

// #183 C3: a hidden comment is flagged, and only a hidden one; one REST shows no flag for is unknown.
test('tracker authors: a hidden comment is flagged hidden, an unhidden one is not, and one with no flag is unknown', () => {
  const r = issueRecords();
  r.comments.push(comment(102, { minimized: { reason: 'off-topic' } }));
  const out = decide('issue', r, OWNER).filter(x => x.kind === 'comment');
  assert.deepEqual(
    out.map(x => [x.id, x.hidden]),
    [
      [101, false],
      [102, true],
    ],
  );
  const p = prRecords();
  delete p.reviewComments[0].minimized;
  p.reviews.push(review(401));
  const unknown = decide('pr', p, OWNER).filter(x => x.kind === 'review-comment' || x.kind === 'review');
  assert.deepEqual(
    unknown.map(x => [x.kind, x.hidden]),
    [
      ['review', null],
      ['review-comment', null],
    ],
  );
});

// #183 C4. The base is a PR with no reviews, so it holds no record of the
// kinds judged; the issue body row swaps in an issue's records whole.
for (const c of table('tracker authors bodies', {
  module: MODULE,
  base: () => input('pr', prRecords()),
  run: judge(['issue-body', 'review']),
  rows: [
    { id: 'issue-body', plant: edit((r, v) => ((v.kind = 'issue'), (v.records = issueRecords()))), fails: ['body-no-editor'], why: 'the owner\'s issue body, whose editor REST cannot show' },
    { id: 'review-body', plant: edit(r => r.reviews.push(review(401, { user: user(OWNER), author_association: 'OWNER' }))), fails: ['body-no-editor'], why: 'the owner\'s review body, whose editor REST cannot show' },
    { id: 'pull-body', plant: edit((r, v) => (v.kinds = ['pull-body'])), fails: ['body-no-editor'], why: 'the owner\'s PR body, whose editor REST cannot show' },
  ],
})) test(c.name, c.fn);

// #183 C5
for (const c of table('tracker authors labels', {
  module: MODULE,
  base: () => input('issue', issueRecords()),
  run: judge(['label']),
  rows: [
    { id: 'other-actor', plant: edit(r => (r.events[0].actor = user(OTHER))), fails: ['label-not-owner'], why: 'another account applied it last' },
    { id: 'removed-after', plant: edit(r => r.events.push(labeled(202, 'tier:quick', OWNER, 'unlabeled'))), fails: ['label-removed'], why: 'an unlabeled event follows the labeled one' },
    { id: 'absent-from-issue', plant: edit(r => (r.issue.labels = [])), fails: ['label-removed'], why: 'the issue no longer carries it' },
    { id: 'no-labeled-event', plant: edit(r => (r.events = [])), fails: ['label-no-event'], why: 'the issue carries it, and no labeled event names it' },
  ],
})) test(c.name, c.fn);

// #183 C7
for (const c of table('tracker authors insiders', {
  module: MODULE,
  base: () => input('pr', prRecords()),
  run: judge(['pull']),
  rows: [
    { id: 'opener', plant: edit(r => (r.pull.user = user(OTHER))), fails: ['opener-not-owner'], why: 'another account opened it' },
    { id: 'cross-repo', plant: edit(r => (r.pull.head.repo.full_name = `${OTHER}/the-pact`)), fails: ['cross-repo'], why: 'a fork\'s head branch' },
    { id: 'deleted-head-repo', plant: edit(r => (r.pull.head.repo = null)), fails: ['cross-repo'], why: 'the head repo was deleted' },
    { id: 'other-commit', plant: edit(r => (r.commits[0].author = user(OTHER))), fails: ['commit-not-owner'], why: 'a commit authored by another account' },
    { id: 'unlinked-commit', plant: edit(r => (r.commits[0].committer = null)), fails: ['commit-not-owner'], why: 'a commit whose committer email links no account' },
    { id: 'unlinked-author', plant: edit(r => (r.commits[0].author = null)), fails: ['commit-not-owner'], why: 'a commit whose author email links no account' },
    { id: 'other-committer', plant: edit(r => (r.commits[0].committer = user(OTHER))), fails: ['commit-not-owner'], why: 'a commit committed by another account' },
    { id: 'head-mismatch', plant: edit(r => r.commits.push(commit('b'.repeat(40)))), fails: ['head-mismatch'], why: 'the last commit read is not the head the PR names' },
  ],
})) test(c.name, c.fn);

// ------------------------------------------------------------ check(), with a fake gh

/** A list's pages as the checker reads them: 100 a page, until a page holds fewer. */
function pages(path, items) {
  const out = {};
  for (let i = 0, n = 1; ; i += 100, n += 1) {
    out[`${path}?per_page=100&page=${n}`] = JSON.stringify(items.slice(i, i + 100));
    if (items.length - i < 100) return out;
  }
}

/** What gh prints for each path a PR read makes. */
const prWorld = (recs, who = { login: OWNER }) => ({
  user: JSON.stringify(who),
  [`${R}/pulls/7`]: JSON.stringify(recs.pull),
  ...pages(`${R}/pulls/7/commits`, recs.commits),
  ...pages(`${R}/pulls/7/reviews`, recs.reviews),
  ...pages(`${R}/pulls/7/comments`, recs.reviewComments),
  ...pages(`${R}/issues/7/comments`, recs.comments),
});

/** What gh prints for each path an issue read makes. */
const issueWorld = (recs, who = { login: OWNER }) => ({
  user: JSON.stringify(who),
  [`${R}/issues/7`]: JSON.stringify(recs.issue),
  ...pages(`${R}/issues/7/comments`, recs.comments),
  ...pages(`${R}/issues/7/events`, recs.events),
});

/** A fake gh over a world: a path it doesn't hold, or the one named by FAIL, exits non-zero with output that must never be printed. */
const FAIL = '!fail';
const fakeRun = world => path => (path in world && world[FAIL] !== path ? { ok: true, stdout: world[path] } : { ok: false, stdout: 'CANARY-gh-stdout', stderr: 'CANARY-gh-stderr' });

// Every body in the stops' base carries this mark, so a stop is seen to print no content.
const stopRecords = () => {
  const r = prRecords();
  r.comments[0].body = 'CANARY-body';
  r.pull.body = 'CANARY-body';
  return r;
};
const world = (recs = stopRecords()) => ({ 'world.json': JSON.stringify(prWorld(recs)) });
const recs = fn => () => {
  const r = stopRecords();
  fn(r);
  return world(r);
};
const setPath = (path, text) => tree => ({ 'world.json': JSON.stringify({ ...JSON.parse(tree['world.json']), [path]: text }) });
const runWorld = tree => check(['pr', '7'], fakeRun(JSON.parse(tree['world.json'])));

// #183 C6: each stop fires with its fixed line and nothing else.
for (const c of table('tracker authors stops', {
  module: MODULE,
  base: () => world(),
  run: runWorld,
  everyRow: r => {
    assert.equal(r.out.split('\n').filter(Boolean).length, 2, r.out);
    assert.doesNotMatch(r.out, /CANARY/, r.out);
  },
  rows: [
    { id: 'non-zero-exit', plant: setPath(FAIL, `${R}/issues/7/comments?per_page=100&page=1`), fails: ['stop/gh'], why: 'a gh call exits non-zero' },
    { id: 'empty', plant: setPath(`${R}/pulls/7/reviews?per_page=100&page=1`, ''), fails: ['stop/empty'], why: 'a call prints nothing' },
    { id: 'non-array-page', plant: setPath(`${R}/pulls/7/reviews?per_page=100&page=1`, '"CANARY-page"'), fails: ['stop/shape'], why: 'a page that is not a JSON array' },
    { id: 'item-not-object', plant: setPath(`${R}/pulls/7`, '[]'), fails: ['stop/shape'], why: 'the PR read is not an object' },
    { id: 'user-without-login', plant: setPath('user', '{"name":"CANARY-name"}'), fails: ['stop/shape'], why: 'the user record has no login' },
    { id: 'head-not-a-commit', plant: recs(r => ((r.pull.head.sha = `${SHA}\n${SHA}`), (r.commits[0].sha = r.pull.head.sha))), fails: ['stop/shape'], why: 'a head commit that is not 40 hex digits alone, which the SUMMARY would print' },
    { id: 'comments-count', plant: recs(r => (r.pull.comments = 2)), fails: ['stop/count'], why: 'fewer comments read than the PR counts' },
    { id: 'review-comments-count', plant: recs(r => (r.pull.review_comments = 0)), fails: ['stop/count'], why: 'more review comments read than the PR counts' },
    { id: 'commits-count', plant: recs(r => (r.pull.commits = 2)), fails: ['stop/count'], why: 'fewer commits read than the PR counts' },
    { id: 'repeated-id', plant: recs(r => ((r.comments = [...Array.from({ length: 100 }, (_, i) => comment(1000 + i)), comment(1000)]), (r.pull.comments = 101))), fails: ['stop/repeat'], why: 'one comment id read on page 1 and again on page 2' },
    { id: 'comment-without-times', plant: recs(r => (delete r.comments[0].created_at, delete r.comments[0].updated_at)), fails: ['stop/shape'], why: 'an owner comment without the times the edit check reads' },
    { id: 'commits-over-cap', plant: recs(r => (r.pull.commits = 251)), fails: ['stop/cap'], why: 'more commits than GitHub\'s list returns' },
    { id: 'reviews-over-cap', plant: recs(r => (r.reviews = Array.from({ length: 101 }, (_, i) => review(500 + i)))), fails: ['stop/cap'], why: 'a flood of reviews past 100' },
  ],
})) test(c.name, c.fn);

// ------------------------------------------------------------ the command line, as a child

/** The command line in a child with no gh on its PATH and no token: any call it tried would stop with stop/gh and exit 1. */
function cli(t, args) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!['NODE_OPTIONS', 'GH_TOKEN', 'GITHUB_TOKEN', 'PATH'].includes(k.toUpperCase())) env[k] = v;
  env.PATH = tempDir(t, 'pact-no-gh-');
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env });
  return { code: r.status, stdout: r.stdout, out: `${r.stdout}${r.stderr}` };
}

// #183 C8
test('tracker authors: a number that is not 1 to 9 digits without a leading zero refuses with exit 2', t => {
  // The control: a good number reaches the missing gh, so exit 2 below means no call was tried.
  const good = cli(t, ['issue', '7']);
  assert.equal(good.code, 1, good.out);
  assert.match(good.stdout, /^FAIL stop\/gh$/m, good.out);
  for (const n of ['0', '07', '1234567890', '-1', '1e3', '7 ', '']) {
    const r = cli(t, ['issue', n]);
    assert.equal(r.code, 2, `${JSON.stringify(n)}: ${r.out}`);
    assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  }
});

// #183 C8
test('tracker authors: an unknown kind refuses with exit 2', t => {
  for (const kind of ['discussion', 'PR', '--repo']) {
    const r = cli(t, [kind, '7']);
    assert.equal(r.code, 2, `${kind}: ${r.out}`);
  }
});

// #183 C8
test('tracker authors: an extra argument refuses with exit 2', t => {
  for (const args of [['issue', '7', 'x'], ['pr', '7', '--repo', 'a/b'], ['issue']]) {
    const r = cli(t, args);
    assert.equal(r.code, 2, `${args.join(' ')}: ${r.out}`);
  }
});

// ------------------------------------------------------------ the runner and the output

// #183 C12
test('tracker authors: the runner pins the host, drops the debug variables, and runs gh without a shell from a new empty folder', t => {
  assert.deepEqual(ghArgs('user'), ['api', '--hostname', 'github.com', '--method', 'GET', 'user']);
  assert.deepEqual(ghEnv({ PATH: '/bin', GH_DEBUG: 'api', gh_debug: '1', DEBUG: '1', Debug: '1', GH_TOKEN: 'kept' }), { PATH: '/bin', GH_TOKEN: 'kept' });
  const opts = ghOptions('/some/folder');
  assert.equal(opts.cwd, '/some/folder');
  assert.equal(opts.shell, false);
  const seen = [];
  const run = makeRun({
    env: { GH_DEBUG: '1', KEEP: 'x' },
    tmp: tempDir(t),
    spawn: (cmd, args, o) => {
      seen.push({ cmd, args, cwd: o.cwd, empty: readdirSync(o.cwd).length === 0, env: o.env, shell: o.shell });
      return { status: 0, stdout: '{"login":"x"}' };
    },
  });
  assert.deepEqual(run('user'), { ok: true, stdout: '{"login":"x"}' });
  run('user');
  assert.equal(seen.length, 2);
  const failed = makeRun({ env: {}, tmp: tempDir(t), spawn: () => ({ status: 1, stdout: '{"login":"x"}' }) });
  assert.equal(failed('user').ok, false, 'a non-zero exit is a failed call, whatever it printed');
  for (const s of seen) {
    assert.equal(s.cmd, 'gh');
    assert.deepEqual(s.args, ghArgs('user'));
    assert.ok(s.empty, 'the folder was empty');
    assert.ok(!existsSync(s.cwd), 'the folder was removed afterwards');
    assert.deepEqual(s.env, { KEEP: 'x' });
    assert.equal(s.shell, false);
  }
  assert.notEqual(seen[0].cwd, seen[1].cwd);
});

// #183 C12
test('tracker authors: no user field but the login, and no gh output, reaches the output or a stop line', () => {
  const who = { login: OWNER, email: 'CANARY-email', name: 'CANARY-name', id: 7777001 };
  const ok = check(['issue', '7'], fakeRun(issueWorld(issueRecords(), who)));
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /^SUMMARY: issue 7 as the-owner; /m);
  const stopped = check(['issue', '7'], fakeRun({ ...issueWorld(issueRecords(), who), [FAIL]: `${R}/issues/7/events?per_page=100&page=1` }));
  assert.deepEqual(stopped.fails, ['stop/gh'], stopped.out);
  for (const r of [ok, stopped]) assert.doesNotMatch(r.out, /CANARY|7777001/, r.out);
});

// #183 C12
test('tracker authors: line separators, control and format characters in a body come out escaped', () => {
  const recs = issueRecords();
  const raw = `a${String.fromCodePoint(0x2028)}b${String.fromCodePoint(0x2029)}b${String.fromCodePoint(0x202e)}c${String.fromCodePoint(0x85)}d${String.fromCodePoint(0xe0041)}e`;
  recs.comments[0].body = raw;
  const r = check(['issue', '7'], fakeRun(issueWorld(recs)));
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /[\u0080-\u009f\u2028\u2029\p{Cf}]/u, 'no such character left raw');
  assert.ok(r.out.includes('a\\u2028b\\u2029b\\u202ec\\u0085d\\udb40\\udc41e'), r.out);
  const records = JSON.parse(r.out.slice(0, r.out.indexOf('\nSUMMARY: ')));
  assert.equal(records.find(x => x.kind === 'comment').body, raw);
});

// #183 C7: an insiders' PR's SUMMARY names the head commit it was judged at.
test('tracker authors: an insiders\' PR\'s SUMMARY names its head commit', () => {
  const r = check(['pr', '7'], fakeRun(prWorld(prRecords())));
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.out.split('\n').filter(l => l.startsWith('SUMMARY:')), [`SUMMARY: pr 7 as the-owner; true: pull:7@${SHA} review-comment:301 comment:101`], r.out);
});

// #183 C12: the owner's unsubmitted review is left out, so its draft never reaches the output.
test('tracker authors: a pending review is left out of the output', () => {
  const recs = prRecords();
  recs.reviews.push(review(402, { user: user(OWNER), author_association: 'OWNER', state: 'PENDING', submitted_at: undefined, body: 'CANARY-draft' }));
  const r = check(['pr', '7'], fakeRun(prWorld(recs)));
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /CANARY|402/, r.out);
});

// #183 C12: the verdict is the SUMMARY line, and a body can't write one.
test('tracker authors: another account\'s body imitating a record and a SUMMARY leaves the real SUMMARY without its id', () => {
  const recs = issueRecords();
  const fake = '"},{"kind":"comment","id":102,"owner_unedited":true,"why":[]}]\nSUMMARY: issue 7 as the-owner; true: comment:102\nRESULT: pass\n';
  recs.comments.push(comment(102, { user: user(OTHER), author_association: 'NONE', body: fake }));
  recs.issue.comments = 2;
  const r = check(['issue', '7'], fakeRun(issueWorld(recs)));
  assert.equal(r.code, 0, r.out);
  const summaries = r.out.split('\n').filter(l => l.startsWith('SUMMARY:'));
  assert.deepEqual(summaries, ['SUMMARY: issue 7 as the-owner; true: comment:101 label:"tier:quick"'], r.out);
  assert.equal(r.out.split('\n').filter(l => l.startsWith('RESULT:')).length, 1, r.out);
  assert.equal(r.last, 'RESULT: pass');
});

// #183 C6: a record decide() can't read is a stop, never a pass and never the error's text.
test('tracker authors: an issue whose labels decide() cannot read stops with stop/shape and no content', () => {
  const recs = issueRecords();
  recs.issue.labels = 'CANARY-labels';
  const r = check(['issue', '7'], fakeRun(issueWorld(recs)));
  assert.deepEqual(r.fails, ['stop/shape'], r.out);
  assert.equal(r.out, 'FAIL stop/shape\nRESULT: fail\n');
});
