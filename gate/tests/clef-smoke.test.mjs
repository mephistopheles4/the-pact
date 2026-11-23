// PACT-82, spec 0003 M7: the gate-macos smoke step's script. Nothing here
// touches the network or runs a real server: the transport serves a small
// archive, and `run` is a stand-in that records how the server would be run.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { SERVER } from '../../claude/tools/clef.mjs';
import { KEY, smoke } from './clef-smoke.mjs';
import { tempDir } from './tree.mjs';

const sha = b => createHash('sha256').update(b).digest('hex');

/** A gzipped ustar of the given entries { name, data }. */
function tgz(entries) {
  const parts = [];
  for (const e of entries) {
    const data = Buffer.from(e.data);
    const head = Buffer.alloc(512);
    head.write(e.name, 0, 'latin1');
    head.write('0000644\0', 100, 'latin1');
    head.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 'latin1');
    head.write('0', 156, 'latin1');
    head.write('ustar\0', 257, 'latin1');
    parts.push(head, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts));
}

const BODY = 'server bytes';
const ARCHIVE = tgz([{ name: 'b/llama-server', data: BODY }, { name: 'b/README', data: 'not kept' }]);
const table = (archive = ARCHIVE) => ({
  repo: 'ggml-org/llama.cpp',
  tag: 'b1',
  archives: { [KEY]: { asset: 'llama-b1-bin-macos-arm64.tar.gz', size: archive.length, sha256: sha(archive), kind: 'tgz', exe: 'b/llama-server', files: [['b/llama-server', Buffer.byteLength(BODY), sha(BODY)]] } },
});
const serving = bytes => async () => ({ status: 200, headers: {}, body: Readable.from([bytes]) });
const recorder = (result = { status: 0, stdout: 'version: b1\n', stderr: '' }) => {
  const calls = [];
  const run = (file, args, opts) => (calls.push({ file, args, opts }), result);
  run.calls = calls;
  return run;
};

test('the smoke run uses the pinned darwin-arm64-cpu row, a tgz of a macOS arm64 build', () => {
  assert.equal(KEY, 'darwin-arm64-cpu');
  assert.match(SERVER.archives[KEY].asset, /-bin-macos-arm64\.tar\.gz$/);
  assert.equal(SERVER.archives[KEY].kind, 'tgz');
});

test('smoke: fetches the pinned archive, unpacks it, and runs the server with --device none --version in its folder and named environment', async t => {
  const dir = join(tempDir(t, 'clef-smoke-'), 'pact-clef');
  const run = recorder();
  const r = await smoke({ dir, server: table(), transport: serving(ARCHIVE), run, env: { HOME: '/h', TMPDIR: '/t', HF_TOKEN: 'secret', DYLD_INSERT_LIBRARIES: '/evil' } });
  assert.equal(r.status, 0);
  assert.equal(run.calls.length, 1);
  const [c] = run.calls;
  assert.equal(c.file, join(dir, 'runtime', 'b1', 'llama-server'));
  assert.deepEqual(c.args, ['--device', 'none', '--version']);
  assert.equal(c.opts.cwd, join(dir, 'runtime', 'b1'));
  assert.deepEqual(Object.keys(c.opts.env).sort(), ['HOME', 'PATH', 'TMPDIR']);
  assert.equal(c.opts.shell, false);
});

test('bad case: smoke refuses an archive that is not the pinned bytes, and runs nothing', async t => {
  const dir = join(tempDir(t, 'clef-smoke-'), 'pact-clef');
  const run = recorder();
  const other = Buffer.from(ARCHIVE);
  other[other.length - 1] ^= 1;
  await assert.rejects(smoke({ dir, server: table(), transport: serving(other), run }), e => e.code === 'clef-hash');
  assert.equal(run.calls.length, 0);
});

for (const [label, result, says] of [
  ['exits 1', { status: 1, stdout: '', stderr: 'bad' }, /status 1/],
  ['is ended by a signal', { status: null, signal: 'SIGKILL' }, /signal SIGKILL/],
  ['cannot be started', { status: null, error: new Error('spawn ENOENT') }, /spawn ENOENT/],
]) {
  test(`bad case: smoke fails when the server ${label}`, async t => {
    const dir = join(tempDir(t, 'clef-smoke-'), 'pact-clef');
    await assert.rejects(smoke({ dir, server: table(), transport: serving(ARCHIVE), run: recorder(result) }), says);
  });
}
