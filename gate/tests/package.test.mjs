// PACT-105 C21: the package npx runs holds one bin, no dependency of any kind
// and no install script, so fetching the pact installs and runs nothing but its
// bootstrap.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from './text.mjs';

const KEYS = ['name', 'version', 'bin', 'engines', 'files'];

/** Where the package file breaks its shape (spec 0007 S10), as plain sentences; empty when it keeps it. Every key is named, so a new one fails until it is added here. */
function packageProblems(pkg) {
  const out = [];
  for (const k of Object.keys(pkg)) {
    if (/dependencies|^workspaces$/i.test(k)) out.push(`declares dependencies (${k})`);
    else if (k === 'scripts') out.push('declares scripts');
    else if (!KEYS.includes(k)) out.push(`holds ${k}, which the allow-list doesn't name`);
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (pkg.name !== 'the-pact') out.push('is not named the-pact');
  if (!/^1\.\d+\.\d+$/.test(pkg.version ?? '')) out.push('has no 1.x.y version');
  if (!same(pkg.bin, { pact: 'bin/pact.mjs' })) out.push('does not hold exactly one bin, pact');
  if (!same(pkg.engines, { node: '>=24' })) out.push('does not require Node 24 or later');
  if (!same(pkg.files, ['bin/pact.mjs'])) out.push('ships other files than the bootstrap');
  return out;
}

const real = () => JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));

test('package: the repo\'s package file keeps its shape', () => {
  assert.deepEqual(packageProblems(real()), []);
});

for (const [label, plant, says] of [
  ['a second bin', p => (p.bin.other = 'bin/other.mjs'), 'does not hold exactly one bin, pact'],
  ['a dependency', p => (p.dependencies = { left: '1' }), 'declares dependencies (dependencies)'],
  ['a development dependency', p => (p.devDependencies = { left: '1' }), 'declares dependencies (devDependencies)'],
  ['an optional dependency', p => (p.optionalDependencies = {}), 'declares dependencies (optionalDependencies)'],
  ['a peer dependency', p => (p.peerDependencies = {}), 'declares dependencies (peerDependencies)'],
  ['a bundled dependency', p => (p.bundleDependencies = []), 'declares dependencies (bundleDependencies)'],
  ['an install script', p => (p.scripts = { postinstall: 'node x.js' }), 'declares scripts'],
  ['a prepare script', p => (p.scripts = { prepare: 'node x.js' }), 'declares scripts'],
  ['an unnamed key', p => (p.gypfile = true), "holds gypfile, which the allow-list doesn't name"],
  ['a lower Node floor', p => (p.engines.node = '>=16'), 'does not require Node 24 or later'],
  ['another shipped file', p => p.files.push('gate/'), 'ships other files than the bootstrap'],
]) {
  test(`package: the check catches ${label}`, () => {
    const pkg = real();
    plant(pkg);
    assert.deepEqual(packageProblems(pkg), [says]);
  });
}
