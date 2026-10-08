// The project install's write function (#95), called directly with a temp
// name the test chooses: gate/contained.mjs. No switch ships; the tests pick
// the name the shipped call would pick at random.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { folderId, readContained, randomTempName, writeContained } from '../contained.mjs';
import { REPO, tempDir } from './helpers.mjs';

const WIN = process.platform === 'win32';
const FAULTS = pathToFileURL(join(REPO, 'gate', 'tests', 'fixtures', 'contained-faults.mjs')).href;
const DRIVER = join(REPO, 'gate', 'tests', 'fixtures', 'contained-driver.mjs');
const TEMP = '.pact-chosen.pact-tmp';

/** A folder to write into and a folder outside it, each new. */
function folders(t) {
  const root = tempDir(t);
  const dir = join(root, 'rules');
  const outside = join(root, 'outside');
  mkdirSync(dir);
  mkdirSync(outside);
  return { root, dir, outside };
}

/** The write function's refusal reason, or null when it wrote. */
function refusal(fn) {
  try {
    fn();
    return null;
  } catch (e) {
    assert.equal(e.rule, 'project-write', `not a refusal: ${e.stack}`);
    return e.reason;
  }
}

/** The driver under the fault fixture, with the given fault. */
function driven(t, fault, dir, temp, final, text, extraEnv = {}) {
  const logDir = tempDir(t);
  const log = join(logDir, 'calls.log');
  const env = { ...process.env, PACT_FAULT: fault, PACT_FAULT_LOG: log, ...extraEnv };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, ['--import', FAULTS, DRIVER, dir, temp, final, text], { encoding: 'utf8', env });
  return { out: r.stdout.trim(), calls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [] };
}

/** Plant a file link, or skip when this system can't make one. */
function fileLink(t, target, at) {
  try {
    symlinkSync(target, at, 'file');
    return true;
  } catch {
    t.skip('cannot create a file link here (not run)');
    return false;
  }
}

test('the write function writes the bytes under the final name and leaves no temp file', t => {
  const { dir } = folders(t);
  writeContained(dir, TEMP, 'pact-project.md', Buffer.from('one\n'));
  assert.equal(readFileSync(join(dir, 'pact-project.md'), 'utf8'), 'one\n');
  assert.deepEqual(readdirSync(dir), ['pact-project.md']);
  assert.ok(lstatSync(join(dir, 'pact-project.md')).isFile());
});

test('the shipped temp name is random, ends in .pact-tmp and never in .md', () => {
  const a = randomTempName();
  const b = randomTempName();
  assert.notEqual(a, b);
  assert.match(a, /^\.pact-[0-9a-f]{24}\.pact-tmp$/);
});

test('bad case: a temp name ending in .md, or holding a separator, refuses before anything is created', t => {
  const { dir } = folders(t);
  for (const name of ['.pact-x.md', '.pact-x.MD', 'sub/x.pact-tmp', 'sub\\x.pact-tmp', '..', 'pact-project.md']) {
    assert.ok(refusal(() => writeContained(dir, name, 'pact-project.md', Buffer.from('x\n'))), name);
  }
  assert.deepEqual(readdirSync(dir), []);
});

test('bad case: a file link planted at the temp name refuses, and nothing is written outside the folder', t => {
  const { dir, outside } = folders(t);
  const target = join(outside, 'victim.txt');
  writeFileSync(target, 'theirs\n');
  if (!fileLink(t, target, join(dir, TEMP))) return;
  assert.ok(refusal(() => writeContained(dir, TEMP, 'pact-project.md', Buffer.from('ours\n'))));
  assert.equal(readFileSync(target, 'utf8'), 'theirs\n');
  assert.deepEqual(readdirSync(outside), ['victim.txt']);
  assert.ok(!existsSync(join(dir, 'pact-project.md')));
});

test('bad case: a folder link planted at the temp name refuses, and nothing is written into the folder it names', t => {
  const { dir, outside } = folders(t);
  symlinkSync(outside, join(dir, TEMP), 'junction');
  assert.ok(refusal(() => writeContained(dir, TEMP, 'pact-project.md', Buffer.from('ours\n'))));
  assert.deepEqual(readdirSync(outside), []);
  assert.ok(!existsSync(join(dir, 'pact-project.md')));
});

test('bad case: a dangling link planted at the temp name refuses, and nothing is created outside the folder', { skip: WIN && "Windows's exclusive create follows a dangling file link; see the known-limit case below (not run)" }, t => {
  const { dir, outside } = folders(t);
  const target = join(outside, 'made.txt');
  symlinkSync(target, join(dir, TEMP), 'file');
  assert.ok(refusal(() => writeContained(dir, TEMP, 'pact-project.md', Buffer.from('ours\n'))));
  assert.deepEqual(readdirSync(outside), []);
  assert.ok(!existsSync(join(dir, 'pact-project.md')));
});

test('known limit (Windows): a dangling link at the temp name refuses before any byte is written, though its target is created empty', { skip: !WIN && 'Windows only; elsewhere the no-follow create refuses it, as the case above shows (not run)' }, t => {
  const { dir, outside } = folders(t);
  const target = join(outside, 'made.txt');
  if (!fileLink(t, target, join(dir, TEMP))) return;
  assert.match(refusal(() => writeContained(dir, TEMP, 'pact-project.md', Buffer.from('ours\n'))), /temp file for pact-project\.md is not the plain file opened/);
  // The guard on Windows is the random name plus the device-and-inode match:
  // the create followed the link, and the match refused before the first byte.
  assert.equal(readFileSync(target).length, 0);
  assert.ok(!existsSync(join(dir, 'pact-project.md')));
});

test('a target that is already a link is replaced by the rename, never followed', t => {
  const { dir, outside } = folders(t);
  const target = join(outside, 'victim.txt');
  writeFileSync(target, 'theirs\n');
  if (!fileLink(t, target, join(dir, 'pact-project.md'))) return;
  writeContained(dir, TEMP, 'pact-project.md', Buffer.from('ours\n'));
  assert.equal(readFileSync(target, 'utf8'), 'theirs\n');
  const st = lstatSync(join(dir, 'pact-project.md'));
  assert.ok(st.isFile() && !st.isSymbolicLink());
  assert.equal(readFileSync(join(dir, 'pact-project.md'), 'utf8'), 'ours\n');
});

test('bad case: a target that is a link after the rename refuses, by the after-rename check', t => {
  const { dir } = folders(t);
  const elsewhere = tempDir(t);
  writeFileSync(join(elsewhere, 'elsewhere.txt'), 'theirs\n');
  const r = driven(t, 'link-after-rename', dir, TEMP, 'pact-project.md', 'ours\n', { PACT_FAULT_DIR: elsewhere });
  assert.match(r.out, /^REFUSED .*after the rename/, r.out);
  assert.ok(r.calls.includes('rename pact-project.md'), r.calls.join('\n'));
  assert.equal(readFileSync(join(elsewhere, 'elsewhere.txt'), 'utf8'), 'theirs\n');
});

test('the device-and-inode match runs before the first byte is written', t => {
  const { dir } = folders(t);
  const r = driven(t, 'log', dir, TEMP, 'pact-project.md', 'ours\n');
  assert.equal(r.out, 'OK');
  const at = line => r.calls.indexOf(line);
  assert.ok(at('open .pact-chosen.pact-tmp') >= 0, r.calls.join('\n'));
  assert.ok(at('fstat temp') > at('open .pact-chosen.pact-tmp'), r.calls.join('\n'));
  assert.ok(at('lstat temp') > at('open .pact-chosen.pact-tmp'), r.calls.join('\n'));
  assert.ok(at('write temp') > at('fstat temp') && at('write temp') > at('lstat temp'), r.calls.join('\n'));
});

test('bad case: a temp file swapped between its open and the match refuses, with no byte written', t => {
  const { dir } = folders(t);
  const r = driven(t, 'swap-temp', dir, TEMP, 'pact-project.md', 'ours\n');
  assert.match(r.out, /^REFUSED the temp file for pact-project\.md is not the plain file opened/, r.out);
  assert.ok(!r.calls.includes('write temp'), r.calls.join('\n'));
  assert.equal(readFileSync(join(dir, `${TEMP}.moved`)).length, 0);
  assert.ok(!existsSync(join(dir, 'pact-project.md')));
});

test('bad case: a folder swapped for a link to another folder partway through refuses, and nothing stays there', t => {
  const { dir, outside } = folders(t);
  const r = driven(t, 'swap-dir-at-open', dir, TEMP, 'pact-project.md', 'ours\n', { PACT_FAULT_DIR: outside });
  assert.match(r.out, /^REFUSED the folder for pact-project\.md moved before the rename$/, r.out);
  assert.deepEqual(readdirSync(outside), []);
});

test('bad case: a folder that is not the one the caller checked refuses before anything is created', t => {
  const { root, dir } = folders(t);
  const other = join(root, 'other');
  mkdirSync(other);
  assert.match(refusal(() => writeContained(dir, TEMP, 'pact-project.md', Buffer.from('ours\n'), folderId(other))), /not the plain folder the checks found/);
  assert.deepEqual(readdirSync(dir), []);
  writeContained(dir, TEMP, 'pact-project.md', Buffer.from('ours\n'), folderId(dir));
  assert.equal(readFileSync(join(dir, 'pact-project.md'), 'utf8'), 'ours\n');
});

test('readContained reads a plain file once, and refuses a link', t => {
  const { dir, outside } = folders(t);
  writeFileSync(join(dir, 'a.json'), '{}\n');
  assert.equal(readContained(dir, 'a.json', 64).buf.toString(), '{}\n');
  assert.equal(readContained(dir, 'none.json', 64), null);
  writeFileSync(join(outside, 'b.json'), '{}\n');
  if (!fileLink(t, join(outside, 'b.json'), join(dir, 'b.json'))) return;
  assert.throws(() => readContained(dir, 'b.json', 64), e => e.rule === 'project-file' && /a link/.test(e.reason));
});

test('bad case: readContained refuses a file over its cap', t => {
  const { dir } = folders(t);
  writeFileSync(join(dir, 'big.json'), 'x'.repeat(65));
  assert.throws(() => readContained(dir, 'big.json', 64), e => e.rule === 'project-file' && /larger than/.test(e.reason));
});
