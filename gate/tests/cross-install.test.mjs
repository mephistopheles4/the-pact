// The cross script installs like the rest of the pact (#45): seam A classifies
// it by an exact path and lists it for one fixed live path. The install runs,
// which copy it, fingerprint it and catch drift, are in
// cross-script-install.test.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO, failRules, lastLine, read, runSeamA, stage } from './helpers.mjs';

const SRC = 'cross/cross.mjs';
const DEST = 'pact/cross.mjs';
const sha = b => createHash('sha256').update(b).digest('hex');

// ------------------------------------------------------------ seam A

test('seam A lists the cross script for install at its one fixed path, with its hash', t => {
  const root = stage(t);
  const r = runSeamA(root);
  assert.equal(r.code, 0, r.out);
  const want = `INSTALL ${sha(readFileSync(join(REPO, SRC)))} ${SRC} ${DEST}`;
  assert.ok(r.stdout.split('\n').includes(want), r.out);
});

test('only the exact path is the cross script: another file in cross/ is never listed', t => {
  const root = stage(t, { 'cross/render-check.mjs': read(join(REPO, 'cross', 'render-check.mjs')), 'cross/extra.mjs': '// x\n' });
  const r = runSeamA(root);
  assert.equal(r.code, 0, r.out);
  const installs = r.stdout.split('\n').filter(l => l.startsWith('INSTALL ') && l.includes(' cross/'));
  assert.deepEqual(installs.map(l => l.split(' ')[2]), [SRC]);
});

test('bad case: a stage with no cross script fails', t => {
  const root = stage(t);
  rmSync(join(root, 'cross', 'cross.mjs'));
  const r = runSeamA(root);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.ok(failRules(r.stdout).includes('cross-script'), r.out);
});

test('bad case: a cross script that is not a regular file fails', t => {
  const root = stage(t);
  rmSync(join(root, 'cross', 'cross.mjs'));
  mkdirSync(join(root, 'cross', 'cross.mjs'));
  const r = runSeamA(root);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.ok(failRules(r.stdout).includes('cross-script'), r.out);
});

for (const [label, ch, rule] of [
  ['a direction override', '‮', 'invisible'],
  ['a zero-width space', '​', 'invisible'],
  ['a carriage return', '\r', 'characters'],
]) {
  test(`bad case: a cross script holding ${label} fails`, t => {
    const root = stage(t);
    const p = join(root, 'cross', 'cross.mjs');
    writeFileSync(p, read(p).replace('// The cross script', `// The cross${ch} script`));
    const r = runSeamA(root);
    assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
    assert.ok(failRules(r.stdout).includes(rule), r.out);
    assert.ok(!r.stdout.split('\n').some(l => l.startsWith('INSTALL ')), 'a failed stage lists nothing for install');
  });
}

// The cross script imports only node:crypto, node:fs and node:path (the security reviewer's F3 on #45, narrowed in round 3).
const IMPORT_PLANTS = {
  'a bare package import': "import x from 'pkg';",
  'a relative import': "import { y } from './helper.mjs';",
  'a node: import that does not fill its line': "import { readFileSync } from 'node:fs'; import z from 'pkg';",
  'a multi-line import': "import {\n  readFileSync,\n} from 'pkg';",
  'an export from a package': "export { x } from 'pkg';",
  'a side-effect import': "import 'pkg';",
  'a dynamic import()': "const m = await import ('pkg');",
  'a require call': "const m = require('pkg');",
  'createRequire': "import { createRequire } from 'node:module';",
  // Round 3 on #45: only the three built-ins the script uses are allowed.
  'a namespace import of node:module': "import * as mod from 'node:module';",
  'an import from node:child_process': "import { execSync } from 'node:child_process';",
  'an import from node:vm': "import vm from 'node:vm';",
  'an import from node:os, harmless but not on the list': "import { tmpdir } from 'node:os';",
};

for (const [label, plant] of Object.entries(IMPORT_PLANTS)) {
  test(`bad case: a cross script with ${label} fails`, t => {
    const root = stage(t);
    const p = join(root, 'cross', 'cross.mjs');
    const src = read(p);
    const at = "import { createHash } from 'node:crypto';\n";
    assert.ok(src.includes(at), 'the cross script no longer holds the line this test plants after');
    writeFileSync(p, src.replace(at, () => `${at}${plant}\n`));
    const r = runSeamA(root);
    assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
    assert.ok(failRules(r.stdout).includes('cross-imports'), r.out);
  });
}

test("the cross script's own imports, and import.meta, pass the import rule", t => {
  const root = stage(t);
  const p = join(root, 'cross', 'cross.mjs');
  writeFileSync(p, `${read(p)}\n// import x from 'pkg' in a comment is not code\nconst here = import.meta.url;\n`);
  const r = runSeamA(root);
  assert.equal(r.code, 0, r.out);
});
