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
import { spawnSync } from 'node:child_process';
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

/** A pax header's body: each record is "<length> <key>=<value>\n", the length counting the whole record. */
function pax(pairs) {
  return pairs.map(([k, v]) => {
    const rest = ` ${k}=${v}\n`;
    let n = rest.length + 1;
    while (String(n).length + rest.length !== n) n = String(n).length + rest.length;
    return `${n}${rest}`;
  }).join('');
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
/** A one-row Linux table whose row names the glibc floor it needs (spec 0005 U3). */
const linuxServer = (glibc = '2.35') => ({ ...miniServer(), archives: { 'linux-x64-cpu': { ...miniServer().archives['win32-x64-cpu'], asset: 'llama-b1-bin-ubuntu-x64.tar.gz', kind: 'tgz', glibc } } });
const miniModel = () => ({ repo: 'ggml-org/Clef-Flash-GGUF', commit: 'a'.repeat(40), file: 'Clef-Flash-Q4_K_M.gguf', size: MODEL_BYTES.length, sha256: sha(MODEL_BYTES) });
// Spec 0011 S9: a second pinned model, `full`, from the full model's own repo.
const FULL_BYTES = Buffer.from('a somewhat larger full model file');
const miniFull = () => ({ repo: 'ggml-org/Clef-GGUF', commit: 'b'.repeat(40), file: 'Clef-Q4_K_M.gguf', size: FULL_BYTES.length, sha256: sha(FULL_BYTES) });
const miniModels = () => ({ flash: miniModel(), full: miniFull() });
const hostsOf = { server: { origin: 'https://github.com', redirects: ['release-assets.githubusercontent.com'] }, model: { origin: 'https://huggingface.co', redirects: ['us.aws.cdn.hf.co'] } };
/** Serves the mini table's archive and model, each through one redirect to its listed host. */
const servingTransport = (zipBuf = ZIP()) => transportOf(url => {
  if (url.host === 'github.com') return redirect('https://release-assets.githubusercontent.com/x');
  if (url.host === 'huggingface.co') return redirect(url.pathname.startsWith('/ggml-org/Clef-GGUF/') ? 'https://us.aws.cdn.hf.co/full' : 'https://us.aws.cdn.hf.co/y');
  if (url.host === 'release-assets.githubusercontent.com') return ok(zipBuf);
  if (url.host === 'us.aws.cdn.hf.co') return ok(url.pathname === '/full' ? FULL_BYTES : MODEL_BYTES);
  return { status: 404 };
});
const setupArgs = (t, over = {}) => ({ dir: join(tempDir(t, 'clef-home-'), 'pact-clef'), platform: 'win32', arch: 'x64', execPath: 'C:\\node\\node.exe', cwd: 'C:\\work', free: 1e12, vulkan: false, exists: () => true, server: miniServer(), models: miniModels(), sources: hostsOf, transport: servingTransport(), ...over });

// ------------------------------------------------------------ the pin table's shape (C3, C21)

// PACT-61 C3: the shipped table passes its own shape check, and the repos are the two the gate names.
test('the shipped pin table passes the shape check, and fixes both repos', () => {
  assert.deepEqual(clef.pinProblems(), []);
  assert.equal(clef.SERVER.repo, 'ggml-org/llama.cpp');
  assert.equal(clef.MODEL.repo, 'ggml-org/Clef-Flash-GGUF');
  assert.ok(Object.isFrozen(clef.SERVER) && Object.isFrozen(clef.MODEL) && Object.isFrozen(clef.SERVER.archives) && Object.isFrozen(clef.SOURCES));
  // Spec 0011 S9: the full model's pin, its repo fixed too, and both ends of the research copy's sha256.
  assert.equal(clef.MODELS.flash, clef.MODEL);
  assert.deepEqual(Object.keys(clef.MODELS), ['flash', 'full']);
  assert.equal(clef.MODELS.full.repo, 'ggml-org/Clef-GGUF');
  assert.equal(clef.MODELS.full.file, 'Clef-Q4_K_M.gguf');
  assert.match(clef.MODELS.full.sha256, /^06a81995[0-9a-f]{52}e1fd$/);
  assert.deepEqual(clef.pinProblems(clef.SERVER, clef.MODELS.full, 'full'), []);
  assert.ok(Object.isFrozen(clef.MODELS) && Object.isFrozen(clef.MODELS.full));
  for (const key of ['win32-x64-cpu', 'win32-x64-vulkan', 'linux-x64-cpu', 'linux-x64-vulkan']) {
    assert.equal(SOURCE_TEXT.split(`'${key}': Object.freeze(`).length, 2, `one row for ${key}`);
    assert.ok(clef.SERVER.archives[key].files.length > 0, `${key} names the files it keeps`);
  }
  // #PACT-91 C-U2 (spec 0005 U3): the three new rows (the glibc floor is held by the shape check above).
  const want = { 'linux-arm64-cpu': ['llama-b12211-bin-ubuntu-arm64.tar.gz', 'tgz'], 'win32-arm64-cpu': ['llama-b12211-bin-win-cpu-arm64.zip', 'zip'], 'darwin-x64-cpu': ['llama-b12211-bin-macos-x64.tar.gz', 'tgz'] };
  for (const [key, [asset, kind]] of Object.entries(want)) {
    assert.equal(SOURCE_TEXT.split(`'${key}': Object.freeze(`).length, 2, `one row for ${key}`);
    assert.deepEqual([clef.SERVER.archives[key].asset, clef.SERVER.archives[key].kind], [asset, kind]);
    assert.ok(clef.SERVER.archives[key].files.length > 0, `${key} names the files it keeps`);
  }
  // Spec 0003 M3: both darwin keys name the one macOS row, which keeps the server and its .0.dylib copies.
  const mac = clef.SERVER.archives['darwin-arm64-metal'];
  assert.equal(clef.SERVER.archives['darwin-arm64-cpu'], mac, 'both darwin keys name one row');
  assert.equal(mac.asset, 'llama-b12211-bin-macos-arm64.tar.gz');
  assert.equal(mac.kind, 'tgz');
  assert.equal(mac.exe, 'llama-b12211/llama-server');
  assert.ok(mac.files.some(r => r[3] === 'libggml-base.0.dylib'), 'a dylib is kept under the name the server loads');
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
    // Spec 0003 M3: two keys may name one asset only when their rows are equal field for field.
    { id: 'asset-shared-unequal', plant: x => { x.server.archives['win32-x64-vulkan'].asset = first(x.server).asset; x.server.archives['win32-x64-vulkan'].size += 1; return x; }, fails: ['asset-shared'], why: 'one asset, two different rows' },
    { id: 'asset-shared-unequal-files', plant: x => { const v = x.server.archives['win32-x64-vulkan']; v.asset = first(x.server).asset; v.size = first(x.server).size; v.sha256 = first(x.server).sha256; v.files = first(x.server).files.map(r => [...r]); v.files[0][1] += 1; return x; }, fails: ['asset-shared'], why: 'one asset, rows equal in size and sha256 but not in a kept file' },
    { id: 'asset-shared-unequal-kind', plant: x => { const v = x.server.archives['win32-x64-vulkan']; const a = first(x.server); v.asset = a.asset; v.size = a.size; v.sha256 = a.sha256; v.files = a.files.map(r => [...r]); v.kind = a.kind === 'zip' ? 'tgz' : 'zip'; return x; }, fails: ['asset-shared'], why: 'one asset, rows equal in size, sha256 and files but not in kind' },
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
    { id: 'platform-key', plant: x => { x.server.archives['freebsd-x64-cpu'] = x.server.archives['win32-x64-cpu']; return x; }, fails: ['platform-key'], why: 'only the nine platform keys; FreeBSD has none' },
    // #PACT-91 C-U2: a Linux row names its glibc floor as 2.<minor>.
    { id: 'glibc-missing', plant: x => { const r = linuxServer().archives['linux-x64-cpu']; delete r.glibc; x.server.archives['linux-x64-cpu'] = r; return x; }, fails: ['glibc'], why: 'a Linux row without its glibc floor' },
    { id: 'glibc-patch-level', plant: x => { x.server.archives['linux-x64-cpu'] = linuxServer('2.35.1').archives['linux-x64-cpu']; return x; }, fails: ['glibc'], why: 'major and minor only' },
    { id: 'glibc-other-major', plant: x => { x.server.archives['linux-x64-cpu'] = linuxServer('3.0').archives['linux-x64-cpu']; return x; }, fails: ['glibc'], why: 'glibc is 2.x' },
    { id: 'glibc-a-number', plant: x => { x.server.archives['linux-x64-cpu'] = linuxServer(2.35).archives['linux-x64-cpu']; return x; }, fails: ['glibc'], why: 'a string, since 2.4 and 2.40 must not collide' },
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
    { id: 'tar-pax', run: () => clef.readTgz(tgz([{ name: 'pax', type: 'x', data: pax([['path', 'a']]) }]), {}), why: 'a pax header naming a path' },
    // Spec 0003 M4: a pax record of either kind that names a path, a link, a size or any key off the list refuses.
    { id: 'tar-pax-global-path', run: () => clef.readTgz(tgz([{ name: 'pax', type: 'g', data: pax([['path', 'a']]) }, { name: 'a', data: 'y' }]), {}), why: 'a global pax header naming a path' },
    { id: 'tar-pax-linkpath', run: () => clef.readTgz(tgz([{ name: 'pax', type: 'x', data: pax([['mtime', '1'], ['linkpath', 'b']]) }, { name: 'a', data: 'y' }]), {}), why: 'a pax link path beside a time' },
    { id: 'tar-pax-size', run: () => clef.readTgz(tgz([{ name: 'pax', type: 'x', data: pax([['size', '9']]) }, { name: 'a', data: 'y' }]), {}), why: 'a pax size' },
    { id: 'tar-pax-other-key', run: () => clef.readTgz(tgz([{ name: 'pax', type: 'x', data: pax([['uname', 'x']]) }, { name: 'a', data: 'y' }]), {}), why: 'a pax key off the list' },
    { id: 'tar-pax-malformed', run: () => clef.readTgz(tgz([{ name: 'pax', type: 'x', data: '99 mtime=1\n' }, { name: 'a', data: 'y' }]), {}), why: 'a pax record whose length is wrong' },
    { id: 'tar-gnu-long', run: () => clef.readTgz(tgz([{ name: 'long', type: 'L', data: 'a'.repeat(200) }]), {}), why: 'a GNU long name' },
    { id: 'tar-device', run: () => clef.readTgz(tgz([{ name: 'dev', type: '3' }]), {}), why: 'a device' },
    { id: 'tar-not-gzip', run: () => clef.readTgz(Buffer.from('plain'), {}), why: 'not gzip' },
  ];
  // Spec 0003 M4: the macOS build's tar holds xattr- and time-only pax records, local and global; they are read and ignored.
  test('tar reader: a local or global pax header holding only xattr, LIBARCHIVE and time keys is ignored, and the entry after it is read', () => {
    const quiet = pax([['SCHILY.xattr.com.apple.provenance', 'x'], ['LIBARCHIVE.creationtime', '1'], ['mtime', '1.5'], ['atime', '1'], ['ctime', '1']]);
    const r = clef.readTgz(tgz([{ name: 'g', type: 'g', data: quiet }, { name: 'x', type: 'x', data: quiet }, { name: 'real.txt', data: 'ok' }]), {});
    assert.deepEqual(r.entries.map(e => [e.path, e.kind, e.data && e.data.toString()]), [['real.txt', 'file', 'ok']]);
  });
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
  // Spec 0003 M4: the macOS executable gets mode 0755, as the Linux one does.
  test('unpack: on macOS the executable gets mode 0755', { skip: process.platform === 'win32' && 'Windows keeps no mode bits (not run)' }, t => {
    const body = Buffer.from('server');
    const tgzBuf = tgz([{ name: 'b/llama-server', data: body }]);
    const row = { asset: 'llama-b1-bin-macos-arm64.tar.gz', size: tgzBuf.length, sha256: sha(tgzBuf), kind: 'tgz', exe: 'b/llama-server', files: [['b/llama-server', body.length, sha(body)]] };
    const a = setupArgs(t, { server: { ...miniServer(), archives: { 'darwin-arm64-metal': row } } });
    mkdirSync(join(a.dir, 'partial'), { recursive: true });
    const archivePath = join(a.dir, 'partial', 'x.tar.gz');
    writeFileSync(archivePath, tgzBuf);
    clef.unpackServer({ dir: a.dir, key: 'darwin-arm64-metal', archivePath, platform: 'darwin', server: a.server });
    assert.equal(statSync(join(a.dir, 'runtime', 'b1', 'llama-server')).mode & 0o777, 0o755);
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
    assert.deepEqual(clef.verify({ dir: a.dir, server: a.server, models: a.models }).failed, []);
    writeFileSync(join(runtime, 'ggml-cpu.so.0'), 'tampered, longer');
    assert.deepEqual(clef.verify({ dir: a.dir, server: a.server, models: a.models }).failed, ['size:ggml-cpu.so.0']);
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
  // Spec 0003 M4: Apple Silicon picks Metal, or CPU with --cpu.
  assert.deepEqual(clef.pickPlatform({ platform: 'darwin', arch: 'arm64', vulkan: false, cpu: false }), { key: 'darwin-arm64-metal', backend: 'metal', why: 'Apple Silicon: Metal' });
  assert.deepEqual(clef.pickPlatform({ platform: 'darwin', arch: 'arm64', vulkan: false, cpu: true }), { key: 'darwin-arm64-cpu', backend: 'cpu', why: 'CPU forced by --cpu' });
  const probe = SOURCE_TEXT.slice(SOURCE_TEXT.indexOf('export function probeVulkan'), SOURCE_TEXT.indexOf('export function pickPlatform'));
  assert.ok(probe.length > 100);
  assert.doesNotMatch(probe, /spawn|exec|child_process/, 'the probe starts nothing');
  // Spec 0003 M5: the one fork is the supervisor starting its keeper from this same file.
  assert.equal(SOURCE_TEXT.split(/\bfork\(/).length - 1, 1, 'one fork');
  assert.match(SOURCE_TEXT, /\bfork\(scriptPath, \['keep'\], keeperOptions\)/);
  // The keeper is this file, run with no node flags and the node that runs the supervisor (no execPath).
  assert.ok(SOURCE_TEXT.includes('const scriptPath = fileURLToPath(import.meta.url);'), 'the keeper is this file, not the watched script');
  const options = SOURCE_TEXT.match(/const keeperOptions = \{[^\n]*\};/)?.[0] ?? '';
  assert.match(options, /\bexecArgv: \[\]/);
  assert.doesNotMatch(options, /execPath/);
  assert.match(options, /env: serveEnv\(env, platform, p\.runtime\)/);
  // The only way in to child processes is the one import line.
  assert.ok(SOURCE_TEXT.includes("import { fork, spawn } from 'node:child_process';\n"), 'the one child_process import');
  assert.equal(SOURCE_TEXT.split('child_process').length - 1, 1, 'nothing else names child_process');
  assert.doesNotMatch(SOURCE_TEXT, /execFile|execSync|spawnSync|shell: true/, 'no shell and no helper program');
  assert.equal(SOURCE_TEXT.split('spawn(').length - 1, 2, 'the supervisor and the server are the only programs started');
});

// #PACT-91 C-U1 (spec 0005 U4): the pick on arm64, on an Intel Mac and under emulation, and the arches it refuses.
test('pickPlatform: arm64 on Windows and Linux picks CPU even with a Vulkan loader, and says why', () => {
  const why = 'arm64: CPU (Vulkan on arm64 is not checked yet)';
  for (const platform of ['win32', 'linux']) {
    for (const vulkan of [true, false]) {
      for (const cpu of [true, false]) assert.deepEqual(clef.pickPlatform({ platform, arch: 'arm64', vulkan, cpu }), { key: `${platform}-arm64-cpu`, backend: 'cpu', why });
    }
  }
});

test('pickPlatform: an Intel Mac picks darwin-x64-cpu with and without --cpu', () => {
  const want = { key: 'darwin-x64-cpu', backend: 'cpu', why: 'x64 node: CPU build; on Apple Silicon, use an arm64 node for Metal' };
  assert.deepEqual(clef.pickPlatform({ platform: 'darwin', arch: 'x64', vulkan: false, cpu: false }), want);
  assert.deepEqual(clef.pickPlatform({ platform: 'darwin', arch: 'x64', vulkan: false, cpu: true }), want);
});

test('pickPlatform: an x64 node on an arm64 Windows machine picks CPU even with a Vulkan loader; elsewhere Vulkan holds', () => {
  assert.deepEqual(clef.pickPlatform({ platform: 'win32', arch: 'x64', vulkan: true, cpu: false, machine: 'arm64' }), { key: 'win32-x64-cpu', backend: 'cpu', why: 'x64 node on an arm64 machine: CPU' });
  assert.equal(clef.pickPlatform({ platform: 'win32', arch: 'x64', vulkan: true, cpu: false, machine: 'x86_64' }).key, 'win32-x64-vulkan');
  assert.equal(clef.pickPlatform({ platform: 'win32', arch: 'x64', vulkan: true, cpu: false }).key, 'win32-x64-vulkan');
});

for (const [platform, arch] of [['linux', 'ia32'], ['win32', 'ia32'], ['linux', 's390x'], ['linux', 'ppc64'], ['darwin', 'ia32'], ['freebsd', 'x64']]) {
  test(`pickPlatform: ${platform} ${arch} has no build`, () => assert.equal(clef.pickPlatform({ platform, arch, vulkan: false, cpu: false }), null));
}

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
  const r = await clef.runSetup({ dir, platform: 'win32', arch: 'x64', execPath: 'C:\\node\\node.exe', cwd: 'C:\\work', free: 1e12, vulkan: true, machine: 'x86_64', exists: () => true, transport });
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
    { id: 'no-platform-freebsd', plant: () => ({ platform: 'freebsd', arch: 'x64' }), fails: ['clef-platform'], why: 'FreeBSD has no build (spec 0005 C-U1; the Intel Mac refusal moved here)' },
    { id: 'no-platform-ia32', plant: () => ({ arch: 'ia32' }), fails: ['clef-platform'], why: 'a 32-bit node has no build' },
    { id: 'no-row-for-key', plant: () => ({ server: { ...miniServer(), archives: {} } }), fails: ['clef-platform'], why: 'the table has no row for the platform' },
    { id: 'too-little-space', plant: () => ({ free: 100 }), fails: ['clef-space'], why: 'the drive cannot hold the files' },
    { id: 'node-in-the-folder', plant: () => ({ execPath: 'C:\\work\\evil\\node.exe', cwd: 'C:\\work' }), fails: ['clef-node'], why: 'a node inside the starting folder' },
    { id: 'node-in-the-folder-cased', plant: () => ({ execPath: 'c:\\WORK\\node.exe', cwd: 'C:\\work' }), fails: ['clef-node'], why: 'Windows compares names without case' },
    { id: 'linux-without-setpriv', plant: () => ({ platform: 'linux', exists: () => false, glibc: '2.35', server: linuxServer() }), fails: ['clef-setpriv'], why: 'Linux needs /usr/bin/setpriv' },
    // #PACT-91 C-U3: the C library is checked before any fetch.
    { id: 'linux-without-glibc', plant: () => ({ platform: 'linux', glibc: null, server: linuxServer() }), fails: ['clef-platform'], why: 'a musl system reports no glibc' },
    { id: 'linux-glibc-below-the-row', plant: () => ({ platform: 'linux', glibc: '2.34', server: linuxServer('2.35') }), fails: ['clef-platform'], why: 'the row needs 2.35' },
    { id: 'linux-glibc-2-4-below-2-35', plant: () => ({ platform: 'linux', glibc: '2.4', server: linuxServer('2.35') }), fails: ['clef-platform'], why: 'versions compare as integers, so 2.4 is below 2.35' },
    // #PACT-91 C-U3 (decision 93): the Visual C++ runtime is checked before any fetch.
    { id: 'windows-without-msvcp140', plant: () => ({ exists: p => !/MSVCP140\.dll$/i.test(p) }), fails: ['clef-platform'], why: 'MSVCP140.dll is missing from System32' },
    { id: 'windows-without-vcruntime140', plant: () => ({ exists: p => !/VCRUNTIME140\.dll$/i.test(p) }), fails: ['clef-platform'], why: 'VCRUNTIME140.dll is missing from System32' },
    { id: 'windows-x64-without-vcruntime140-1', plant: () => ({ exists: p => !/VCRUNTIME140_1\.dll$/i.test(p) }), fails: ['clef-platform'], why: 'the x64 build also needs VCRUNTIME140_1.dll' },
    { id: 'bad-pin', plant: () => ({ models: { ...miniModels(), flash: { ...miniModel(), commit: 'main' } } }), fails: ['clef-pin'], why: 'a table that fails its shape check fetches nothing' },
    // Spec 0011 S9.
    { id: 'flash-pin-names-the-full-repo', plant: () => ({ models: { ...miniModels(), flash: { ...miniModel(), repo: miniFull().repo } } }), fails: ['clef-pin'], why: 'the flash pin stays in the flash repo' },
    { id: 'full-pin-names-the-flash-repo', plant: () => ({ variant: 'full', models: { ...miniModels(), full: { ...miniFull(), repo: miniModel().repo } } }), fails: ['clef-pin'], why: 'the full pin stays in the full repo' },
    { id: 'too-little-space-for-full', plant: () => ({ variant: 'full', free: 1000, models: { ...miniModels(), full: { ...miniFull(), size: 5000 } } }), fails: ['clef-space'], why: 'the free-space check counts the variant\'s model' },
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
  // #PACT-91 C-U3: at or above the row's glibc, setup passes the check.
  // The seam answers only for setpriv, so a pass also shows that no OpenSSL file is asked for (decision 93: no OpenSSL check on Linux).
  for (const glibc of ['2.35', '2.36', '2.100', '3.0']) {
    test(`setup: glibc ${glibc} passes a row that needs 2.35`, t => {
      assert.doesNotThrow(() => clef.planSetup({ ...setupArgs(t), platform: 'linux', exists: p => p === '/usr/bin/setpriv', glibc, server: linuxServer('2.35') }));
    });
  }
  // #PACT-91 C-U3: the real read takes glibcVersionRuntime from the report, asks it without network lookups, and answers null where there is none.
  test('runtimeGlibc: reads glibcVersionRuntime, leaves excludeNetwork as it found it, and gives null for musl or a failing report', () => {
    let seen;
    const report = { excludeNetwork: false, getReport() { seen = this.excludeNetwork; return { header: { glibcVersionRuntime: '2.31', glibcVersionCompiler: '9.99' } }; } };
    assert.equal(clef.runtimeGlibc(report), '2.31');
    assert.equal(seen, true, 'the report is built without network lookups');
    assert.equal(report.excludeNetwork, false, 'the setting is put back');
    assert.equal(clef.runtimeGlibc({ getReport: () => ({ header: {} }) }), null);
    assert.equal(clef.runtimeGlibc({ getReport() { throw new Error('no report'); } }), null);
  });
  test('setup: the glibc refusal names both versions, and the musl one says the builds need glibc', t => {
    const plan = glibc => () => clef.planSetup({ ...setupArgs(t), platform: 'linux', exists: () => true, glibc, server: linuxServer('2.35') });
    assert.throws(plan('2.34'), e => e.code === 'clef-platform' && /2\.34/.test(e.message) && /2\.35/.test(e.message) && /newer glibc distribution/.test(e.message));
    assert.throws(plan(null), e => e.code === 'clef-platform' && e.message === 'the pinned Linux builds need glibc; this system has none');  });
  // #PACT-91 C-U3 (decision 93): the message names the redistributable, the seam sees System32 paths, and the arm64 build needs no VCRUNTIME140_1.
  test('setup: a missing Visual C++ runtime names the redistributable and the missing files, looks under the given system folder, and prints no environment path', t => {
    const seen = [];
    const exists = p => { seen.push(p); return !/MSVCP140\.dll$|VCRUNTIME140_1\.dll$/i.test(p); };
    assert.throws(() => clef.planSetup({ ...setupArgs(t), exists, systemRoot: 'D:\\Win' }), e => e.code === 'clef-platform' && /Microsoft Visual C\+\+ Redistributable/.test(e.message) && /MSVCP140\.dll/.test(e.message) && /VCRUNTIME140_1\.dll/.test(e.message) && /%SystemRoot%\\System32/.test(e.message) && !/D:\\Win/.test(e.message));
    assert.ok(seen.includes('D:\\Win\\System32\\MSVCP140.dll'), seen.join('\n'));
  });
  test('setup: the Vulkan probe looks under the same system folder', t => {
    const seen = [];
    clef.planSetup({ ...setupArgs(t), vulkan: undefined, exists: p => { seen.push(p); return true; }, systemRoot: 'D:\\Win' });
    assert.ok(seen.some(p => /^D:.Win.System32.vulkan-1\.dll$/.test(p)), seen.join('\n'));
  });
  test('setup: the arm64 Windows build needs MSVCP140.dll and VCRUNTIME140.dll but not VCRUNTIME140_1.dll, and runs no Vulkan probe', t => {
    const server = { ...miniServer(), archives: { 'win32-arm64-cpu': miniServer().archives['win32-x64-cpu'] } };
    const seen = [];
    assert.doesNotThrow(() => clef.planSetup({ ...setupArgs(t), arch: 'arm64', exists: p => { seen.push(p); return !/VCRUNTIME140_1\.dll$/i.test(p); }, vulkan: undefined, server }));
    assert.ok(seen.length > 0 && !seen.some(p => /vulkan/i.test(p)), seen.join('\n'));
    assert.throws(() => clef.planSetup({ ...setupArgs(t), arch: 'arm64', exists: p => !/VCRUNTIME140\.dll$/i.test(p), server }), e => e.code === 'clef-platform');
  });
  test('setup: an x64 node on an arm64 Windows machine plans the CPU build, told by the machine read when none is given', t => {
    const plan = clef.planSetup({ ...setupArgs(t), vulkan: true, machine: 'arm64' });
    assert.equal(plan.pick.key, 'win32-x64-cpu');
    assert.match(plan.lines.join('\n'), /^platform: win32-x64-cpu \(x64 node on an arm64 machine: CPU\)$/m);
    assert.equal(clef.planSetup({ ...setupArgs(t), vulkan: true, readMachine: () => 'arm64' }).pick.key, 'win32-x64-cpu');
    assert.equal(clef.planSetup({ ...setupArgs(t), vulkan: true, readMachine: () => 'x86_64' }).pick.key, 'win32-x64-vulkan');
  });
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
  assert.deepEqual(JSON.parse(readFileSync(join(a.dir, 'setup.json'), 'utf8')), { platform: 'win32-x64-cpu', tag: 'b1', model: sha(MODEL_BYTES), variant: 'flash', backend: 'cpu', node: 'C:\\node\\node.exe' });
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
  assert.deepEqual(clef.verify({ dir: a.dir, server: a.server, models: a.models }).failed.sort(), ['sha256:ggml-cpu.dll', `sha256:model ${sha(MODEL_BYTES).slice(0, 8)}`]);
  const dry = await clef.runSetup({ ...a, yes: false });
  assert.match(dry.lines.join('\n'), /^present \(sizes match\), skipped unless its sha256 fails: server b1/m, 'the plan does not claim a hash it did not make');
  const again = await clef.runSetup({ ...a, transport: servingTransport() });
  assert.match(again.lines.join('\n'), /^sha256 failed, fetching again: server b1$/m);
  assert.match(again.lines.join('\n'), /^sha256 failed, fetching again: model /m);
  assert.deepEqual(clef.verify({ dir: a.dir, server: a.server, models: a.models }).failed, []);
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
  const good = clef.verify({ dir: a.dir, server: a.server, models: a.models });
  assert.deepEqual(good.failed, []);
  assert.equal(good.lines.length, 4);
  writeFileSync(join(a.dir, 'runtime', 'b1', 'llama-server.exe'), 'MZ forged');
  writeFileSync(join(a.dir, 'runtime', 'b1', 'ggml-cpu.dll'), 'cpu backend!');
  rmSync(join(a.dir, 'runtime', 'b1', 'LICENSE'));
  const bad = clef.verify({ dir: a.dir, server: a.server, models: a.models });
  assert.deepEqual(bad.failed.sort(), ['missing:LICENSE', 'sha256:llama-server.exe', 'size:ggml-cpu.dll']);
  assert.deepEqual(clef.verify({ dir: join(a.dir, 'nowhere'), server: a.server, models: a.models }).failed, ['missing:setup.json']);
  const path = join(a.dir, 'setup.json');
  writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), variant: 'huge' }));
  const unknown = clef.verify({ dir: a.dir, server: a.server, models: a.models });
  assert.deepEqual([unknown.lines, unknown.failed], [['unknown: variant'], ['unknown:variant']], 'a record that is there, naming no variant the table has');
});

// ------------------------------------------------------------ the full variant (spec 0011 S9, claim 14)

const statusOf = async a => (await clef.statusRun({ dir: a.dir, server: a.server, models: a.models })).lines;

test('setup --variant full: the plan names the variant and its size, setup.json records it, status prints it, and verify re-hashes the recorded model', async t => {
  const a = setupArgs(t, { variant: 'full' });
  const plan = await clef.runSetup(a);
  assert.ok(plan.lines.includes(`variant: full (model Clef-Q4_K_M.gguf, ${(FULL_BYTES.length / 1e6).toFixed(1)} MB)`), plan.lines.join('\n'));
  await clef.runSetup({ ...a, yes: true });
  const setup = JSON.parse(readFileSync(join(a.dir, 'setup.json'), 'utf8'));
  assert.deepEqual([setup.variant, setup.model], ['full', sha(FULL_BYTES)]);
  const lines = await statusOf(a);
  assert.ok(lines.includes(`model: ${sha(FULL_BYTES).slice(0, 8)}`) && lines.includes('variant: full'), lines.join('|'));
  assert.deepEqual(clef.verify({ dir: a.dir, server: a.server, models: a.models }).failed, []);
  writeFileSync(join(a.dir, 'models', `${sha(FULL_BYTES)}.gguf`), Buffer.alloc(FULL_BYTES.length, 1));
  assert.deepEqual(clef.verify({ dir: a.dir, server: a.server, models: a.models }).failed, [`sha256:model ${sha(FULL_BYTES).slice(0, 8)}`]);
});

test('changing the variant keeps the other model the table names, and a switch back hashes it instead of fetching it', async t => {
  const a = setupArgs(t, { yes: true });
  await clef.runSetup(a);
  await clef.runSetup({ ...a, variant: 'full' });
  assert.deepEqual(readdirSync(join(a.dir, 'models')).sort(), [`${sha(MODEL_BYTES)}.gguf`, `${sha(FULL_BYTES)}.gguf`].sort());
  const back = await clef.runSetup({ ...a, transport: transportOf(() => { throw new Error('a request was made'); }) });
  assert.ok(back.lines.includes(`checked: model ${sha(MODEL_BYTES).slice(0, 8)}`), back.lines.join('\n'));
  assert.equal(JSON.parse(readFileSync(join(a.dir, 'setup.json'), 'utf8')).variant, 'flash');
});

test('a setup.json with no variant reads as flash', async t => {
  const a = setupArgs(t, { yes: true });
  await clef.runSetup(a);
  const path = join(a.dir, 'setup.json');
  const { variant, ...old } = JSON.parse(readFileSync(path, 'utf8'));
  writeFileSync(path, JSON.stringify(old));
  assert.ok((await statusOf(a)).includes('variant: flash'));
  assert.deepEqual(clef.verify({ dir: a.dir, server: a.server, models: a.models }).failed, []);
});

// ------------------------------------------------------------ the command

test('main: refuses an unknown mode, an unknown flag and a repeated flag, before any folder or request', async t => {
  const out = [];
  const env = { CLAUDE_CONFIG_DIR: tempDir(t, 'clef-claude-') };
  const common = { env, out: l => out.push(l), chdir: () => { throw new Error('chdir'); }, transport: transportOf(() => { throw new Error('a request was made'); }) };
  for (const argv of [[], ['nonsense'], ['setup', '--url', 'x'], ['setup', '--yes', '--yes'], ['verify', '--yes'], ['ensure', '--wait'], ['ensure', '--wait', '61'], ['ensure', '--wait', 'x'], ['ensure', '--yes'], ['stop', '--yes'], ['status', 'x'], ['remove', '--wait', '1'], ['serve', '--yes'], ['setup', '--variant'], ['setup', '--variant', 'huge'], ['setup', '--variant', '__proto__'], ['setup', '--variant', 'full', '--variant', 'full'], ['verify', '--variant', 'full']]) {
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
  const code = await clef.main(['setup'], { env, platform: 'win32', arch: 'x64', execPath: 'C:\\node\\node.exe', cwd: tempDir(t, 'clef-start-'), out: l => out.push(l), chdir: d => moved.push(d), exists: p => /(MSVCP140|VCRUNTIME140(_1)?)\.dll$/i.test(p), free: 1e12, transport: transportOf(() => { throw new Error('a request was made'); }) });
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
  // Spec 0003 M4: macOS's default volume folds case, so a clef folder named in another case of the starting folder is inside it.
  test('assertOutsideStart: with case folding, a folder under another case of the starting folder is clef-home', t => {
    const root = tempDir(t, 'clef-fold-');
    const start = join(root, 'repo');
    mkdirSync(start);
    const cased = join(root, 'REPO', 'pact-clef');
    assert.throws(() => clef.assertOutsideStart(cased, start, process.platform === 'win32', true), refusedHome);
    if (process.platform === 'linux') assert.doesNotThrow(() => clef.assertOutsideStart(cased, start, false, false), 'without folding, another case is another folder');
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

// #PACT-91 C-U1 (spec 0005 U4, replacing spec 0003 M4's Rosetta refusal): an x64 node on macOS plans the CPU build and says what to use for Metal; neither arch probes for Vulkan.
test('setup on darwin: x64 plans the CPU build with the arm64-node words, and neither arch looks for a Vulkan loader', t => {
  const looked = [];
  const exists = p => { looked.push(p); return false; };
  const x64 = clef.planSetup({ dir: tempDir(t, 'clef-dir-'), platform: 'darwin', arch: 'x64', execPath: '/opt/node/bin/node', cwd: tempDir(t, 'clef-start-'), free: 1e12, exists });
  assert.equal(x64.pick.key, 'darwin-x64-cpu');
  assert.match(x64.lines.join('\n'), /^platform: darwin-x64-cpu \(x64 node: CPU build; on Apple Silicon, use an arm64 node for Metal\)$/m);
  const plan = clef.planSetup({ dir: tempDir(t, 'clef-dir-'), platform: 'darwin', arch: 'arm64', execPath: '/opt/node/bin/node', cwd: tempDir(t, 'clef-start-'), free: 1e12, exists });
  assert.equal(plan.key ?? plan.pick?.key, 'darwin-arm64-metal');
  assert.deepEqual(looked.filter(p => /vulkan/i.test(p)), [], 'no Vulkan probe on macOS');
});

// Spec 0003 M4: on macOS the node check folds case too.
test('setup on darwin: a node under another case of the starting folder is clef-node', t => {
  assert.throws(() => clef.planSetup({ dir: tempDir(t, 'clef-dir-'), platform: 'darwin', arch: 'arm64', execPath: '/WORK/evil/node', cwd: '/work', free: 1e12 }), e => e.code === 'clef-node');
});

test('main: a refusal prints REFUSED and RESULT with the word, and exits 2', async t => {
  const out = [];
  const env = { CLAUDE_CONFIG_DIR: tempDir(t, 'clef-claude-') };
  const code = await clef.main(['setup'], { env, platform: 'freebsd', arch: 'x64', execPath: 'C:\\node\\node.exe', cwd: tempDir(t, 'clef-start-'), out: l => out.push(l), chdir: () => {}, exists: () => false, transport: transportOf(() => ({ status: 500 })) });
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

// Spec 0003 C-M9, C-M10: setup on macOS keeps the darwin row, verify re-hashes it, status names it, and nothing it fetched is quarantined.
test('setup on macOS: the darwin row is kept, verify re-hashes it, status names its platform and backend, and no fetched file is quarantined', async t => {
  const body = Buffer.from('server');
  const lib = Buffer.from('dylib');
  const tgzBuf = tgz([{ name: 'b/llama-server', data: body }, { name: 'b/libggml.0.1.dylib', data: lib }]);
  const row = { asset: 'llama-b1-bin-macos-arm64.tar.gz', size: tgzBuf.length, sha256: sha(tgzBuf), kind: 'tgz', exe: 'b/llama-server', files: [['b/libggml.0.1.dylib', lib.length, sha(lib), 'libggml.0.dylib'], ['b/llama-server', body.length, sha(body)]] };
  const server = { ...miniServer(), archives: { 'darwin-arm64-metal': row, 'darwin-arm64-cpu': row } };
  const a = setupArgs(t, { yes: true, platform: 'darwin', arch: 'arm64', execPath: '/opt/node/bin/node', cwd: '/work', server, transport: servingTransport(tgzBuf) });
  await clef.runSetup(a);
  const runtime = join(a.dir, 'runtime', 'b1');
  assert.deepEqual(readdirSync(runtime).sort(), ['libggml.0.1.dylib', 'libggml.0.dylib', 'llama-server']);
  assert.deepEqual(clef.verify({ dir: a.dir, server, models: a.models }).failed, []);
  writeFileSync(join(runtime, 'libggml.0.dylib'), 'DYLIB');
  assert.deepEqual(clef.verify({ dir: a.dir, server, models: a.models }).failed, ['sha256:libggml.0.dylib'], 'the copy is re-hashed too');
  const st = await clef.statusRun({ dir: a.dir });
  assert.ok(st.lines.includes('platform: darwin-arm64-metal') && st.lines.includes('backend: metal'), st.lines.join('|'));
  // xattr exits non-zero for a missing file too, so each file is shown to exist first, on every job.
  const fetched = [join(runtime, 'llama-server'), join(a.dir, 'models', `${sha(MODEL_BYTES)}.gguf`)];
  for (const f of fetched) assert.ok(existsSync(f), `${f} was fetched`);
  if (process.platform === 'darwin') {
    for (const f of fetched) {
      const r = spawnSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', f], { encoding: 'utf8' });
      assert.notEqual(r.status, 0, `no quarantine on ${f}`);
      assert.match(r.stderr, /No such xattr: com\.apple\.quarantine/, 'it failed because the attribute is absent');
    }
  }
});
