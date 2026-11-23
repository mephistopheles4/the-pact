// PACT-82, spec 0003 M7: the gate-macos smoke step's script. Nothing here
// touches the network or runs a real server: the transport serves a small
// archive, and `run` is a stand-in that records how the server would be run.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { SERVER } from '../../claude/tools/clef.mjs';
import { KEY, changedFiles, smoke, smokeNeeded } from '../../.github/scripts/clef-smoke.mjs';
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

// The change check: the step runs the server only when the change touches clef.mjs or this script.
const SHA = 'a'.repeat(39) + 'b';
const eventFile = ev => () => JSON.stringify(ev);
const okGit = (names, calls = []) => args => (calls.push(args), args[0] === 'diff' ? { status: 0, stdout: names } : { status: 0, stdout: '' });
const withEvent = (ev, git) => changedFiles({ env: { GITHUB_EVENT_PATH: '/e.json' }, readFile: eventFile(ev), git });

test('smokeNeeded: null runs, an empty list or other files skip, either named path runs', () => {
  assert.equal(smokeNeeded(null), true);
  assert.equal(smokeNeeded([]), false);
  assert.equal(smokeNeeded(['README.md', 'gate/tests/x.mjs']), false);
  assert.equal(smokeNeeded(['claude/tools/clef.mjs']), true);
  assert.equal(smokeNeeded(['a', '.github/scripts/clef-smoke.mjs']), true);
});

test('changedFiles: a pull_request event uses base.sha and a push uses before, with a fixed git argument list', () => {
  const calls = [];
  assert.deepEqual(withEvent({ pull_request: { base: { sha: SHA } }, before: 'c'.repeat(40) }, okGit('a.md\nb.md\n', calls)), ['a.md', 'b.md']);
  assert.deepEqual(calls[0], ['fetch', '--no-tags', '--depth=1', 'origin', SHA]);
  assert.deepEqual(calls[1], ['diff', '--name-only', '--no-renames', SHA, 'HEAD']);
  const push = [];
  assert.deepEqual(withEvent({ before: SHA }, okGit('', push)), []);
  assert.equal(push[0][4], SHA);
});

for (const [label, run] of [
  ['no event file', () => changedFiles({ env: {}, readFile: eventFile({}), git: okGit('') })],
  ['an unreadable event file', () => changedFiles({ env: { GITHUB_EVENT_PATH: '/e' }, readFile: () => { throw new Error('ENOENT'); }, git: okGit('') })],
  ['no sha in the event', () => withEvent({}, okGit(''))],
  ['a bad sha', () => withEvent({ before: 'main; rm -rf' }, okGit(''))],
  ['an all-zero before', () => withEvent({ before: '0'.repeat(40) }, okGit(''))],
  ['a failed fetch', () => withEvent({ before: SHA }, args => ({ status: args[0] === 'fetch' ? 128 : 0, stdout: '' }))],
  ['a failed diff', () => withEvent({ before: SHA }, args => ({ status: args[0] === 'diff' ? 1 : 0, stdout: '' }))],
  ['git that cannot start', () => withEvent({ before: SHA }, () => ({ status: null, error: new Error('ENOENT') }))],
]) {
  test(`bad case: changedFiles gives null (run the smoke) on ${label}`, () => {
    const r = run();
    assert.equal(r, null);
    assert.equal(smokeNeeded(r), true);
  });
}

test('the script run as a child with git out of reach falls back to running the smoke', { skip: process.platform === 'darwin' && process.arch === 'arm64' }, t => {
  const dir = tempDir(t, 'clef-smoke-ev-');
  const event = join(dir, 'event.json');
  const empty = join(dir, 'nobin');
  mkdirSync(empty);
  writeFileSync(event, JSON.stringify({ before: SHA }));
  const script = fileURLToPath(new URL('../../.github/scripts/clef-smoke.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [script], { env: { PATH: empty, GITHUB_EVENT_PATH: event, RUNNER_TEMP: dir }, encoding: 'utf8', shell: false, timeout: 60_000 });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /smoke: fail: this smoke run needs an Apple Silicon Mac/);
  assert.doesNotMatch(r.stdout, /skipped/);
});
