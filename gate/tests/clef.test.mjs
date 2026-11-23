// The clef tool's setup half (PACT-61 spec 0002, T1): the pin table's shape
// check, the checked fetch, the archive readers, setup's plan and fetch, and
// verify. Nothing here touches the network, a real archive or a real server:
// the transport is a fake handed to the exported functions, and every folder
// is a temp folder. Each bad case is a row that must fail with its exact rule
// id, with a base that passes before and after.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { crc32, deflateRawSync, gzipSync } from 'node:zlib';
import * as clef from '../../claude/tools/clef.mjs';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const sha = b => createHash('sha256').update(b).digest('hex');
const SOURCE_TEXT = readFileSync(join(REPO, 'claude', 'tools', 'clef.mjs'), 'utf8');

// ------------------------------------------------------------ fixtures

/** A zip: entries { name, data, method (0 or 8), mode (unix st_mode, optional), flags }. */
function zip(entries, { zip64 = false } = {}) {
  const locals = [];
  const central = [];
  let off = 0;
  for (const e of entries) {
    const data = Buffer.from(e.data ?? '');
    const method = e.method ?? 8;
    const comp = method === 8 ? deflateRawSync(data) : data;
    const name = Buffer.from(e.name, 'latin1');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(e.flags ?? 0, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc32(data), 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(e.mode === undefined ? 20 : (3 << 8) | 20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(e.flags ?? 0, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc32(data), 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(e.mode === undefined ? 0 : (e.mode << 16) >>> 0, 38);
    ch.writeUInt32LE(off, 42);
    central.push(ch, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(off, 16);
  const loc = Buffer.alloc(20);
  loc.writeUInt32LE(0x07064b50, 0);
  return Buffer.concat([...locals, cd, ...(zip64 ? [loc] : []), eocd]);
}

/** A gzipped ustar: entries { name, data, type }. */
function tgz(entries) {
  const parts = [];
  for (const e of entries) {
    const data = Buffer.from(e.data ?? '');
    const head = Buffer.alloc(512);
    head.write(e.name, 0, 'latin1');
    head.write('0000644\0', 100, 'latin1');
    head.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 'latin1');
    head.write(e.type ?? '0', 156, 'latin1');
    head.write('ustar\0', 257, 'latin1');
    parts.push(head, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts));
}

/** A fake transport: `route(url, headers)` gives { status, headers, body }; every request is recorded. */
function transportOf(route) {
  const calls = [];
  const fn = async (url, headers) => {
    calls.push({ url: String(url), headers });
    const r = route(new URL(url), headers, calls.length);
    return { status: r.status, headers: r.headers ?? {}, body: r.body ?? Readable.from([]) };
  };
  fn.calls = calls;
  return fn;
}
const ok = (buf, status = 200) => ({ status, body: Readable.from([buf]) });
const redirect = (to, status = 302) => ({ status, headers: { location: to } });

const SRC = { s: { origin: 'https://one.test', redirects: ['cdn.one.test'] } };
const PAYLOAD = Buffer.from('the pinned bytes, all of them');
const fetchArgs = (t, over = {}) => ({ url: 'https://one.test/a', source: 's', size: PAYLOAD.length, sha256: sha(PAYLOAD), out: join(tempDir(t, 'clef-out-'), 'f.bin'), sources: SRC, ...over });

// A tiny pin table: a server archive with a LICENSE at the root and files in a folder, and a small model.
const EXE = 'bin/llama-server.exe';
const FILES = { [EXE]: 'MZ server', 'bin/ggml-cpu.dll': 'cpu backend', LICENSE: 'MIT text' };
const ZIP = () => zip([...Object.entries(FILES).map(([name, data]) => ({ name, data })), { name: 'README.txt', data: 'not kept' }, { name: 'bin/', data: '' }]);
const ROWS = () => Object.entries(FILES).map(([p, d]) => [p, Buffer.byteLength(d), sha(d)]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
const MODEL_BYTES = Buffer.from('a very small model file');
const miniServer = (zipBuf = ZIP()) => ({
  repo: 'ggml-org/llama.cpp',
  tag: 'b1',
  archives: { 'win32-x64-cpu': { asset: 'llama-b1-bin-win-cpu-x64.zip', size: zipBuf.length, sha256: sha(zipBuf), kind: 'zip', exe: EXE, files: ROWS() }, 'win32-x64-vulkan': { asset: 'llama-b1-bin-win-vulkan-x64.zip', size: zipBuf.length, sha256: sha(zipBuf), kind: 'zip', exe: EXE, files: ROWS() } },
});
const miniModel = () => ({ repo: 'ggml-org/Clef-Flash-GGUF', commit: 'a'.repeat(40), file: 'Clef-Flash-Q4_K_M.gguf', size: MODEL_BYTES.length, sha256: sha(MODEL_BYTES) });
const hostsOf = { server: { origin: 'https://github.com', redirects: ['release-assets.githubusercontent.com'] }, model: { origin: 'https://huggingface.co', redirects: ['us.aws.cdn.hf.co'] } };
/** Serves the mini table's archive and model, each through one redirect to its listed host. */
const servingTransport = (zipBuf = ZIP()) => transportOf(url => {
  if (url.host === 'github.com') return redirect('https://release-assets.githubusercontent.com/x');
  if (url.host === 'huggingface.co') return redirect('https://us.aws.cdn.hf.co/y');
  if (url.host === 'release-assets.githubusercontent.com') return ok(zipBuf);
  if (url.host === 'us.aws.cdn.hf.co') return ok(MODEL_BYTES);
  return { status: 404 };
});
const setupArgs = (t, over = {}) => ({ dir: join(tempDir(t, 'clef-home-'), 'pact-clef'), platform: 'win32', arch: 'x64', execPath: 'C:\\node\\node.exe', cwd: 'C:\\work', free: 1e12, vulkan: false, server: miniServer(), model: miniModel(), sources: hostsOf, transport: servingTransport(), ...over });

// ------------------------------------------------------------ the pin table's shape (C3, C21)

// PACT-61 C3: the shipped table passes its own shape check, and the repos are the two the gate names.
test('the shipped pin table passes the shape check, and fixes both repos', () => {
  assert.deepEqual(clef.pinProblems(), []);
  assert.equal(clef.SERVER.repo, 'ggml-org/llama.cpp');
  assert.equal(clef.MODEL.repo, 'ggml-org/Clef-Flash-GGUF');
  assert.ok(Object.isFrozen(clef.SERVER) && Object.isFrozen(clef.MODEL) && Object.isFrozen(clef.SERVER.archives) && Object.isFrozen(clef.SOURCES));
  for (const key of ['win32-x64-cpu', 'win32-x64-vulkan', 'linux-x64-cpu', 'linux-x64-vulkan']) {
    assert.equal(SOURCE_TEXT.split(`'${key}': Object.freeze(`).length, 2, `one row for ${key}`);
    assert.ok(clef.SERVER.archives[key].files.length > 0, `${key} names the files it keeps`);
  }
  assert.deepEqual(clef.SOURCES.server.redirects, ['release-assets.githubusercontent.com', 'objects.githubusercontent.com']);
  assert.deepEqual(clef.SOURCES.model.redirects, ['us.aws.cdn.hf.co']);
});

// PACT-61 C3
{
  const base = () => ({ server: structuredClone(miniServer()), model: miniModel() });
  const run = ({ server, model }) => ({ fails: clef.pinProblems(server, model) });
  const first = s => s.archives['win32-x64-cpu'];
  const rows = [
    { id: 'server-repo', plant: x => { x.server.repo = 'evil/llama.cpp'; return x; }, fails: ['server-repo'], why: 'a table-only change cannot move the source repo' },
    { id: 'model-repo', plant: x => { x.model.repo = 'someone/Clef-Flash-GGUF'; return x; }, fails: ['model-repo'], why: 'the model repo is fixed too' },
    { id: 'tag-shape', plant: x => { x.server.tag = 'main'; return x; }, fails: ['tag', 'asset'], why: 'a tag is b and digits only' },
    { id: 'tag-slash', plant: x => { x.server.tag = 'b1/../b2'; return x; }, fails: ['tag', 'asset'], why: 'a tag cannot hold a path' },
    { id: 'asset-slash', plant: x => { first(x.server).asset = 'llama-b1-bin-a/b.zip'; return x; }, fails: ['asset'], why: 'one plain segment' },
    { id: 'asset-dotdot', plant: x => { first(x.server).asset = '..'; return x; }, fails: ['asset'], why: 'never . or ..' },
    { id: 'asset-percent', plant: x => { first(x.server).asset = 'llama-b1-bin-%2e%2e.zip'; return x; }, fails: ['asset'], why: 'no escapes' },
    { id: 'asset-query', plant: x => { first(x.server).asset = 'llama-b1-bin-x.zip?a=b'; return x; }, fails: ['asset'], why: 'no query' },
    { id: 'asset-fragment', plant: x => { first(x.server).asset = 'llama-b1-bin-x.zip#f'; return x; }, fails: ['asset'], why: 'no fragment' },
    { id: 'asset-prefix', plant: x => { first(x.server).asset = 'other-b1-bin-x.zip'; return x; }, fails: ['asset'], why: 'an asset starts llama-<tag>-bin-' },
    { id: 'commit-short', plant: x => { x.model.commit = 'abc123'; return x; }, fails: ['commit'], why: 'a full commit, never a branch' },
    { id: 'commit-branch', plant: x => { x.model.commit = 'main'; return x; }, fails: ['commit'], why: 'a branch moves' },
    { id: 'commit-upper', plant: x => { x.model.commit = 'A'.repeat(40); return x; }, fails: ['commit'], why: 'lower-case hex' },
    { id: 'model-file-slash', plant: x => { x.model.file = 'a/b.gguf'; return x; }, fails: ['model-file'], why: 'one plain segment' },
    { id: 'model-file-hash', plant: x => { x.model.file = 'a.gguf#x'; return x; }, fails: ['model-file'], why: 'no fragment' },
    { id: 'model-sha-short', plant: x => { x.model.sha256 = 'abc'; return x; }, fails: ['model-sha256'], why: '64 hex' },
    { id: 'archive-sha-upper', plant: x => { first(x.server).sha256 = 'A'.repeat(64); return x; }, fails: ['sha256'], why: 'lower-case hex' },
    { id: 'size-zero', plant: x => { first(x.server).size = 0; return x; }, fails: ['size'], why: 'a positive integer' },
    { id: 'size-fraction', plant: x => { x.model.size = 1.5; return x; }, fails: ['model-size'], why: 'an integer' },
    { id: 'kind', plant: x => { first(x.server).kind = 'rar'; return x; }, fails: ['kind'], why: 'zip or tgz' },
    { id: 'file-sha', plant: x => { first(x.server).files[0][2] = 'x'; return x; }, fails: ['file-sha256'], why: 'each kept file has a sha256' },
    { id: 'file-path', plant: x => { first(x.server).files[0][0] = '../x'; return x; }, fails: ['file-path'], why: 'a kept file path goes through the path check' },
    { id: 'file-size-negative', plant: x => { first(x.server).files[1][1] = -1; return x; }, fails: ['file-size'], why: 'a positive integer' },
    { id: 'file-size-zero', plant: x => { first(x.server).files[1][1] = 0; return x; }, fails: ['file-size'], why: 'a positive integer, not zero' },
    { id: 'asset-dotdot-inside', plant: x => { first(x.server).asset = 'llama-b1-bin-x..zip'; return x; }, fails: ['asset'], why: 'a name that holds .. at all' },
    { id: 'file-dup', plant: x => { first(x.server).files.push(['other/LICENSE', 1, 'a'.repeat(64)]); return x; }, fails: ['file-dup'], why: 'two files landing in one place' },
    { id: 'copy-with-a-path', plant: x => { first(x.server).files[0][3] = 'a/b.so.0'; return x; }, fails: ['file-copy'], why: 'a copy is named by one plain segment' },
    { id: 'copy-twice', plant: x => { first(x.server).files[0].push('a.so.0', 'b.so.0'); return x; }, fails: ['file-copy'], why: 'one copy at most' },
    { id: 'copy-collides', plant: x => { first(x.server).files[0][3] = 'ggml-cpu.dll'; return x; }, fails: ['file-dup'], why: 'a copy landing on another kept file' },
    { id: 'exe-missing', plant: x => { first(x.server).exe = 'bin/nothing.exe'; return x; }, fails: ['exe'], why: 'the executable is one of the kept files' },
    { id: 'platform-key', plant: x => { x.server.archives['darwin-arm64-cpu'] = x.server.archives['win32-x64-cpu']; return x; }, fails: ['platform-key'], why: 'only the four platform keys' },
  ];
  test('pin table shape: base passes', () => assert.deepEqual(run(base()).fails, []));
  for (const r of rows) {
    test(`pin table shape: ${r.id}`, () => {
      const got = run(r.plant(base())).fails;
      assert.deepEqual([...new Set(got)].sort(), [...r.fails].sort(), `${r.id} should fail exactly these rules`);
    });
  }
  test('pin table shape: base passes after the rows', () => assert.deepEqual(run(base()).fails, []));
}

// PACT-61 C3: every path the table or an archive names goes through one check.
{
  const NUL = String.fromCharCode(0);
  const rows = [
    ['empty', '', 'empty'], ['absolute', '/etc/x', 'absolute'], ['dotdot', '../x', 'dotdot'], ['dotdot-mid', 'a/../b', 'dotdot'], ['dotdot-inside-a-name', 'a/b..c', 'dotdot'],
    ['backslash', 'a\\b', 'backslash'], ['drive', 'C:x', 'colon'], ['colon', 'a:b', 'colon'], ['nul', `a${NUL}b`, 'control'], ['control', 'a\u0007b', 'control'],
    ['trailing-dot', 'a/b.', 'trailing'], ['trailing-space', 'a/b ', 'trailing'], ['dir-trailing-dot', 'a./b', 'trailing'], ['con', 'CON', 'reserved'], ['aux-ext', 'x/aux.txt', 'reserved'], ['com1-lower', 'com1.dll', 'reserved'],
    ['lpt9', 'LPT9', 'reserved'], ['nul-name', 'bin/NUL.x', 'reserved'], ['double-slash', 'a//b', 'empty'],
  ];
  test('path check: plain names pass', () => {
    for (const p of ['LICENSE', 'bin/llama-server.exe', 'a/b/libggml-cpu-x64.so.0', 'COM10', 'console.dll']) assert.equal(clef.pathProblem(p), null, p);
  });
  for (const [id, path, word] of rows) test(`path check: ${id}`, () => assert.equal(clef.pathProblem(path), word));
  test('path check: plain names pass after the rows', () => assert.equal(clef.pathProblem('bin/llama-server.exe'), null));
}

// PACT-61 C21: a built URL stays inside its repo, tag or commit.
{
  const server = () => structuredClone(miniServer());
  const refused = fn => assert.throws(fn, e => e instanceof clef.Refused && e.code === 'clef-pin');
  test('built URLs: the base builds the documented paths', () => {
    assert.equal(clef.archiveUrl(server(), 'win32-x64-cpu').href, 'https://github.com/ggml-org/llama.cpp/releases/download/b1/llama-b1-bin-win-cpu-x64.zip');
    assert.equal(clef.modelUrl(miniModel()).href, `https://huggingface.co/ggml-org/Clef-Flash-GGUF/resolve/${'a'.repeat(40)}/Clef-Flash-Q4_K_M.gguf`);
  });
  for (const [id, bad] of [['slash', 'a/b'], ['dotdot', '..'], ['percent', '%2e%2e'], ['question', 'x?y'], ['hash', 'x#y']]) {
    test(`built URLs: an asset with ${id} is refused`, () => {
      const s = server();
      s.archives['win32-x64-cpu'].asset = bad;
      refused(() => clef.archiveUrl(s, 'win32-x64-cpu'));
    });
    test(`built URLs: a model file with ${id} is refused`, () => refused(() => clef.modelUrl({ ...miniModel(), file: bad })));
  }
  test('built URLs: a path that leaves its repo is refused after building', () => {
    const s = server();
    s.repo = 'ggml-org/../evil/x';
    refused(() => clef.archiveUrl(s, 'win32-x64-cpu'));
    refused(() => clef.modelUrl({ ...miniModel(), repo: 'ggml-org/../evil/x' }));
  });
  test('built URLs: a platform with no row is clef-platform', () => assert.throws(() => clef.archiveUrl(server(), 'linux-x64-cpu'), e => e.code === 'clef-platform'));
}

// ------------------------------------------------------------ the checked fetch (C5, C7)

// PACT-61 C5
{
  const tr = (...answers) => transportOf((url, h, n) => answers[Math.min(n - 1, answers.length - 1)]);
  const gone = t => assert.equal(existsSync(t), false, 'a refusal leaves no file in place');
  const rows = [
    { id: 'own-host-redirect', answers: [redirect('https://one.test/b'), ok(PAYLOAD)], passes: true, why: 'its own host is allowed' },
    { id: 'relative-redirect', answers: [redirect('/b'), ok(PAYLOAD)], passes: true, why: 'a relative redirect resolves against the current URL' },
    { id: 'listed-host', answers: [redirect('https://cdn.one.test/x'), ok(PAYLOAD)], passes: true, why: 'a listed host is allowed' },
    { id: 'other-host', answers: [redirect('https://evil.test/x'), ok(PAYLOAD)], code: 'clef-redirect', why: 'a host not listed' },
    { id: 'http', answers: [redirect('http://one.test/x'), ok(PAYLOAD)], code: 'clef-redirect', why: 'http is never followed' },
    { id: 'lookalike-host', answers: [redirect('https://cdn.one.test.evil.test/x'), ok(PAYLOAD)], code: 'clef-redirect', why: 'the host is compared whole' },
    { id: 'userinfo-host', answers: [redirect('https://one.test@evil.test/x'), ok(PAYLOAD)], code: 'clef-redirect', why: 'a userinfo trick still lands on evil.test' },
    { id: 'five-hops', answers: [redirect('https://one.test/1'), redirect('https://one.test/2'), redirect('https://one.test/3'), redirect('https://one.test/4'), redirect('https://one.test/5'), ok(PAYLOAD)], code: 'clef-redirect', why: 'at most 4 redirects' },
    { id: 'four-hops', answers: [redirect('https://one.test/1'), redirect('https://one.test/2'), redirect('https://one.test/3'), redirect('https://one.test/4'), ok(PAYLOAD)], passes: true, why: 'four is allowed' },
    { id: 'no-location', answers: [{ status: 302 }, ok(PAYLOAD)], code: 'clef-redirect', why: 'a redirect with nowhere to go' },
    { id: 'too-long', answers: [ok(Buffer.concat([PAYLOAD, Buffer.from('x')]))], code: 'clef-size', why: 'a byte past the size' },
    { id: 'hash-mismatch', answers: [ok(Buffer.from(PAYLOAD.toString().replace('pinned', 'forged')))], code: 'clef-hash', why: 'same size, other bytes' },
  ];
  test('fetch: base passes', async t => {
    const a = fetchArgs(t);
    assert.deepEqual(await clef.fetchFile({ ...a, transport: tr(ok(PAYLOAD)) }), { ok: true });
    assert.deepEqual(readFileSync(a.out), PAYLOAD);
  });
  for (const r of rows) {
    test(`fetch: ${r.id}`, async t => {
      const a = fetchArgs(t);
      writeFileSync(a.out, 'a stale file from an earlier run');
      const transport = tr(...r.answers);
      if (r.passes) {
        assert.deepEqual(await clef.fetchFile({ ...a, transport }), { ok: true });
        assert.deepEqual(readFileSync(a.out), PAYLOAD);
      } else {
        await assert.rejects(clef.fetchFile({ ...a, transport }), e => e instanceof clef.Refused && e.code === r.code);
        gone(a.out);
      }
    });
  }
  test('fetch: a short body is refused and deleted unless the file resumes, and nothing follows a refused redirect', async t => {
    const a = fetchArgs(t);
    await assert.rejects(clef.fetchFile({ ...a, transport: tr(ok(PAYLOAD.subarray(0, 5))) }), e => e instanceof clef.Refused && e.code === 'clef-size');
    gone(a.out);
    const r = fetchArgs(t);
    await assert.rejects(clef.fetchFile({ ...r, transport: tr(ok(PAYLOAD.subarray(0, 5))), resume: true }), /network/);
    assert.equal(statSync(r.out).size, 5, 'a resumable file keeps its bytes');
    const b = fetchArgs(t);
    const transport = tr(redirect('https://evil.test/x'), ok(PAYLOAD));
    await assert.rejects(clef.fetchFile({ ...b, transport }));
    assert.equal(transport.calls.length, 1, 'the evil host was never asked');
  });
  test('fetch: sends no cookie, no token, and only the two fixed headers', async t => {
    const transport = tr(ok(PAYLOAD));
    await clef.fetchFile({ ...fetchArgs(t), transport });
    assert.deepEqual(transport.calls[0].headers, { 'user-agent': 'pact-clef-setup', 'accept-encoding': 'identity' });
  });
  test('fetch: base passes after the rows', async t => assert.deepEqual(await clef.fetchFile({ ...fetchArgs(t), transport: tr(ok(PAYLOAD)) }), { ok: true }));
}

// PACT-61 C7
{
  test('resume: a broken fetch resumes with a Range request and ends with a whole-file hash check', async t => {
    const a = fetchArgs(t);
    const half = PAYLOAD.subarray(0, 10);
    const broken = Readable.from((async function* () { yield half; throw new Error('reset'); })());
    await assert.rejects(clef.fetchFile({ ...a, transport: transportOf(() => ({ status: 200, body: broken })), resume: true }), /network/);
    assert.equal(statSync(a.out).size, 10, 'the bytes so far are kept');
    const transport = transportOf((u, h) => (h.range === 'bytes=10-' ? ok(PAYLOAD.subarray(10), 206) : { status: 500 }));
    assert.deepEqual(await clef.fetchFile({ ...a, transport, resume: true }), { ok: true });
    assert.equal(transport.calls[0].headers.range, 'bytes=10-');
    assert.deepEqual(readFileSync(a.out), PAYLOAD);
  });
  test('resume: a server that ignores the range restarts the file', async t => {
    const a = fetchArgs(t);
    writeFileSync(a.out, 'garbage!!!');
    assert.deepEqual(await clef.fetchFile({ ...a, transport: transportOf(() => ok(PAYLOAD)), resume: true }), { ok: true });
    assert.deepEqual(readFileSync(a.out), PAYLOAD);
  });
  test('resume: a resumed file whose joined bytes do not match the hash is refused and removed', async t => {
    const a = fetchArgs(t);
    writeFileSync(a.out, 'WRONG-START');
    await assert.rejects(clef.fetchFile({ ...a, transport: transportOf(() => ok(PAYLOAD.subarray(11), 206)), resume: true }), e => e.code === 'clef-hash');
    assert.equal(existsSync(a.out), false);
  });
  test('resume: a partial already the pinned size is hash-checked and kept without a request; one that fails restarts from nothing', async t => {
    const a = fetchArgs(t);
    writeFileSync(a.out, PAYLOAD);
    const none = transportOf(() => ({ status: 416 }));
    assert.deepEqual(await clef.fetchFile({ ...a, transport: none, resume: true }), { ok: true });
    assert.equal(none.calls.length, 0, 'no request for a whole file');
    writeFileSync(a.out, Buffer.from(PAYLOAD.toString().replace('pinned', 'forged')));
    const again = transportOf(() => ok(PAYLOAD));
    assert.deepEqual(await clef.fetchFile({ ...a, transport: again, resume: true }), { ok: true });
    assert.equal(again.calls[0].headers.range, undefined, 'a wrong whole-size file is asked for from byte 0');
    assert.deepEqual(readFileSync(a.out), PAYLOAD);
  });
  test('resume: without resume, an old partial file is not continued', async t => {
    const a = fetchArgs(t);
    writeFileSync(a.out, 'garbage!!!');
    const transport = transportOf(() => ok(PAYLOAD));
    await clef.fetchFile({ ...a, transport });
    assert.equal(transport.calls[0].headers.range, undefined);
  });
}

// ------------------------------------------------------------ the archive readers (C6)

// PACT-61 C6
{
  const named = new Set(Object.keys(FILES));
  const want = n => named.has(n);
  test('zip reader: reads stored and deflate files, folders and unnamed files without their data', () => {
    const z = zip([{ name: 'a.txt', data: 'stored', method: 0 }, { name: 'd/', data: '' }, { name: 'd/b.txt', data: 'deflated' }, { name: 'skip.txt', data: 'x' }]);
    const r = clef.readZip(z, { want: n => n !== 'skip.txt' });
    assert.deepEqual(r.entries.map(e => [e.path, e.kind, e.data && e.data.toString()]), [['a.txt', 'file', 'stored'], ['d', 'dir', null], ['d/b.txt', 'file', 'deflated'], ['skip.txt', 'file', null]]);
    assert.deepEqual(r.forms, ['dir:deflate', 'file:deflate', 'file:stored']);
  });
  test('tar reader: reads files, folders and links without link data, drops a leading ./', () => {
    const r = clef.readTgz(tgz([{ name: './', type: '5' }, { name: './d/', type: '5' }, { name: './d/a.txt', data: 'hello' }, { name: './d/link', type: '2' }]), {});
    assert.deepEqual(r.entries.map(e => [e.path, e.kind, e.data && e.data.toString()]), [['d', 'dir', null], ['d/a.txt', 'file', 'hello'], ['d/link', 'link', null]]);
  });
  test('tar reader: a "." folder, a "./" entry with data and a size-0 "./" are skipped whole, and the entry after them is still read', () => {
    const r = clef.readTgz(tgz([{ name: '.', type: '5' }, { name: './', data: 'x'.repeat(700) }, { name: './', type: '5' }, { name: 'real.txt', data: 'ok' }]), {});
    assert.deepEqual(r.entries.map(e => [e.path, e.kind, e.data && e.data.toString()]), [['real.txt', 'file', 'ok']]);
  });
  const bads = [
    { id: 'zip-traversal', run: () => clef.readZip(zip([{ name: '../x', data: 'y' }]), {}), why: 'a name that leaves the folder' },
    { id: 'zip-absolute', run: () => clef.readZip(zip([{ name: '/etc/x', data: 'y' }]), {}), why: 'an absolute name' },
    { id: 'zip-backslash', run: () => clef.readZip(zip([{ name: 'a\\b', data: 'y' }]), {}), why: 'a backslash' },
    { id: 'zip-drive', run: () => clef.readZip(zip([{ name: 'C:evil.dll', data: 'y' }]), {}), why: 'a drive' },
    { id: 'zip-reserved', run: () => clef.readZip(zip([{ name: 'bin/con.dll', data: 'y' }]), {}), why: 'a reserved name' },
    { id: 'zip-trailing-dot', run: () => clef.readZip(zip([{ name: 'bin/a.dll.', data: 'y' }]), {}), why: 'a trailing dot' },
    { id: 'zip-zip64', run: () => clef.readZip(zip([{ name: 'a', data: 'y' }], { zip64: true }), {}), why: 'zip64 is not read' },
    { id: 'zip-encrypted', run: () => clef.readZip(zip([{ name: 'a', data: 'y', flags: 1 }]), {}), why: 'an encrypted entry' },
    { id: 'zip-method', run: () => clef.readZip(zip([{ name: 'a', data: 'y', method: 12 }]), {}), why: 'bzip2 is not read' },
    { id: 'zip-device', run: () => clef.readZip(zip([{ name: 'a', data: 'y', mode: 0o020000 }]), {}), why: 'a device entry' },
    { id: 'zip-bomb', run: () => clef.readZip(zip([{ name: 'a', data: Buffer.alloc(5000) }]), { maxBytes: 100 }), why: 'unpacks past its limit' },
    { id: 'zip-no-end', run: () => clef.readZip(Buffer.from('not a zip at all, no end record'), {}), why: 'not a zip' },
    { id: 'tar-traversal', run: () => clef.readTgz(tgz([{ name: '../x', data: 'y' }]), {}), why: 'a name that leaves the folder' },
    { id: 'tar-drive', run: () => clef.readTgz(tgz([{ name: 'C:x', data: 'y' }]), {}), why: 'a drive' },
    { id: 'tar-pax', run: () => clef.readTgz(tgz([{ name: 'pax', type: 'x', data: 'path=a\n' }]), {}), why: 'a pax header' },
    { id: 'tar-gnu-long', run: () => clef.readTgz(tgz([{ name: 'long', type: 'L', data: 'a'.repeat(200) }]), {}), why: 'a GNU long name' },
    { id: 'tar-device', run: () => clef.readTgz(tgz([{ name: 'dev', type: '3' }]), {}), why: 'a device' },
    { id: 'tar-not-gzip', run: () => clef.readTgz(Buffer.from('plain'), {}), why: 'not gzip' },
  ];
  for (const b of bads) test(`archive reader: ${b.id}`, () => assert.throws(b.run, e => e instanceof clef.Refused && e.code === 'clef-archive'));
  test('archive reader: the good archive reads', () => assert.equal(clef.readZip(ZIP(), { want }).entries.length, 5));

  test('unpack: writes only the named entries, flattened under the exe\'s folder, and checks each again', t => {
    const a = setupArgs(t);
    mkdirSync(join(a.dir, 'partial'), { recursive: true });
    const archivePath = join(a.dir, 'partial', 'x.zip');
    writeFileSync(archivePath, ZIP());
    clef.unpackServer({ dir: a.dir, key: 'win32-x64-cpu', archivePath, platform: 'win32', server: a.server });
    const runtime = join(a.dir, 'runtime', 'b1');
    assert.deepEqual(readdirSync(runtime).sort(), ['LICENSE', 'ggml-cpu.dll', 'llama-server.exe']);
    assert.equal(readFileSync(join(runtime, 'llama-server.exe'), 'utf8'), 'MZ server');
    assert.equal(existsSync(join(a.dir, 'runtime', 'b1.partial')), false);
  });
  const unpackWith = (t, zipBuf, tweak = s => s) => {
    const a = setupArgs(t, { server: tweak(miniServer()) });
    mkdirSync(join(a.dir, 'partial'), { recursive: true });
    const archivePath = join(a.dir, 'partial', 'x.zip');
    writeFileSync(archivePath, zipBuf);
    const run = () => clef.unpackServer({ dir: a.dir, key: 'win32-x64-cpu', archivePath, platform: 'win32', server: a.server });
    run.runtime = join(a.dir, 'runtime', 'b1');
    return run;
  };
  test('unpack: a named file whose bytes differ from the table is clef-hash, and nothing is moved into place', t => {
    const z = zip([...Object.entries(FILES).map(([name, data]) => ({ name: name, data: name === EXE ? 'MZ forged' : data }))]);
    const dir = tempDir(t, 'clef-home-');
    const a = setupArgs(t, { dir: join(dir, 'pact-clef') });
    mkdirSync(join(a.dir, 'partial'), { recursive: true });
    writeFileSync(join(a.dir, 'partial', 'x.zip'), z);
    assert.throws(() => clef.unpackServer({ dir: a.dir, key: 'win32-x64-cpu', archivePath: join(a.dir, 'partial', 'x.zip'), platform: 'win32', server: a.server }), e => e.code === 'clef-hash');
    assert.equal(existsSync(join(a.dir, 'runtime', 'b1')), false);
  });
  test('unpack: a named file that is a link in the archive is refused, and a link nobody named is never written', t => {
    const linked = zip([...Object.entries(FILES).map(([name, data]) => ({ name, data, mode: name === EXE ? 0o120777 : 0o100644 }))]);
    assert.throws(unpackWith(t, linked), e => e.code === 'clef-archive');
    const extra = zip([...Object.entries(FILES).map(([name, data]) => ({ name, data })), { name: 'bin/libx.so', data: '../../etc/passwd', mode: 0o120777 }]);
    const run = unpackWith(t, extra);
    run();
    assert.deepEqual(readdirSync(run.runtime).sort(), ['LICENSE', 'ggml-cpu.dll', 'llama-server.exe'], 'the unnamed link left no file, link or copy');
  });
  test('unpack: a pinned file named twice in the archive is clef-archive, and nothing is moved into place', t => {
    const twice = zip([{ name: EXE, data: 'MZ server' }, { name: EXE, data: 'MZ server' }, { name: 'bin/ggml-cpu.dll', data: 'cpu backend' }, { name: 'LICENSE', data: 'MIT text' }]);
    const run = unpackWith(t, twice);
    assert.throws(run, e => e instanceof clef.Refused && e.code === 'clef-archive');
    assert.equal(existsSync(run.runtime), false);
  });
  // PACT-61 S6, Linux: the tgz branch writes the same files, and the server is made executable.
  test('unpack: a tar.gz archive unpacks the named files, and on Linux the server is executable', t => {
    const entries = [{ name: './build/', type: '5' }, ...Object.entries(FILES).map(([name, data]) => ({ name: `./build/${name}`, data })), { name: './build/notes.txt', data: 'not kept' }];
    const buf = tgz(entries);
    const files = ROWS().map(([p, s, h]) => [`build/${p}`, s, h]);
    const server = { repo: 'ggml-org/llama.cpp', tag: 'b1', archives: { 'linux-x64-cpu': { asset: 'llama-b1-bin-ubuntu-x64.tar.gz', size: buf.length, sha256: sha(buf), kind: 'tgz', exe: `build/${EXE}`, files } } };
    const a = setupArgs(t, { server });
    mkdirSync(join(a.dir, 'partial'), { recursive: true });
    const archivePath = join(a.dir, 'partial', 'x.tar.gz');
    writeFileSync(archivePath, buf);
    clef.unpackServer({ dir: a.dir, key: 'linux-x64-cpu', archivePath, platform: 'linux', server });
    const runtime = join(a.dir, 'runtime', 'b1');
    assert.deepEqual(readdirSync(runtime).sort(), ['LICENSE', 'ggml-cpu.dll', 'llama-server.exe']);
    if (process.platform !== 'win32') assert.equal(statSync(join(runtime, 'llama-server.exe')).mode & 0o111, 0o111);
  });
  // PACT-61 C6: the Linux build holds its sonames as links; a link is never written, so the bytes are kept as a copy under the soname.
  test('unpack: a row\'s copy name keeps the same bytes as a regular file, and verify checks both', async t => {
    const a = setupArgs(t, { yes: true });
    a.server.archives['win32-x64-cpu'].files = a.server.archives['win32-x64-cpu'].files.map(r => (r[0] === 'bin/ggml-cpu.dll' ? [...r, 'ggml-cpu.so.0'] : r));
    await clef.runSetup(a);
    const runtime = join(a.dir, 'runtime', 'b1');
    assert.equal(readFileSync(join(runtime, 'ggml-cpu.so.0'), 'utf8'), 'cpu backend');
    assert.equal(statSync(join(runtime, 'ggml-cpu.so.0')).isFile(), true);
    assert.deepEqual(clef.verify({ dir: a.dir, server: a.server, model: a.model }).failed, []);
    writeFileSync(join(runtime, 'ggml-cpu.so.0'), 'tampered, longer');
    assert.deepEqual(clef.verify({ dir: a.dir, server: a.server, model: a.model }).failed, ['size:ggml-cpu.so.0']);
  });
  test('unpack: a named file missing from the archive is refused', t => assert.throws(unpackWith(t, zip([{ name: EXE, data: 'MZ server' }])), e => e.code === 'clef-archive'));
}

// ------------------------------------------------------------ the Vulkan probe (C8)

// PACT-61 C8
test('the probe picks Vulkan on the loader file and CPU without it, runs nothing, and --cpu forces CPU', () => {
  const seen = [];
  const exists = p => { seen.push(p); return p.endsWith('vulkan-1.dll'); };
  assert.equal(clef.probeVulkan({ platform: 'win32', exists, systemRoot: 'C:\\Windows' }), true);
  assert.deepEqual(seen, [join('C:\\Windows', 'System32', 'vulkan-1.dll')]);
  assert.equal(clef.probeVulkan({ platform: 'win32', exists: () => false, systemRoot: 'C:\\Windows' }), false);
  const lin = [];
  assert.equal(clef.probeVulkan({ platform: 'linux', exists: p => { lin.push(p); return p === '/usr/lib64/libvulkan.so.1'; } }), true);
  assert.deepEqual(lin, ['/usr/lib/libvulkan.so.1', '/usr/lib64/libvulkan.so.1']);
  assert.equal(clef.probeVulkan({ platform: 'linux', exists: () => false }), false);
  assert.deepEqual(clef.pickPlatform({ platform: 'win32', arch: 'x64', vulkan: true, cpu: false }), { key: 'win32-x64-vulkan', backend: 'vulkan', why: 'Vulkan loader found' });
  assert.deepEqual(clef.pickPlatform({ platform: 'win32', arch: 'x64', vulkan: false, cpu: false }), { key: 'win32-x64-cpu', backend: 'cpu', why: 'no Vulkan loader: CPU' });
  assert.equal(clef.pickPlatform({ platform: 'linux', arch: 'x64', vulkan: true, cpu: true }).key, 'linux-x64-cpu');
  assert.equal(clef.pickPlatform({ platform: 'darwin', arch: 'arm64', vulkan: false, cpu: false }), null);
  assert.equal(clef.pickPlatform({ platform: 'win32', arch: 'arm64', vulkan: false, cpu: false }), null);
  assert.doesNotMatch(SOURCE_TEXT, /child_process|spawn|execFile/, 'T1 starts no program');
});

// ------------------------------------------------------------ setup: the plan and the fetch (C4, C5, C7)

// PACT-61 C4: without --yes, no network request, and nothing written but the clef folder.
test('setup without --yes prints the plan, makes no request, and writes nothing but the clef folder', async t => {
  const a = setupArgs(t, { transport: transportOf(() => { throw new Error('a request was made'); }) });
  const r = await clef.runSetup(a);
  assert.equal(a.transport.calls.length, 0);
  assert.deepEqual(readdirSync(a.dir), [], 'the clef folder holds nothing');
  assert.deepEqual(readdirSync(dirname(a.dir)), ['pact-clef'], 'nothing is written beside the clef folder');
  assert.equal(r.lines.at(-1), 'run again with --yes to fetch');
  assert.match(r.lines.join('\n'), /^platform: win32-x64-cpu \(no Vulkan loader: CPU\)$/m);
  assert.match(r.lines.join('\n'), /^fetch: github\.com llama-b1-bin-win-cpu-x64\.zip [\d.]+ MB sha256 [0-9a-f]{8}$/m);
  assert.match(r.lines.join('\n'), /^fetch: huggingface\.co Clef-Flash-Q4_K_M\.gguf [\d.]+ MB sha256 [0-9a-f]{8}$/m);
  assert.match(r.lines.join('\n'), /^free space: .* needs .*$/m);
  assert.match(r.lines.join('\n'), /^node recorded in setup\.json: C:\\node\\node\.exe$/m);
});

test('setup with the real table prints the real plan and still fetches nothing', async t => {
  const dir = join(tempDir(t, 'clef-home-'), 'pact-clef');
  const transport = transportOf(() => { throw new Error('a request was made'); });
  const r = await clef.runSetup({ dir, platform: 'win32', arch: 'x64', execPath: 'C:\\node\\node.exe', cwd: 'C:\\work', free: 1e12, vulkan: true, transport });
  assert.equal(transport.calls.length, 0);
  assert.match(r.lines.join('\n'), /fetch: github\.com llama-b12211-bin-win-vulkan-x64\.zip 37\.8 MB sha256 20954cba/);
  assert.match(r.lines.join('\n'), /fetch: huggingface\.co Clef-Flash-Q4_K_M\.gguf 6732\.8 MB sha256 eef2968c/);
});

// PACT-61 C4, C5: each refusal fetches nothing.
{
  const base = () => ({});
  const run = async (over, t) => {
    const a = setupArgs(t, over);
    try {
      await clef.runSetup({ ...a, yes: true });
      return { fails: [], calls: a.transport.calls.length };
    } catch (e) {
      return { fails: [e.code], calls: a.transport.calls.length };
    }
  };
  const rows = [
    { id: 'no-platform-macos', plant: () => ({ platform: 'darwin', arch: 'arm64' }), fails: ['clef-platform'], why: 'macOS is out of scope' },
    { id: 'no-platform-arm', plant: () => ({ arch: 'arm64' }), fails: ['clef-platform'], why: 'Windows on ARM is out of scope' },
    { id: 'no-row-for-key', plant: () => ({ server: { ...miniServer(), archives: {} } }), fails: ['clef-platform'], why: 'the table has no row for the platform' },
    { id: 'too-little-space', plant: () => ({ free: 100 }), fails: ['clef-space'], why: 'the drive cannot hold the files' },
    { id: 'node-in-the-folder', plant: () => ({ execPath: 'C:\\work\\evil\\node.exe', cwd: 'C:\\work' }), fails: ['clef-node'], why: 'a node inside the starting folder' },
    { id: 'node-in-the-folder-cased', plant: () => ({ execPath: 'c:\\WORK\\node.exe', cwd: 'C:\\work' }), fails: ['clef-node'], why: 'Windows compares names without case' },
    { id: 'linux-without-setpriv', plant: () => ({ platform: 'linux', exists: () => false, server: { ...miniServer(), archives: { 'linux-x64-cpu': { ...miniServer().archives['win32-x64-cpu'], asset: 'llama-b1-bin-ubuntu-x64.tar.gz', kind: 'tgz' } } } }), fails: ['clef-setpriv'], why: 'Linux needs /usr/bin/setpriv' },
    { id: 'bad-pin', plant: () => ({ model: { ...miniModel(), commit: 'main' } }), fails: ['clef-pin'], why: 'a table that fails its shape check fetches nothing' },
  ];
  test('setup refusals: base passes', async t => assert.deepEqual((await run(base(), t)).fails, []));
  for (const r of rows) {
    test(`setup refusals: ${r.id}`, async t => {
      const got = await run(r.plant(), t);
      assert.deepEqual(got.fails, r.fails);
      assert.equal(got.calls, 0, 'nothing was fetched');
    });
  }
  test('setup refusals: base passes after the rows', async t => assert.deepEqual((await run(base(), t)).fails, []));
  test('setup: a node outside the starting folder, and a sibling with a shared prefix, are not inside it', t => {
    const plan = over => clef.planSetup({ ...setupArgs(t), free: 1e12, ...over });
    assert.doesNotThrow(() => plan({ execPath: 'C:\\work2\\node.exe', cwd: 'C:\\work' }));
    assert.throws(() => plan({ execPath: 'C:\\work\\node.exe', cwd: 'C:\\work' }), e => e.code === 'clef-node');
  });
}

test('setup --yes fetches both files through their redirects, keeps them checked, writes setup.json last, and a second run skips both', async t => {
  const a = setupArgs(t, { yes: true, execPath: 'C:\\node\\node.exe' });
  const r = await clef.runSetup(a);
  assert.deepEqual(a.transport.calls.map(c => new URL(c.url).host), ['github.com', 'release-assets.githubusercontent.com', 'huggingface.co', 'us.aws.cdn.hf.co']);
  assert.deepEqual(readdirSync(join(a.dir, 'runtime', 'b1')).sort(), ['LICENSE', 'ggml-cpu.dll', 'llama-server.exe']);
  assert.deepEqual(readFileSync(join(a.dir, 'models', `${sha(MODEL_BYTES)}.gguf`)), MODEL_BYTES);
  assert.deepEqual(JSON.parse(readFileSync(join(a.dir, 'setup.json'), 'utf8')), { platform: 'win32-x64-cpu', tag: 'b1', model: sha(MODEL_BYTES), backend: 'cpu', node: 'C:\\node\\node.exe' });
  assert.deepEqual(readdirSync(join(a.dir, 'partial')), [], 'no partial file is left');
  assert.match(r.lines.join('\n'), /^kept: server b1 \(win32-x64-cpu\)$/m);
  const again = await clef.runSetup({ ...a, transport: transportOf(() => { throw new Error('a request was made'); }) });
  assert.match(again.lines.join('\n'), /^checked: server b1 \(win32-x64-cpu\)$/m);
  assert.match(again.lines.join('\n'), /^checked: model /m);
});

// PACT-61 C4, S6: a file present at its pinned size is skipped only when its sha256 holds; one that fails is fetched again.
test('setup --yes hashes a present file before skipping it, and fetches again one whose bytes changed at the same size', async t => {
  const a = setupArgs(t, { yes: true });
  await clef.runSetup(a);
  writeFileSync(join(a.dir, 'runtime', 'b1', 'ggml-cpu.dll'), 'CPU BACKEND'); // same length as 'cpu backend'
  writeFileSync(join(a.dir, 'models', `${sha(MODEL_BYTES)}.gguf`), Buffer.alloc(MODEL_BYTES.length, 1));
  assert.deepEqual(clef.verify({ dir: a.dir, server: a.server, model: a.model }).failed.sort(), ['sha256:ggml-cpu.dll', `sha256:model ${sha(MODEL_BYTES).slice(0, 8)}`]);
  const dry = await clef.runSetup({ ...a, yes: false });
  assert.match(dry.lines.join('\n'), /^present \(sizes match\), skipped unless its sha256 fails: server b1/m, 'the plan does not claim a hash it did not make');
  const again = await clef.runSetup({ ...a, transport: servingTransport() });
  assert.match(again.lines.join('\n'), /^sha256 failed, fetching again: server b1$/m);
  assert.match(again.lines.join('\n'), /^sha256 failed, fetching again: model /m);
  assert.deepEqual(clef.verify({ dir: a.dir, server: a.server, model: a.model }).failed, []);
});

test('setup --yes: a failed fetch writes no setup.json and keeps nothing in place', async t => {
  const a = setupArgs(t, { yes: true, transport: transportOf(url => (url.host === 'github.com' ? redirect('https://evil.test/x') : { status: 404 })) });
  await assert.rejects(clef.runSetup(a), e => e.code === 'clef-redirect');
  assert.equal(existsSync(join(a.dir, 'setup.json')), false);
  assert.equal(existsSync(join(a.dir, 'runtime', 'b1')), false);
});

test('setup --yes prunes runtime folders and model files the table no longer names, and nothing else', async t => {
  const a = setupArgs(t, { yes: true });
  mkdirSync(join(a.dir, 'runtime', 'b0'), { recursive: true });
  writeFileSync(join(a.dir, 'runtime', 'b0', 'old.dll'), 'old');
  mkdirSync(join(a.dir, 'models'), { recursive: true });
  writeFileSync(join(a.dir, 'models', `${'f'.repeat(64)}.gguf`), 'old model');
  writeFileSync(join(a.dir, 'notes.txt'), 'mine');
  await clef.runSetup(a);
  assert.deepEqual(readdirSync(join(a.dir, 'runtime')), ['b1']);
  assert.deepEqual(readdirSync(join(a.dir, 'models')), [`${sha(MODEL_BYTES)}.gguf`]);
  assert.equal(readFileSync(join(a.dir, 'notes.txt'), 'utf8'), 'mine', 'a file the tool did not make stays');
});

test('setup --yes replaces an older runtime folder of the same tag by rename, leaving no .old or .partial', async t => {
  const a = setupArgs(t, { yes: true });
  mkdirSync(join(a.dir, 'runtime', 'b1'), { recursive: true });
  writeFileSync(join(a.dir, 'runtime', 'b1', 'stale.dll'), 'stale');
  await clef.runSetup(a);
  assert.deepEqual(readdirSync(join(a.dir, 'runtime')), ['b1']);
  assert.equal(existsSync(join(a.dir, 'runtime', 'b1', 'stale.dll')), false);
});

// PACT-61 C7: the model fetch inside setup resumes from its partial file.
test('setup --yes resumes a partial model file', async t => {
  const a = setupArgs(t, { yes: true });
  mkdirSync(join(a.dir, 'partial'), { recursive: true });
  writeFileSync(join(a.dir, 'partial', `${sha(MODEL_BYTES)}.gguf`), MODEL_BYTES.subarray(0, 7));
  const transport = transportOf((url, h) => {
    if (url.host === 'github.com') return redirect('https://release-assets.githubusercontent.com/x');
    if (url.host === 'release-assets.githubusercontent.com') return ok(ZIP());
    if (url.host === 'huggingface.co') return redirect('https://us.aws.cdn.hf.co/y');
    return h.range === 'bytes=7-' ? ok(MODEL_BYTES.subarray(7), 206) : { status: 416 };
  });
  await clef.runSetup({ ...a, transport });
  assert.deepEqual(readFileSync(join(a.dir, 'models', `${sha(MODEL_BYTES)}.gguf`)), MODEL_BYTES);
  assert.ok(transport.calls.some(c => c.headers.range === 'bytes=7-'));
});

// ------------------------------------------------------------ verify

test('verify re-hashes every kept file and the model: ok when whole, a word for each that is not', async t => {
  const a = setupArgs(t, { yes: true });
  await clef.runSetup(a);
  const good = clef.verify({ dir: a.dir, server: a.server, model: a.model });
  assert.deepEqual(good.failed, []);
  assert.equal(good.lines.length, 4);
  writeFileSync(join(a.dir, 'runtime', 'b1', 'llama-server.exe'), 'MZ forged');
  writeFileSync(join(a.dir, 'runtime', 'b1', 'ggml-cpu.dll'), 'cpu backend!');
  rmSync(join(a.dir, 'runtime', 'b1', 'LICENSE'));
  const bad = clef.verify({ dir: a.dir, server: a.server, model: a.model });
  assert.deepEqual(bad.failed.sort(), ['missing:LICENSE', 'sha256:llama-server.exe', 'size:ggml-cpu.dll']);
  assert.deepEqual(clef.verify({ dir: join(a.dir, 'nowhere'), server: a.server, model: a.model }).failed, ['missing:setup.json']);
});

// ------------------------------------------------------------ the command

test('main: refuses an unknown mode, an unknown flag and a repeated flag, before any folder or request', async t => {
  const out = [];
  const env = { CLAUDE_CONFIG_DIR: tempDir(t, 'clef-claude-') };
  const common = { env, out: l => out.push(l), chdir: () => { throw new Error('chdir'); }, transport: transportOf(() => { throw new Error('a request was made'); }) };
  for (const argv of [[], ['serve'], ['setup', '--url', 'x'], ['setup', '--yes', '--yes'], ['verify', '--yes']]) {
    out.length = 0;
    assert.equal(await clef.main(argv, common), 2, argv.join(' '));
    assert.match(out.at(-1), /^RESULT: refused usage$/);
  }
  assert.equal(existsSync(join(env.CLAUDE_CONFIG_DIR, 'pact-clef')), false, 'a usage refusal makes no folder');
});

test('main: setup without --yes works from CLAUDE_CONFIG_DIR, goes to the clef folder first, and ends RESULT: pass', async t => {
  const out = [];
  const env = { CLAUDE_CONFIG_DIR: tempDir(t, 'clef-claude-') };
  const moved = [];
  const code = await clef.main(['setup'], { env, platform: 'win32', arch: 'x64', execPath: 'C:\\node\\node.exe', cwd: tempDir(t, 'clef-start-'), out: l => out.push(l), chdir: d => moved.push(d), exists: () => false, free: 1e12, transport: transportOf(() => { throw new Error('a request was made'); }) });
  assert.equal(code, 0, out.join('\n'));
  assert.deepEqual(moved, [join(env.CLAUDE_CONFIG_DIR, 'pact-clef')]);
  assert.equal(out.at(-1), 'RESULT: pass');
  assert.ok(out.includes('run again with --yes to fetch'));
});

// PACT-61 adversarial F1, behaviour E1: CLAUDE_CONFIG_DIR is an absolute path or a refusal, never a quiet fall-back that moves the clef folder with the start folder. On Windows it needs a drive letter: a root-relative value moves with the start folder's drive, and a network path is not a local folder.
test('claudeHome: CLAUDE_CONFIG_DIR is used as an absolute path, a relative one is clef-home, and unset or empty is ~/.claude', t => {
  const outside = tempDir(t, 'clef-claude-');
  const home = join(tempDir(t, 'clef-userhome-'), 'h');
  assert.equal(clef.claudeHome({ CLAUDE_CONFIG_DIR: outside }, home), resolve(outside));
  assert.throws(() => clef.claudeHome({ CLAUDE_CONFIG_DIR: 'cfg' }, home), e => e instanceof clef.Refused && e.code === 'clef-home');
  for (const bad of ['..\\x', '\\x', '/x', '\\\\server\\share\\x', '//server/share/x', '\\\\?\\C:\\x', 'cfg']) {
    assert.throws(() => clef.claudeHome({ CLAUDE_CONFIG_DIR: bad }, home, true), e => e.code === 'clef-home', bad);
  }
  assert.equal(clef.claudeHome({ CLAUDE_CONFIG_DIR: 'D:\\claude' }, home, true), resolve('D:\\claude'));
  assert.equal(clef.claudeHome({ CLAUDE_CONFIG_DIR: '' }, home), join(home, '.claude'));
  assert.equal(clef.claudeHome({}, home), join(home, '.claude'));
});

// PACT-61 adversarial E1, further read: the folder checks use real paths, run before anything is made, and bind only an environment value; the default folder may lie under the starting folder.
{
  const link = (target, at) => {
    try {
      symlinkSync(target, at, 'junction');
      return true;
    } catch {
      return false;
    }
  };
  const refusedHome = e => e instanceof clef.Refused && e.code === 'clef-home';
  test('assertOutsideStart: a folder inside the starting folder is clef-home, also through a link and when its parents do not exist yet, and one beside it passes', t => {
    const root = tempDir(t, 'clef-real-');
    const start = join(root, 'repo');
    mkdirSync(start);
    mkdirSync(join(root, 'elsewhere'));
    assert.doesNotThrow(() => clef.assertOutsideStart(join(root, 'elsewhere', 'a', 'pact-clef'), start));
    assert.doesNotThrow(() => clef.assertOutsideStart(join(root, 'repo2', 'pact-clef'), start), 'a sibling with a shared prefix is outside');
    assert.throws(() => clef.assertOutsideStart(join(start, 'a', 'b', 'pact-clef'), start), refusedHome);
    assert.throws(() => clef.assertOutsideStart(start, start), refusedHome);
    assert.equal(existsSync(join(start, 'a')), false, 'the check makes nothing');
    const via = join(root, 'via');
    if (link(start, via)) assert.throws(() => clef.assertOutsideStart(join(via, 'pact-clef'), start), refusedHome, 'through a link');
  });
  test('assertOutsideStart: a starting folder that does not resolve is clef-home, not a skip', t => {
    const root = tempDir(t, 'clef-real-');
    assert.throws(() => clef.assertOutsideStart(join(root, 'pact-clef'), join(root, 'nowhere')), refusedHome);
  });
  test('assertRealFolders: the start folder counts only with checkStart; a plain folder passes', t => {
    const root = tempDir(t, 'clef-real-');
    const dir = join(root, 'repo', 'pact-clef');
    mkdirSync(dir, { recursive: true });
    assert.doesNotThrow(() => clef.assertRealFolders(dir, join(root, 'repo')), 'the default folder may lie under the starting folder (a session started in the home folder)');
    assert.throws(() => clef.assertRealFolders(dir, join(root, 'repo'), { checkStart: true }), refusedHome);
    assert.doesNotThrow(() => clef.assertRealFolders(dir, join(root, 'elsewhere'), { checkStart: false }));
  });
  for (const sub of ['runtime', 'models', 'partial']) {
    test(`assertRealFolders: a linked ${sub} folder is clef-home`, t => {
      const root = tempDir(t, 'clef-real-');
      const dir = join(root, 'pact-clef');
      mkdirSync(dir);
      const target = join(root, 'target');
      mkdirSync(target);
      if (!link(target, join(dir, sub))) return t.skip('this machine cannot make a link');
      assert.throws(() => clef.assertRealFolders(dir, join(root, 'start')), refusedHome);
    });
  }
  test('main: a relative value, one inside the starting folder and one with no real starting folder are refused clef-home before anything is made', async t => {
    const start = tempDir(t, 'clef-start-');
    const cases = [['cfg', start], [join(start, 'cfg'), start], [join(start, 'a', 'b'), start], [join(tempDir(t, 'clef-claude-'), 'cfg'), join(start, 'nowhere')]];
    for (const [value, cwd] of cases) {
      const out = [];
      const code = await clef.main(['verify'], { env: { CLAUDE_CONFIG_DIR: value }, cwd, out: l => out.push(l), chdir: () => { throw new Error('chdir'); } });
      assert.equal(code, 2, value);
      assert.match(out.at(-2), /^REFUSED clef-home: /);
      assert.equal(out.at(-1), 'RESULT: refused clef-home');
    }
    assert.deepEqual(readdirSync(start), [], 'nothing was made inside the starting folder');
  });
  // PACT-61 adversarial F1, second further read: HOME and USERPROFILE can be set by a cloned repo's settings, so the default folder is taken from the account record.
  test('accountHome: the account record answers, not HOME or USERPROFILE', t => {
    const fake = tempDir(t, 'clef-fakehome-');
    const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
    process.env.HOME = fake;
    process.env.USERPROFILE = fake;
    try {
      const got = clef.accountHome();
      assert.notEqual(got, fake);
      assert.equal(got, userInfo().homedir);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
  test('main: with no readable account record the default folder is checked against the starting folder, and nothing is made inside it', async t => {
    const start = tempDir(t, 'clef-start-');
    const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
    process.env.HOME = join(start, 'h');
    process.env.USERPROFILE = join(start, 'h');
    try {
      const out = [];
      const code = await clef.main(['verify'], { env: {}, cwd: start, account: null, out: l => out.push(l), chdir: () => { throw new Error('chdir'); } });
      assert.equal(code, 2);
      assert.match(out.at(-2), /^REFUSED clef-home: /);
      assert.equal(out.at(-1), 'RESULT: refused clef-home');
      assert.deepEqual(readdirSync(start), []);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
  test('main: an account home inside the starting folder is accepted (a session started in the home folder)', async t => {
    const home = tempDir(t, 'clef-acct-');
    const out = [];
    const code = await clef.main(['verify'], { env: {}, cwd: home, account: home, out: l => out.push(l), chdir: () => {} });
    assert.notEqual(out.at(-1), 'RESULT: refused clef-home');
    assert.equal(existsSync(join(home, '.claude', 'pact-clef')), true);
    assert.ok([0, 1].includes(code));
  });
  test('main: a linked runtime folder prints REFUSED clef-home before any chdir', async t => {
    const root = tempDir(t, 'clef-real-');
    const start = join(root, 'repo');
    mkdirSync(start);
    const dirLinked = join(root, 'cfg', 'pact-clef');
    mkdirSync(dirLinked, { recursive: true });
    const target = join(root, 'target');
    mkdirSync(target);
    if (!link(target, join(dirLinked, 'runtime'))) return t.skip('this machine cannot make a link');
    const out = [];
    const code = await clef.main(['verify'], { env: { CLAUDE_CONFIG_DIR: join(root, 'cfg') }, cwd: start, out: l => out.push(l), chdir: () => { throw new Error('chdir'); } });
    assert.equal(code, 2);
    assert.match(out.at(-2), /^REFUSED clef-home: /);
    assert.equal(out.at(-1), 'RESULT: refused clef-home');
  });
}

test('main: a refusal prints REFUSED and RESULT with the word, and exits 2', async t => {
  const out = [];
  const env = { CLAUDE_CONFIG_DIR: tempDir(t, 'clef-claude-') };
  const code = await clef.main(['setup'], { env, platform: 'darwin', arch: 'arm64', execPath: 'C:\\node\\node.exe', cwd: tempDir(t, 'clef-start-'), out: l => out.push(l), chdir: () => {}, exists: () => false, transport: transportOf(() => ({ status: 500 })) });
  assert.equal(code, 2);
  assert.match(out.at(-2), /^REFUSED clef-platform: /);
  assert.equal(out.at(-1), 'RESULT: refused clef-platform');
});

test('main: verify with no setup fails with a word and exit 1', async t => {
  const out = [];
  const code = await clef.main(['verify'], { env: { CLAUDE_CONFIG_DIR: tempDir(t, 'clef-claude-') }, out: l => out.push(l), chdir: () => {} });
  assert.equal(code, 1);
  assert.deepEqual(out, ['missing: setup.json', 'RESULT: fail 1']);
});
