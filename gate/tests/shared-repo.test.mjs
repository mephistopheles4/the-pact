// The shared throwaway repo (#146): one per test file, for tests that only
// read it. Its after-check hashes the whole repo after each test, without
// running git, and fails the test that changed it. The plants run as their own
// node --test child, so a failing after-check is seen end to end: the planted
// test fails, the run exits non-zero, and the next test gets a fresh repo.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { home, install, sharedRepo, treeHash } from './install-harness.mjs';
import { GATE, tempDir } from './helpers.mjs';

const shared = sharedRepo();

test('shared repo: two dry-run installs in a row leave its hash unchanged', t => {
  const built = treeHash(shared.root);
  for (const run of ['first', 'second']) {
    const r = install(shared.root, home(t));
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(treeHash(shared.root), built, `the ${run} dry run changed the shared repo`);
  }
});

// A tracked file whose timestamp moved makes git's status rehash it and, when
// it may take the index lock, write the index back. So this is the case the
// lock setting is for; with a plain repo the dry runs may leave it alone anyway.
test('shared repo: a dry run after a tracked file\'s timestamp moved still leaves its hash unchanged', t => {
  const built = treeHash(shared.root);
  const f = join(shared.root, 'AGENTS.md');
  const { atime, mtime } = statSync(f);
  utimesSync(f, atime, new Date(mtime.getTime() + 60_000));
  try {
    const r = install(shared.root, home(t));
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(treeHash(shared.root), built, 'the dry run changed the shared repo');
  } finally {
    utimesSync(f, atime, mtime);
  }
});

const HARNESS_URL = pathToFileURL(join(GATE, 'tests', 'install-harness.mjs')).href;

/** A planted test file whose first test runs `plant` on the shared repo; its second test checks it got a fresh one. */
function plantFile(t, plant) {
  const f = join(tempDir(t, 'pact-plant-'), 'planted.test.mjs');
  writeFileSync(
    f,
    `import assert from 'node:assert/strict';
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { git, sharedRepo } from ${JSON.stringify(HARNESS_URL)};
const shared = sharedRepo();
let first;
test('planted', () => {
  first = shared.root;
  const root = shared.root;
  ${plant}
});
test('next', () => {
  assert.ok(existsSync(join(shared.root, '.git')));
  assert.ok(!existsSync(join(shared.root, 'settings.json')));
});
`,
  );
  return f;
}

/** Run a planted file with node --test and the TAP reporter, outside this run's own test context. */
function runPlant(f) {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', f], { env, encoding: 'utf8', timeout: 120_000 });
  return { code: r.status, stdout: r.stdout, out: `${r.stdout}${r.stderr}` };
}

const CHANGED = /the test changed the shared repo, which only read-only tests may use: /;

test('shared repo control: a planted test that writes nothing passes, and so does the next', t => {
  const r = runPlant(plantFile(t, 'void root;'));
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^ok 1 - planted$/m, r.out);
  assert.match(r.stdout, /^ok 2 - next$/m, r.out);
  assert.doesNotMatch(r.out, CHANGED);
});

for (const [label, plant, path] of [
  ['writes a tracked file', "appendFileSync(join(root, 'AGENTS.md'), 'x\\n');", 'AGENTS.md'],
  ['writes an ignored file', "writeFileSync(join(root, 'settings.json'), '{}\\n'); assert.equal(git(root, 'check-ignore', 'settings.json').trim(), 'settings.json');", 'settings.json'],
  ['changes the repo\'s local git configuration', "git(root, 'config', 'user.name', 'planted');", '.git/config'],
]) {
  test(`bad case: a test that ${label} fails the shared repo's after-check, naming ${path}, and the next test gets a fresh repo`, t => {
    const r = runPlant(plantFile(t, plant));
    assert.notEqual(r.code, 0, r.out);
    assert.match(r.stdout, /^not ok 1 - planted$/m, r.out);
    assert.match(r.out, CHANGED, r.out);
    assert.ok(r.out.includes(path), r.out);
    assert.match(r.stdout, /^ok 2 - next$/m, r.out);
  });
}
