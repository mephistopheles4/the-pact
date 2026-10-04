// The cross script installs like the rest of the pact (#45): seam A classifies
// it by an exact path, the install copies it to one fixed live path, the
// manifest fingerprints it, and a changed live copy is drift.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO, failRules, lastLine, read, runSeamA, stage } from './helpers.mjs';
import { home, install, listTree, makeRepo, refused } from './install-harness.mjs';

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

// The cross script loads only Node's built-in modules (security-reviewer's F3 on #45).
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

test('bad case: a seam A that leaves the cross script off its install list refuses', t => {
  const repo = makeRepo(t, root => {
    const p = join(root, 'gate', 'seam-a.mjs');
    writeFileSync(p, read(p).replace('// @@TEST-INSTALL-HOOK@@', `if (dest === '${DEST}') continue;`));
  });
  const r = install(repo, home(t));
  refused(r);
  assert.match(r.stdout, /copy set/);
});

test('bad case: a seam A that sends the cross script to another live path refuses', t => {
  const repo = makeRepo(t, root => {
    const p = join(root, 'gate', 'seam-a.mjs');
    const from = "['cross/cross.mjs', 'pact/cross.mjs']";
    assert.ok(read(p).includes(from), 'seam A no longer holds the mapping this test plants against');
    writeFileSync(p, read(p).replace(from, "['cross/cross.mjs', 'agents/cross.mjs']"));
  });
  const r = install(repo, home(t));
  refused(r);
  assert.match(r.stdout, /copy set/);
});
