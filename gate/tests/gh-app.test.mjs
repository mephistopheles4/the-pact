// The GitHub App helper (#599, T1): C1 setup and forget, C2 mintToken, C3 no
// secret in any output. Every case runs in-process against a fake GitHub, a
// fake Credential Manager and fake gh and git (gh-app-world.mjs), so no case
// needs Windows, the network or a real key, and the suite runs on both CI
// jobs. Keys and tokens are built at run time; no key is committed.
import assert from 'node:assert/strict';
import { generateKeyPairSync, createPrivateKey, createPublicKey, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PS_ENCODED, PS_SCRIPT, REASONS, Refusal, SETS, gitconfigText, main, makeCredStore, mintToken, parseArgs, parseRepo, pemToDer } from '../../claude/tools/gh-app.mjs';
import { BOT, IDS, NODE, OWNER, SLUG, derOf, keys, leakSurface, printed, world, writePem, writePin } from './gh-app-world.mjs';

const REPO = `${OWNER}/sandbox`;
const mint = (w, set = 'git', repo = REPO, provider = 'claude') => mintToken({ provider, repo, set }, w.io);
const refusesWith = (p, id) => assert.rejects(p, e => e instanceof Refusal && e.id === id, `refuses with ${id}`);
const readPinFile = w => JSON.parse(readFileSync(join(w.home, '.claude', 'pact', 'github.json'), 'utf8'));
const gitconfigFile = w => join(w.home, '.claude', 'pact', 'gh-app-claude.gitconfig');

// ---------------------------------------------------------------- C2: mintToken

// C2: the request is narrowed to one repo and the set's permissions, and the JWT is the spec's.
test('mintToken asks for one repo and the set\'s permissions, signed as the app with the stored key', async t => {
  for (const set of ['git', 'post', 'gh']) {
    const w = world(t);
    const token = await mint(w, set);
    assert.match(token, /^ghs_[0-9a-f]{48}$/);
    const post = w.spy.fetches.find(f => f.method === 'POST');
    assert.equal(new URL(post.url).pathname, `/app/installations/${IDS.inst}/access_tokens`);
    assert.deepEqual(post.body, { repositories: ['sandbox'], permissions: SETS[set] });
    const { iat, exp, iss } = post.jwt;
    assert.equal(iss, IDS.app);
    assert.equal(iat, Math.floor(w.state.now / 1000) - 60);
    assert.equal(exp, Math.floor(w.state.now / 1000) + 540);
    assert.ok(w.spy.fetches.every(f => f.host === 'api.github.com'), 'the only host is api.github.com');
  }
  assert.deepEqual({ ...SETS.git }, { contents: 'write', workflows: 'write' });
  assert.deepEqual({ ...SETS.post }, { issues: 'write', pull_requests: 'write' });
});

// C2: each refusal, as its own case, with nothing minted.
{
  const rows = [
    { id: 'repo-outside-owner', reason: 'repo/owner', run: w => mint(w, 'git', 'someone-else/sandbox') },
    { id: 'repo-not-owner-name', reason: 'repo/shape', run: w => mint(w, 'git', 'sandbox') },
    { id: 'repo-extra-segment', reason: 'repo/shape', run: w => mint(w, 'git', `${OWNER}/a/b`) },
    { id: 'repo-object-with-a-path-in-its-name', reason: 'repo/shape', run: w => mint(w, 'git', { owner: OWNER, name: '../orgs' }) },
    { id: 'repo-is-neither-text-nor-an-object', reason: 'repo/shape', run: w => mint(w, 'git', null) },
    { id: 'foreign-installation', reason: 'install/owner', setup: w => { w.state.installation.account.id = 99; }, run: w => mint(w) },
    { id: 'installation-of-another-app', reason: 'install/owner', setup: w => { w.state.installation.app_id = 77; }, run: w => mint(w) },
    { id: 'unpinned-provider', reason: 'pin/unpinned', run: w => mint(w, 'git', REPO, 'codex') },
    { id: 'unknown-provider', reason: 'provider', run: w => mint(w, 'git', REPO, 'gemini') },
    { id: 'unknown-set', reason: 'usage', run: w => mint(w, 'admin') },
    { id: 'no-key', reason: 'key/missing', world: { key: false }, run: w => mint(w) },
    { id: 'no-pin-file', reason: 'pin/missing', world: { pin: false }, run: w => mint(w) },
    { id: 'tls-off', reason: 'tls', world: { env: { NODE_TLS_REJECT_UNAUTHORIZED: '0' } }, run: w => mint(w) },
    { id: 'tls-off-lowercase-name', reason: 'tls', world: { env: { node_tls_reject_unauthorized: '0' } }, run: w => mint(w) },
    { id: 'not-windows', reason: 'platform', world: { platform: 'linux' }, run: w => mint(w) },
    // S4's check: each field of GitHub's own record.
    { id: 'pin-app-id-differs', reason: 'pin/check', setup: w => { w.state.app.id = 5; }, run: w => mint(w) },
    { id: 'pin-app-owner-differs', reason: 'pin/check', setup: w => { w.state.app.owner.id = 5; }, run: w => mint(w) },
    { id: 'pin-app-gained-a-permission', reason: 'pin/check', setup: w => { w.state.app.permissions.administration = 'write'; }, run: w => mint(w) },
    { id: 'pin-app-lost-a-permission', reason: 'pin/check', setup: w => { delete w.state.app.permissions.checks; }, run: w => mint(w) },
    { id: 'pin-app-permission-raised', reason: 'pin/check', setup: w => { w.state.app.permissions.checks = 'write'; }, run: w => mint(w) },
    { id: 'pin-app-subscribes-an-event', reason: 'pin/check', setup: w => { w.state.app.events = ['push']; }, run: w => mint(w) },
    { id: 'pin-bot-id-differs', reason: 'pin/check', setup: w => { w.state.bot.id = 5; }, run: w => mint(w) },
    { id: 'pin-bot-is-a-user', reason: 'pin/check', setup: w => { w.state.bot.type = 'User'; }, run: w => mint(w) },
    { id: 'pin-owner-login-differs', reason: 'pin/check', setup: w => { w.state.me.login = 'intruder'; }, run: w => mint(w) },
    { id: 'pin-owner-id-differs', reason: 'pin/check', setup: w => { w.state.me.id = 5; }, run: w => mint(w) },
    // A check that can't run stops the mint; it never falls back to the owner.
    { id: 'pin-read-cannot-run', reason: 'pin/unavailable', setup: w => { w.state.ghReadFails.add('user'); }, run: w => mint(w) },
    { id: 'pin-app-read-cannot-run', reason: 'pin/unavailable', setup: w => { w.state.ghReadFails.add(`apps/${SLUG}`); }, run: w => mint(w) },
    { id: 'github-refuses-the-mint', reason: 'net', setup: w => { w.state.mintStatus = 403; }, run: w => mint(w) },
    { id: 'mint-answer-names-more-repos', reason: 'shape', setup: w => { w.state.mintOverride = { token: `ghs_${'a'.repeat(30)}`, expires_at: new Date(w.state.now + 3.6e6).toISOString(), repositories: [{ name: 'sandbox' }, { name: 'other' }] }; }, run: w => mint(w) },
    { id: 'mint-answer-has-no-token', reason: 'shape', setup: w => { w.state.mintOverride = { expires_at: new Date(w.state.now + 3.6e6).toISOString() }; }, run: w => mint(w) },
    { id: 'mint-answer-is-not-json', reason: 'shape', setup: w => { w.state.mintOverride = 'not json at all'; }, run: w => mint(w) },
  ];
  for (const r of rows) {
    test(`mintToken refuses: ${r.id}`, async t => {
      const w = world(t, r.world);
      r.setup?.(w);
      await refusesWith(r.run(w), r.reason);
      assert.equal(w.store.has(`the-pact/gh-app/claude/token/${OWNER}/sandbox/git`), false, 'nothing cached');
    });
  }
}

// C2: the control for the table above: the same world, unchanged, mints; and the owner name matches without regard to case.
test('mintToken: the same world with nothing planted mints, owner matched case-insensitively', async t => {
  const w = world(t);
  assert.match(await mint(w, 'git', `${OWNER.toUpperCase()}/Sandbox`), /^ghs_/);
});

// C2 (r3 U-F12): the pin is checked on a miss only, so a cached token costs no API call.
test('mintToken reuses a cached token until five minutes before it expires, with no call at all', async t => {
  const w = world(t);
  const first = await mint(w);
  const reads = w.spy.spawns.length;
  const calls = w.spy.fetches.length;
  assert.equal(await mint(w), first);
  assert.equal(w.spy.spawns.length, reads, 'no gh read on a hit');
  assert.equal(w.spy.fetches.length, calls, 'no request on a hit');
  w.state.now += 3600e3 - 5 * 60e3 - 1000;
  assert.equal(await mint(w), first, 'still good just before the margin');
  w.state.now += 2000;
  const second = await mint(w);
  assert.notEqual(second, first, 'five minutes before expiry it mints again');
  assert.ok(w.spy.spawns.length > reads, 'a miss checks the pin');
});

test('mintToken keeps one cache entry per repo and set', async t => {
  const w = world(t);
  const a = await mint(w, 'git', REPO);
  const b = await mint(w, 'post', REPO);
  const c = await mint(w, 'git', `${OWNER}/other`);
  assert.equal(new Set([a, b, c]).size, 3);
  assert.deepEqual([...w.store.keys()].filter(k => k.includes('/token/')).sort(), ['git', 'post'].map(s => `the-pact/gh-app/claude/token/${OWNER}/sandbox/${s}`).concat(`the-pact/gh-app/claude/token/${OWNER}/other/git`).sort());
});

// C3: a cache entry that isn't the stored shape is a miss, never output.
test('mintToken treats a malformed cache entry as a miss and prints nothing of it', async t => {
  for (const bad of ['not json', '{"token":"x","expires_at":"2099-01-01T00:00:00Z"}', '{"token":"ghs_aaaaaaaaaaaaaaaaaaaaaaaaaaaa","expires_at":"soon"}', '{"token":"ghs_aaaaaaaaaaaaaaaaaaaaaaaaaaaa","expires_at":"2099-01-01T00:00:00Z","extra":1}', '[]']) {
    const w = world(t);
    w.store.set(`the-pact/gh-app/claude/token/${OWNER}/sandbox/git`, Buffer.from(bad));
    const token = await mint(w);
    assert.match(token, /^ghs_[0-9a-f]{48}$/, `minted fresh over ${bad.slice(0, 12)}`);
    assert.ok(!leakSurface(w).includes('ghs_aaaaaaaa'), 'the bad entry is never printed');
  }
});

// ---------------------------------------------------------------- the pin file (S4)

test('the pin file is read strictly: exactly these fields', async t => {
  const entry = { app_id: IDS.app, slug: SLUG, bot_login: BOT, bot_id: IDS.bot };
  const owner = { login: OWNER, id: IDS.owner };
  const bad = [
    { owner, apps: { claude: entry }, extra: 1 },
    { owner: { ...owner, extra: 1 }, apps: { claude: entry } },
    { owner, apps: { claude: { ...entry, extra: 1 } } },
    { owner, apps: { claude: { ...entry, bot_login: 'other[bot]' } } },
    { owner, apps: { claude: { ...entry, bot_login: SLUG } } },
    { owner, apps: { claude: { ...entry, app_id: '2000001' } } },
    { owner, apps: { gemini: entry } },
    { owner: { login: 'bad login', id: 1 }, apps: { claude: entry } },
    { owner, apps: [] },
  ];
  for (const [i, body] of bad.entries()) {
    const w = world(t, { pin: false });
    writeFileSync(join(w.home, '.claude', 'pact', 'github.json'), JSON.stringify(body));
    await refusesWith(mint(w), 'pin/missing');
    assert.equal(w.spy.fetches.length, 0, `case ${i}: refused before any call`);
  }
  const w = world(t, { pin: false });
  writeFileSync(join(w.home, '.claude', 'pact', 'github.json'), '{not json');
  await refusesWith(mint(w), 'pin/missing');
});

test('the pin reads go through gh api with the owner\'s own login: no token, stripped environment, fresh empty folder', async t => {
  const canary = `owner-${'x'.repeat(24)}`;
  const w = world(t, { env: { GH_TOKEN: canary, GITHUB_TOKEN: canary, GH_HOST: 'evil.example', GH_ENTERPRISE_TOKEN: canary, GH_DEBUG: 'api', DEBUG: '1', Path: 'C:\\x' } });
  await mint(w);
  const reads = w.spy.spawns.filter(s => s.file === 'gh');
  assert.deepEqual(reads.map(s => s.args.at(-1)), [`apps/${SLUG}`, `users/${BOT}`, 'user']);
  for (const s of reads) {
    assert.deepEqual(s.args.slice(0, 4), ['api', '--hostname', 'github.com', '--method']);
    for (const k of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST', 'GH_ENTERPRISE_TOKEN', 'GH_DEBUG', 'DEBUG']) assert.equal(Object.hasOwn(s.env, k), false, `${k} stripped`);
    assert.equal(s.env.Path, 'C:\\x', 'other variables stay');
  }
  assert.ok(!leakSurface(w).includes(canary), 'the owner token canary shows in no output, argv or write');
  for (const c of w.spy.cwdChecks) {
    assert.deepEqual(c.entries, [], 'each spawn runs from an empty folder');
    assert.ok(c.underTmp, 'under the temp folder');
    assert.notEqual(c.cwd, process.cwd());
  }
});

// ---------------------------------------------------------------- git-credential

const ask = (w, lines, op = 'get', provider = 'claude') => {
  w.state.stdin = lines.join('\n') + '\n\n';
  return main(['git-credential', '--provider', provider, op], w.io);
};
const GOOD_ASK = ['protocol=https', 'host=github.com', `path=${REPO}.git`];

// C3: get answers on git's pipe, and only there.
test('git-credential get prints username and password on stdout only for an https github.com <owner>/<name> path', async t => {
  for (const path of [`${REPO}.git`, REPO]) {
    const w = world(t);
    assert.equal(await ask(w, ['protocol=https', 'host=github.com', `path=${path}`]), 0);
    const { out, err } = printed(w);
    assert.match(out, /^username=x-access-token\npassword=ghs_[0-9a-f]{48}\n$/);
    assert.equal(err, '');
    assert.equal(w.spy.fetches.find(f => f.method === 'POST').body.repositories[0], 'sandbox', 'the .git suffix is dropped');
    assert.deepEqual(w.spy.fetches.find(f => f.method === 'POST').body.permissions, SETS.git, 'the git set');
  }
});

{
  const rows = [
    { id: 'http', lines: ['protocol=http', 'host=github.com', `path=${REPO}`], reason: 'repo/shape' },
    { id: 'other-host', lines: ['protocol=https', 'host=evil.example', `path=${REPO}`], reason: 'repo/shape' },
    { id: 'host-with-a-port', lines: ['protocol=https', 'host=github.com:444', `path=${REPO}`], reason: 'repo/shape' },
    { id: 'no-path', lines: ['protocol=https', 'host=github.com'], reason: 'repo/shape' },
    { id: 'path-with-a-subfolder', lines: ['protocol=https', 'host=github.com', `path=${REPO}/x`], reason: 'repo/shape' },
    { id: 'path-with-dotdot', lines: ['protocol=https', 'host=github.com', `path=${OWNER}/..`], reason: 'repo/shape' },
    { id: 'another-owner', lines: ['protocol=https', 'host=github.com', 'path=someone-else/sandbox.git'], reason: 'repo/owner' },
    { id: 'ssl-verify-off', lines: GOOD_ASK, env: { GIT_SSL_NO_VERIFY: 'true' }, reason: 'tls' },
    { id: 'ssl-verify-off-empty-value', lines: GOOD_ASK, env: { GIT_SSL_NO_VERIFY: '' }, reason: 'tls' },
    { id: 'tls-off', lines: GOOD_ASK, env: { NODE_TLS_REJECT_UNAUTHORIZED: '0' }, reason: 'tls' },
    // `git -c http.sslVerify=false` reaches the helper only through these variables: git 2.31 and later write
    // 'key'='value' (key and value quoted apart), earlier git wrote 'key=value'.
    { id: 'ssl-verify-off-by-git-c', lines: GOOD_ASK, env: { GIT_CONFIG_PARAMETERS: "'http.sslVerify'='false'" }, reason: 'tls' },
    { id: 'ssl-verify-off-by-git-c-before-2-31', lines: GOOD_ASK, env: { GIT_CONFIG_PARAMETERS: "'http.sslverify=false'" }, reason: 'tls' },
    { id: 'ssl-verify-off-for-a-url-by-git-c', lines: GOOD_ASK, env: { GIT_CONFIG_PARAMETERS: "'user.name'='a' 'http.https://github.com/.sslVerify'='no'" }, reason: 'tls' },
    { id: 'ssl-verify-zero-by-git-c', lines: GOOD_ASK, env: { GIT_CONFIG_PARAMETERS: "'http.sslVerify'='00'" }, reason: 'tls' },
    { id: 'ssl-verify-empty-by-git-c', lines: GOOD_ASK, env: { GIT_CONFIG_PARAMETERS: "'http.sslVerify'=''" }, reason: 'tls' },
    { id: 'ssl-verify-off-by-config-count', lines: GOOD_ASK, env: { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.sslVerify', GIT_CONFIG_VALUE_0: 'false' }, reason: 'tls' },
    { id: 'not-windows', lines: GOOD_ASK, platform: 'darwin', reason: 'platform' },
    { id: 'pin-fails', lines: GOOD_ASK, setup: w => { w.state.app.events = ['push']; }, reason: 'pin/check' },
  ];
  for (const r of rows) {
    test(`git-credential get refuses: ${r.id}: nothing on stdout, one fixed line on stderr, exit 0`, async t => {
      const w = world(t, { env: r.env, platform: r.platform });
      r.setup?.(w);
      assert.equal(await ask(w, r.lines), 0);
      const { out, err } = printed(w);
      assert.equal(out, '');
      assert.equal(err, `gh-app: ${REASONS[r.reason]}\n`);
      assert.equal(w.spy.fetches.filter(f => f.method === 'POST').length, 0);
    });
  }
  test('git-credential get refuses its protocol, host, path and owner before any spawn', async t => {
    for (const r of rows.filter(x => /^(http|other-host|host-with|no-path|path-with|another-owner)/.test(x.id))) {
      const w = world(t);
      await ask(w, r.lines);
      assert.equal(w.spy.spawns.length, 0, r.id);
      assert.equal(w.spy.fetches.length, 0, r.id);
    }
  });
}

test('git-credential store and erase do nothing', async t => {
  for (const op of ['store', 'erase']) {
    const w = world(t);
    assert.equal(await ask(w, [...GOOD_ASK, 'username=x-access-token', 'password=whatever'], op), 0);
    assert.equal(printed(w).out + printed(w).err, '');
    assert.equal(w.spy.spawns.length + w.spy.fetches.length, 0);
    assert.equal(w.store.size, 1, 'only the key is in the store');
  }
});

// C3 (r3 X-N5): a fake app token in GH_TOKEN reaches nothing.
test('git-credential get with GH_TOKEN set calls the stubbed gh without it', async t => {
  const canary = `app-${'y'.repeat(30)}`;
  const w = world(t, { env: { GH_TOKEN: canary } });
  await ask(w, GOOD_ASK);
  assert.ok(w.spy.spawns.length >= 3);
  for (const s of w.spy.spawns) assert.equal(Object.hasOwn(s.env, 'GH_TOKEN'), false);
  assert.ok(!printed(w).out.includes(canary));
});

// ---------------------------------------------------------------- C3: the unknown modes and refused gh

test('there is no mode that prints a token: `token` is an unknown mode, and so is anything else', async t => {
  for (const argv of [['token', '--provider', 'claude'], ['mint', '--provider', 'claude'], [], ['--help']]) {
    const w = world(t);
    assert.equal(await main(argv, w.io), 2);
    assert.equal(printed(w).out, '');
    assert.equal(printed(w).err, `gh-app: ${REASONS.mode}\n`);
  }
});

test('gh refuses auth, extension, ext, alias and config as its first argument, even after --', async t => {
  for (const first of ['auth', 'Auth', 'extension', 'extensions', 'ext', 'alias', 'config']) {
    const w = world(t);
    assert.equal(await main(['gh', '--provider', 'claude', '-R', REPO, '--', first, 'token'], w.io), 1, first);
    assert.equal(w.spy.fetches.length, 0, 'refused before any mint');
    assert.equal(printed(w).err, `gh-app: ${REASONS.gh}\n`);
  }
  const w = world(t);
  assert.equal(await main(['gh', '--provider', 'claude', '-R', REPO, '--'], w.io), 1, 'no gh command at all');
  // gh skips a leading flag to find its subcommand, so a flag first could hide a forbidden one.
  for (const lead of ['--hostname=github.com', '-h', '--version']) {
    const v = world(t);
    assert.equal(await main(['gh', '--provider', 'claude', '-R', REPO, '--', lead, 'auth', 'token'], v.io), 1, lead);
    assert.equal(v.spy.fetches.length, 0, 'refused before any mint');
  }
});

test('gh gives gh the one repo in GH_REPO, since it runs from an empty folder', async t => {
  const w = world(t);
  let seen;
  w.state.gh = (args, opts) => { seen = opts.env; return { status: 0, stdout: '', stderr: '' }; };
  assert.equal(await main(['gh', '--provider', 'claude', '-R', REPO, '--', 'issue', 'list'], w.io), 0);
  assert.equal(seen.GH_REPO, REPO);
});

// ---------------------------------------------------------------- the gh mode

test('gh runs gh with a gh-set token in GH_TOKEN from a fresh empty folder, strips the rest, and withholds a line that holds the token', async t => {
  const canary = `owner-${'z'.repeat(24)}`;
  const w = world(t, { env: { GH_TOKEN: canary, GITHUB_TOKEN: canary, GH_DEBUG: '1', DEBUG: 'x', GH_HOST: 'evil.example' } });
  let seen;
  w.state.gh = (args, opts) => {
    seen = { args, env: opts.env };
    return { status: 0, stdout: `ok one\nthe token is ${opts.env.GH_TOKEN}\nok two\n`, stderr: `warn ${opts.env.GH_TOKEN}\nplain warning\n` };
  };
  assert.equal(await main(['gh', '--provider', 'claude', '-R', REPO, '--', 'pr', 'merge', '7', '--match-head-commit', 'abc'], w.io), 0);
  assert.deepEqual(seen.args, ['pr', 'merge', '7', '--match-head-commit', 'abc']);
  assert.match(seen.env.GH_TOKEN, /^ghs_/);
  for (const k of ['GITHUB_TOKEN', 'GH_DEBUG', 'DEBUG', 'GH_HOST']) assert.equal(Object.hasOwn(seen.env, k), false, k);
  assert.equal(w.spy.fetches.find(f => f.method === 'POST').body.permissions.administration, undefined);
  assert.deepEqual(w.spy.fetches.find(f => f.method === 'POST').body.permissions, SETS.gh, 'the full app set');
  const { out, err } = printed(w);
  assert.equal(out, 'ok one\n(withheld)\nok two\n');
  assert.equal(err, '(withheld)\nplain warning\n');
  assert.ok(!leakSurface(w).includes(seen.env.GH_TOKEN));
  assert.ok(!leakSurface(w).includes(canary));
  const last = w.spy.cwdChecks.at(-1);
  assert.deepEqual(last.entries, []);
  assert.ok(last.underTmp);
});

test('gh passes gh\'s failure on as exit 1', async t => {
  const w = world(t);
  w.state.gh = () => ({ status: 1, stdout: '', stderr: 'nope\n' });
  assert.equal(await main(['gh', '--provider', 'claude', '-R', REPO, '--', 'issue', 'list'], w.io), 1);
});

test('gh refuses a repo outside the pinned owner and a missing -R', async t => {
  const w = world(t);
  assert.equal(await main(['gh', '--provider', 'claude', '-R', 'someone-else/x', '--', 'issue', 'list'], w.io), 1);
  assert.equal(printed(w).err, `gh-app: ${REASONS['repo/owner']}\n`);
  const v = world(t);
  assert.equal(await main(['gh', '--provider', 'claude', '--', 'issue', 'list'], v.io), 1);
});

// ---------------------------------------------------------------- the command line

test('parseArgs: each flag once, a value never starts with a dash, the provider is required and known', () => {
  assert.deepEqual(parseArgs(['status', '--provider', 'claude']).flags, { '--provider': 'claude' });
  assert.deepEqual(parseArgs(['gh', '--provider', 'codex', '-R', 'a/b', '--', 'issue', '--provider']).after, ['issue', '--provider']);
  for (const argv of [['status'], ['status', '--provider'], ['status', '--provider', 'claude', '--provider', 'claude'], ['status', '--provider', '--repo'], ['status', '--provider', 'claude', '--bogus'], ['forget', '--provider', 'claude', 'extra'], ['git-credential', '--provider', 'claude', 'get', 'extra']]) {
    assert.throws(() => parseArgs(argv), e => e instanceof Refusal, argv.join(' '));
  }
  assert.throws(() => parseArgs(['status', '--provider', 'gemini']), e => e.id === 'provider');
});

test('parseRepo: owner/name only; a .git suffix is dropped only when asked', () => {
  assert.deepEqual(parseRepo('a-b/c.d_e'), { owner: 'a-b', name: 'c.d_e' });
  assert.deepEqual(parseRepo('a/b.git', true), { owner: 'a', name: 'b' });
  assert.equal(parseRepo('a/b.git').name, 'b.git');
  for (const bad of ['', 'a', 'a/', '/b', 'a/b/c', 'a b/c', '-a/b', 'a/..', 'a/.', 'a/b c', 'a/b;c', 5, null]) assert.throws(() => parseRepo(bad), e => e.id === 'repo/shape', String(bad));
});

test('every mode refuses off Windows and names the platform, and git-credential prints nothing on stdout', async t => {
  for (const argv of [['status'], ['forget'], ['gh', '-R', REPO, '--', 'issue', 'list'], ['setup', '--app-id', '1', '--key', 'x.pem']]) {
    const w = world(t, { platform: 'linux' });
    assert.equal(await main([argv[0], '--provider', 'claude', ...argv.slice(1)], w.io), 1, argv[0]);
    assert.equal(printed(w).err, `gh-app: ${REASONS.platform}\n`);
    assert.equal(w.spy.spawns.length + w.spy.fetches.length, 0);
  }
});

// ---------------------------------------------------------------- the key and the JWT

test('pemToDer turns a PKCS#1 or a PKCS#8 PEM into PKCS#1 DER under the credential size limit, and refuses a key that is not RSA or is small', () => {
  for (const pair of ['a', 'b']) {
    const der = pemToDer(keys()[pair].privateKey);
    assert.ok(der.length < 1400, `about 1.2 KB, got ${der.length}`);
    assert.ok(der.length < 2560);
    assert.equal(createPrivateKey({ key: der, format: 'der', type: 'pkcs1' }).asymmetricKeyType, 'rsa');
  }
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  assert.throws(() => pemToDer(ec.privateKey), e => e.id === 'key/not-rsa');
  const small = generateKeyPairSync('rsa', { modulusLength: 1024, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  assert.throws(() => pemToDer(small.privateKey), e => e.id === 'key/not-rsa');
  assert.throws(() => pemToDer('not a pem'), e => e.id === 'key/not-rsa');
  assert.throws(() => pemToDer(''), e => e.id === 'key/not-rsa');
});

// ---------------------------------------------------------------- the gitconfig text (S7)

const EXAMPLE = { home: 'C:\\Users\\alice', nodePath: 'C:\\Program Files\\nodejs\\node.exe', provider: 'claude', app: { app_id: 2000001, slug: 'example-owner-claude', bot_login: 'example-owner-claude[bot]', bot_id: 3000001 } };

test('gitconfigText is the spec\'s file: forward slashes, the include, the empty helper, then the pact helper', () => {
  assert.equal(gitconfigText(EXAMPLE), [
    '[include]',
    '  path = C:/Users/alice/.gitconfig',
    '[user]',
    '  name = example-owner-claude[bot]',
    '  email = 3000001+example-owner-claude[bot]@users.noreply.github.com',
    '[credential "https://github.com"]',
    '  helper =',
    '  helper = "!\\"C:/Program Files/nodejs/node.exe\\" \\"C:/Users/alice/.claude/pact/tools/gh-app.mjs\\" git-credential --provider claude"',
    '  useHttpPath = true',
    '',
  ].join('\n'));
  assert.match(gitconfigText({ ...EXAMPLE, xdg: true }), /\[include\]\n  path = C:\/Users\/alice\/\.gitconfig\n  path = C:\/Users\/alice\/\.config\/git\/config\n\[user\]/);
});

test('gitconfigText quotes and escapes a path that holds a quote, a backslash or a hash, and refuses a line break', () => {
  const odd = gitconfigText({ ...EXAMPLE, home: 'C:\\Users\\alice "q" #1' });
  assert.match(odd, /^  path = "C:\/Users\/alice \\"q\\" #1\/\.gitconfig"$/m);
  assert.throws(() => gitconfigText({ ...EXAMPLE, home: 'C:\\Users\\a\nb' }), e => e.id === 'gitconfig');
});

test('gitconfigText names the Node setup runs under, wherever it is, with forward slashes', () => {
  const mise = 'C:\\Users\\alice\\AppData\\Local\\mise\\installs\\node\\24.22.0\\node.exe';
  assert.match(gitconfigText({ ...EXAMPLE, nodePath: mise }), /helper = "!\\"C:\/Users\/alice\/AppData\/Local\/mise\/installs\/node\/24\.22\.0\/node\.exe\\" /);
});

// ---------------------------------------------------------------- C1: setup

/** The fake git for setup's read-back: it answers `git config --file <f> --get-all ...` from the file's own text. */
const readBack = w => {
  w.state.git = args => {
    if (args[0] === 'config' && args[1] === '--file') {
      const body = readFileSync(args[2], 'utf8');
      const values = [...body.matchAll(/^  helper =(?: (.*))?$/gm)].map(m => {
        const v = (m[1] ?? '').trim();
        return v.startsWith('"') ? v.slice(1, -1).replaceAll('\\"', '"').replaceAll('\\\\', '\\') : v;
      });
      return { status: 0, stdout: values.map(v => `${v}\n`).join(''), stderr: '' };
    }
    return { status: 1, stdout: '', stderr: '' };
  };
};
const setupArgs = (w, provider = 'claude', extra = {}) => ['setup', '--provider', provider, '--app-id', String(extra.appId ?? IDS.app), '--key', extra.key ?? writePem(w, 'download.pem')];
const fresh = (t, o = {}) => {
  const w = world(t, { pin: false, key: false, ...o });
  readBack(w);
  return w;
};
const untouched = w => {
  assert.equal(w.store.size, 0, 'no credential written');
  assert.equal(existsSync(join(w.home, '.claude', 'pact', 'github.json')), false, 'no pin file');
  assert.equal(existsSync(gitconfigFile(w)), false, 'no gitconfig');
};

// C1: the whole happy path, step by step.
test('setup stores the key as DER, writes the pin and the gitconfig, reads the helper line back, and deletes the download last', async t => {
  const w = fresh(t);
  const argv = setupArgs(w);
  const pem = readFileSync(argv[argv.indexOf('--key') + 1], 'utf8');
  assert.equal(await main(argv, w.io), 0, printed(w).err);
  const stored = w.store.get('the-pact/gh-app/claude/key');
  assert.deepEqual(stored, derOf(pem), 'the key credential is the PKCS#1 DER');
  assert.ok(stored.length < 2560 && stored.length < Buffer.byteLength(pem, 'utf16le'));
  assert.deepEqual(readPinFile(w), { owner: { login: OWNER, id: IDS.owner }, apps: { claude: { app_id: IDS.app, slug: SLUG, bot_login: BOT, bot_id: IDS.bot } } });
  assert.equal(readFileSync(gitconfigFile(w), 'utf8'), gitconfigText({ home: w.home, nodePath: NODE, provider: 'claude', app: readPinFile(w).apps.claude, xdg: false }));
  const git = w.spy.spawns.find(s => s.file === 'git');
  assert.deepEqual(git.args.slice(0, 2), ['config', '--file']);
  assert.equal(git.args.at(-1), 'credential.https://github.com.helper');
  assert.equal(existsSync(argv.at(-1)), false, 'the download is deleted');
  assert.equal(w.store.size, 1, 'no token left in the cache');
  const test = w.spy.fetches.find(f => f.method === 'POST');
  assert.deepEqual(test.body, { permissions: { metadata: 'read' } }, 'the test token is metadata read, nothing more');
  assert.equal(w.state.revoked.length, 1, 'the test token is revoked');
  assert.match(printed(w).out, new RegExp(`SHA256:${createHash('sha256').update(createPublicKey(keys().a.publicKey).export({ type: 'spki', format: 'der' })).digest('base64').replace(/[+/]/g, '\\$&')}`));
  const order = w.spy.fetches.map(f => `${f.method} ${new URL(f.url).pathname}`);
  assert.deepEqual(order, ['GET /app', `GET /users/${OWNER}/installation`, `POST /app/installations/${IDS.inst}/access_tokens`, `GET /users/${SLUG}%5Bbot%5D`, 'DELETE /installation/token']);
});

test('setup writes the XDG include only when that config exists', async t => {
  const w = fresh(t);
  const { mkdirSync } = await import('node:fs');
  mkdirSync(join(w.home, '.config', 'git'), { recursive: true });
  writeFileSync(join(w.home, '.config', 'git', 'config'), '[core]\n');
  assert.equal(await main(setupArgs(w), w.io), 0, printed(w).err);
  assert.match(readFileSync(gitconfigFile(w), 'utf8'), /\.config\/git\/config/);
});

test('setup for codex pins its app and key and writes no gitconfig', async t => {
  const w = fresh(t);
  w.state.app.slug = 'example-owner-codex';
  w.state.bot.login = 'example-owner-codex[bot]';
  assert.equal(await main(setupArgs(w, 'codex'), w.io), 0, printed(w).err);
  assert.ok(w.store.has('the-pact/gh-app/codex/key'));
  assert.equal(readPinFile(w).apps.codex.bot_login, 'example-owner-codex[bot]');
  assert.equal(existsSync(join(w.home, '.claude', 'pact', 'gh-app-codex.gitconfig')), false);
});

// C1: every refusal writes nothing, deletes nothing it didn't write, and keeps the download.
{
  const rows = [
    { id: 'wrong-app-id', setup: w => { w.state.app.id = 5; } },
    { id: 'app-owner-is-another-account', setup: w => { w.state.app.owner.id = 5; } },
    { id: 'installation-on-another-account', setup: w => { w.state.installation.account.id = 5; } },
    { id: 'app-has-administration', setup: w => { w.state.app.permissions.administration = 'write'; } },
    { id: 'app-lacks-a-permission', setup: w => { delete w.state.app.permissions.workflows; } },
    { id: 'app-subscribes-an-event', setup: w => { w.state.app.events = ['issues']; } },
    { id: 'app-has-an-account-permission', setup: w => { w.state.app.permissions.emails = 'read'; } },
    { id: 'the-test-mint-fails', setup: w => { w.state.mintStatus = 403; } },
    { id: 'the-bot-is-not-a-bot', setup: w => { w.state.bot.type = 'User'; } },
    { id: 'key-is-not-rsa', pem: generateKeyPairSync('ec', { namedCurve: 'P-256', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey },
    { id: 'key-is-not-a-pem', pem: 'hello' },
    { id: 'key-is-signed-by-another-app', pairOther: true },
    { id: 'the-readback-differs', setup: w => { w.state.git = () => ({ status: 0, stdout: '\n!evil\n', stderr: '' }); }, wrote: true },
    { id: 'the-readback-fails', setup: w => { w.state.git = () => ({ status: 1, stdout: '', stderr: '' }); }, wrote: true },
    { id: 'gh-cannot-read-the-owner', setup: w => { w.state.ghReadFails.add('user'); } },
  ];
  for (const r of rows) {
    test(`setup refuses: ${r.id}: writes nothing, keeps the download, says where it is`, async t => {
      const w = fresh(t);
      const key = writePem(w, 'download.pem', r.pem ?? keys().a.privateKey);
      if (r.pairOther) {
        // The fake verifies JWTs against pair a; the download holds pair b.
        writeFileSync(key, keys().b.privateKey);
      }
      r.setup?.(w);
      const code = await main(setupArgs(w, 'claude', { key }), w.io);
      assert.equal(code, 1, printed(w).err);
      untouched(w);
      assert.ok(existsSync(key), 'the download is kept');
      if (r.wrote) assert.match(printed(w).err, /the key file is still at /);
      assert.ok(!leakSurface(w).includes(readFileSync(key, 'utf8').split('\n')[1]), 'no key text in any output');
    });
  }
}

test('setup refuses a pin whose owner differs from this gh login, writing nothing new', async t => {
  const w = fresh(t);
  writePin(w);
  const pinBefore = readFileSync(join(w.home, '.claude', 'pact', 'github.json'), 'utf8');
  w.state.me = { login: 'someone-else', id: 77 };
  assert.equal(await main(setupArgs(w), w.io), 1);
  assert.equal(readFileSync(join(w.home, '.claude', 'pact', 'github.json'), 'utf8'), pinBefore);
  assert.equal(w.store.size, 0);
});

test('setup refuses a pin file that exists but is not the pinned shape, and writes nothing over it', async t => {
  const w = fresh(t);
  const file = join(w.home, '.claude', 'pact', 'github.json');
  const body = `${JSON.stringify({ owner: { login: OWNER, id: IDS.owner }, apps: { codex: { app_id: 9, slug: 's', bot_login: 's[bot]', bot_id: 8 } }, extra: true })}\n`;
  writeFileSync(file, body);
  const key = writePem(w, 'download.pem');
  assert.equal(await main(setupArgs(w, 'claude', { key }), w.io), 1);
  assert.equal(readFileSync(file, 'utf8'), body, 'the other provider\'s entry is not dropped');
  assert.equal(w.store.size, 0);
  assert.ok(existsSync(key));
});

// Every request carries a credential, so none goes out with certificate checks off.
test('setup refuses with Node\'s certificate checks off: no request is sent and nothing is written', async t => {
  const w = fresh(t, { env: { NODE_TLS_REJECT_UNAUTHORIZED: '0' } });
  const key = writePem(w, 'download.pem');
  assert.equal(await main(setupArgs(w, 'claude', { key }), w.io), 1);
  assert.equal(printed(w).err.includes(REASONS.tls), true);
  assert.equal(w.spy.fetches.length, 0, 'nothing was sent');
  untouched(w);
  assert.ok(existsSync(key));
});

test('forget with Node\'s certificate checks off sends no revoke, says it was not confirmed, and still clears the cache', async t => {
  const w = world(t, { env: { NODE_TLS_REJECT_UNAUTHORIZED: '0' } });
  const token = cachedToken(w, 'git');
  assert.equal(await main(['forget', '--provider', 'claude'], w.io), 0, printed(w).err);
  assert.equal(w.spy.fetches.length, 0, 'the token is not sent anywhere');
  assert.match(printed(w).out, /a token revoke was not confirmed/);
  assert.equal(w.store.size, 0);
  assert.ok(!leakSurface(w).includes(token));
});

test('setup prints a usage fault for a bad app id or a missing key path', async t => {
  for (const argv of [['setup', '--provider', 'claude', '--app-id', 'abc', '--key', 'x'], ['setup', '--provider', 'claude', '--app-id', '0', '--key', 'x'], ['setup', '--provider', 'claude', '--app-id', '1'], ['setup', '--provider', 'claude', '--key', 'x']]) {
    const w = fresh(t);
    assert.equal(await main(argv, w.io), 2);
    untouched(w);
  }
});

// C1: a re-run swaps the key only after the new key's test mint succeeds.
const cachedToken = (w, set, n = 'sandbox') => {
  const token = `ghs_${'ab12'.repeat(8)}${n}${set}`.replace(/[^A-Za-z0-9_]/g, '');
  w.knownTokens.add(token);
  w.store.set(`the-pact/gh-app/claude/token/${OWNER}/${n}/${set}`, Buffer.from(JSON.stringify({ token, expires_at: new Date(w.state.now + 3600e3).toISOString() })));
  return token;
};
// A re-run over a different, older key and pin entry: the fake GitHub accepts JWTs of pair a (the new download),
// the store holds pair b's key and the pin names another app, so a swap, a keep and a rollback each show.
const KEY = 'the-pact/gh-app/claude/key';
const OLD_ENTRY = { app_id: 4242, slug: 'old-slug', bot_login: 'old-slug[bot]', bot_id: 4243 };
const rerun = async t => {
  const w = world(t, { keyPair: 'a' });
  readBack(w);
  const oldDer = Buffer.from(derOf(keys().b.privateKey));
  w.store.set(KEY, oldDer);
  writePin(w, { claude: OLD_ENTRY });
  const oldPin = readFileSync(join(w.home, '.claude', 'pact', 'github.json'), 'utf8');
  const tokens = [cachedToken(w, 'git'), cachedToken(w, 'post'), cachedToken(w, 'gh', 'other')];
  const key = writePem(w, 'download.pem', keys().a.privateKey);
  return { w, oldDer, oldPin, tokens, key, code: () => main(setupArgs(w, 'claude', { key }), w.io) };
};
const newDer = () => derOf(keys().a.privateKey);

test('a re-run whose new key fails its test mint keeps the old key, pin and cache, and revokes nothing', async t => {
  const { w, oldDer, oldPin, code, key } = await rerun(t);
  w.state.mintStatus = 403; // the new key signs, GitHub answers the key's own test mint with a refusal
  assert.equal(await code(), 1);
  assert.deepEqual(w.store.get(KEY), oldDer, 'a refused test mint leaves the old key');
  assert.equal(readFileSync(join(w.home, '.claude', 'pact', 'github.json'), 'utf8'), oldPin, 'and the old pin');
  assert.equal(w.store.size, 4, 'and the cache');
  assert.equal(w.state.revoked.length, 0, 'none of the cached tokens is revoked');
  assert.ok(existsSync(key));
});

test('a re-run whose new key passes its test mint swaps the key and the pin entry, revokes each cached token, and clears the cache', async t => {
  const { w, oldDer, tokens, code, key } = await rerun(t);
  assert.equal(await code(), 0, printed(w).err);
  assert.deepEqual(w.store.get(KEY), newDer(), 'the new key');
  assert.notDeepEqual(w.store.get(KEY), oldDer);
  assert.deepEqual(readPinFile(w).apps.claude, { app_id: IDS.app, slug: SLUG, bot_login: BOT, bot_id: IDS.bot }, 'the new entry');
  assert.deepEqual(w.state.revoked.filter(x => tokens.includes(x)).sort(), [...tokens].sort(), 'each cached token is revoked');
  assert.deepEqual([...w.store.keys()], [KEY], 'the cache is empty');
  assert.equal(existsSync(key), false);
});

test('a re-run whose cached tokens answer 401 keeps the new key and empties the cache', async t => {
  const { w, code, key } = await rerun(t);
  w.state.revoked.push(...w.knownTokens);
  assert.equal(await code(), 0, printed(w).err);
  assert.deepEqual(w.store.get(KEY), newDer());
  assert.deepEqual([...w.store.keys()], [KEY]);
  assert.equal(existsSync(key), false);
  assert.doesNotMatch(printed(w).out, /not confirmed/, 'a 401 counts as already revoked: no warning');
});

test('a re-run whose revoke fails otherwise prints one fixed line, keeps the new key, and empties the cache', async t => {
  const { w, code } = await rerun(t);
  // Setup's own test token is revoked first and succeeds; only the cached tokens' revokes fail.
  const real = w.io.fetch;
  let deletes = 0;
  w.io.fetch = async (url, init) => (init?.method === 'DELETE' && ++deletes > 1 ? { status: 500, text: async () => '' } : real(url, init));
  assert.equal(await code(), 0, printed(w).err);
  assert.equal(printed(w).out.split('a token revoke was not confirmed').length - 1, 1, 'one fixed line, once');
  assert.deepEqual(w.store.get(KEY), newDer(), 'a failed revoke never undoes the swap');
  assert.deepEqual([...w.store.keys()], [KEY]);
});

test('a re-run whose own test token cannot be revoked says so once, and keeps the new key', async t => {
  const { w, code } = await rerun(t);
  const real = w.io.fetch;
  let deletes = 0;
  w.io.fetch = async (url, init) => (init?.method === 'DELETE' && ++deletes === 1 ? { status: 500, text: async () => '' } : real(url, init));
  assert.equal(await code(), 0, printed(w).err);
  assert.equal(printed(w).out.split('a token revoke was not confirmed').length - 1, 1);
  assert.deepEqual(w.store.get(KEY), newDer());
});

test('a re-run that fails after the key swap puts back the prior key and entry', async t => {
  const { w, oldDer, oldPin, code, key } = await rerun(t);
  writeFileSync(gitconfigFile(w), 'old gitconfig\n');
  w.state.git = () => ({ status: 0, stdout: '\n!wrong\n', stderr: '' });
  assert.equal(await code(), 1);
  assert.deepEqual(w.store.get(KEY), oldDer, 'the prior key, not the new one');
  assert.equal(readFileSync(join(w.home, '.claude', 'pact', 'github.json'), 'utf8'), oldPin, 'the prior entry');
  assert.equal(readFileSync(gitconfigFile(w), 'utf8'), 'old gitconfig\n');
  assert.ok(existsSync(key));
});

// The cache and the settings check, where nothing can be listed or read.
test('forget says so when the token cache cannot be listed, and still removes the key', async t => {
  const w = world(t);
  cachedToken(w, 'git');
  w.io.credStore.list = () => { throw new Error('list failed'); };
  assert.equal(await main(['forget', '--provider', 'claude'], w.io), 0, printed(w).err);
  assert.match(printed(w).out, /the token cache could not be listed/);
  assert.equal(w.store.has(KEY), false);
});

test('a cached token that cannot be read is deleted and counted as a revoke not confirmed', async t => {
  const w = world(t);
  cachedToken(w, 'git');
  const real = w.io.credStore.read;
  w.io.credStore.read = tgt => { if (tgt.includes('/token/')) throw new Error('read failed'); return real(tgt); };
  assert.equal(await main(['forget', '--provider', 'claude'], w.io), 0, printed(w).err);
  assert.match(printed(w).out, /a token revoke was not confirmed/);
  assert.equal([...w.store.keys()].some(k => k.includes('/token/')), false);
});

// ---------------------------------------------------------------- C1: forget

test('forget revokes each cached token, deletes the credentials, and removes the pin entry and the gitconfig', async t => {
  const w = world(t);
  const tokens = [cachedToken(w, 'git'), cachedToken(w, 'gh')];
  writeFileSync(gitconfigFile(w), 'x\n');
  assert.equal(await main(['forget', '--provider', 'claude'], w.io), 0, printed(w).err);
  assert.deepEqual(w.state.revoked.sort(), [...tokens].sort());
  assert.equal(w.store.size, 0);
  assert.deepEqual(readPinFile(w).apps, {});
  assert.equal(existsSync(gitconfigFile(w)), false);
});

test('forget refuses while the settings env points GIT_CONFIG_GLOBAL at the gitconfig, and keeps everything', async t => {
  for (const spell of [p => p, p => p.replaceAll('\\', '/'), p => p.toUpperCase()]) {
    const w = world(t);
    cachedToken(w, 'git');
    writeFileSync(gitconfigFile(w), 'x\n');
    writeFileSync(join(w.home, '.claude', 'settings.json'), JSON.stringify({ env: { GIT_CONFIG_GLOBAL: spell(gitconfigFile(w)) } }));
    assert.equal(await main(['forget', '--provider', 'claude'], w.io), 1);
    assert.equal(printed(w).err, `gh-app: ${REASONS.settings}\n`);
    assert.equal(w.store.size, 2);
    assert.deepEqual(Object.keys(readPinFile(w).apps), ['claude']);
    assert.ok(existsSync(gitconfigFile(w)));
    assert.equal(w.state.revoked.length, 0);
  }
});

test('forget with an expired cached token (401 on revoke) completes', async t => {
  const w = world(t);
  const token = cachedToken(w, 'git');
  w.state.revoked.push(token);
  assert.equal(await main(['forget', '--provider', 'claude'], w.io), 0, printed(w).err);
  assert.equal(w.store.size, 0);
  assert.deepEqual(readPinFile(w).apps, {});
  assert.doesNotMatch(printed(w).out, /not confirmed/, 'a 401 counts as already revoked: no warning');
});

test('forget goes on when a revoke fails otherwise: it prints one fixed line and still deletes', async t => {
  const w = world(t);
  cachedToken(w, 'git');
  w.state.revokeStatus = 500;
  assert.equal(await main(['forget', '--provider', 'claude'], w.io), 0, printed(w).err);
  assert.match(printed(w).out, /a token revoke was not confirmed/);
  assert.equal(w.store.size, 0);
});

test('forget leaves the other providers\' entries and credentials', async t => {
  const w = world(t);
  w.store.set('the-pact/gh-app/codex/key', Buffer.from('k'));
  w.store.set('the-pact/gh-app/codex/token/a/b/git', Buffer.from('t'));
  writePin(w, { claude: { app_id: IDS.app, slug: SLUG, bot_login: BOT, bot_id: IDS.bot }, codex: { app_id: 9, slug: 'example-owner-codex', bot_login: 'example-owner-codex[bot]', bot_id: 8 } });
  assert.equal(await main(['forget', '--provider', 'claude'], w.io), 0);
  assert.deepEqual([...w.store.keys()].sort(), ['the-pact/gh-app/codex/key', 'the-pact/gh-app/codex/token/a/b/git']);
  assert.deepEqual(Object.keys(readPinFile(w).apps), ['codex']);
});

// ---------------------------------------------------------------- the credential store's PowerShell call (S6)

test('the credential store calls PowerShell by its fixed path with a fixed script; no secret is in argv or the script', () => {
  const calls = [];
  const secret = Buffer.from('s3cret-key-bytes-'.repeat(8));
  const reply = { value: 'OK' };
  const io = {
    env: { SystemRoot: 'C:\\Windows' },
    tmp: join(process.cwd(), '.'),
    fs: { mkdtempSync: () => 'tmp-run', rmSync: () => {} },
    spawn: (file, args, opts) => {
      calls.push({ file, args, input: opts.input, cwd: opts.cwd, shell: opts.shell });
      return { status: 0, stdout: reply.value, stderr: '' };
    },
  };
  const cs = makeCredStore(io);
  cs.write('the-pact/gh-app/claude/key', secret);
  reply.value = `OK ${secret.toString('base64')}`;
  assert.deepEqual(cs.read('the-pact/gh-app/claude/key'), secret);
  reply.value = 'NONE';
  assert.equal(cs.read('x'), null);
  reply.value = 'OK';
  cs.delete('x');
  reply.value = `OK\n${Buffer.from('the-pact/gh-app/claude/token/a/b/git').toString('base64')}\n`;
  assert.deepEqual(cs.list('the-pact/gh-app/claude/token/'), ['the-pact/gh-app/claude/token/a/b/git']);
  for (const c of calls) {
    assert.equal(c.file, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    assert.deepEqual(c.args, ['-NoProfile', '-NonInteractive', '-NoLogo', '-EncodedCommand', PS_ENCODED]);
    assert.equal(c.shell, false);
    assert.ok(!c.args.join(' ').includes(secret.toString('base64')));
  }
  assert.equal(calls[0].input, `write\n${Buffer.from('the-pact/gh-app/claude/key').toString('base64')}\n${secret.toString('base64')}\n`, 'the secret goes in on stdin as base64');
  assert.equal(Buffer.from(PS_ENCODED, 'base64').toString('utf16le'), PS_SCRIPT, 'the encoded command is the script');
  assert.ok(!PS_SCRIPT.includes(secret.toString('base64')));
  assert.match(PS_SCRIPT, /CredReadW/);
  assert.match(PS_SCRIPT, /c\.Persist = 2/, 'local-machine persistence');
  assert.doesNotMatch(PS_SCRIPT, /Write-Host|Write-Output|ConvertTo-SecureString|Out-File|Set-Content|\$input|Read-Host/, 'no cmdlet touches a secret');
});

test('the credential store refuses an error answer, a failed process and an answer that is not the shape', () => {
  for (const [stdout, status] of [['ERR 5', 0], ['OK', 1], ['', 0], ['garbage', 0]]) {
    const io = { env: {}, tmp: '.', fs: { mkdtempSync: () => 'x', rmSync: () => {} }, spawn: () => ({ status, stdout, stderr: '' }) };
    assert.throws(() => makeCredStore(io).read('t'), e => e instanceof Refusal && e.id === 'store', `${stdout}/${status}`);
  }
  const io = { env: {}, tmp: '.', fs: { mkdtempSync: () => 'x', rmSync: () => {} }, spawn: () => ({ status: 0, stdout: 'ERR 5', stderr: '' }) };
  assert.throws(() => makeCredStore(io).write('t', Buffer.from('x')), e => e.id === 'store');
});

// ---------------------------------------------------------------- C3: no secret in any output

// C3: a spy over every mode, the cases the claim lists.
test('no key, JWT or token appears in any output, argv, file or request body but git-credential get\'s reply on git\'s pipe', async t => {
  const w = fresh(t);
  const pem = keys().a.privateKey;
  const key = writePem(w, 'download.pem', pem);
  await main(setupArgs(w, 'claude', { key }), w.io);
  w.spy.out.length = 0;
  w.spy.err.length = 0;
  await ask(w, GOOD_ASK);
  const reply = printed(w).out;
  const token = /password=(\S+)/.exec(reply)[1];
  w.state.gh = (args, opts) => ({ status: 0, stdout: `done ${opts.env.GH_TOKEN}\n`, stderr: '' });
  await main(['gh', '--provider', 'claude', '-R', REPO, '--', 'pr', 'list'], w.io);
  await main(['gh', '--provider', 'claude', '-R', REPO, '--', 'auth', 'token'], w.io);
  await main(['token', '--provider', 'claude'], w.io);
  await main(['status', '--provider', 'claude'], w.io);
  await main(['forget', '--provider', 'claude'], w.io);
  const jwtSeen = w.spy.fetches.map(f => (f.headers?.Authorization ?? '').replace('Bearer ', '')).filter(a => a.split('.').length === 3);
  assert.ok(jwtSeen.length >= 2, 'JWTs were sent');
  const secrets = [pem, pem.split('\n')[1], derOf(pem).toString('base64'), ...jwtSeen, ...w.knownTokens];
  const surface = leakSurface(w).replace(reply, '');
  for (const s of secrets) assert.ok(!surface.includes(s), `a secret of ${s.length} characters leaked`);
  assert.ok(reply.includes(token));
  assert.equal(w.spy.out.concat(w.spy.err).filter(l => /password=/.test(l)).length, 1, 'one password= line in the whole run: the reply');
  // The token is on git's pipe, and never in what the helper would write to a file or an argv.
  for (const s of w.spy.spawns) assert.ok(!`${s.file} ${s.args.join(' ')}`.includes(token));
});

test('a malformed mint answer, even one that echoes a secret, gives only a fixed line', async t => {
  const w = world(t);
  const echo = `{"token": "${'q'.repeat(10)}", "message": "${derOf(keys().a.privateKey).toString('base64')}"`;
  w.state.mintOverride = echo;
  w.state.stdin = GOOD_ASK.join('\n') + '\n\n';
  assert.equal(await main(['git-credential', '--provider', 'claude', 'get'], w.io), 0);
  assert.equal(printed(w).out, '');
  assert.equal(printed(w).err, `gh-app: ${REASONS.shape}\n`);
  assert.ok(!leakSurface(w).includes(echo.slice(-40)));
});

test('an error with a message never reaches the output: a thrown Error prints the generic line', async t => {
  const w = world(t);
  w.io.fetch = async () => {
    throw new Error(`boom ${'k'.repeat(20)}`);
  };
  w.state.stdin = GOOD_ASK.join('\n') + '\n\n';
  assert.equal(await main(['git-credential', '--provider', 'claude', 'get'], w.io), 0);
  assert.ok(!leakSurface(w).includes('boom'));
  const v = world(t);
  v.io.credStore.read = () => {
    throw new Error('store failed kkkkkkkkkkkk');
  };
  await main(['status', '--provider', 'claude'], v.io);
  assert.ok(!leakSurface(v).includes('kkkkkkkk'));
});

test('the module exports mintToken for code callers and no function that prints a token', async () => {
  const mod = await import('../../claude/tools/gh-app.mjs');
  assert.equal(typeof mod.mintToken, 'function');
  assert.equal(Object.keys(mod).some(k => /^(token|printToken|getToken)$/i.test(k)), false);
});
