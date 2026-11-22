// The poster in app mode (#599, T3, #604): with the `claude` app pinned and the
// helper beside the poster, a post goes out as the app's bot, on a minted
// token, and the checks compare against the bot and the pinned owner (S8, C6).
// Every case runs in-process against the real helper behind its fake GitHub,
// Credential Manager and gh (the helper's fake world) and a fake gh for the
// poster's own calls, so no case needs Windows, a real key or the network. A
// few cases run the real file as a child, with a temp home. Keys and tokens are
// built at run time.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as helper from '../../claude/tools/gh-app.mjs';
import { SCHEMA, hasHeard, pinFile, post, postAsApp } from '../../claude/tools/poster.mjs';
import { childEnv } from './gate-run.mjs';
import { BOT, IDS, OWNER, SLUG, world as helperWorld, writePin } from './gh-app-world.mjs';
import { REPO } from './text.mjs';
import { tempDir, writeTree } from './tree.mjs';

const POSTER = join(REPO, 'claude', 'tools', 'poster.mjs');
const TARGET = `${OWNER}/sandbox`;
const API = `https://api.github.com/repos/${TARGET}`;
const LABEL = 'pact-604';
const REASON = 'fixed a link';
const WORDS = 'The owner said this plainly.';
const SAID = "Said in this session's chat, 2026-11-11.";
const MARK = 'Owner decision, from chat.';
const HEARD = `Heard in chat by ${LABEL}.`;
const DRY_APP = 'dry-run: the pin check and the token mint did not run';

// ---------------------------------------------------------------- a fake GitHub for the poster's own gh

/**
 * What the poster's gh calls see. `runner(env)` is a gh for an environment: one
 * with a GH_TOKEN is the app's, any other the owner's own, and every call is
 * recorded with which it was. `items` is what the repo holds, by API path.
 */
function github({ ownerId = IDS.owner, items = {}, failWrite = null } = {}) {
  const calls = [];
  const store = structuredClone(items);
  const runner = env => (args, input) => {
    const at = args.indexOf('--method');
    const method = args[at + 1];
    const path = args[at + 2];
    const as = env.GH_TOKEN ? 'app' : 'owner';
    calls.push({ as, env, method, path, input });
    const user = { login: as === 'app' ? BOT : OWNER };
    const ok = v => ({ ok: true, stdout: JSON.stringify(v), stderr: '' });
    if (method !== 'GET' && failWrite) return { ok: false, stdout: '', stderr: failWrite };
    if (method === 'GET' && path === 'user') return ok(user);
    if (method === 'GET' && path === `repos/${TARGET}`) return ok({ owner: { login: OWNER, id: ownerId } });
    if (method === 'POST') {
      const req = JSON.parse(input);
      if (path === `repos/${TARGET}/issues`) {
        store[`${path}/42`] = { number: 42, title: req.title, body: req.body, labels: [], user };
        return ok(store[`${path}/42`]);
      }
      const m = path.match(/^repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments$/);
      if (m) {
        store[`repos/${TARGET}/issues/comments/9001`] = { id: 9001, body: req.body, issue_url: `${API}/issues/${m[1]}`, user };
        return ok(store[`repos/${TARGET}/issues/comments/9001`]);
      }
    }
    if (method === 'PATCH' && store[path]) {
      store[path] = { ...store[path], body: JSON.parse(input).body };
      return ok(store[path]);
    }
    if (method === 'GET' && store[path]) return ok(store[path]);
    return { ok: false, stdout: '', stderr: 'HTTP 404: Not Found' };
  };
  const writes = () => calls.filter(c => c.method !== 'GET');
  return { calls, store, runner, writes };
}

/** One app-mode setup: the helper's world, the fake GitHub, and the `io` the poster takes. `load` and `has` can be replaced. */
function setup(t, { hw = helperWorld(t), gh = github(), load, has = () => true, app = true, env = {} } = {}) {
  const io = { gh: gh.runner(env), env, home: '/srv/home/tester', tmp: '/tmp', user: 'tester', host: 'buildhost' };
  if (app) io.app = { has, load: load ?? (async () => helper), helperIo: () => hw.io, makeGh: env => gh.runner(env) };
  return { hw, gh, io };
}

/** Run a post document through `postAsApp`, with its body file beside it. */
async function run(t, s, surface, doc, { body = 'A plain body.\n', dry = false, as = BOT } = {}) {
  const dir = tempDir(t, 'pact-poster-app-');
  writeTree(dir, { 'body.md': body });
  const file = join(dir, 'post.json');
  const full = { repo: TARGET, signer: LABEL, body_file: 'body.md', ...(as === null ? {} : { as }), ...doc };
  writeFileSync(file, JSON.stringify(full));
  return postAsApp([surface, '--post', file, ...(dry ? ['--dry-run'] : [])], s.io);
}

const note = { kind: 'note', issue: 5 };
const text = r => r.lines.join(' | ');
const last = r => r.lines.at(-1);
const refusedBy = (r, rule, where) => r.code === 2 && r.lines.some(l => l === `REFUSED ${rule} ${where}`);
const minted = s => [...s.hw.knownTokens];
const mintPosts = s => s.hw.spy.fetches.filter(f => f.method === 'POST');
/** What a run may never do in app mode: send as the owner. */
const noOwnerWrite = s => assert.deepEqual(s.gh.writes().filter(c => c.as !== 'app'), [], 'no write goes out as the owner');
const sent = s => JSON.parse(s.gh.writes()[0].input);
/** What every run must show: it read, and each read was the owner's own gh with no token variable. */
const ownerReads = s => {
  const reads = s.gh.calls.filter(c => c.method === 'GET');
  assert.ok(reads.length > 0 && reads.every(c => c.as === 'owner' && !Object.keys(c.env).some(k => /^(?:GH|GITHUB)_TOKEN$/i.test(k))), 'every read is the owner\'s, with no token variable');
};

// ---------------------------------------------------------------- C6: app mode posts only as the app

// #604 C6: the post is the bot's, on a post-set token, and every read stays the owner's
test('C6: in app mode a post goes out as the bot on a token narrowed to one repo and the post set, and every read is the owner\'s', async t => {
  // The session's own token variables, in every case: the reads carry none, the write carries only the minted token.
  const s = setup(t, { env: { GH_TOKEN: 'owner-token-x', GITHUB_TOKEN: 'owner-token-y', github_token: 'owner-token-z', PATH: '/bin' } });
  const r = await run(t, s, 'issue-comment', note);
  assert.equal(r.code, 0, text(r));
  assert.equal(last(r), `RESULT: verified issue-comment https://github.com/${TARGET}/issues/5#issuecomment-9001 as ${BOT}`);
  const [mint] = mintPosts(s).filter(f => f.url.includes('/access_tokens'));
  assert.deepEqual(mint.body, { repositories: ['sandbox'], permissions: { issues: 'write', pull_requests: 'write' } });
  const writes = s.gh.writes();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].as, 'app');
  assert.ok(minted(s).includes(writes[0].env.GH_TOKEN), 'the write carries the minted token');
  ownerReads(s);
  assert.deepEqual(Object.keys(writes[0].env).filter(k => /token/i.test(k)), ['GH_TOKEN'], 'the write carries no other token variable');
  assert.equal(writes[0].env.PATH, '/bin');
  assert.ok(!text(r).includes(writes[0].env.GH_TOKEN), 'the token is in no output line');
});

// #604 C6: a missing `as`, the owner's own login and another bot are refused as/not-app, with nothing minted or sent
test('C6: a post with no as, as the owner or as another bot is refused as/not-app, and nothing is minted or sent', async t => {
  for (const as of [null, OWNER, 'another-app[bot]', BOT.replace('example', 'Example')]) {
    const s = setup(t);
    const r = await run(t, s, 'issue-comment', note, { as });
    assert.ok(refusedBy(r, 'as/not-app', 'as'), `${as}: ${text(r)}`);
    assert.equal(s.gh.calls.length, 0);
    assert.equal(s.hw.spy.fetches.length, 0);
  }
});

// #604 C6: a dry run reads nothing and mints nothing, and says the checks did not run
test('C6: a dry run in app mode still checks as, reads and mints nothing, and says the pin check did not run', async t => {
  const s = setup(t);
  const r = await run(t, s, 'issue-comment', note, { dry: true });
  assert.equal(r.code, 0, text(r));
  assert.ok(r.lines.includes(DRY_APP), text(r));
  assert.equal(last(r), 'RESULT: dry-run issue-comment');
  assert.equal(s.gh.calls.length + s.hw.spy.fetches.length + s.hw.spy.spawns.length, 0);
  const bad = await run(t, setup(t), 'issue-comment', note, { dry: true, as: null });
  assert.ok(refusedBy(bad, 'as/not-app', 'as'), text(bad));
});

// #604 C6, S4: a pin that fails, or a check that cannot run, stops with a fixed line, and nothing posts as the owner
test('C6: a pin that fails S4\'s check, or a check that cannot run, ends refused pin/check with the helper\'s id, and no write or mint is made', async t => {
  const rows = [
    ['the app gained a permission', w => { w.state.app.permissions = { ...w.state.app.permissions, administration: 'write' }; }, 'pin/check'],
    ['the app subscribed to an event', w => { w.state.app.events = ['push']; }, 'pin/check'],
    ['the app id differs', w => { w.state.app.id = 5; }, 'pin/check'],
    ['the app is owned by another account', w => { w.state.app.owner = { id: 5 }; }, 'pin/check'],
    ['the bot id differs', w => { w.state.bot.id = 5; }, 'pin/check'],
    ['the bot is a user', w => { w.state.bot.type = 'User'; }, 'pin/check'],
    ['the owner\'s login is another account', w => { w.state.me = { login: 'someone', id: 5 }; }, 'pin/check'],
    ['the owner\'s own gh login read fails', w => { w.state.ghReadFails.add('user'); }, 'pin/unavailable'],
    ['the app record read fails', w => { w.state.ghReadFails.add(`apps/${SLUG}`); }, 'pin/unavailable'],
  ];
  for (const [what, change, id] of rows) {
    const s = setup(t);
    change(s.hw);
    const r = await run(t, s, 'issue-comment', note);
    assert.equal(r.code, 2, `${what}: ${text(r)}`);
    assert.deepEqual(r.lines, ['REFUSED pin/check pin', `NOTE: gh-app said ${id}; nothing was sent, and nothing was posted as the owner`, 'RESULT: refused 1'], what);
    assert.equal(s.gh.writes().length, 0, what);
    assert.equal(mintPosts(s).length, 0, `${what}: nothing minted`);
  }
});

// #604 C6: a pin file that is not the pinned shape is not owner mode
test('C6: a github.json that is not the pinned shape stops the poster, and does not read as owner mode', async t => {
  for (const body of ['not json', '{}', '{"owner":{"login":"x","id":1},"apps":{"claude":{"app_id":1}}}']) {
    const s = setup(t);
    writeFileSync(join(s.hw.home, '.claude', 'pact', 'github.json'), body);
    const r = await run(t, s, 'issue-comment', note);
    assert.deepEqual(r.lines, ['REFUSED pin/check pin', 'NOTE: gh-app said pin/missing; nothing was sent, and nothing was posted as the owner', 'RESULT: refused 1'], body);
    assert.equal(s.gh.calls.length, 0);
    assert.ok(!text(r).includes('not json'));
  }
});

// #604 C6, r2 D-N5: a helper that fails prints a fixed line, never its message, and a malformed mint answer likewise
test('C6: a helper that cannot load, or throws, and a malformed or refused mint answer print only fixed lines, send nothing and never post as the owner', async t => {
  const CANARY = 'canary-message-8f3a';
  const loads = setup(t, { load: async () => { throw new Error(CANARY); } });
  const l = await run(t, loads, 'issue-comment', note);
  assert.deepEqual(l.lines, ['REFUSED pin/check pin', 'NOTE: gh-app said unknown; nothing was sent, and nothing was posted as the owner', 'RESULT: refused 1']);
  assert.equal(loads.gh.writes().length, 0);
  const throws = setup(t, { load: async () => ({ ...helper, checkPin: () => { throw new Error(CANARY); } }) });
  const th = await run(t, throws, 'issue-comment', note);
  assert.ok(!text(th).includes(CANARY) && th.code === 2, text(th));
  // A mint that answers with no token is the poster's own guard: nothing is sent, and no owner fallback.
  for (const answer of [undefined, '']) {
    const none = setup(t, { load: async () => ({ ...helper, mintToken: async () => answer }) });
    const nr = await run(t, none, 'issue-comment', note);
    assert.deepEqual(nr.lines, ['REFUSED app/token token', 'NOTE: gh-app said unknown; nothing was sent, and nothing was posted as the owner', 'RESULT: refused 1'], String(answer));
    assert.equal(none.gh.writes().length, 0);
  }
  const rows = [
    ['a token that is not a token', w => { w.state.mintOverride = { token: `${CANARY} not a token`, expires_at: '2026-11-21T13:00:00Z' }; }, 'shape'],
    ['an answer with no expiry', w => { w.state.mintOverride = { token: 'ghs_aaaaaaaaaaaaaaaaaaaaaaaa' }; }, 'shape'],
    ['a mint GitHub refuses', w => { w.state.mintStatus = 500; }, 'net'],
    ['an installation of another account', w => { w.state.installation.account.id = 99; }, 'install/owner'],
  ];
  for (const [what, change, id] of rows) {
    const s = setup(t);
    change(s.hw);
    const r = await run(t, s, 'issue-comment', note);
    assert.deepEqual(r.lines, ['REFUSED app/token token', `NOTE: gh-app said ${id}; nothing was sent, and nothing was posted as the owner`, 'RESULT: refused 1'], what);
    assert.equal(s.gh.writes().length, 0, what);
    assert.ok(![...s.hw.spy.out, ...s.hw.spy.err].join('').includes(CANARY));
  }
});

// #604 C6: with no helper, no pin or no claude entry, the poster is as it was
test('C6: with no io.app, no pin file or helper, or a pin with no claude entry, a post is the owner\'s, as before, with no helper call', async t => {
  const own = { kind: 'note', issue: 5 };
  const cases = [
    ['no io.app, with a pin file present', { app: false }],
    ['no pin file or no helper beside the poster', { has: () => false }],
    ['a pin with no claude entry', { prepare: w => writePin(w, { codex: { app_id: 7, slug: 'x-codex', bot_login: 'x-codex[bot]', bot_id: 8 } }) }],
  ];
  for (const [what, o] of cases) {
    const s = setup(t, { app: o.app, has: o.has });
    o.prepare?.(s.hw);
    const r = await run(t, s, 'issue-comment', own, { as: null });
    assert.equal(r.code, 0, `${what}: ${text(r)}`);
    assert.equal(last(r), `RESULT: verified issue-comment https://github.com/${TARGET}/issues/5#issuecomment-9001 as ${OWNER}`, what);
    assert.ok(s.gh.calls.every(c => c.as === 'owner'), what);
    assert.equal(s.hw.spy.fetches.length + s.hw.spy.spawns.length, 0, `${what}: the helper was not called`);
  }
  // `post` itself stays synchronous: a result, never a promise.
  const direct = post(['schema'], { gh: github().runner({}), env: {} });
  assert.equal(typeof direct.then, 'undefined');
  assert.equal(direct.code, 0);
});

// #604 C6: the poster's pin path is the helper's
test('the poster looks for the pin file where the helper writes it', () => {
  for (const home of ['/srv/home/tester', 'D:\\srv\\home']) assert.equal(pinFile(home), helper.pinPath(home));
});

// ---------------------------------------------------------------- S8: which login each check compares against

// #604 C6: post/tracker accepts a comment the owner wrote and refuses one an app wrote
test('C6: post/tracker refuses an app-written comment quoted as the owner\'s, and accepts a comment the owner wrote', async t => {
  const issue = { kind: 'issue', title: 'A plain title', quote: [{ text: WORDS, source: 'tracker', comment: 4001, when: '2026-11-11' }], intent: { text: 'I read it so.', status: 'pending' } };
  const comment = login => ({ [`repos/${TARGET}/issues/comments/4001`]: { id: 4001, user: { login }, issue_url: `${API}/issues/5`, body: `Before. ${WORDS} After.` } });
  const bad = setup(t, { gh: github({ items: comment(BOT) }) });
  const by = await run(t, bad, 'issue', issue);
  assert.ok(refusedBy(by, 'post/tracker', 'quote[0].comment'), text(by));
  assert.equal(bad.gh.writes().length, 0);
  const good = setup(t, { gh: github({ items: comment(OWNER) }) });
  const ok = await run(t, good, 'issue', issue);
  assert.equal(ok.code, 0, text(ok));
  assert.equal(good.gh.writes().length, 1);
  assert.ok(good.gh.calls.find(c => c.path.endsWith('issues/comments/4001')).as === 'owner', 'the tracker comment is read as the owner');
});

// #604 S8: the repo's owner is the pinned owner, by name and by id
test('S8: a repo whose owner is not the pinned owner is refused, by name before the post and by id from GitHub\'s own record', async t => {
  const wrongId = setup(t, { gh: github({ ownerId: 5 }) });
  const a = await run(t, wrongId, 'issue-comment', note);
  assert.ok(refusedBy(a, 'owner/github', 'repo'), text(a));
  assert.equal(wrongId.gh.writes().length, 0);
  const named = setup(t);
  const dir = tempDir(t, 'pact-poster-app-');
  writeTree(dir, { 'body.md': 'A plain body.\n' });
  writeFileSync(join(dir, 'post.json'), JSON.stringify({ repo: `${OWNER.toUpperCase()}/sandbox`, signer: LABEL, body_file: 'body.md', as: BOT, ...note, kind: 'note' }));
  const d = await postAsApp(['issue-comment', '--post', join(dir, 'post.json')], named.io);
  assert.ok(refusedBy(d, 'owner/repo', 'repo'), text(d));
  assert.equal(named.gh.writes().length, 0);
});

// ---------------------------------------------------------------- S8: the app's token is a secret

// #604 S8: the minted token is added to the values the scan refuses, and to gh's error line
test('S8: a body that holds the app\'s token is refused secret/env, and a gh error line that holds it is withheld', async t => {
  const TOKEN = `ghs_${'a1'.repeat(20)}`;
  const seed = s => s.hw.store.set('the-pact/gh-app/claude/token/example-owner/sandbox/post', Buffer.from(JSON.stringify({ token: TOKEN, expires_at: '2026-11-21T13:00:00.000Z' })));
  const leaky = setup(t);
  seed(leaky);
  const r = await run(t, leaky, 'issue-comment', note, { body: `A body with ${TOKEN} in it.\n` });
  assert.ok(r.lines.some(l => l.startsWith('REFUSED secret/env body') && l.includes('(app token)')), text(r));
  assert.ok(!text(r).includes(TOKEN));
  assert.equal(leaky.gh.writes().length, 0);
  // The error line is scanned whole, before it is cut: a token at the start, one across the 300-character cut, and a real-length one over it.
  const LONG = `ghs_${'a1'.repeat(260)}`;
  for (const [what, token, said] of [
    ['at the start', TOKEN, `HTTP 401: bad ${TOKEN}`],
    ['across the cut', TOKEN, `HTTP 401: ${'x'.repeat(280)} ${TOKEN}`],
    ['longer than the cut', LONG, `HTTP 401: bad ${LONG}`],
  ]) {
    const fails = setup(t, { gh: github({ failWrite: said }) });
    fails.hw.store.set('the-pact/gh-app/claude/token/example-owner/sandbox/post', Buffer.from(JSON.stringify({ token, expires_at: '2026-11-21T13:00:00.000Z' })));
    const f = await run(t, fails, 'issue-comment', note);
    assert.equal(f.code, 3, `${what}: ${text(f)}`);
    assert.ok(f.lines[0].startsWith('gh said: (withheld: secret/env)'), `${what}: ${text(f)}`);
    assert.ok(!text(f).includes(token.slice(0, 30)), what);
  }
});

// ---------------------------------------------------------------- S8: decisions in app mode

const decision = { kind: 'decision', issue: 5, answers: 'issue 5', quote: [{ text: 'Yes, go ahead.', source: 'chat', when: '2026-11-11' }], intent: { text: 'Go ahead.', status: 'confirmed' } };

// #604 C6: a chat decision renders "Heard in chat by", never the owner's mark
test('C6: a decision from chat renders "Heard in chat by <signer>." in app mode, and never the owner\'s mark', async t => {
  const s = setup(t);
  const r = await run(t, s, 'issue-comment', decision);
  assert.equal(r.code, 0, text(r));
  const { body } = sent(s);
  assert.ok(body.startsWith(`${HEARD}\n\nAnswers: issue 5.\n\n## The ask\n\n> Yes, go ahead.`), body);
  assert.ok(!/owner decision/i.test(body));
  // A relayed decision keeps its own mark.
  const relayed = setup(t);
  const rel = await run(t, relayed, 'issue-comment', { ...decision, quote: [{ text: 'Yes.', source: 'relayed', via: 'lead-1', when: '2026-11-11' }], intent: { text: 'Go ahead.', status: 'pending' } });
  assert.equal(rel.code, 0, text(rel));
  assert.ok(sent(relayed).body.startsWith('Relayed owner words, not a decision mark.'));
});

// #604 S8: a body can't forge the line, and an item holding it is not edited
test('S8: a body file line that opens "Heard in chat by" is refused post/owned-line, and an item that holds one is refused edit/decision', async t => {
  const s = setup(t);
  const r = await run(t, s, 'issue-comment', note, { body: 'Heard in chat by someone-else.\n' });
  assert.ok(refusedBy(r, 'post/owned-line', 'body_file'), text(r));
  assert.equal(s.gh.calls.length, 0);
  assert.ok(hasHeard(`${HEARD}\n\nA body.`) && hasHeard('> * Heard  in chat by x.') && !hasHeard('We heard in chat by luck.'));
  const item = `${HEARD}\n\nAnswers: issue 5.\n\nA part.\n\nSigned: ${LABEL}\n`;
  const g = setup(t, { gh: github({ items: { [`repos/${TARGET}/issues/comments/9001`]: { id: 9001, body: item, user: { login: BOT }, issue_url: `${API}/issues/5` } } }) });
  const e = await run(t, g, 'issue-comment-edit', { issue: 5, comment: 9001, reason: REASON });
  assert.ok(refusedBy(e, 'edit/decision', 'item'), text(e));
  assert.equal(g.gh.writes().length, 0);
});

const ask = (readback = 'Read-back: not yet confirmed.') => `## The ask\n\n> ${WORDS}\n\n${SAID}\n\n## Understood intent\n\nI read it so.\n\n${readback}\n\nA session part.\n\nSigned: ${LABEL}\n`;
const decisionItem = ({ mark = HEARD, signer = LABEL, login = BOT } = {}) => ({ id: 7001, user: { login }, issue_url: `${API}/issues/5`, body: `${mark}\n\nAnswers: issue 5.\n\n## The ask\n\n> Yes.\n\n${SAID}\n\n## Understood intent\n\nI read it so.\n\nRead-back: confirmed in this session's chat.\n\nThe decision's part.\n\nSigned: ${signer}\n` });
const confirmDoc = { issue: 5, reason: REASON, quote: [{ text: WORDS, source: 'chat', when: '2026-11-11' }], intent: { text: 'I read it so.', status: 'confirmed', comment: 7001 } };
const editWorld = (t, dec) => setup(t, { gh: github({ items: { [`repos/${TARGET}/issues/5`]: { number: 5, body: ask(), user: { login: BOT } }, [`repos/${TARGET}/issues/comments/7001`]: dec } }) });

// #604 S8: edit/confirm accepts the bot's own heard decision, and the owner's marked one, and no other pairing
test('S8: edit/confirm accepts the bot\'s "Heard in chat by" decision and the owner\'s marked one, and refuses a mark under the wrong author or naming another signer', async t => {
  const heard = editWorld(t, decisionItem());
  const r = await run(t, heard, 'issue-edit', confirmDoc);
  assert.equal(r.code, 0, text(r));
  assert.equal(sent(heard).body, `## The ask\n\n> ${WORDS}\n\n${SAID}\n\n## Understood intent\n\nI read it so.\n\nRead-back: confirmed in comment 7001.\n\nA plain body.\n\nSigned: ${LABEL}\n\nEdited: ${REASON}, confirmed, as heard in chat by ${LABEL} (${LABEL})`);
  assert.equal(heard.gh.writes()[0].as, 'app');
  ownerReads(heard);
  const owners = editWorld(t, decisionItem({ mark: MARK, login: OWNER }));
  const o = await run(t, owners, 'issue-edit', confirmDoc);
  assert.equal(o.code, 0, text(o));
  ownerReads(owners);
  assert.ok(sent(owners).body.endsWith(`Edited: ${REASON}, heard by ${LABEL} (${LABEL})`));
  for (const [what, dec] of [
    ['the owner\'s mark under the bot', decisionItem({ mark: MARK })],
    ['the heard mark under the owner', decisionItem({ login: OWNER })],
    ['a heard mark naming another signer', decisionItem({ mark: 'Heard in chat by other-session.' })],
    ['another account', decisionItem({ login: 'someone-else' })],
  ]) {
    const w = editWorld(t, dec);
    const x = await run(t, w, 'issue-edit', confirmDoc);
    assert.ok(refusedBy(x, 'edit/confirm', 'intent.comment'), `${what}: ${text(x)}`);
    assert.equal(w.gh.writes().length, 0, what);
  }
});

// #604 S8: an edit is of an item the bot wrote
test('S8: an edit refuses an item the owner\'s own account wrote, and carries one the bot wrote, as the bot', async t => {
  const item = login => ({ [`repos/${TARGET}/issues/5`]: { number: 5, body: `A plain body.\n\nSigned: ${LABEL}\n`, user: { login } } });
  const owned = setup(t, { gh: github({ items: item(OWNER) }) });
  const r = await run(t, owned, 'issue-edit', { issue: 5, reason: REASON });
  assert.ok(refusedBy(r, 'edit/author', 'item'), text(r));
  assert.equal(owned.gh.writes().length, 0);
  const own = setup(t, { gh: github({ items: item(BOT) }) });
  const ok = await run(t, own, 'issue-edit', { issue: 5, reason: REASON });
  assert.equal(ok.code, 0, text(ok));
  assert.equal(last(ok), `RESULT: verified issue-edit https://github.com/${TARGET}/issues/5 as ${BOT}`);
  assert.equal(own.gh.writes()[0].as, 'app');
  noOwnerWrite(own);
  ownerReads(own);
});

// ---------------------------------------------------------------- the schema

test('the schema\'s as field takes a login or a bot login, and nothing past [bot]', () => {
  const re = new RegExp(SCHEMA.properties.as.pattern);
  for (const ok of ['tester', 'a-b', 'example-owner-claude[bot]']) assert.ok(re.test(ok), ok);
  for (const bad of ['', '[bot]', 'a[bot]x', 'a[bot][bot]', 'a b[bot]', 'a[Bot]', `${'a'.repeat(40)}[bot]`]) assert.ok(!re.test(bad), bad);
});

// ---------------------------------------------------------------- the file run as a child, with a temp home

/** The pin file a child's home holds: a made-up owner and `claude` app, or the given apps. */
const PIN = apps => JSON.stringify({ owner: { login: OWNER, id: IDS.owner }, apps: apps ?? { claude: { app_id: IDS.app, slug: SLUG, bot_login: BOT, bot_id: IDS.bot } } });

/** Run the real poster file as a child on a dry run, with `home` as the home folder and nothing on PATH. */
function child(t, { pin, copyOnly = false, as = null, installed = true } = {}) {
  const dir = tempDir(t, 'pact-poster-app-child-');
  const home = join(dir, 'home');
  const empty = join(dir, 'empty');
  const doc = { repo: TARGET, kind: 'note', issue: 5, signer: LABEL, body_file: 'body.md', ...(as ? { as } : {}) };
  writeTree(dir, { 'body.md': 'A plain body.\n', 'post.json': JSON.stringify(doc), 'empty/.keep': '', 'home/.keep': '' });
  if (pin !== undefined) writeTree(home, { '.claude/pact/github.json': pin });
  // The install puts the helper under the home folder; a home without it is one whose agent-identity switch is off.
  if (pin !== undefined && installed) writeTree(home, { '.claude/pact/tools/.keep': '' }), copyFileSync(join(REPO, 'claude', 'tools', 'gh-app.mjs'), join(home, '.claude', 'pact', 'tools', 'gh-app.mjs'));
  let script = POSTER;
  if (copyOnly) {
    writeTree(dir, { 'alone/.keep': '' });
    script = join(dir, 'alone', 'poster.mjs');
    copyFileSync(POSTER, script);
  }
  const env = childEnv();
  for (const k of Object.keys(env)) if (/^(?:PATH|HOME|USERPROFILE|GH_TOKEN|GITHUB_TOKEN)$/i.test(k)) delete env[k];
  Object.assign(env, { PATH: empty, HOME: home, USERPROFILE: home });
  return spawnSync(process.execPath, [script, 'issue-comment', '--post', join(dir, 'post.json'), '--dry-run'], { cwd: empty, env, encoding: 'utf8' });
}

// #604 C6: the real entry script reads the pin from its home, loads the real helper beside it, and decides the mode
test('the poster file run as a child decides its mode from the pin file under its home and the helper beside it', t => {
  const none = child(t);
  assert.equal(none.status, 0, none.stdout + none.stderr);
  assert.ok(!none.stdout.includes(DRY_APP));
  const pinned = child(t, { pin: PIN() });
  assert.equal(pinned.status, 2, pinned.stdout + pinned.stderr);
  assert.ok(pinned.stdout.split('\n').includes('REFUSED as/not-app as'), pinned.stdout);
  const asBot = child(t, { pin: PIN(), as: BOT });
  assert.equal(asBot.status, 0, asBot.stdout + asBot.stderr);
  assert.ok(asBot.stdout.split('\n').includes(DRY_APP), asBot.stdout);
  const other = child(t, { pin: PIN({ codex: { app_id: 7, slug: 'x-codex', bot_login: 'x-codex[bot]', bot_id: 8 } }) });
  assert.equal(other.status, 0, other.stdout + other.stderr);
  assert.ok(!other.stdout.includes(DRY_APP));
  const bad = child(t, { pin: 'not json' });
  assert.equal(bad.status, 2, bad.stdout + bad.stderr);
  assert.ok(bad.stdout.split('\n').includes('REFUSED pin/check pin'), bad.stdout);
  assert.ok(!bad.stdout.includes('not json'));
  // With no helper beside the poster, a pin file alone changes nothing (S4: pinned means the pin and the helper).
  const alone = child(t, { pin: PIN(), copyOnly: true });
  assert.equal(alone.status, 0, alone.stdout + alone.stderr);
  assert.ok(!alone.stdout.includes(DRY_APP));
  // With the switch off the install removes the helper from the home folder, and a checkout's poster, which always has one beside it, stays the owner's.
  const off = child(t, { pin: PIN(), as: BOT, installed: false });
  assert.equal(off.status, 0, off.stdout + off.stderr);
  assert.ok(!off.stdout.includes(DRY_APP), off.stdout);
});
