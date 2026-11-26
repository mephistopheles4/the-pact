// The project install's write function (#95), called directly with a temp
// name the test chooses: gate/contained.mjs. No switch ships; the tests pick
// the name the shipped call would pick at random.
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { readContained, randomTempName, writeContained } from '../contained.mjs';
import { tempDir } from './tree.mjs';

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
