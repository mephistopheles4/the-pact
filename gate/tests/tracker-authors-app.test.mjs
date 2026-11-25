// The tracker author checker with an agent app pinned (#599 T4, spec revision 5,
// S9.7 and C7). Every case but the command-line ones, which run as a child
// process, calls the core in-process with a fake gh, so none reaches GitHub. Ids and logins are made up. A fake gh holds
// only the paths a read should make: any other path is a failed call, so a
// check that reads more than it should stops with stop/gh and is seen.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CLAIM_PERMISSIONS, PROVIDERS } from '../../claude/tools/gh-app.mjs';
import { APP_PERMISSIONS, APP_PROVIDERS, SLUG, check, checkAtHome, ghEnv, makeRun, pinInputFrom, tableCheck } from '../tracker-authors-core.mjs';
import { GATE, assertFails, assertPasses } from './text.mjs';
import { tempDir } from './tree.mjs';

const OWNER = 'the-owner';
const OWNER_ID = 1000001;
const APP_ID = 2000001;
const APP_SLUG = 'the-owner-claude';
const BOT = 'the-owner-claude[bot]';
const BOT_ID = 3000001;
const OTHER_BOT_ID = 3999999;
const T = '2026-01-02T03:04:05Z';
const SHA = 'a'.repeat(40);
const R = `repos/${SLUG}`;

const pinOf = (over = {}) => ({ owner: { login: OWNER, id: OWNER_ID }, apps: { claude: { app_id: APP_ID, slug: APP_SLUG, bot_login: BOT, bot_id: BOT_ID } }, ...over });
const pinInput = (pin = pinOf(), helper = true) => ({ text: typeof pin === 'string' ? pin : JSON.stringify(pin), helper });

const person = (login, id, type = 'User') => ({ login, id, type });
const owner = () => person(OWNER, OWNER_ID);
const bot = (id = BOT_ID, login = BOT) => person(login, id, 'Bot');
const comment = (id, over = {}) => ({ id, html_url: `https://example.invalid/c/${id}`, user: owner(), author_association: 'OWNER', created_at: T, updated_at: T, minimized: null, body: 'A comment.', ...over });
const commit = (sha, who) => ({ sha, author: who, committer: who });

/** A PR read: opened by `opener`, one commit by `who`, no reviews, no review comments, no comments. */
const prRecords = (opener, who = opener) => ({
  pull: { number: 7, html_url: 'https://example.invalid/p/7', user: opener, author_association: 'NONE', created_at: T, body: 'A PR.', comments: 0, review_comments: 0, commits: 1, head: { sha: SHA, repo: { full_name: SLUG } } },
  commits: [commit(SHA, who)],
  reviews: [],
  reviewComments: [],
  comments: [],
});

const page = (path, items) => ({ [`${path}?per_page=100&page=1`]: JSON.stringify(items) });
const app = (over = {}) => ({ id: APP_ID, owner: { id: OWNER_ID }, permissions: { ...APP_PERMISSIONS }, events: [], ...over });

/** What gh prints for a PR read with an app pinned: the user, the app's and the bot's public records, then the PR's own. */
const world = (recs, over = {}) => ({
  user: JSON.stringify({ login: OWNER, id: OWNER_ID }),
  [`apps/${APP_SLUG}`]: JSON.stringify(app()),
  [`users/${BOT}`]: JSON.stringify(bot()),
  [`${R}/pulls/7`]: JSON.stringify(recs.pull),
  ...page(`${R}/pulls/7/commits`, recs.commits),
  ...page(`${R}/pulls/7/reviews`, recs.reviews),
  ...page(`${R}/pulls/7/comments`, recs.reviewComments),
  ...page(`${R}/issues/7/comments`, recs.comments),
  ...over,
});

const FAIL = '!fail';
const fakeRun = w => path => (path in w && w[FAIL] !== path ? { ok: true, stdout: w[path] } : { ok: false, stdout: 'CANARY-gh-stdout' });

/** The checker's answer on a pinned PR read, with the world's paths a test overrides. */
const run = (recs, over, pin = pinInput()) => check(['pr', '7'], fakeRun(world(recs, over)), pin);
const insiders = r => r.out.split('\n').some(l => l.startsWith('SUMMARY:') && l.includes(`pull:7@${SHA}`));

// ------------------------------------------------------------ what counts: C7

// #599 C7
test('agent app checker: a pinned app\'s PR, with every commit by the app, is insiders\' code', () => {
  const r = run(prRecords(bot()));
  assertPasses(r);
  assert.ok(insiders(r), r.out);
});

// #599 C7: the owner's own PR still counts with an app pinned.
test('agent app checker: the owner\'s PR is still insiders\' code with an app pinned', () => {
  const r = run(prRecords(owner()));
  assertPasses(r);
  assert.ok(insiders(r), r.out);
});

// #599 C7: a PR the owner opened with a commit by the app, and the reverse, counts too.
test('agent app checker: a mix of the owner and the app on one PR is insiders\' code', () => {
  assert.ok(insiders(run(prRecords(owner(), bot()))));
  assert.ok(insiders(run(prRecords(bot(), owner()))));
});

// #599 C7
{
  const rows = [
    { id: 'same-login-other-id', recs: prRecords(bot(OTHER_BOT_ID)), why: 'a Bot with the pinned login but another id opened it' },
    { id: 'user-with-the-bots-id', recs: prRecords(person(BOT, BOT_ID, 'User')), why: 'an account of type User holding the bot\'s id' },
    { id: 'other-bot', recs: prRecords(bot(OTHER_BOT_ID, 'someone-else[bot]')), why: 'another bot opened it, a Codex connector for one' },
    { id: 'other-account', recs: prRecords(person('the-owner-2', 1000002)), why: 'another account opened it' },
    { id: 'commit-by-other-bot', recs: prRecords(bot(), bot(OTHER_BOT_ID)), why: 'the app opened it, a commit is another bot\'s' },
    { id: 'unlinked-commit', recs: Object.assign(prRecords(bot()), { commits: [{ sha: SHA, author: bot(), committer: null }] }), why: 'a commit whose committer links no account' },
  ];
  for (const row of rows) {
    test(`agent app checker: not insiders' code: ${row.id}`, () => {
      const r = run(row.recs);
      assertPasses(r);
      assert.ok(!insiders(r), `${row.why}: ${r.out}`);
    });
  }
}

// #599 C7: with no app pinned the app's PR is outsiders' code, as today.
{
  const rows = [
    { id: 'no-pin-file', pin: { text: null, helper: true } },
    { id: 'no-input', pin: undefined },
    { id: 'file-and-no-helper', pin: pinInput(pinOf(), false) },
  ];
  for (const row of rows) {
    test(`agent app checker: not pinned, an app's PR is outsiders' code and no pin read is made: ${row.id}`, () => {
      // The world holds only the PR's own paths, so a read of the app's record would stop with stop/gh.
      const w = world(prRecords(bot()));
      delete w[`apps/${APP_SLUG}`];
      delete w[`users/${BOT}`];
      const r = check(['pr', '7'], fakeRun(w), row.pin);
      assertPasses(r);
      assert.ok(!insiders(r), r.out);
    });
  }
}

// #599 C7: an app record that does not match the pin is dropped, so its PRs are outsiders', and a fixed line says so.
{
  const rows = [
    { id: 'owner-differs', rec: app({ owner: { id: 1000002 } }) },
    { id: 'id-differs', rec: app({ id: 2999999 }) },
    { id: 'extra-permission', rec: app({ permissions: { ...APP_PERMISSIONS, administration: 'write' } }) },
    { id: 'wider-permission', rec: app({ permissions: { ...APP_PERMISSIONS, contents: 'read' } }) },
    { id: 'missing-permission', rec: app({ permissions: Object.fromEntries(Object.entries(APP_PERMISSIONS).filter(([k]) => k !== 'workflows')) }) },
    { id: 'an-event', rec: app({ events: ['push'] }) },
    { id: 'no-events-field', rec: (({ events, ...rest }) => rest)(app()) },
  ];
  for (const row of rows) {
    test(`agent app checker: the app is not counted, and the output says so: ${row.id}`, () => {
      const r = run(prRecords(bot()), { [`apps/${APP_SLUG}`]: JSON.stringify(row.rec) });
      assertPasses(r);
      assert.ok(!insiders(r), r.out);
      assert.deepEqual(r.out.split('\n').filter(l => l.startsWith('NOTE:')), ['NOTE: the claude app is not counted: its record does not match the pin'], r.out);
    });
  }
  test('agent app checker: a dropped app does not drop the owner\'s own PR', () => {
    const r = run(prRecords(owner()), { [`apps/${APP_SLUG}`]: JSON.stringify(app({ owner: { id: 1000002 } })) });
    assert.ok(insiders(r), r.out);
  });
}

// #599 C7: with two apps pinned, each app is checked on its own: a mismatched codex record drops codex alone.
test('agent app checker: with two apps pinned, a mismatched one is dropped and the other still counts', () => {
  const codex = { app_id: 2000002, slug: 'the-owner-codex', bot_login: 'the-owner-codex[bot]', bot_id: 3000002 };
  const pin = pinInput(pinOf({ apps: { claude: pinOf().apps.claude, codex } }));
  const extra = { 'apps/the-owner-codex': JSON.stringify(app({ id: 2000002, owner: { id: 1000002 } })), 'users/the-owner-codex[bot]': JSON.stringify(bot(3000002, 'the-owner-codex[bot]')) };
  const claudePr = run(prRecords(bot()), extra, pin);
  assert.ok(insiders(claudePr), claudePr.out);
  assert.deepEqual(claudePr.out.split('\n').filter(l => l.startsWith('NOTE:')), ['NOTE: the codex app is not counted: its record does not match the pin'], claudePr.out);
  assert.ok(!insiders(run(prRecords(bot(3000002, 'the-owner-codex[bot]')), extra, pin)), 'the dropped app\'s PR is outsiders\' code');
});

// #599 C7: the table adapter judges with the apps it is handed.
test('agent app checker: the table adapter counts a pinned app only when the input names it', () => {
  const input = apps => ({ kind: 'pr', owner: OWNER, records: prRecords(bot()), ...(apps ? { apps } : {}) });
  assertPasses(tableCheck(['pull'], input([{ provider: 'claude', bot_id: BOT_ID }])));
  assertFails(tableCheck(['pull'], input()), ['commit-not-owner', 'opener-not-owner']);
});

// ------------------------------------------------------------ stops: C7

// #599 C7: each stop prints its fixed line and nothing it read.
{
  const rows = [
    { id: 'bot-id-differs', plant: { [`users/${BOT}`]: JSON.stringify(bot(OTHER_BOT_ID)) }, fails: ['stop/bot'], why: 'the slug\'s bot has another id than the pin\'s bot_id' },
    { id: 'bot-is-a-user', plant: { [`users/${BOT}`]: JSON.stringify(person(BOT, BOT_ID, 'User')) }, fails: ['stop/bot'], why: 'the account at the bot\'s login is not a Bot' },
    { id: 'bot-login-differs', plant: { [`users/${BOT}`]: JSON.stringify(bot(BOT_ID, 'other[bot]')) }, fails: ['stop/bot'], why: 'the record is another login' },
    { id: 'user-login-differs', plant: { user: JSON.stringify({ login: 'the-owner-2', id: OWNER_ID }) }, fails: ['stop/owner'], why: '/user is another login than the pin\'s owner' },
    { id: 'user-id-differs', plant: { user: JSON.stringify({ login: OWNER, id: 1000002 }) }, fails: ['stop/owner'], why: '/user is the same login with another id' },
    { id: 'user-without-id', plant: { user: JSON.stringify({ login: OWNER }) }, fails: ['stop/owner'], why: '/user shows no id to compare' },
    { id: 'app-read-fails', plant: { [FAIL]: `apps/${APP_SLUG}` }, fails: ['stop/gh'], why: 'a check that cannot run' },
    { id: 'bot-read-fails', plant: { [FAIL]: `users/${BOT}` }, fails: ['stop/gh'], why: 'a check that cannot run' },
    { id: 'app-record-not-an-object', plant: { [`apps/${APP_SLUG}`]: '[]' }, fails: ['stop/shape'], why: 'an app record that is not an object' },
  ];
  test('agent app checker stops: base passes', () => assertPasses(run(prRecords(bot()))));
  for (const row of rows) {
    test(`agent app checker stops: ${row.id}`, () => {
      const r = run(prRecords(bot()), row.plant);
      assertFails(r, row.fails, undefined);
      assert.equal(r.out.split('\n').filter(Boolean).length, 2, r.out);
      assert.doesNotMatch(r.out, /CANARY/, row.why);
    });
  }
  test('agent app checker stops: base passes after the rows', () => assertPasses(run(prRecords(bot()))));
}

// #599 C7: a pin file that is not the pinned shape stops with stop/pin, and no call is made first.
{
  const withoutField = (o, k) => Object.fromEntries(Object.entries(o).filter(([key]) => key !== k));
  const rows = [
    { id: 'not-json', plant: '{ not json', fails: ['stop/pin'], why: 'the file is not JSON' },
    { id: 'empty', plant: '', fails: ['stop/pin'], why: 'the file is empty' },
    { id: 'extra-top-field', plant: { ...pinOf(), extra: 1 }, fails: ['stop/pin'], why: 'a field the pin does not have' },
    { id: 'no-owner', plant: withoutField(pinOf(), 'owner'), fails: ['stop/pin'], why: 'no owner entry' },
    { id: 'owner-without-id', plant: pinOf({ owner: { login: OWNER } }), fails: ['stop/pin'], why: 'an owner with no id' },
    { id: 'unknown-provider', plant: pinOf({ apps: { gemini: pinOf().apps.claude } }), fails: ['stop/pin'], why: 'an app for a provider the pact does not know' },
    { id: 'app-extra-field', plant: pinOf({ apps: { claude: { ...pinOf().apps.claude, installation: 5 } } }), fails: ['stop/pin'], why: 'an app entry with a field the pin does not have' },
    { id: 'bot-login-not-slug-bot', plant: pinOf({ apps: { claude: { ...pinOf().apps.claude, bot_login: 'other[bot]' } } }), fails: ['stop/pin'], why: 'a bot login that is not the slug\'s bot' },
    { id: 'string-ids', plant: pinOf({ owner: { login: OWNER, id: '1000001' } }), fails: ['stop/pin'], why: 'an owner id written as a string' },
    { id: 'bad-slug', plant: pinOf({ apps: { claude: { ...pinOf().apps.claude, slug: 'a/b', bot_login: 'a/b[bot]' } } }), fails: ['stop/pin'], why: 'a slug that is not a GitHub slug' },
    { id: 'string-app-id', plant: pinOf({ apps: { claude: { ...pinOf().apps.claude, app_id: '2000001' } } }), fails: ['stop/pin'], why: 'an app id written as a string' },
    { id: 'bad-owner-login', plant: pinOf({ owner: { login: 'bad login', id: OWNER_ID } }), fails: ['stop/pin'], why: 'an owner login that is not a GitHub login' },
    { id: 'owner-extra-field', plant: pinOf({ owner: { login: OWNER, id: OWNER_ID, email: 'x' } }), fails: ['stop/pin'], why: 'an owner entry with a field the pin does not have' },
    { id: 'apps-an-array', plant: pinOf({ apps: [] }), fails: ['stop/pin'], why: 'apps written as an array' },
  ];
  const base = () => run(prRecords(bot()));
  test('agent app checker stops on a pin file: base passes', () => assertPasses(base()));
  for (const row of rows) {
    test(`agent app checker stops on a pin file: ${row.id}`, () => {
      const seen = [];
      const r = check(['pr', '7'], path => (seen.push(path), { ok: false, stdout: 'CANARY' }), pinInput(row.plant));
      assertFails(r, row.fails);
      assert.deepEqual(seen, [], `${row.why}: the file is read before any call`);
      assert.equal(r.out, 'FAIL stop/pin\nRESULT: fail\n');
    });
  }
  test('agent app checker stops on a pin file: base passes after the rows', () => assertPasses(base()));
}

// #599 C7: an issue read checks the pin too, but an app's issue text is data whoever it is.
test('agent app checker: an issue read stops on a /user that differs from the pin, and an app-written comment stays data', () => {
  const issue = { number: 7, html_url: 'https://example.invalid/i/7', user: owner(), author_association: 'OWNER', created_at: T, body: 'An issue.', comments: 1, labels: [] };
  const w = {
    user: JSON.stringify({ login: OWNER, id: OWNER_ID }),
    [`apps/${APP_SLUG}`]: JSON.stringify(app()),
    [`users/${BOT}`]: JSON.stringify(bot()),
    [`${R}/issues/7`]: JSON.stringify(issue),
    ...page(`${R}/issues/7/comments`, [comment(101, { user: bot(), author_association: 'NONE' })]),
    ...page(`${R}/issues/7/events`, []),
  };
  const ok = check(['issue', '7'], fakeRun(w), pinInput());
  assertPasses(ok);
  assert.match(ok.out, /^SUMMARY: issue 7 as the-owner; true: none$/m, ok.out);
  assert.match(ok.out, /"why": \[\s*"bot"\s*\]/, 'the app\'s comment is flagged bot');
  const wrong = check(['issue', '7'], fakeRun({ ...w, user: JSON.stringify({ login: 'the-owner-2', id: OWNER_ID }) }), pinInput());
  assertFails(wrong, ['stop/owner']);
});

// ------------------------------------------------------------ the runner and the pin input

// #599 C7: the checker's copy of the pin's constants is the helper's.
test('agent app checker: its app permissions and providers equal the helper\'s', () => {
  assert.deepEqual(APP_PERMISSIONS, CLAIM_PERMISSIONS);
  assert.deepEqual([...APP_PROVIDERS], [...PROVIDERS]);
});

// #599 C7 (S4): with an app pinned, the reads run on the owner's own gh login, so every token variable is dropped.
test('agent app checker: a pinned run drops the token variables, and an unpinned run keeps them', t => {
  const env = { GH_TOKEN: 't', gh_host: 'h', GITHUB_TOKEN: 't', GH_ENTERPRISE_TOKEN: 't', GITHUB_ENTERPRISE_TOKEN: 't', GH_DEBUG: '1', DEBUG: '1', KEEP: 'x' };
  assert.deepEqual(ghEnv(env, true), { KEEP: 'x' });
  assert.deepEqual(ghEnv(env), { GH_TOKEN: 't', gh_host: 'h', GITHUB_TOKEN: 't', GH_ENTERPRISE_TOKEN: 't', GITHUB_ENTERPRISE_TOKEN: 't', KEEP: 'x' });
  const seen = [];
  const spawn = (cmd, args, o) => (seen.push(o.env), { status: 0, stdout: '{}' });
  makeRun({ env, tmp: tempDir(t), spawn, strip: true })('user');
  makeRun({ env, tmp: tempDir(t), spawn })('user');
  assert.deepEqual(seen[0], { KEEP: 'x' });
  assert.equal(seen[1].GH_TOKEN, 't');
});

// #599 C7 (S4): the command line's own run drops the token variables when an app is pinned, and keeps them when none is.
test('agent app checker: the command line\'s run strips the token variables only with an app pinned', () => {
  const home = join('/h', 'user');
  const dir = join(home, '.pact');
  const fsOf = files => ({ existsSync: p => files.has(p), readFileSync: p => files.get(p) });
  const pinned = new Map([[join(dir, 'github.json'), JSON.stringify(pinOf())], [join(dir, 'tools', 'gh-app.mjs'), '//']]);
  const unpinned = new Map([[join(dir, 'github.json'), JSON.stringify(pinOf())]]);
  const envs = [];
  const spawn = (cmd, args, o) => (envs.push(o.env), { status: 0, stdout: '{}' });
  const env = { GH_TOKEN: 'CANARY-token', GITHUB_TOKEN: 'CANARY-token', KEEP: 'x' };
  const tmp = tmpdir();
  checkAtHome({ argv: ['pr', '7'], env, home, fs: fsOf(pinned), tmp, spawn });
  checkAtHome({ argv: ['pr', '7'], env, home, fs: fsOf(unpinned), tmp, spawn });
  assert.deepEqual(envs, [{ KEEP: 'x' }, { GH_TOKEN: 'CANARY-token', GITHUB_TOKEN: 'CANARY-token', KEEP: 'x' }]);
});

// #599 C7: the pin input is two reads, behind a seam.
test('agent app checker: the pin input is the file\'s text and whether the helper is installed', () => {
  const home = join('/h', 'user');
  const files = new Map([[join(home, '.pact', 'github.json'), '{"x":1}'], [join(home, '.pact', 'tools', 'gh-app.mjs'), '//']]);
  const fs = {
    existsSync: p => files.has(p),
    readFileSync: p => {
      if (!files.has(p)) throw Object.assign(new Error('CANARY'), { code: 'ENOENT' });
      return files.get(p);
    },
  };
  assert.deepEqual(pinInputFrom({ home, fs }), { text: '{"x":1}', helper: true });
  files.delete(join(home, '.pact', 'tools', 'gh-app.mjs'));
  assert.deepEqual(pinInputFrom({ home, fs }), { text: '{"x":1}', helper: false });
  files.delete(join(home, '.pact', 'github.json'));
  assert.deepEqual(pinInputFrom({ home, fs }), { text: null, helper: false });
  const broken = { existsSync: () => true, readFileSync: () => { throw Object.assign(new Error('CANARY'), { code: 'EACCES' }); } };
  assert.deepEqual(pinInputFrom({ home, fs: broken }), { text: '', helper: true }, 'a file that cannot be read is not an absent one');
});

// ------------------------------------------------------------ the command line, as a child

/** The command line in a child whose home holds `files`, with no gh on its PATH and no token. */
function cli(t, files, args = ['pr', '7']) {
  const home = tempDir(t, 'pact-home-');
  for (const [rel, text] of Object.entries(files)) {
    const p = join(home, ...rel.split('/'));
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, text);
  }
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!['NODE_OPTIONS', 'GH_TOKEN', 'GITHUB_TOKEN', 'PATH', 'HOME', 'USERPROFILE'].includes(k.toUpperCase())) env[k] = v;
  env.PATH = tempDir(t, 'pact-no-gh-');
  env.HOME = home;
  env.USERPROFILE = home;
  const r = spawnSync(process.execPath, [join(GATE, 'tracker-authors.mjs'), ...args], { encoding: 'utf8', env });
  return { code: r.status, stdout: r.stdout, out: `${r.stdout}${r.stderr}` };
}

// #599 C7
test('agent app checker, as a command: the home\'s pin file and installed helper are what it reads', t => {
  const helper = { '.pact/tools/gh-app.mjs': '//' };
  // A malformed pin with the helper installed stops before any call, so the missing gh is never reached.
  assert.match(cli(t, { ...helper, '.pact/github.json': '{ not json' }).stdout, /^FAIL stop\/pin$/m);
  // The same file with no helper is not a pin: the first call runs, and the missing gh stops it as today.
  assert.match(cli(t, { '.pact/github.json': '{ not json' }).stdout, /^FAIL stop\/gh$/m);
  // No file at all: as today.
  assert.match(cli(t, helper).stdout, /^FAIL stop\/gh$/m);
  // A good pin and the helper reach the first call.
  assert.match(cli(t, { ...helper, '.pact/github.json': JSON.stringify(pinOf()) }).stdout, /^FAIL stop\/gh$/m);
});
