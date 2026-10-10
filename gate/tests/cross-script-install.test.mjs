// The cross script's install runs (#45): the install copies it to one fixed
// live path, the manifest fingerprints it, and a changed live copy is drift.
// cross/render-check.mjs, beside it, never installs. Seam A's side, which never installs, is in cross-install.test.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { read } from './tree.mjs';
import { home, install, listTree, makeRepo, refused } from './install-harness.mjs';

const DEST = 'pact/cross.mjs';
const sha = b => createHash('sha256').update(b).digest('hex');

// ------------------------------------------------------------ the install

test('-Apply installs the cross script byte for byte, the manifest records its hash, and render-check never installs', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, new RegExp(`^  ${DEST.replace('.', '\\.')}$`, 'm'), dry.out);
  const r = install(repo, h, { apply: true });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^OK +${DEST.replace('.', '\\.')}$`, 'm'), r.out);
  assert.deepEqual(readFileSync(join(h, 'pact', 'cross.mjs')), readFileSync(join(repo, 'cross', 'cross.mjs')));
  const manifest = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  const entry = manifest.files.find(f => f.path === DEST);
  assert.ok(entry, JSON.stringify(manifest.files));
  assert.equal(entry.sha256, sha(readFileSync(join(repo, 'cross', 'cross.mjs'))));
  assert.ok(!listTree(h).some(f => /render-check/.test(f)), listTree(h).join('\n'));
  assert.ok(!existsSync(join(h, 'cross')), 'nothing installs under a cross folder');
});

test('bad case: a tampered installed cross script is drift, and -Apply refuses', t => {
  const repo = makeRepo(t);
  const h = home(t);
  assert.equal(install(repo, h, { apply: true }).code, 0);
  const live = join(h, 'pact', 'cross.mjs');
  writeFileSync(live, `${read(live)}\n// tampered\n`);
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^Drift: 1$/m, dry.out);
  assert.match(dry.stdout, /^ {2}pact\/cross\.mjs \(changed since the install\)$/m, dry.out);
  refused(install(repo, h, { apply: true }));
  assert.match(read(live), /tampered/, 'a refused -Apply changes nothing');
});

test('bad case: a deleted installed cross script is drift, and -Apply refuses', t => {
  const repo = makeRepo(t);
  const h = home(t);
  assert.equal(install(repo, h, { apply: true }).code, 0);
  rmSync(join(h, 'pact', 'cross.mjs'));
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^Drift: 1$/m, dry.out);
  assert.match(dry.stdout, /^ {2}pact\/cross\.mjs \(deleted since the install\)$/m, dry.out);
  refused(install(repo, h, { apply: true }));
  assert.ok(!existsSync(join(h, 'pact', 'cross.mjs')), 'a refused -Apply changes nothing');
});
