import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs, { mkdirSync, readFileSync, writeFileSync, existsSync, linkSync, symlinkSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { tempDir } from './tree.mjs';
import { plan, apply, rollback, digest, verifyPlan } from '../../codex/transaction.mjs';

function fixture(t) {
  const root = tempDir(t, 'pact-codex-');
  const home = join(root, 'home');
  const review = join(root, 'review');
  mkdirSync(home); mkdirSync(review);
  return { home, review, files: [{ path: 'AGENTS.md', text: 'mirror\n' }] };
}

test('Codex dry run does not write live files; apply and rollback are digest bound', t => {
  const f = fixture(t);
  const p = plan(f.home, f.files, { source: 'pinned', code: 'reviewed' });
  assert.equal(existsSync(join(f.home, 'AGENTS.md')), false);
  assert.deepEqual(p.counts, { add: 1, replace: 0, unchanged: 0 });
  assert.throws(() => apply(f.home, p, 'wrong', f.review), /review digest/);
  apply(f.home, p, digest(p), f.review);
  assert.equal(readFileSync(join(f.home, 'AGENTS.md'), 'utf8'), 'mirror\n');
  rollback(f.home, f.review);
  assert.equal(existsSync(join(f.home, 'AGENTS.md')), false);
});

test('Codex apply refuses destination drift before making any write', t => {
  const f = fixture(t), p = plan(f.home, [...f.files, { path: 'later.txt', text: 'new' }], {});
  writeFileSync(join(f.home, 'later.txt'), 'new owner text');
  assert.throws(() => apply(f.home, p, digest(p), f.review), /destination drift/);
  assert.equal(existsSync(join(f.home, 'AGENTS.md')), false);
  assert.equal(readFileSync(join(f.home, 'later.txt'), 'utf8'), 'new owner text');
});

test('Codex planner refuses path escapes and case aliases', t => {
  const f = fixture(t);
  for (const path of ['../outside', '/absolute', 'C:/escape', 'a\\b', 'a/../b', 'a./b', 'nul', 'COM1.txt']) {
    assert.throws(() => plan(f.home, [{ path, text: 'bad' }], {}), /unsafe target/);
  }
  assert.throws(() => plan(f.home, [{ path: 'AGENTS.md', text: 'a' }, { path: 'agents.md', text: 'b' }], {}), /duplicate target/);
  const outside = join(f.review, 'outside'); writeFileSync(outside, 'keep');
  linkSync(outside, join(f.home, 'hardlink'));
  assert.throws(() => plan(f.home, [{ path: 'hardlink', text: 'bad' }], {}), /unsafe target/);
  symlinkSync(f.review, join(f.home, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => plan(f.home, [{ path: 'linked/outside', text: 'bad' }], {}), /unsafe target/);
});

test('Codex rollback refuses files changed after the install', t => {
  const f = fixture(t), p = plan(f.home, [...f.files, { path: 'later.txt', text: 'new' }], {});
  apply(f.home, p, digest(p), f.review);
  writeFileSync(join(f.home, 'later.txt'), 'later owner edit');
  assert.throws(() => rollback(f.home, f.review), /installed files changed/);
  assert.equal(readFileSync(join(f.home, 'AGENTS.md'), 'utf8'), 'mirror\n');
});

test('Codex transaction restores replacement bytes after a deterministic mid-apply write failure', t => {
  const f = fixture(t); writeFileSync(join(f.home, 'AGENTS.md'), 'original owner bytes');
  const p = plan(f.home, [...f.files, { path: 'new.txt', text: 'addition' }], { source: 'old' });
  for (const patch of [{ pins: { source: 'changed' } }, { files: [{ ...p.files[0], data: 'Y2hhbmdlZA==' }] }]) {
    assert.throws(() => verifyPlan(p, { ...p, ...patch }, digest(p)), /drift/);
  }
  const original = fs.renameSync; let failed = false;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === join(f.home, 'new.txt') && !failed) { failed = true; throw Error('fixture write failure'); }
    return original(from, to);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  assert.throws(() => apply(f.home, p, digest(p), f.review), /fixture write failure/);
  assert.equal(readFileSync(join(f.home, 'AGENTS.md'), 'utf8'), 'original owner bytes');
  assert.equal(existsSync(join(f.home, 'new.txt')), false);
});
