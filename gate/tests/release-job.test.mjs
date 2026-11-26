// PACT-105 C23 and spec 0007 S10: what the release job's one script does,
// run as the workflow writes it, and what the owner's promote command does,
// both against a local stand-in for GitHub's API.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { test } from 'node:test';
import { tokenFor } from '../release-promote.mjs';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const WORKFLOW = join(REPO, '.github', 'workflows', 'release.yml');
const PROMOTE = join(REPO, 'gate', 'release-promote.mjs');
const sha = c => c.repeat(40);

/** The script of the workflow's one run block. */
function script() {
  const src = readFileSync(WORKFLOW, 'utf8').replace(/\r\n/g, '\n');
  const parts = src.split('\n        run: |\n');
  assert.equal(parts.length, 2, 'one run block, in the one job');
  // The block ends at the first line indented less than the script.
  const lines = parts[1].split('\n');
  const end = lines.findIndex(l => l.trim() !== '' && !l.startsWith(' '.repeat(10)));
  return (end < 0 ? lines : lines.slice(0, end)).map(l => l.slice(10)).join('\n');
}

/**
 * One run of the workflow's script, or with `job: 'promote'` of the owner's
 * command, `node gate/release-promote.mjs <rc>`. `tips` are main's tip at each read, the last one
 * repeating; `refs` maps a tag name to its object; `tags` an annotated tag
 * object's id to the commit it names. Returns the code, the output, every tag
 * the script created and the tokens it sent.
 */
async function release(t, { tips = [sha('a')], refs = {}, tags = {}, head = sha('a'), token = 'test-token', fail = null, job = 'candidate', rc = '' } = {}) {
  const created = [];
  const sent = new Set();
  let reads = 0;
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', d => (body += d));
    req.on('end', () => {
      sent.add(req.headers.authorization);
      const path = req.url.replace('/repos/o/r/', '');
      const answer = (status, doc) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(doc));
      if (fail && path.startsWith(fail)) return answer(500, {});
      if (req.method === 'GET' && path === 'git/ref/heads/main') return answer(200, { object: { type: 'commit', sha: tips[Math.min(reads++, tips.length - 1)] } });
      if (req.method === 'GET' && path === 'git/matching-refs/tags/v1.') return answer(200, Object.entries(refs).map(([name, object]) => ({ ref: `refs/tags/${name}`, object })));
      const tag = /^git\/tags\/([0-9a-f]{40})$/.exec(path);
      if (req.method === 'GET' && tag) return answer(200, { object: { type: 'commit', sha: tags[tag[1]] } });
      if (req.method === 'POST' && path === 'git/refs') {
        created.push(JSON.parse(body));
        return answer(201, {});
      }
      return answer(404, {});
    });
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => server.close());
  const api = { GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`, GITHUB_REPOSITORY: 'o/r' };
  const env = { ...process.env, ...api };
  delete env.NODE_OPTIONS;
  let args;
  if (job === 'promote') {
    // The owner's command reads the token from GH_TOKEN, and never from the workflow's variables.
    delete env.TOKEN;
    env.GH_TOKEN = token;
    args = [PROMOTE, rc];
  } else {
    const file = join(tempDir(t, 'pact-release-'), 'step');
    writeFileSync(file, script());
    Object.assign(env, { TOKEN: token, HEAD_SHA: head });
    args = [file];
  }
  const child = spawn(process.execPath, args, { env, timeout: 60_000 });
  let out = '';
  for (const s of [child.stdout, child.stderr]) s.on('data', d => (out += d));
  const code = await new Promise(done => child.on('close', done));
  return { code, out, created, sent: [...sent] };
}

const commit = c => ({ type: 'commit', sha: sha(c) });
const RC_ONLY = /^refs\/tags\/v1\.\d+\.0-rc\.\d+$/;

test('release job: on a push with no release yet it tags main\'s tip v1.1.0-rc.1, with the token it was handed', async t => {
  const got = await release(t);
  assert.equal(got.code, 0, got.out);
  assert.deepEqual(got.created, [{ ref: 'refs/tags/v1.1.0-rc.1', sha: sha('a') }]);
  assert.deepEqual(got.sent, ['Bearer test-token']);
});

test('release job: a push numbers the next minor after the highest stable release, and counts candidates of that minor, ignoring other names', async t => {
  const refs = { 'v1.2.0': commit('b'), 'v1.10.0': commit('c'), 'v1.12.0-rc.9': commit('b'), 'v1.11.0-rc.1': commit('b'), 'v1.11.0-rc.3': commit('c'), 'v1.99.1': commit('d'), 'v1.011.0': commit('d'), 'v1.50.0-rc1': commit('d'), 'v1.11.0-rc.03': commit('d') };
  const got = await release(t, { refs });
  assert.deepEqual(got.created, [{ ref: 'refs/tags/v1.11.0-rc.4', sha: sha('a') }], got.out);
  // Bad case: candidates of a minor already released do not count toward the next one.
  const next = await release(t, { refs: { 'v1.3.0': commit('b'), 'v1.3.0-rc.7': commit('c') } });
  assert.deepEqual(next.created, [{ ref: 'refs/tags/v1.4.0-rc.1', sha: sha('a') }], next.out);
});

test('release job: a push never makes a stable tag or a major, whatever the tags hold', async t => {
  for (const refs of [{}, { 'v1.1.0': commit('b') }, { 'v1.1.0-rc.1': commit('b') }, { 'v2.0.0': commit('b'), 'v1.4.0-rc.2': commit('c') }]) {
    const got = await release(t, { refs });
    assert.equal(got.created.length, 1, got.out);
    assert.match(got.created[0].ref, RC_ONLY, JSON.stringify(refs));
  }
});

test('release job: tags nothing when the run\'s commit is not main\'s tip', async t => {
  const got = await release(t, { head: sha('b') });
  assert.equal(got.code, 0, got.out);
  assert.deepEqual(got.created, []);
});

test('release job: tags nothing when main moves between its first read and the tag', async t => {
  const got = await release(t, { tips: [sha('a'), sha('b')] });
  assert.equal(got.code, 0, got.out);
  assert.deepEqual(got.created, []);
});

test('release job: tags nothing when a release or candidate already points at the commit, an annotated one included', async t => {
  assert.deepEqual((await release(t, { refs: { 'v1.1.0': commit('a') } })).created, []);
  assert.deepEqual((await release(t, { refs: { 'v1.2.0-rc.1': commit('a') } })).created, []);
  assert.deepEqual((await release(t, { refs: { 'v1.1.0': { type: 'tag', sha: sha('e') } }, tags: { [sha('e')]: sha('a') } })).created, []);
});

test('release job: fails and tags nothing with no token, a malformed commit or a failed read', async t => {
  for (const plant of [{ token: '' }, { head: 'main' },{ fail: 'git/matching-refs' }, { fail: 'git/ref/heads/main' }]) {
    const got = await release(t, plant);
    assert.equal(got.code, 1, `${JSON.stringify(plant)} ${got.out}`);
    assert.deepEqual(got.created, []);
    assert.doesNotMatch(got.out, /test-token/);
  }
});

const promote = (t, rc, more = {}) => release(t, { job: 'promote', rc, ...more });

test('promote command: tags the named candidate\'s commit with its stable release, an annotated candidate included, with the token it was given', async t => {
  const refs = { 'v1.1.0': commit('b'), 'v1.2.0-rc.1': commit('c'), 'v1.2.0-rc.2': commit('d') };
  const got = await promote(t, 'v1.2.0-rc.1', { refs });
  assert.equal(got.code, 0, got.out);
  assert.deepEqual(got.created, [{ ref: 'refs/tags/v1.2.0', sha: sha('c') }]);
  assert.match(got.out, /v1\.2\.0 on c{40}/);
  assert.deepEqual(got.sent, ['Bearer test-token']);
  const annotated = await promote(t, 'v1.2.0-rc.2', { refs: { ...refs, 'v1.2.0-rc.2': { type: 'tag', sha: sha('e') } }, tags: { [sha('e')]: sha('d') } });
  assert.deepEqual(annotated.created, [{ ref: 'refs/tags/v1.2.0', sha: sha('d') }], annotated.out);
  // With no stable release yet, the first minor is the next.
  assert.deepEqual((await promote(t, 'v1.1.0-rc.1', { refs: { 'v1.1.0-rc.1': commit('c') } })).created, [{ ref: 'refs/tags/v1.1.0', sha: sha('c') }]);
});

test('promote command: refuses, and tags nothing, a missing token, an input that is not a candidate tag, a candidate that does not exist, a minor already released or one that is not the next', async t => {
  const refs = { 'v1.1.0': commit('b'), 'v1.2.0': commit('b'), 'v1.2.0-rc.1': commit('c'), 'v1.3.0-rc.1': commit('c'), 'v1.5.0-rc.1': commit('d') };
  for (const [what, rc, more] of [
    ['an empty token', 'v1.3.0-rc.1', { token: '' }],
    ['a stable tag', 'v1.3.0'],
    ['a major candidate', 'v2.3.0-rc.1'],
    ['a zero candidate number', 'v1.3.0-rc.0'],
    ['the old candidate spelling', 'v1.3.0-rc1'],
    ['trailing text', 'v1.3.0-rc.1 '],
    ['a branch name', 'main'],
    ['nothing', ''],
    ['a candidate that does not exist', 'v1.3.0-rc.2'],
    ['a minor already released', 'v1.2.0-rc.1'],
    ['a minor past the next', 'v1.5.0-rc.1'],
  ]) {
    const got = await promote(t, rc, { refs, ...more });
    assert.equal(got.code, 1, `${what}: ${got.out}`);
    assert.deepEqual(got.created, [], what);
    assert.equal(got.out.trim().split('\n').length, 1, `${what}: one line`);
    assert.doesNotMatch(got.out, /test-token/);
    if (more) assert.deepEqual(got.sent, [], `${what}: no request was made`);
  }
  // Control: the next minor's candidate passes against the same tags.
  assert.deepEqual((await promote(t, 'v1.3.0-rc.1', { refs })).created, [{ ref: 'refs/tags/v1.3.0', sha: sha('c') }]);
});

test('promote command: a run that cannot read the tags fails and tags nothing', async t => {
  const got = await promote(t, 'v1.1.0-rc.1', { refs: { 'v1.1.0-rc.1': commit('c') }, fail: 'git/matching-refs' });
  assert.equal(got.code, 1, got.out);
  assert.deepEqual(got.created, []);
});

test('promote command: the token is GH_TOKEN when set, else what gh auth token prints, and an empty one or a failing gh is refused', () => {
  const gh = out => (program, args) => {
    assert.deepEqual([program, ...args], ['gh', 'auth', 'token']);
    if (out instanceof Error) throw out;
    return out;
  };
  assert.equal(tokenFor({ GH_TOKEN: 'given' }, gh(new Error('must not run gh'))), 'given');
  assert.equal(tokenFor({}, gh('from-gh\n')), 'from-gh');
  // Bad cases: set but empty is not "unset", so gh's token is never swapped in; nor is an empty gh answer or a failed gh run accepted.
  assert.throws(() => tokenFor({ GH_TOKEN: '' }, gh('from-gh\n')), /No token/);
  assert.throws(() => tokenFor({}, gh('\n')), /No token/);
  assert.throws(() => tokenFor({}, gh(new Error('not signed in'))), /No token/);
});
