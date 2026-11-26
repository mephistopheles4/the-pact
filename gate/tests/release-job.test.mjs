// PACT-105 C23 and spec 0007 S10: what the release job's one script does,
// run as the workflow writes it against a local stand-in for GitHub's API.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const WORKFLOW = join(REPO, '.github', 'workflows', 'release.yml');
const sha = c => c.repeat(40);

/** The script of the workflow's one run block, which ends the file. */
function script() {
  const src = readFileSync(WORKFLOW, 'utf8').replace(/\r\n/g, '\n');
  const parts = src.split('\n        run: |\n');
  assert.equal(parts.length, 2, 'one run block');
  return parts[1].split('\n').map(l => l.slice(10)).join('\n');
}

/**
 * One run of the script. `tips` are main's tip at each read, the last one
 * repeating; `refs` maps a tag name to its object; `tags` an annotated tag
 * object's id to the commit it names. Returns the code, the output, every tag
 * the script created and the tokens it sent.
 */
async function release(t, { tips = [sha('a')], refs = {}, tags = {}, head = sha('a'), token = 'test-token', fail = null } = {}) {
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
  const file = join(tempDir(t, 'pact-release-'), 'step');
  writeFileSync(file, script());
  const env = { ...process.env, TOKEN: token, HEAD_SHA: head, GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`, GITHUB_REPOSITORY: 'o/r' };
  delete env.NODE_OPTIONS;
  const child = spawn(process.execPath, [file], { env, timeout: 60_000 });
  let out = '';
  for (const s of [child.stdout, child.stderr]) s.on('data', d => (out += d));
  const code = await new Promise(done => child.on('close', done));
  return { code, out, created, sent: [...sent] };
}

const commit = c => ({ type: 'commit', sha: sha(c) });

test('release job: with no release yet it tags main\'s tip v1.1.0, with the token it was handed', async t => {
  const got = await release(t);
  assert.equal(got.code, 0, got.out);
  assert.deepEqual(got.created, [{ ref: 'refs/tags/v1.1.0', sha: sha('a') }]);
  assert.deepEqual(got.sent, ['Bearer test-token']);
});

test('release job: numbers one past the highest exact release, by number, ignoring other names', async t => {
  const got = await release(t, { refs: { 'v1.2.0': commit('b'), 'v1.10.0': commit('c'), 'v1.99.1': commit('d'), 'v1.011.0': commit('d'), 'v1.50.0-rc1': commit('d') } });
  assert.deepEqual(got.created, [{ ref: 'refs/tags/v1.11.0', sha: sha('a') }], got.out);
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

test('release job: tags nothing when a release already points at the commit, an annotated one included', async t => {
  assert.deepEqual((await release(t, { refs: { 'v1.1.0': commit('a') } })).created, []);
  assert.deepEqual((await release(t, { refs: { 'v1.1.0': { type: 'tag', sha: sha('e') } }, tags: { [sha('e')]: sha('a') } })).created, []);
});

test('release job: fails and tags nothing with no token, a malformed commit, or a failed read', async t => {
  for (const plant of [{ token: '' }, { head: 'main' }, { fail: 'git/matching-refs' }, { fail: 'git/ref/heads/main' }]) {
    const got = await release(t, plant);
    assert.equal(got.code, 1, `${JSON.stringify(plant)} ${got.out}`);
    assert.deepEqual(got.created, []);
    assert.doesNotMatch(got.out, /test-token/);
  }
});
