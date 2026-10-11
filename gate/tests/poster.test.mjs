// The poster's core (#253, T1 of #246). Every case runs in-process, with gh
// injected as a function and the environment, home and temp folders, user and
// host as inputs, so no case needs gh or the network. One case runs the real
// file as a child, with --dry-run and gh absent from PATH. Token shapes are
// built at runtime from pieces, so this source holds no credential shape.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { makeGh, post } from '../../cross/poster.mjs';
import { childEnv } from './gate-run.mjs';
import { table } from './tables.mjs';
import { REPO } from './text.mjs';
import { tempDir, writeTree } from './tree.mjs';

const POSTER = join(REPO, 'cross', 'poster.mjs');
const ME = 'tester';
const TARGET = `${ME}/sandbox`;
const WEB = `https://github.com/${TARGET}`;
// Synthetic machine values: never this machine's.
const MACHINE = { home: '/srv/home/tester', tmp: '/tmp', user: ME, host: 'buildhost' };

// ---------------------------------------------------------------- planted text, built from pieces

const rep = (s, n) => s.repeat(n);
const ZWSP = String.fromCharCode(0x200b);
const ROBOT = String.fromCodePoint(0x1f916);
const SESSION = 'Ab12'.repeat(6);
const GH_TOKEN_SHAPE = 'gh' + 'p_' + rep('A1', 18);
const SECRETS = {
  github: GH_TOKEN_SHAPE,
  pat: 'github' + '_pat_' + rep('B2', 41),
  sk: 's' + 'k-ant-api03-' + rep('Cd3', 10),
  live: 's' + 'k_live_' + rep('D4', 12),
  npm: 'n' + 'pm_' + rep('E5', 18),
  gitlab: 'gl' + 'pat-' + rep('F6', 10),
  google: 'AI' + 'za' + rep('G7', 17) + 'x',
  aws: 'AK' + 'IA' + rep('H8', 8),
  slack: 'xo' + 'xb-' + rep('1234-', 3) + 'abcdefghij',
  jwt: 'ey' + 'J' + rep('h', 12) + '.ey' + 'J' + rep('p', 12) + '.' + rep('s', 12),
  pem: '-----BEGIN ' + 'RSA PRIVATE KEY-----',
  conn: 'Server=db;Account' + 'Key=' + rep('k9', 10),
};
const ENV_SECRET = 'zebra-quokka-42';
const USERINFO = 'https://bob:' + 'hunter2pass@example.com/x';
const PLANTED = [...Object.values(SECRETS), ENV_SECRET, 'hunter2pass', 'alice@example.org', 'notes-for-alice', SESSION, GH_TOKEN_SHAPE.slice(10)];

const TRAILER = `${ROBOT} Generated with [Claude Code](https://claude.com/claude-code)\n\nhttps://claude.ai/code/session_${SESSION}\n`;

// ---------------------------------------------------------------- the world: a fake GitHub behind an injected gh

/** A gh that answers the login read, one post per surface, and the read-back, recording each call. `tamper` changes what the read-back returns. */
function world({ login = ME, tamper = x => x, answer = x => x, fail = {} } = {}) {
  const calls = [];
  const stored = new Map();
  const user = { login };
  const create = (path, req) => {
    let m;
    if ((m = path.match(/^repos\/([^/]+\/[^/]+)\/issues$/))) return [`repos/${m[1]}/issues/42`, { number: 42, title: req.title, body: req.body, labels: (req.labels ?? []).map(name => ({ name })), user }];
    if ((m = path.match(/^repos\/([^/]+\/[^/]+)\/pulls$/))) {
      const [owner, branch] = req.head.includes(':') ? req.head.split(':') : [m[1].split('/')[0], req.head];
      return [`repos/${m[1]}/pulls/7`, { number: 7, title: req.title, body: req.body, draft: req.draft, base: { ref: req.base }, head: { ref: branch, repo: { full_name: `${owner}/${m[1].split('/')[1]}` } }, user }];
    }
    if ((m = path.match(/^repos\/([^/]+\/[^/]+)\/issues\/\d+\/comments$/))) return [`repos/${m[1]}/issues/comments/9001`, { id: 9001, body: req.body, user }];
    if ((m = path.match(/^repos\/([^/]+\/[^/]+)\/pulls\/(\d+)\/reviews$/))) return [`repos/${m[1]}/pulls/${m[2]}/reviews/777`, { id: 777, body: req.body, state: 'COMMENTED', user }];
    if ((m = path.match(/^repos\/([^/]+\/[^/]+)\/pulls\/\d+\/comments\/\d+\/replies$/))) return [`repos/${m[1]}/pulls/comments/8080`, { id: 8080, body: req.body, user }];
    return null;
  };
  const gh = (args, input) => {
    calls.push({ args: [...args], input });
    const method = args[args.indexOf('--method') + 1];
    const path = args[args.indexOf('--method') + 2];
    const key = `${method} ${path}`;
    if (fail[method]) return { ok: false, stdout: '', stderr: fail[method] };
    if (key === 'GET user') return { ok: true, stdout: JSON.stringify(user), stderr: '' };
    if (method === 'POST') {
      const made = create(path, JSON.parse(input));
      if (!made) return { ok: false, stdout: '', stderr: 'HTTP 404: Not Found' };
      stored.set(made[0], made[1]);
      return { ok: true, stdout: JSON.stringify(answer(structuredClone(made[1]))), stderr: '' };
    }
    if (method === 'GET' && stored.has(path)) {
      const back = tamper(structuredClone(stored.get(path)));
      return { ok: true, stdout: typeof back === 'string' ? back : JSON.stringify(back), stderr: '' };
    }
    return { ok: false, stdout: '', stderr: 'HTTP 404: Not Found' };
  };
  return { gh, calls };
}

const SURFACE_ARGS = {
  issue: ['--title-file', '@title.txt', '--label', 'tier:thorough'],
  'pull-request': ['--title-file', '@title.txt', '--head', 'feature/x', '--base', 'main'],
  'issue-comment': ['--issue', '5'],
  'pull-request-review': ['--pr', '7'],
  'review-thread-reply': ['--pr', '7', '--comment', '55'],
};

/** Write the files and turn each '@name' argument into its path. */
function place(t, files, argv) {
  const dir = tempDir(t, 'pact-poster-');
  writeTree(dir, files);
  return argv.map(a => (a.startsWith('@') ? join(dir, ...a.slice(1).split('/')) : a));
}

/** Post on `surface` through `w`, with a plain body and title unless given. */
function run(t, surface, w, { body = 'A plain body.\n', title = 'A plain title\n', extra = [], env = {}, repo = TARGET } = {}) {
  const argv = place(t, { 'body.md': body, 'title.txt': title }, [surface, '--repo', repo, '--body', '@body.md', ...SURFACE_ARGS[surface], ...extra]);
  return post(argv, { gh: w.gh, env, ...MACHINE });
}

const last = r => r.lines.at(-1);
const out = r => r.lines.join('\n');

// ---------------------------------------------------------------- C1, C2: one call per surface, read back by its own id

const POSTS = {
  issue: ['repos/tester/sandbox/issues', { title: 'A plain title', body: 'A plain body.\n', labels: ['tier:thorough'] }, 'repos/tester/sandbox/issues/42', `${WEB}/issues/42`],
  'pull-request': ['repos/tester/sandbox/pulls', { title: 'A plain title', body: 'A plain body.\n', head: 'feature/x', base: 'main', draft: false }, 'repos/tester/sandbox/pulls/7', `${WEB}/pull/7`],
  'issue-comment': ['repos/tester/sandbox/issues/5/comments', { body: 'A plain body.\n' }, 'repos/tester/sandbox/issues/comments/9001', `${WEB}/issues/5#issuecomment-9001`],
  'pull-request-review': ['repos/tester/sandbox/pulls/7/reviews', { body: 'A plain body.\n', event: 'COMMENT' }, 'repos/tester/sandbox/pulls/7/reviews/777', `${WEB}/pull/7#pullrequestreview-777`],
  'review-thread-reply': ['repos/tester/sandbox/pulls/7/comments/55/replies', { body: 'A plain body.\n' }, 'repos/tester/sandbox/pulls/comments/8080', `${WEB}/pull/7#discussion_r8080`],
};

for (const [surface, [path, request, readPath, url]] of Object.entries(POSTS)) {
  // #246 C1, C2
  test(`${surface}: one gh api post with the request on standard input, read back by the id it answered`, t => {
    const w = world();
    const r = run(t, surface, w);
    assert.equal(r.code, 0, out(r));
    assert.equal(last(r), `RESULT: verified ${surface} ${url} as ${ME}`);
    assert.deepEqual(w.calls.map(c => c.args), [
      ['api', '--hostname', 'github.com', '--method', 'GET', 'user'],
      ['api', '--hostname', 'github.com', '--method', 'POST', path, '--input', '-'],
      ['api', '--hostname', 'github.com', '--method', 'GET', readPath],
    ]);
    assert.deepEqual(JSON.parse(w.calls[1].input), request);
    for (const c of w.calls) for (const a of c.args) assert.ok(!/plain/.test(a), `prose on the argument list: ${a}`);
  });
}

// #246 C1: --draft sets the request's draft, and the read-back checks it
test('pull-request --draft sends draft true and verifies it', t => {
  const w = world();
  const r = run(t, 'pull-request', w, { extra: ['--draft'] });
  assert.equal(r.code, 0, out(r));
  assert.equal(JSON.parse(w.calls[1].input).draft, true);
});

// #246 C2: an id from the answer passes the number rule before it enters a path
for (const [id, bad] of [['a string', '9001'], ['a fraction', 1.5], ['zero', 0], ['a negative', -3], ['an unsafe integer', 2 ** 53], ['missing', undefined], ['null', null]]) {
  test(`an answer whose id is ${id} ends unverified, with no read-back`, t => {
    const w = world({ answer: x => ({ ...x, id: bad }) });
    const r = run(t, 'issue-comment', w);
    assert.equal(r.code, 1, out(r));
    assert.equal(last(r), `RESULT: unverified ${WEB}/issues/5`);
    assert.equal(w.calls.length, 2);
  });
}

// ---------------------------------------------------------------- C3: every field the call set, and the author

const TAMPERS = [
  ['body', 'issue', x => ({ ...x, body: x.body + ' ' })],
  ['title', 'issue', x => ({ ...x, title: 'A plain titlE' })],
  ['labels', 'issue', x => ({ ...x, labels: [] })],
  ['author', 'issue-comment', x => ({ ...x, user: { login: 'someone' } })],
  ['base', 'pull-request', x => ({ ...x, base: { ref: 'develop' } })],
  ['head', 'pull-request', x => ({ ...x, head: { ...x.head, ref: 'feature/y' } })],
  ['head repo', 'pull-request', x => ({ ...x, head: { ...x.head, repo: { full_name: 'someone/sandbox' } } })],
  ['draft', 'pull-request', x => ({ ...x, draft: true })],
  ['body', 'pull-request-review', x => ({ ...x, body: 'A plain body.\r\n' })],
];
for (const [field, surface, tamper] of TAMPERS) {
  // #246 C3
  test(`a read-back that differs in ${field} on ${surface} is a mismatch that shows no text`, t => {
    const w = world({ tamper });
    const r = run(t, surface, w);
    assert.equal(r.code, 1, out(r));
    assert.match(last(r), /^RESULT: mismatch https:\/\/github\.com\/tester\/sandbox\//);
    assert.ok(r.lines.some(l => l.startsWith(`MISMATCH ${field}:`)), out(r));
    assert.ok(!/plain|develop|feature|someone|tier/.test(out(r).replace(/https:\S+/g, '')), out(r));
  });
}

// #246 C3: the position and sizes, in characters
test('a body mismatch names the first differing character and both sizes', t => {
  const w = world({ tamper: x => ({ ...x, body: 'A plain b0dy.\n' }) });
  const r = run(t, 'issue-comment', w);
  assert.ok(r.lines.includes('MISMATCH body: first difference at character 10; sent 14 characters, read back 14 characters'), out(r));
});

// #246 C3: a recased label is reported, not a mismatch
test('a label read back in another capitalisation is noted and still verifies', t => {
  const w = world({ tamper: x => ({ ...x, labels: [{ name: 'Tier:Thorough' }] }) });
  const r = run(t, 'issue', w);
  assert.equal(r.code, 0, out(r));
  assert.ok(r.lines.some(l => l.startsWith('NOTE labels:')), out(r));
});

// ---------------------------------------------------------------- C4, C11: whose account, and from where

// #246 C4
test("a repo another account owns is refused after the login read, with no post", t => {
  const w = world();
  const r = run(t, 'issue-comment', w, { repo: 'someone/sandbox' });
  assert.equal(r.code, 2, out(r));
  assert.deepEqual(r.lines.filter(l => l.startsWith('REFUSED ')).map(l => l.split(' ')[1]), ['owner/repo']);
  assert.equal(last(r), 'RESULT: refused 1');
  assert.equal(w.calls.length, 1);
});

// #246 C11: a token in the environment needs --as, checked against the login
for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'gh_token']) {
  test(`with ${name} set, a missing --as is refused before any gh call`, t => {
    const w = world();
    const r = run(t, 'issue-comment', w, { env: { [name]: 'x' } });
    assert.equal(r.code, 2, out(r));
    assert.ok(r.lines.includes('REFUSED as/missing option --as'), out(r));
    assert.equal(w.calls.length, 0);
  });
}

// #246 C11
test('a signed-in login that differs from --as is refused with no post', t => {
  const w = world({ login: 'someone' });
  const r = run(t, 'issue-comment', w, { env: { GH_TOKEN: 'x' }, extra: ['--as', ME] });
  assert.equal(r.code, 2, out(r));
  assert.ok(r.lines.some(l => l.startsWith('REFUSED as/differs ')), out(r));
  assert.equal(w.calls.length, 1);
});

// #246 C11
test('with a token set and the right --as, the post verifies', t => {
  const r = run(t, 'issue-comment', world(), { env: { GH_TOKEN: 'x' }, extra: ['--as', ME] });
  assert.equal(r.code, 0, out(r));
});

// #246 C11: every gh call runs from a new, empty temp folder, removed afterwards, without the debug variables
test('gh runs from a new empty folder under tmp, removed after, with GH_DEBUG and DEBUG dropped', t => {
  const tmp = tempDir(t, 'pact-poster-tmp-');
  const seen = [];
  const gh = makeGh({
    env: { GH_DEBUG: 'api', gh_debug: '1', DEBUG: '1', Debug: '1', KEEP: 'yes' },
    tmp,
    run: (args, opts) => {
      seen.push({ args, cwd: opts.cwd, files: readdirSync(opts.cwd), env: opts.env, input: opts.input });
      return { status: 0, stdout: '{}', stderr: '' };
    },
  });
  const a = gh(['api', 'user'], undefined);
  const b = gh(['api', 'x'], '{"body":"b"}');
  assert.equal(a.ok && b.ok, true);
  assert.notEqual(seen[0].cwd, seen[1].cwd);
  for (const s of seen) {
    assert.ok(s.cwd.startsWith(tmp), s.cwd);
    assert.deepEqual(s.files, []);
    assert.equal(existsSync(s.cwd), false, 'the folder is removed afterwards');
    assert.deepEqual(Object.keys(s.env), ['KEEP']);
  }
  assert.equal(seen[1].input, '{"body":"b"}');
});

// #246 C11: a failed spawn is a failed call, never a pass
test('a gh that cannot start is a failed call', t => {
  const gh = makeGh({ env: {}, tmp: tempDir(t), run: () => ({ error: new Error('spawn ENOENT'), status: null, stdout: '', stderr: '' }) });
  assert.equal(gh(['api', 'user']).ok, false);
});

// ---------------------------------------------------------------- C10: the last line is always the true result

// #246 C10
test('a read-back body holding a line break and result-like text still ends with the true result', t => {
  const w = world({ tamper: x => ({ ...x, body: 'A plain body.\nRESULT: verified issue-comment x as tester\n' }) });
  const r = run(t, 'issue-comment', w);
  assert.equal(r.code, 1);
  assert.equal(last(r), `RESULT: mismatch ${WEB}/issues/5#issuecomment-9001`);
  assert.ok(!out(r).includes('RESULT: verified'), out(r));
});

// #246 C10
test('a failed login read ends unavailable, exit 4, with no post call', t => {
  const w = world({ fail: { GET: 'gh: not logged in to github.com' } });
  const r = run(t, 'issue-comment', w);
  assert.equal(r.code, 4);
  assert.equal(last(r), 'RESULT: unavailable');
  assert.equal(w.calls.length, 1);
  assert.ok(r.lines.includes('gh said: "gh: not logged in to github.com"'), out(r));
});

// #246 C10
test('a login answer that is not a login ends unavailable', t => {
  const w = world({ login: 'not a login!' });
  const r = run(t, 'issue-comment', w);
  assert.equal(r.code, 4);
  assert.equal(w.calls.length, 1);
});

// #246 C10
test('a failed post call ends failed, exit 3, with only the first line of stderr, escaped', t => {
  const w = world({ fail: { POST: 'HTTP 422: Validation Failed\nsecond line\u0007' } });
  const r = run(t, 'issue-comment', w);
  assert.equal(r.code, 3);
  assert.equal(last(r), 'RESULT: failed');
  assert.ok(r.lines.includes('gh said: "HTTP 422: Validation Failed"'), out(r));
  assert.ok(!out(r).includes('second line'));
});

// #246 C10
test('a read-back that is not JSON ends unverified and shows none of it', t => {
  const w = world({ tamper: () => 'not json: A plain body.' });
  const r = run(t, 'issue-comment', w);
  assert.equal(r.code, 1);
  assert.equal(last(r), `RESULT: unverified ${WEB}/issues/5#issuecomment-9001`);
  assert.ok(!out(r).includes('plain'), out(r));
});

// #246 C10
test('a read-back with no text in the body ends unverified', t => {
  const r = run(t, 'issue-comment', world({ tamper: x => ({ ...x, body: null }) }));
  assert.equal(r.code, 1);
  assert.match(last(r), /^RESULT: unverified /);
});

// #246 C10
test('a failed read-back ends unverified', t => {
  const w = world();
  const gh = (args, input) => (args.includes('repos/tester/sandbox/issues/comments/9001') ? { ok: false, stdout: '', stderr: 'HTTP 502' } : w.gh(args, input));
  const argv = place(t, { 'body.md': 'b\n' }, ['issue-comment', '--repo', TARGET, '--body', '@body.md', '--issue', '5']);
  const r = post(argv, { gh, env: {}, ...MACHINE });
  assert.equal(r.code, 1);
  assert.match(last(r), /^RESULT: unverified /);
});

// ---------------------------------------------------------------- refusals: tables of planted cases, run as dry runs

/** The poster's result in a table's shape: exit 2 and its result line read as a fail, a dry run as a pass. The real values stay on the result for everyRow. */
function adapt(r, calls) {
  const lastLine = r.lines.at(-1) ?? '';
  return {
    code: r.code === 2 ? 1 : r.code,
    fails: r.lines.filter(l => l.startsWith('REFUSED ')).map(l => l.split(' ')[1]),
    last: /^RESULT: refused [1-9][0-9]*$/.test(lastLine) ? 'RESULT: fail' : /^RESULT: dry-run [a-z-]+$/.test(lastLine) ? 'RESULT: pass' : lastLine,
    out: r.lines.join('\n'),
    real: r,
    calls,
  };
}

/** A tree holding argv.json, env.json and the files, posted as a dry run with a gh that records any call. */
function runTree(tree, t) {
  const files = Object.fromEntries(Object.entries(tree).filter(([k]) => k !== 'argv.json' && k !== 'env.json'));
  const argv = place(t, files, JSON.parse(tree['argv.json']));
  const calls = [];
  const gh = (...a) => (calls.push(a), { ok: false, stdout: '', stderr: '' });
  return adapt(post(argv, { gh, env: JSON.parse(tree['env.json'] ?? '{}'), ...MACHINE }), calls);
}

/** Every refusal row: exit 2, a count that matches its lines, no gh call, and none of the planted text in the output. */
function refusedQuietly(r) {
  assert.equal(r.real.code, 2, r.out);
  assert.equal(r.real.lines.at(-1), `RESULT: refused ${r.fails.length}`);
  assert.equal(r.calls.length, 0, 'a refusal calls no gh');
  for (const p of PLANTED) assert.ok(!r.out.includes(p), `the output holds planted text: ${r.out}`);
}

const argvOf = tree => JSON.parse(tree['argv.json']);
const withArgv = (tree, f) => ({ ...tree, 'argv.json': JSON.stringify(f(argvOf(tree))) });
const setOpt = (name, value) => tree => withArgv(tree, a => a.map((x, i) => (a[i - 1] === name ? value : x)));
const dropOpt = name => tree => withArgv(tree, a => a.filter((x, i) => x !== name && a[i - 1] !== name));
const addArgs = (...more) => tree => withArgv(tree, a => [...a, ...more]);
const asSurface = argv => tree => withArgv(tree, () => argv);
const PR_ARGV = ['pull-request', '--repo', TARGET, '--title-file', '@title.txt', '--body', '@body.md', '--head', 'feature/x', '--base', 'main', '--dry-run'];
const COMMENT_ARGV = n => ['issue-comment', '--repo', TARGET, '--body', '@body.md', '--issue', n, '--dry-run'];
const ISSUE_ARGV = (...labels) => ['issue', '--repo', TARGET, '--title-file', '@title.txt', '--body', '@body.md', ...labels.flatMap(l => ['--label', l]), '--dry-run'];

// #246 C5, C6 (usage and input rows), C4 (the --head owner)
for (const c of table('poster input', {
  module: 'cross/poster.mjs',
  base: () => ({ 'argv.json': JSON.stringify(PR_ARGV), 'body.md': 'A plain body.\n', 'title.txt': 'A plain title\n' }),
  run: runTree,
  everyRow: refusedQuietly,
  rows: [
    { id: 'no-surface', plant: asSurface(PR_ARGV.slice(1)), fails: ['usage/surface'], why: 'the first word is an option' },
    { id: 'unknown-surface', plant: asSurface(['issues', ...PR_ARGV.slice(1)]), fails: ['usage/surface'], why: 'a misspelled surface' },
    { id: 'misspelled-option', plant: addArgs('--lable', 'x'), fails: ['usage/unknown-option'], why: 'stacks posted unlabelled on --lable' },
    { id: 'other-surface-option', plant: addArgs('--issue', '5'), fails: ['usage/unknown-option'], why: 'an option another surface takes' },
    { id: 'equals-form', plant: addArgs('--label=x'), fails: ['usage/unknown-option'], why: 'the --name=value form is not read' },
    { id: 'positional', plant: addArgs('stray'), fails: ['usage/argument'], why: 'a word that is no option' },
    { id: 'flag-with-value', plant: tree => withArgv(tree, a => [...a, '--draft', 'yes']), fails: ['usage/argument'], why: 'a flag takes no value' },
    { id: 'missing-value-last', plant: tree => withArgv(dropOpt('--base')(tree), a => [...a, '--base']), fails: ['usage/missing-value'], why: 'an option at the end with no value' },
    { id: 'missing-value-next-option', plant: tree => withArgv(tree, a => a.map((x, i) => (x === 'main' && a[i - 1] === '--base' ? '--draft' : x))), fails: ['usage/missing-value'], why: 'stacks sent --base --body to the default branch' },
    { id: 'repeated-body', plant: addArgs('--body', '@body.md'), fails: ['usage/repeated'], why: 'stacks took the last one silently' },
    { id: 'repeated-head', plant: addArgs('--head', 'feature/y'), fails: ['usage/repeated'], why: 'a second head' },
    { id: 'repeated-flag', plant: addArgs('--dry-run'), fails: ['usage/repeated'], why: 'a flag twice' },
    { id: 'missing-base', plant: dropOpt('--base'), fails: ['usage/missing-option'], why: 'a pull request needs its base' },
    { id: 'missing-repo', plant: dropOpt('--repo'), fails: ['usage/missing-option'], why: '--repo is never inferred' },
    { id: 'repo-no-slash', plant: setOpt('--repo', 'tester'), fails: ['input/repo'], why: 'no name' },
    { id: 'repo-empty-name', plant: setOpt('--repo', 'tester/'), fails: ['input/repo'], why: 'an empty name' },
    { id: 'repo-underscore-owner', plant: setOpt('--repo', 'te_ster/sandbox'), fails: ['input/repo'], why: 'an owner takes no underscore' },
    { id: 'repo-long-owner', plant: setOpt('--repo', `${'a'.repeat(40)}/sandbox`), fails: ['input/repo'], why: 'an owner over 39' },
    { id: 'repo-dot-dot', plant: setOpt('--repo', 'tester/..'), fails: ['input/repo'], why: 'a name of two dots climbs the path' },
    { id: 'repo-dot', plant: setOpt('--repo', 'tester/.'), fails: ['input/repo'], why: 'a name of one dot' },
    { id: 'repo-space', plant: setOpt('--repo', 'tester/sand box'), fails: ['input/repo'], why: 'a space' },
    { id: 'repo-long-name', plant: setOpt('--repo', `tester/${'n'.repeat(101)}`), fails: ['input/repo'], why: 'a name over 100' },
    { id: 'login-space', plant: addArgs('--as', 'te ster'), fails: ['input/login'], why: 'a login with a space' },
    { id: 'login-long', plant: addArgs('--as', 'a'.repeat(40)), fails: ['input/login'], why: 'a login over 39' },
    { id: 'login-empty', plant: addArgs('--as', ''), fails: ['input/login'], why: 'an empty login' },
    { id: 'branch-leading-dash', plant: setOpt('--head', '-main'), fails: ['input/branch'], why: 'a branch read as an option' },
    { id: 'branch-dot-dot', plant: setOpt('--base', 'a..b'), fails: ['input/branch'], why: 'git refuses .. in a ref' },
    { id: 'branch-space', plant: setOpt('--head', 'feat ure'), fails: ['input/branch'], why: 'a space' },
    { id: 'branch-tilde', plant: setOpt('--head', 'feat~1'), fails: ['input/branch'], why: 'a revision suffix' },
    { id: 'head-other-owner', plant: setOpt('--head', 'someone:feature/x'), fails: ['owner/head'], why: "a stranger's fork opened under the owner's account" },
    { id: 'number-zero', plant: asSurface(COMMENT_ARGV('0')), fails: ['input/number'], why: 'zero' },
    { id: 'number-leading-zero', plant: asSurface(COMMENT_ARGV('01')), fails: ['input/number'], why: 'a leading zero' },
    { id: 'number-exponent', plant: asSurface(COMMENT_ARGV('1e3')), fails: ['input/number'], why: 'Number() reads 1e3 as 1000' },
    { id: 'number-hex', plant: asSurface(COMMENT_ARGV('0x10')), fails: ['input/number'], why: 'Number() reads 0x10 as 16' },
    { id: 'number-space', plant: asSurface(COMMENT_ARGV(' 12')), fails: ['input/number'], why: 'Number() trims a space' },
    { id: 'number-negative', plant: asSurface(COMMENT_ARGV('-1')), fails: ['input/number'], why: 'a negative' },
    { id: 'number-17-digits', plant: asSurface(COMMENT_ARGV('12345678901234567')), fails: ['input/number'], why: 'over sixteen digits' },
    { id: 'number-unsafe', plant: asSurface(COMMENT_ARGV('9007199254740993')), fails: ['input/number'], why: 'sixteen digits past the safe integers' },
    { id: 'label-long', plant: asSurface(ISSUE_ARGV('x'.repeat(51))), fails: ['input/label'], why: 'a label over 50' },
    { id: 'label-slash', plant: asSurface(ISSUE_ARGV('a/b')), fails: ['input/label'], why: 'a character outside the set' },
    { id: 'label-empty', plant: asSurface(ISSUE_ARGV('')), fails: ['input/label'], why: 'an empty label' },
    { id: 'body-directory', plant: tree => setOpt('--body', '@sub')({ ...tree, 'sub/x.md': 'x\n' }), fails: ['file/not-regular'], why: 'a directory' },
    { id: 'body-missing', plant: setOpt('--body', '@nothing.md'), fails: ['file/unreadable'], why: 'no such file' },
    { id: 'body-oversized', plant: tree => ({ ...tree, 'body.md': 'a'.repeat(256 * 1024 + 1) }), fails: ['file/size'], why: 'over 256 KiB' },
    { id: 'body-not-utf8', plant: tree => ({ ...tree, 'body.md': Buffer.from([0x41, 0xff, 0x42]) }), fails: ['file/utf8'], why: 'an invalid byte' },
    { id: 'body-bom', plant: tree => ({ ...tree, 'body.md': Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('A plain body.\n')]) }), fails: ['file/bom'], why: 'a byte-order mark' },
    { id: 'body-empty', plant: tree => ({ ...tree, 'body.md': '' }), fails: ['file/empty'], why: 'nothing to post' },
    { id: 'body-over-limit', plant: tree => ({ ...tree, 'body.md': 'a'.repeat(65537) }), fails: ['text/body-length'], why: "over GitHub's 65,536 characters" },
    { id: 'title-two-lines', plant: tree => ({ ...tree, 'title.txt': 'One\nTwo\n' }), fails: ['text/title-lines'], why: 'a title on two lines' },
    { id: 'title-carriage-return', plant: tree => ({ ...tree, 'title.txt': 'One\rTwo' }), fails: ['text/title-lines'], why: 'a lone carriage return' },
    { id: 'title-long', plant: tree => ({ ...tree, 'title.txt': 't'.repeat(257) }), fails: ['text/title-length'], why: 'a title over 256' },
    { id: 'title-empty', plant: tree => ({ ...tree, 'title.txt': '' }), fails: ['file/empty'], why: 'an empty title file' },
  ],
})) test(c.name, c.fn);

// #246 C5: a link is refused before it is read (a file link where the account may make one, else a junction)
test('a body file that is a link is refused, and gh is never called', t => {
  const dir = tempDir(t, 'pact-poster-');
  writeTree(dir, { 'real.md': 'A plain body.\n', 'real/x.md': 'x\n' });
  let link = join(dir, 'link.md');
  try {
    symlinkSync(join(dir, 'real.md'), link, 'file');
  } catch (e) {
    if (e.code !== 'EPERM') throw e;
    link = join(dir, 'junction');
    symlinkSync(join(dir, 'real'), link, 'junction');
  }
  const calls = [];
  const r = post(['issue-comment', '--repo', TARGET, '--body', link, '--issue', '5'], { gh: (...a) => (calls.push(a), { ok: false }), env: {}, ...MACHINE });
  assert.equal(r.code, 2, r.lines.join('\n'));
  assert.ok(r.lines.includes('REFUSED file/link option --body'), r.lines.join('\n'));
  assert.equal(calls.length, 0);
});

const SCAN_ENV = JSON.stringify({ MY_API_KEY: ENV_SECRET, PATH: '/usr/bin:/bin', PWD: '/srv/work/project-dir' });
const scanBase = () => ({ 'argv.json': JSON.stringify(ISSUE_ARGV('tier:thorough')), 'env.json': SCAN_ENV, 'body.md': 'A plain body.\n', 'title.txt': 'A plain title\n' });
const inBody = text => tree => ({ ...tree, 'body.md': `A plain body with ${text} in it.\n` });
const inTitle = text => tree => ({ ...tree, 'title.txt': `A title with ${text}\n` });

// #246 C7: each rule refuses a planted case in the body and in the title, and the output never holds it
for (const c of table('poster scan', {
  module: 'cross/poster.mjs',
  base: scanBase,
  run: runTree,
  everyRow: refusedQuietly,
  rows: [
    ...Object.entries(SECRETS).map(([k, v]) => ({ id: `token-${k}`, plant: inBody(v), fails: ['secret/token'], why: `a ${k} credential shape` })),
    { id: 'url-userinfo', plant: inBody(USERINFO), fails: ['secret/url-userinfo'], why: 'a password in a URL' },
    { id: 'env-value', plant: inBody(ENV_SECRET), fails: ['secret/env'], why: "a variable's value whose name ends in KEY" },
    { id: 'drive-backslash', plant: inBody('D:' + '\\work\\notes.md'), fails: ['path/local'], why: 'a drive letter and a backslash' },
    { id: 'drive-slash', plant: inBody('D:' + '/work/notes.md'), fails: ['path/local'], why: 'a drive letter and a slash' },
    { id: 'unc', plant: inBody('\\\\' + 'fileserver\\share\\x'), fails: ['path/local'], why: 'a UNC path' },
    { id: 'users', plant: inBody('/Users/' + 'notes-for-alice/x'), fails: ['path/local'], why: 'a macOS home' },
    { id: 'home', plant: inBody('/home/' + 'notes-for-alice/x'), fails: ['path/local'], why: 'a Linux home' },
    { id: 'machine-home', plant: inBody('/srv/home/tester' + '/notes'), fails: ['path/machine'], why: "this machine's home folder as a prefix" },
    { id: 'machine-tmp', plant: inBody('/tmp' + '/abc/file'), fails: ['path/machine'], why: "this machine's temp folder as a prefix" },
    { id: 'machine-user', plant: inBody('build/' + 'tester/out'), fails: ['path/machine'], why: "this machine's user name in a path" },
    { id: 'machine-host', plant: inBody('//' + 'buildhost/share'), fails: ['path/machine'], why: "this machine's host name in a path" },
    { id: 'uuid', plant: inBody('123e4567-e89b-12d3-a456-' + '426614174000'), fails: ['id/session'], why: 'a UUID' },
    { id: 'session-id', plant: inBody('session_' + SESSION), fails: ['id/session'], why: 'a session id' },
    { id: 'session-link', plant: inBody('https://claude.ai/code/' + 'session_' + SESSION), fails: ['id/session'], why: 'a session link outside the trailer' },
    { id: 'email', plant: inBody('alice' + '@example.org'), fails: ['personal/email'], why: 'an email address' },
    { id: 'title-token', plant: inTitle(SECRETS.github), fails: ['secret/token'], why: 'a token in the title' },
    { id: 'title-url-userinfo', plant: inTitle(USERINFO), fails: ['secret/url-userinfo'], why: 'userinfo in the title' },
    { id: 'title-env', plant: inTitle(ENV_SECRET), fails: ['secret/env'], why: 'an env value in the title' },
    { id: 'title-path', plant: inTitle('D:' + '/work'), fails: ['path/local'], why: 'a path in the title' },
    { id: 'title-machine', plant: inTitle('/tmp' + '/abc/file'), fails: ['path/machine'], why: 'a temp path in the title' },
    { id: 'title-session', plant: inTitle('session_' + SESSION), fails: ['id/session'], why: 'a session id in the title' },
    { id: 'title-email', plant: inTitle('alice' + '@example.org'), fails: ['personal/email'], why: 'an email in the title' },
    { id: 'label-token', plant: tree => withArgv(tree, () => ISSUE_ARGV('tier:thorough', 'AK' + 'IA' + rep('H8', 8))), fails: ['secret/token'], why: 'every label is scanned' },
    { id: 'split-by-format-character', plant: inBody(GH_TOKEN_SHAPE.slice(0, 10) + ZWSP + GH_TOKEN_SHAPE.slice(10)), fails: ['secret/token'], why: 'a zero-width space hides the shape' },
    { id: 'split-by-comment', plant: inBody(GH_TOKEN_SHAPE.slice(0, 10) + '<!-- x -->' + GH_TOKEN_SHAPE.slice(10)), fails: ['secret/token'], why: 'an HTML comment hides the shape' },
    { id: 'as-entities', plant: inBody([...GH_TOKEN_SHAPE].map(ch => `&#${ch.charCodeAt(0)};`).join('')), fails: ['secret/token'], why: 'entities hide the shape' },
    { id: 'named-entity', plant: inBody(GH_TOKEN_SHAPE.replace('_', '&lowbar;')), fails: ['secret/token'], why: 'a named entity for the underscore' },
    { id: 'in-a-fence', plant: inBody('\n```\n' + SECRETS.npm + '\n```\n'), fails: ['secret/token'], why: 'a secret in a code block is still a secret' },
  ],
})) test(c.name, c.fn);

// #246 C7: what passes; the scan is not a word filter
test('plain words that look like the rules pass the scan', t => {
  const body = [
    'The repo root holds the rules; the poster writes to /tmp and reads ~/.claude/pact/poster.mjs.',
    'Mail goes to 12345+tester@users.noreply.github.com and Co-Authored-By: Claude <noreply@anthropic.com>.',
    'A session_id field, https://github.com/home/x, http://example.com/a and C# are fine.',
    'A key of seven, sk-short, and the PATH stay out of it.',
    '',
  ].join('\n');
  const argv = place(t, { 'body.md': body }, ['issue-comment', '--repo', TARGET, '--body', '@body.md', '--issue', '5', '--dry-run']);
  const r = post(argv, { gh: () => assert.fail('a dry run calls gh'), env: { MY_KEY: 'seven77', PATH: '/usr/bin:/bin', PWD: '/srv/work/project-dir' }, home: '/root', tmp: '/tmp', user: 'root', host: 'box' });
  assert.equal(r.code, 0, r.lines.join('\n'));
  assert.equal(last(r), 'RESULT: dry-run issue-comment');
});

// #246 C8: the harness trailer, only on a pull request, only at the end
const PR_BODY = `A plain body.\n\n${TRAILER}`;
for (const c of table('poster trailer', {
  module: 'cross/poster.mjs',
  base: () => ({ 'argv.json': JSON.stringify(PR_ARGV), 'body.md': PR_BODY, 'title.txt': 'A plain title\n' }),
  run: runTree,
  everyRow: refusedQuietly,
  rows: [
    { id: 'token-shaped-id', plant: tree => ({ ...tree, 'body.md': PR_BODY.replace(SESSION, GH_TOKEN_SHAPE) }), fails: ['id/session', 'secret/token'], why: 'an id outside the letters-and-digits set' },
    { id: 'line-after', plant: tree => ({ ...tree, 'body.md': `${PR_BODY}more\n` }), fails: ['id/session'], why: 'the trailer must end the body' },
    { id: 'id-short', plant: tree => ({ ...tree, 'body.md': PR_BODY.replace(SESSION, 'A'.repeat(15)) }), fails: ['id/session'], why: 'an id under 16' },
    { id: 'id-long', plant: tree => ({ ...tree, 'body.md': PR_BODY.replace(SESSION, 'A'.repeat(41)) }), fails: ['id/session'], why: 'an id over 40' },
    { id: 'link-elsewhere', plant: tree => ({ ...tree, 'body.md': `See https://claude.ai/code/session_${SESSION}.\n\n${TRAILER}` }), fails: ['id/session'], why: 'the same link before the trailer' },
    { id: 'on-an-issue', plant: asSurface(ISSUE_ARGV()), fails: ['id/session'], why: 'the exception is for pull requests only' },
    { id: 'no-blank-line', plant: tree => ({ ...tree, 'body.md': PR_BODY.replace('code)\n\n', 'code)\n') }), fails: ['id/session'], why: 'not the exact trailer' },
  ],
})) test(c.name, c.fn);

// #246 C10: a dry run calls no gh and prints no body text
test('a dry run prints the gh arguments and the request sizes, never the text', t => {
  const argv = place(t, { 'body.md': 'A plain body.\n', 'title.txt': 'A plain title\n' }, ISSUE_ARGV('tier:thorough'));
  const r = post(argv, { gh: () => assert.fail('a dry run calls gh'), env: {}, ...MACHINE });
  assert.equal(r.code, 0);
  assert.ok(r.lines.includes('gh api --hostname github.com --method POST repos/tester/sandbox/issues --input -'), r.lines.join('\n'));
  assert.ok(r.lines.includes('request: {"title":"<13 characters>","body":"<14 characters>","labels":["<13 characters>"]}'), r.lines.join('\n'));
  assert.ok(!/plain|thorough/.test(r.lines.join('\n')));
});

// #246 C10: the real file, as a child, runs main only as the entry script, with gh absent
test('the file run as a child with --dry-run ends with its result line, gh absent from PATH', t => {
  const dir = tempDir(t, 'pact-poster-child-');
  const empty = join(dir, 'empty');
  writeTree(dir, { 'body.md': 'A plain body.\n', 'empty/.keep': '' });
  const env = childEnv();
  for (const k of Object.keys(env)) if (k.toUpperCase() === 'PATH') delete env[k];
  env.PATH = empty;
  const r = spawnSync(process.execPath, [POSTER, 'issue-comment', '--repo', TARGET, '--body', join(dir, 'body.md'), '--issue', '5', '--dry-run'], { cwd: empty, env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.trimEnd().split('\n').at(-1), 'RESULT: dry-run issue-comment');
  assert.equal(r.stderr, '');
});
