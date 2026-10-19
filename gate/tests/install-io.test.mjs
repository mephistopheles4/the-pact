// The Node install's file system module (#153, S3 and S7), on temp folders
// only: the link test that replaces the reparse-attribute test, the stage's
// tree state, the replacing write and the leftover count. Nothing here
// installs. A link the OS won't let this account make is a skip, named.
import assert from 'node:assert/strict';
import { chmodSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as core from '../install-core.mjs';
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

// The skill-clash check's presence test (#203, S8): anything at the path counts, a link unfollowed.
test('presence: a file, a folder and a junction to nothing are present; a missing path is not', t => {
  const root = tempDir(t, 'pact-io-');
  writeFileSync(join(root, 'file'), 'x');
  mkdirSync(join(root, 'folder'));
  assert.equal(io.present(join(root, 'file')), true);
  assert.equal(io.present(join(root, 'folder')), true);
  assert.equal(io.present(join(root, 'missing')), false);
  assert.equal(io.present(join(root, 'missing', 'deeper')), false);
  // A junction on Windows needs no privilege; elsewhere a directory symlink.
  if (!linkOrSkip(t, join(root, 'gone'), join(root, 'dangling'), WIN ? 'junction' : 'dir')) return;
  assert.equal(io.present(join(root, 'dangling')), true, 'a dangling link is present, read without following it');
});

// ------------------------------------------------------------ the backup (#272, S7)

const NOW = () => new Date(Date.UTC(2026, 9, 18, 14, 30, 5, 123));
const BASE_NAME = '20261018T143005123Z-aaaaaaa';
const COMMIT = 'a'.repeat(40);

/** A home holding the person's own rules file and settings, and the entries an apply over it backs up. */
function backupHome(t, { fresh = false } = {}) {
  const h = fresh ? join(tempDir(t, 'pact-bk-'), 'home') : tempDir(t, 'pact-bk-');
  const entries = [
    { path: '.pact-install.json', was: 'absent' },
    { path: 'agents/scout.md', was: 'absent' },
  ];
  if (!fresh) {
    writeFileSync(join(h, 'CLAUDE.md'), 'mine\n');
    writeFileSync(join(h, 'settings.json'), '{"k": 1}\n');
    entries.unshift({ path: 'CLAUDE.md', was: 'file', sha256: io.sha256('mine\n') });
    entries.push({ path: 'settings.json', was: 'file', sha256: io.sha256('{"k": 1}\n') });
  }
  return { h, entries };
}
const backup = (h, entries, { ops = io.FS_OPS, platform = process.platform, now = NOW } = {}) => io.takeBackup(ops, { home: h, commit: COMMIT, entries, platform, now, started: () => {} });
const stateOf = h => (io.present(h) ? io.treeState(h) : 'absent');

/** The real operations, with `name` failing whenever `when` holds for the path it acts on (a write or fsync: the path its handle opened). */
function failing(name, when = () => true, base = io.FS_OPS) {
  const opened = new Map();
  const ops = { ...base, open: (p, flags, mode) => {
    const fd = base.open(p, flags, mode);
    opened.set(fd, p);
    return fd;
  } };
  const real = ops[name];
  ops[name] = (a, ...rest) => {
    if (when(String(typeof a === 'number' ? opened.get(a) : a))) throw Object.assign(new Error('injected'), { code: 'EIO' });
    return real(a, ...rest);
  };
  return ops;
}
const refusal = (rule, outcome) => e => e instanceof core.Refusal && e.rule === rule && (outcome === undefined || outcome.test(e.outcome));

test('#272 C3: each failing step of the backup refuses with nothing changed, and a name taken moves to the next free one', t => {
  const cases = [
    ["a copy's write", failing('write', p => p.endsWith('CLAUDE.md')), process.platform],
    ["a copy's fsync", failing('fsync', p => p.endsWith('CLAUDE.md')), process.platform],
    ["a copy's read-back", failing('read', p => p.includes('.staging-')), process.platform],
    ["a copy's read-back that differs", { ...io.FS_OPS, read: p => (p.includes('.staging-') ? Buffer.from('changed\n') : io.FS_OPS.read(p)) }, process.platform],
    ['the manifest', failing('open', p => p.endsWith('manifest.json')), process.platform],
    ['the rename', failing('rename'), process.platform],
    ['the chmod of pact/backups', failing('chmod'), 'linux'],
  ];
  // A first install on an empty home copies nothing, so only the steps that make folders or the manifest can fail there.
  for (const fresh of [false, true]) {
    for (const [step, ops, platform] of fresh ? cases.filter(([step]) => !step.includes('copy')) : cases) {
      const { h, entries } = backupHome(t, { fresh });
      const before = stateOf(h);
      assert.throws(() => backup(h, entries, { ops, platform }), refusal('backup-failed', /^Nothing was changed\.$/), step);
      assert.equal(stateOf(h), before, `${step}${fresh ? ', on a first install' : ''}`);
    }
  }
  // pact/backups is narrowed before the staging folder is made.
  const log = [];
  const order = { ...io.FS_OPS, chmod: (q, m) => (log.push('chmod'), io.FS_OPS.chmod(q, m)), mkdir: (q, m) => (log.push(q.includes('.staging-') ? 'staging' : 'mkdir'), io.FS_OPS.mkdir(q, m)) };
  const narrowed = backupHome(t);
  try {
    backup(narrowed.h, narrowed.entries, { ops: order, platform: 'linux' });
  } catch (e) {
    if (!(e instanceof core.Refusal)) throw e; // on Windows the mode check refuses afterwards; the order is what counts here
  }
  assert.ok(log.includes('chmod') && log.indexOf('chmod') < log.indexOf('staging'), log.join(' '));
  // Every name taken refuses; one taken takes the next suffix.
  const { h, entries } = backupHome(t);
  mkdirSync(join(h, 'pact', 'backups', BASE_NAME), { recursive: true });
  assert.equal(backup(h, entries).name, `${BASE_NAME}-02`);
  for (let i = 3; i <= 99; i++) mkdirSync(join(h, 'pact', 'backups', `${BASE_NAME}-${String(i).padStart(2, '0')}`));
  const full = stateOf(h);
  assert.throws(() => backup(h, entries), refusal('backup-name-taken', /^Nothing was changed\.$/));
  assert.equal(stateOf(h), full);
  // A clean-up that fails names the staging folder instead.
  const other = backupHome(t);
  assert.throws(() => backup(other.h, other.entries, { ops: failing('rmdir', p => p.includes('.staging-'), failing('rename')) }), refusal('backup-cleanup', new RegExp(`pact/backups/\\.staging-${BASE_NAME} may hold a copy of your settings`)));
});

test('#272 C4: a link on the backup path at the first check or the second, or at a source, refuses before anything is copied', t => {
  const elsewhere = tempDir(t, 'pact-bk-else-');
  const first = backupHome(t);
  if (!linkOrSkip(t, elsewhere, join(first.h, 'pact'), WIN ? 'junction' : 'dir')) return;
  const before = stateOf(first.h);
  assert.throws(() => backup(first.h, first.entries), refusal('backup-link', /^Nothing was changed\.$/));
  assert.equal(stateOf(first.h), before);
  assert.deepEqual(readdirSync(elsewhere), []);
  // The second check, just before the rename: a folder whose real path disagrees with its own.
  const second = backupHome(t);
  const swapped = { ...io.FS_OPS, realpath: p => (p.includes('.staging-') ? `${p}-elsewhere` : io.FS_OPS.realpath(p)) };
  assert.throws(() => backup(second.h, second.entries, { ops: swapped }), refusal('backup-cleanup'));
  // A plain file where pact/backups should be refuses too.
  const file = backupHome(t);
  mkdirSync(join(file.h, 'pact'));
  writeFileSync(join(file.h, 'pact', 'backups'), 'not a folder\n');
  const filed = stateOf(file.h);
  assert.throws(() => backup(file.h, file.entries), refusal('backup-link', /^Nothing was changed\.$/));
  assert.equal(stateOf(file.h), filed);
  // A retired agent a first install deletes is a source too, though the plan never link-tests it.
  const source = backupHome(t);
  writeFileSync(join(elsewhere, 'builder.md'), 'outside\n');
  if (!linkOrSkip(t, elsewhere, join(source.h, 'agents'), WIN ? 'junction' : 'dir')) return;
  const withSource = [...source.entries, { path: 'agents/builder.md', was: 'file', sha256: io.sha256('outside\n') }];
  const was = stateOf(source.h);
  assert.throws(() => backup(source.h, withSource), refusal('backup-link', /^Nothing was changed\.$/));
  assert.equal(stateOf(source.h), was);
});

// ------------------------------------------------------------ the prune (#272, S8)

const OWN = '20261018T143005123Z-aaaaaaa';
/** A backup folder named `name` under `h`, holding a manifest with `format`, and the record listed as a file or, with `noRecord`, absent. */
function fakeBackup(h, name, { format = 'pact-backup-1', noRecord = false, manifest } = {}) {
  const dir = join(h, 'pact', 'backups', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'CLAUDE.md'), 'old\n');
  const entries = [{ path: '.pact-install.json', ...(noRecord ? { was: 'absent' } : { was: 'file', sha256: 'f'.repeat(64), bytes: 1 }) }];
  if (manifest !== null) writeFileSync(join(dir, 'manifest.json'), manifest ?? `${JSON.stringify({ format, commit: COMMIT, created: '', entries })}\n`);
  return dir;
}
const older = i => `2025${String(i).padStart(4, '0')}T000000000Z-bbbbbbb`;
const left = h => readdirSync(join(h, 'pact', 'backups')).sort();
/** A link where the OS allows this account one, without marking the test skipped where it does not. */
function tryLink(target, path, type) {
  try {
    symlinkSync(target, path, type);
    return true;
  } catch (e) {
    if (e.code === 'EPERM' || e.code === 'EACCES') return false;
    throw e;
  }
}

test('#272 C7: the prune keeps this run\'s backup, the ten newest, every one taken with no record, those named later and everything it does not recognise', t => {
  const h = tempDir(t, 'pact-prune-');
  fakeBackup(h, OWN);
  for (let i = 1; i <= 12; i++) fakeBackup(h, older(i + 100));
  fakeBackup(h, older(1), { noRecord: true });
  fakeBackup(h, older(2), { noRecord: true });
  fakeBackup(h, '20991231T235959999Z-ccccccc');
  // What is never a candidate: a name off the pattern, no manifest, a foreign one, an oversized one, one that is a link, a link to a backup, a staging folder.
  fakeBackup(h, 'mine-kept');
  fakeBackup(h, older(3), { manifest: null });
  fakeBackup(h, older(4), { format: 'other-1' });
  fakeBackup(h, older(5), { manifest: `${JSON.stringify({ format: 'pact-backup-1', commit: COMMIT, created: '', entries: [] })}${' '.repeat(1024 * 1024)}` });
  const elsewhere = tempDir(t, 'pact-prune-else-');
  writeFileSync(join(elsewhere, 'manifest.json'), `${JSON.stringify({ format: 'pact-backup-1', entries: [] })}\n`);
  const linkedManifest = fakeBackup(h, older(6), { manifest: null });
  const linked = tryLink(join(elsewhere, 'manifest.json'), join(linkedManifest, 'manifest.json'), 'file') && tryLink(elsewhere, join(h, 'pact', 'backups', older(7)), WIN ? 'junction' : 'dir');
  mkdirSync(join(h, 'pact', 'backups', `.staging-${older(8)}`));
  const before = left(h);
  const r = io.pruneBackups(io.FS_OPS, { home: h, own: OWN });
  const pruned = [older(101), older(102), older(103)];
  assert.deepEqual(r.pruned, pruned);
  assert.deepEqual(left(h), before.filter(n => !pruned.includes(n)));
  assert.equal(r.later, 1);
  assert.equal(r.others, linked ? 6 : 4);
  assert.equal(r.failed, false);
  assert.deepEqual(readdirSync(elsewhere), ['manifest.json'], 'a link to a backup is never followed');
});

test('#272 C15: a prune that fails part way reports one warning naming the folder, and never throws', t => {
  const h = tempDir(t, 'pact-prune-');
  fakeBackup(h, OWN);
  for (let i = 1; i <= 11; i++) fakeBackup(h, older(i + 100));
  // A file that fails to go, beside a manifest that could: the manifest is only tried after it.
  writeFileSync(join(h, 'pact', 'backups', older(101), 'z-last.md'), 'x\n');
  const r = io.pruneBackups(failing('unlink', p => p.endsWith('z-last.md')), { home: h, own: OWN });
  assert.equal(r.failed, true);
  const warns = core.pruneLines(r).filter(l => l.startsWith('WARN: '));
  assert.equal(warns.length, 1, warns.join('\n'));
  assert.match(warns[0], /pact\/backups/);
  assert.ok(left(h).includes(older(101)), 'the backup it could not remove is left as it was, manifest and all');
  assert.ok(readdirSync(join(h, 'pact', 'backups', older(101))).includes('manifest.json'), 'the manifest goes last, so a half-removed backup stays a candidate');
});

test('#272 C16: the clean-up and the prune remove a link inside a folder they remove without following it', t => {
  const elsewhere = tempDir(t, 'pact-follow-');
  writeFileSync(join(elsewhere, 'keep.md'), 'outside\n');
  // The clean-up: a link planted in the staging folder while the backup runs.
  const { h, entries } = backupHome(t);
  const before = stateOf(h);
  let planted = null;
  const plant = { ...failing('rename'), mkdir: (p, mode) => {
    io.FS_OPS.mkdir(p, mode);
    if (planted === null && p.includes('.staging-')) planted = tryLink(elsewhere, join(p, 'planted'), WIN ? 'junction' : 'dir');
  } };
  assert.throws(() => backup(h, entries, { ops: plant }), refusal('backup-failed', /^Nothing was changed\.$/));
  assert.ok(planted, 'the link was planted in the staging folder');
  assert.equal(stateOf(h), before);
  // The prune: a link inside a backup it removes, and a folder whose real path disagrees with its own.
  const p = tempDir(t, 'pact-prune-');
  fakeBackup(p, OWN);
  for (let i = 1; i <= 10; i++) fakeBackup(p, older(i + 100));
  assert.ok(tryLink(elsewhere, join(p, 'pact', 'backups', older(101), 'planted'), WIN ? 'junction' : 'dir'));
  assert.deepEqual(io.pruneBackups(io.FS_OPS, { home: p, own: OWN }).pruned, [older(101)]);
  fakeBackup(p, older(100));
  mkdirSync(join(p, 'pact', 'backups', older(100), 'sub'));
  const swapped = { ...io.FS_OPS, realpath: q => (q.endsWith('sub') ? `${q}-elsewhere` : io.FS_OPS.realpath(q)) };
  const r = io.pruneBackups(swapped, { home: p, own: OWN });
  assert.equal(r.failed, true);
  assert.ok(existsSync(join(p, 'pact', 'backups', older(100), 'sub')), 'a folder that resolves elsewhere is not walked');
  // A folder swapped for a link after its entries were read is not walked on.
  const q = tempDir(t, 'pact-prune-');
  fakeBackup(q, OWN);
  for (let i = 1; i <= 10; i++) fakeBackup(q, older(i + 100));
  let read = false;
  const flip = {
    ...io.FS_OPS,
    readdir: d => {
      const names = io.FS_OPS.readdir(d);
      if (d.endsWith(older(101))) read = true;
      return names;
    },
    realpath: d => (read && d.endsWith(older(101)) ? `${d}-elsewhere` : io.FS_OPS.realpath(d)),
  };
  assert.equal(io.pruneBackups(flip, { home: q, own: OWN }).failed, true);
  assert.ok(existsSync(join(q, 'pact', 'backups', older(101), 'CLAUDE.md')), 'nothing under the swapped folder is removed');
  // A pact/backups that is a link is not pruned at all.
  const linked = tempDir(t, 'pact-prune-');
  const target = tempDir(t, 'pact-prune-target-');
  for (let i = 1; i <= 12; i++) fakeBackup(target, older(i + 100));
  mkdirSync(join(linked, 'pact'));
  assert.ok(tryLink(join(target, 'pact', 'backups'), join(linked, 'pact', 'backups'), WIN ? 'junction' : 'dir'));
  assert.deepEqual(io.pruneBackups(io.FS_OPS, { home: linked, own: OWN }), { pruned: [], later: 0, others: 0, failed: true });
  assert.equal(readdirSync(join(target, 'pact', 'backups')).length, 12);
  assert.deepEqual(readdirSync(elsewhere), ['keep.md']);
  assert.equal(readFileSync(join(elsewhere, 'keep.md'), 'utf8'), 'outside\n');
});

test('#272 C6: on Linux and macOS a backup file or folder found open to others refuses, with nothing changed', t => {
  const { h, entries } = backupHome(t);
  const before = stateOf(h);
  // Group read alone, so a check of the other bits only would pass it.
  const wide = { ...io.FS_OPS, stat: p => ({ ...io.FS_OPS.stat(p), mode: 0o100640 }) };
  assert.throws(() => backup(h, entries, { ops: wide, platform: 'linux' }), refusal('backup-mode', /^Nothing was changed\.$/));
  assert.equal(stateOf(h), before);
});
