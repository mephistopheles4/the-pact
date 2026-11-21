// The GitHub App helper's status mode (#599, T1, S6): it names what git would
// do, never a path, a value or a secret. Every case runs in-process against the
// fake world (gh-app-world.mjs) with a scripted git.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { main } from '../../claude/tools/gh-app.mjs';
import { BOT, IDS, NODE, OWNER, leakSurface, printed, world } from './gh-app-world.mjs';

// The exact helper line the gitconfig writes; the world's home is filled in by gitWith.
const PACT = '!"C:/Program Files/nodejs/node.exe" "@HOME@/.claude/pact/tools/gh-app.mjs" git-credential --provider claude';
const BOT_EMAIL = `${IDS.bot}+${BOT}@users.noreply.github.com`;
const CANARY = `canary${'q'.repeat(18)}`;

/** A scripted git: `cfg` is what the repo's config says. */
const gitWith = (w, cfg = {}) => {
  const c = { remote: `https://github.com/${OWNER}/sandbox.git`, helpers: [], email: BOT_EMAIL, askpass: '', rewrites: [], ssl: '', header: '', ...cfg };
  const ok = out => ({ status: 0, stdout: out, stderr: '' });
  const no = { status: 1, stdout: '', stderr: '' };
  w.state.git = args => {
    const a = args[0] === '-C' ? args.slice(2) : args;
    if (a[0] === 'remote') return c.remote ? ok(`${c.remote}\n`) : no;
    if (a[0] !== 'config') return no;
    if (a.includes('--get-regexp') && a.at(-1).startsWith('^credential')) return ok(c.helpers.map(h => `${h.scope}\t${h.key} ${h.value.replace('@HOME@', w.home.replaceAll('\\', '/'))}`.trimEnd()).join('\n') + '\n');
    if (a.includes('--get-regexp') && a.at(-1).startsWith('^url')) return ok(c.rewrites.join('\n') + '\n');
    if (a.at(-1) === 'user.email') return c.email ? ok(`${c.email}\n`) : no;
    if (a.at(-1) === 'core.askPass') return c.askpass ? ok(`${c.askpass}\n`) : no;
    if (a.includes('--get-urlmatch') && a.includes('http.sslVerify')) return c.ssl ? ok(`${c.ssl}\n`) : no;
    if (a.includes('--get-urlmatch') && a.includes('http.extraHeader')) return c.header ? ok(`${c.header}\n`) : no;
    return no;
  };
};
const H = (scope, value, url = 'https://github.com') => ({ scope, key: url === '' ? 'credential.helper' : `credential.${url}.helper`, value });
const run = async (t, cfg, o = {}) => {
  const w = world(t, o.world);
  gitWith(w, cfg);
  o.setup?.(w);
  const code = await main(['status', '--provider', 'claude'], w.io);
  return { w, code, lines: printed(w).out.split('\n').filter(Boolean) };
};
const GOOD = [H('system', 'manager', ''), H('global', '', 'https://github.com'), H('global', PACT)];

test('status on a good setup: pass, the pact helper alone, the bot address, nothing off', async t => {
  const { code, lines, w } = await run(t, { helpers: GOOD });
  assert.equal(code, 0, printed(w).err);
  assert.deepEqual(lines, [
    'provider: claude',
    `bot: ${BOT}`,
    'pin check: pass',
    'key: present',
    'gitconfig node path exists: no',
    'helpers: 1',
    'helper 1: scope global, pact',
    'pact helper resolved: yes',
    'user.email: bot address',
    'remote protocol: https',
    'askpass: not set',
    'url rewrite applies: no',
    'http.sslVerify off: no',
    'remote url carries credentials: no',
    'http extraHeader applies: no',
  ]);
});

test('status reports the helper classes by scope: reset drops the earlier ones, the rest are named by class only', async t => {
  const { lines } = await run(t, { helpers: [H('system', 'manager', ''), H('global', 'store', ''), H('local', `!${CANARY} helper`, 'https://github.com/' + OWNER), H('worktree', 'osxkeychain', ''), H('command', '!gh auth git-credential', 'https://github.com')] });
  assert.deepEqual(lines.filter(l => l.startsWith('helper')), ['helpers: 5', 'helper 1: scope system, gcm', 'helper 2: scope global, other:store', 'helper 3: scope local, shell', 'helper 4: scope worktree, other:osxkeychain', 'helper 5: scope command, github-cli']);
  assert.ok(lines.includes('pact helper resolved: no'));
});

test('status flags any helper after the pact helper, and a reset after it drops it', async t => {
  const after = await run(t, { helpers: [H('global', ''), H('global', PACT), H('local', 'manager', 'https://github.com')] });
  assert.ok(after.lines.includes('helper 2: scope local, gcm, FLAGGED: after the pact helper'));
  assert.ok(!after.lines.find(l => l.startsWith('helper 1')).includes('FLAGGED'));
  const reset = await run(t, { helpers: [H('global', ''), H('global', PACT), H('local', '', 'https://github.com')] });
  assert.ok(reset.lines.includes('helpers: 0'), 'a later reset drops the pact helper too');
  assert.ok(reset.lines.includes('pact helper resolved: no'));
});

test('status counts a helper only where its url applies to the repo', async t => {
  const { lines } = await run(t, { helpers: [H('global', 'manager', 'https://gitlab.com'), H('global', 'manager', 'http://github.com'), H('global', 'manager', `https://github.com/${OWNER}/sandbox`), H('global', 'manager', 'https://github.com/other-owner'), H('global', 'manager', 'https://*.com'), H('global', 'manager', 'ssh://github.com')] });
  assert.deepEqual(lines.filter(l => l.startsWith('helper ')).map(l => l.replace(/^helper \d+: /, '')), ['scope global, gcm', 'scope global, gcm']);
});

// C3 (r4 D-N2): a repo-config helper's canary never shows in status.
test('status never shows a helper\'s text, arguments or path: a ! helper with a password= canary shows as shell, a program only by its base name', async t => {
  const w = world(t);
  gitWith(w, { helpers: [H('local', `!f() { echo username=u; echo password=${CANARY}; }; f`, 'https://github.com'), H('local', `C:/Users/someone/bin/git-credential-evil.exe --password=${CANARY}`, 'https://github.com')] });
  await main(['status', '--provider', 'claude'], w.io);
  const all = leakSurface(w);
  assert.ok(!all.includes(CANARY), 'the canary shows nowhere');
  assert.ok(!all.includes('someone'), 'no path shows');
  assert.ok(!/C:[\\/]Users/.test(printed(w).out), 'no path in the output');
  const lines = printed(w).out.split('\n');
  assert.ok(lines.includes('helper 1: scope local, shell'));
  assert.ok(lines.includes('helper 2: scope local, other:git-credential-evil'));
});

test('status reports the email as the bot\'s address, something else or unset, never the value', async t => {
  assert.ok((await run(t, { helpers: GOOD, email: BOT_EMAIL })).lines.includes('user.email: bot address'));
  const other = await run(t, { helpers: GOOD, email: 'someone@example.com' });
  assert.ok(other.lines.includes('user.email: something else'));
  assert.ok(!printed(other.w).out.includes('someone@example.com'));
  assert.ok((await run(t, { helpers: GOOD, email: '' })).lines.includes('user.email: unset'));
});

// C4 (the part status holds): the ways a session can still write as the owner are reported.
{
  const rows = [
    { id: 'ssh-remote', cfg: { remote: `git@github.com:${OWNER}/sandbox.git` }, line: 'remote protocol: ssh' },
    { id: 'ssh-url-remote', cfg: { remote: `ssh://git@github.com/${OWNER}/sandbox.git` }, line: 'remote protocol: ssh' },
    { id: 'no-remote', cfg: { remote: '' }, line: 'remote protocol: none' },
    { id: 'askpass-in-config', cfg: { askpass: 'C:/x/askpass.exe' }, line: 'askpass: set' },
    { id: 'askpass-in-env', cfg: {}, world: { env: { GIT_ASKPASS: 'x' } }, line: 'askpass: set' },
    { id: 'ssh-askpass-in-env', cfg: {}, world: { env: { SSH_ASKPASS: 'x' } }, line: 'askpass: set' },
    { id: 'insteadOf-rewrites-the-remote', cfg: { rewrites: ['url.git@github.com:.insteadof https://github.com/'] }, line: 'url rewrite applies: yes' },
    { id: 'insteadOf-for-another-host', cfg: { rewrites: ['url.git@gitlab.com:.insteadof https://gitlab.com/'] }, line: 'url rewrite applies: no' },
    { id: 'sslVerify-false', cfg: { ssl: 'false' }, line: 'http.sslVerify off: yes' },
    { id: 'sslVerify-true', cfg: { ssl: 'true' }, line: 'http.sslVerify off: no' },
    { id: 'ssl-no-verify-in-env', cfg: {}, world: { env: { GIT_SSL_NO_VERIFY: '1' } }, line: 'http.sslVerify off: yes' },
    { id: 'ssl-no-verify-empty-in-env', cfg: {}, world: { env: { GIT_SSL_NO_VERIFY: '' } }, line: 'http.sslVerify off: yes' },
    { id: 'credentials-in-the-url', cfg: { remote: `https://x-access-token:${CANARY}@github.com/${OWNER}/sandbox.git` }, line: 'remote url carries credentials: yes' },
    { id: 'user-in-the-url', cfg: { remote: `https://someone@github.com/${OWNER}/sandbox.git` }, line: 'remote url carries credentials: yes' },
    { id: 'extra-header', cfg: { header: `AUTHORIZATION: basic ${CANARY}` }, line: 'http extraHeader applies: yes' },
  ];
  for (const r of rows) {
    test(`status reports: ${r.id}, and never the value`, async t => {
      const { lines, w } = await run(t, { helpers: GOOD, ...r.cfg }, { world: r.world });
      assert.ok(lines.includes(r.line), `${r.line} in ${lines.join(' | ')}`);
      assert.ok(!leakSurface(w).includes(CANARY), 'no value shown');
      assert.ok(!leakSurface(w).includes('someone'), 'no login in a url shown');
    });
  }
}

test('status says the pin check failed, and exits 1, when GitHub\'s record differs', async t => {
  const r = await run(t, { helpers: GOOD }, { setup: w => { w.state.app.events = ['push']; } });
  assert.ok(r.lines.includes('pin check: fail'));
  assert.equal(r.code, 1);
});

test('status on an unpinned provider names none and exits 1, and one with no key says absent', async t => {
  const r = await run(t, { helpers: GOOD }, { world: { pin: false, key: false } });
  assert.ok(r.lines.includes('bot: not pinned'));
  assert.ok(r.lines.includes('pin check: fail'));
  assert.ok(r.lines.includes('key: absent'));
  assert.equal(r.code, 1);
});

test('status reads the gitconfig\'s node path and says only whether it still exists', async t => {
  const exists = [];
  const w = world(t);
  gitWith(w, { helpers: GOOD });
  writeFileSync(join(w.home, '.claude', 'pact', 'gh-app-claude.gitconfig'), `[credential "https://github.com"]\n  helper =\n  helper = "!\\"${NODE.replaceAll('\\', '/')}\\" \\"x/gh-app.mjs\\" git-credential --provider claude"\n`);
  w.io.fs = { ...w.io.fs, existsSync: p => { exists.push(p); return p === NODE.replaceAll('\\', '/'); } };
  await main(['status', '--provider', 'claude'], w.io);
  assert.ok(printed(w).out.includes('gitconfig node path exists: yes'));
  assert.ok(!printed(w).out.includes('nodejs'), 'the path is not printed');
  w.io.fs = { ...w.io.fs, existsSync: () => false };
  w.spy.out.length = 0;
  await main(['status', '--provider', 'claude'], w.io);
  assert.ok(printed(w).out.includes('gitconfig node path exists: no'));
});

test('status passes -C to git when --repo is given, and runs git from a fresh empty folder', async t => {
  const w = world(t);
  gitWith(w, { helpers: GOOD });
  await main(['status', '--provider', 'claude', '--repo', join(w.home, 'repo')], w.io);
  const gits = w.spy.spawns.filter(s => s.file === 'git');
  assert.ok(gits.length >= 5);
  for (const g of gits) assert.deepEqual(g.args.slice(0, 2), ['-C', join(w.home, 'repo')]);
  for (const c of w.spy.cwdChecks) assert.deepEqual(c.entries, []);
});

// git reads a config pattern as a POSIX extended regex, where (?:) is an error, and a push may go to a different address than a fetch.
test('status reads the push address and asks git for rewrites with a pattern git accepts', async t => {
  const w = world(t);
  gitWith(w, { helpers: GOOD });
  await main(['status', '--provider', 'claude'], w.io);
  const gits = w.spy.spawns.filter(s => s.file === 'git').map(s => s.args);
  assert.ok(gits.some(a => a[0] === 'remote' && a.includes('--push')), 'the push address');
  const rewrite = gits.find(a => a.includes('--get-regexp') && a.at(-1).startsWith('^url'));
  assert.ok(rewrite, 'the rewrite lookup runs');
  assert.doesNotMatch(rewrite.at(-1), /\(\?/, 'no Perl-style group');
});

test('status reads a helper as the pact\'s only when its text is the exact line the gitconfig writes', async t => {
  const look = { scope: 'global', key: 'credential.https://github.com.helper', value: '!echo gh-app.mjs git-credential --provider claude' };
  const r = await run(t, { helpers: [H('global', ''), look] });
  assert.ok(r.lines.includes('helper 1: scope global, shell'));
  assert.ok(r.lines.includes('pact helper resolved: no'));
});

test('status counts a helper keyed by the default port and by user info as applying to github.com', async t => {
  const r = await run(t, { helpers: [H('global', 'manager', 'https://user@github.com:443')] });
  assert.ok(r.lines.includes('helpers: 1'));
});
