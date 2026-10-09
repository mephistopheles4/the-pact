// The Node install's file system module (#153, S3 and S7), on temp folders
// only: the link test that replaces the reparse-attribute test, the stage's
// tree state, the replacing write and the leftover count. Nothing here
// installs. A link the OS won't let this account make is a skip, named.
import assert from 'node:assert/strict';
import { chmodSync, linkSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as io from '../install-io.mjs';
import { tempDir } from './tree.mjs';

const WIN = process.platform === 'win32';

/** Makes a link, or skips the test when the OS refuses this account one (a Windows symlink without the privilege). */
function linkOrSkip(t, target, path, type) {
  try {
    symlinkSync(target, path, type);
    return true;
  } catch (e) {
    if (e.code === 'EPERM' || e.code === 'EACCES') {
      t.skip(`this account may not make a ${type ?? 'file'} link here`);
      return false;
    }
    throw e;
  }
}

// S7's table, re-run where the OS can make the entry.
test('the link test: a junction, or a directory link, anywhere below the root is a link, and so is a file under one', t => {
  const root = tempDir(t, 'pact-io-');
  const elsewhere = tempDir(t, 'pact-io-else-');
  writeFileSync(join(elsewhere, 'f.md'), 'x');
  mkdirSync(join(root, 'agents'));
  if (!linkOrSkip(t, elsewhere, join(root, 'agents', 'j'), WIN ? 'junction' : 'dir')) return;
  assert.equal(io.throughLink(root, 'agents/j'), true);
  assert.equal(io.throughLink(root, 'agents/j/f.md'), true);
  assert.equal(io.throughLink(root, 'agents/plain.md'), false, 'a missing segment ends the walk');
});

test('the link test: a file link is a link', t => {
  const root = tempDir(t, 'pact-io-');
  writeFileSync(join(root, 'target.md'), 'x');
  if (!linkOrSkip(t, join(root, 'target.md'), join(root, 'CLAUDE.md'), 'file')) return;
  assert.equal(io.throughLink(root, 'CLAUDE.md'), true);
});

test('the link test: plain folders and files pass, and the root is judged at its real path, so a link above it is not refused', t => {
  const real = tempDir(t, 'pact-io-');
  mkdirSync(join(real, 'pact', 'blocks'), { recursive: true });
  writeFileSync(join(real, 'pact', 'config.json'), '{}');
  assert.equal(io.throughLink(real, 'pact/config.json'), false);
  assert.equal(io.throughLink(real, 'pact/blocks'), false);
  const parent = tempDir(t, 'pact-io-up-');
  if (!linkOrSkip(t, real, join(parent, 'home'), WIN ? 'junction' : 'dir')) return;
  assert.equal(io.throughLink(join(parent, 'home'), 'pact/config.json'), false);
  assert.equal(io.throughLink(join(parent, 'home', 'missing'), 'x'), false, 'a root that does not exist yet holds nothing');
});

test('the tree state names links, folders and each file by hash, hidden entries included', t => {
  const root = tempDir(t, 'pact-io-');
  mkdirSync(join(root, 'a', '.hidden'), { recursive: true });
  writeFileSync(join(root, 'a', '.hidden', 'x'), 'x');
  const before = io.treeState(root);
  assert.equal(before, ['dir a', 'dir a/.hidden', `file a/.hidden/x ${io.sha256('x')}`].join('\n'));
  writeFileSync(join(root, 'a', '.hidden', 'x'), 'y');
  assert.notEqual(io.treeState(root), before);
  if (!linkOrSkip(t, join(root, 'a'), join(root, 'l'), WIN ? 'junction' : 'dir')) return;
  assert.ok(io.treeState(root).split('\n').includes('link l'));
});

test('a replacing write keeps the destination\'s mode, breaks a hard link, and uses the fallback mode for a new file', t => {
  const root = tempDir(t, 'pact-io-');
  const outside = join(tempDir(t, 'pact-io-else-'), 'victim');
  writeFileSync(outside, 'victim');
  const dest = join(root, 'agents', 'a.md');
  mkdirSync(join(root, 'agents'));
  linkSync(outside, dest);
  if (!WIN) chmodSync(dest, 0o640);
  io.writeReplacing(dest, Buffer.from('new'));
  assert.equal(readFileSync(dest, 'utf8'), 'new');
  assert.equal(readFileSync(outside, 'utf8'), 'victim');
  if (!WIN) assert.equal(statSync(dest).mode & 0o777, 0o640);
  const fresh = join(root, 'settings.json');
  io.writeReplacing(fresh, Buffer.from('{}'), 0o600);
  if (!WIN) assert.equal(statSync(fresh).mode & 0o777, 0o600);
});

test('bad case: a replacing write refuses when its temp file already exists, and leaves the destination as it was', t => {
  const root = tempDir(t, 'pact-io-');
  const dest = join(root, 'settings.json');
  writeFileSync(dest, 'old');
  writeFileSync(`${dest}.pact-tmp`, 'planted');
  assert.throws(() => io.writeReplacing(dest, Buffer.from('new'), 0o600), { code: 'EEXIST' });
  assert.equal(readFileSync(dest, 'utf8'), 'old');
  assert.equal(readFileSync(`${dest}.pact-tmp`, 'utf8'), 'planted');
});

test('live state, optional reads and the leftover count', t => {
  const root = tempDir(t, 'pact-io-');
  mkdirSync(join(root, 'dir'));
  writeFileSync(join(root, 'f'), 'x');
  assert.deepEqual(io.liveState(join(root, 'f')), { exists: true, file: true, sha256: io.sha256('x') });
  assert.deepEqual(io.liveState(join(root, 'dir')), { exists: true, file: false, sha256: null });
  assert.deepEqual(io.liveState(join(root, 'none')), { exists: false, file: false, sha256: null });
  assert.equal(io.readOptional(join(root, 'none')), null);
  assert.throws(() => io.readOptional(join(root, 'dir')));
  mkdirSync(join(root, 'pact-install-a'));
  mkdirSync(join(root, 'pact-install-b'));
  assert.equal(io.leftoverWorkFolders(root, 'pact-install-a'), 1);
  assert.equal(io.blobId(Buffer.from('')), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  const entries = io.folderEntries(root).sort((a, b) => (a.name < b.name ? -1 : 1));
  assert.deepEqual(entries.map(e => [e.name, e.file, e.link]), [['dir', false, false], ['f', true, false], ['pact-install-a', false, false], ['pact-install-b', false, false]]);
});
