// PACT-105 C22, C25 and C28: the release bootstrap. A throwaway local repo
// stands in for the pact's own, holding a stub install and a stub builder that
// record how they were run; no test here runs the install or reaches the network.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const BOOT = join(REPO, 'bin', 'pact.mjs');
const boot = () => import(pathToFileURL(BOOT).href);
const WIN = process.platform === 'win32';

const STUB = "import { writeFileSync } from 'node:fs';\nwriteFileSync(process.env.STUB_OUT, JSON.stringify({ argv: process.argv.slice(1), cwd: process.cwd(), path: process.env.PATH ?? process.env.Path, nodeOptions: process.env.NODE_OPTIONS ?? null, home: process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME }));\nprocess.exitCode = Number(process.env.STUB_EXIT ?? 0);\n";

// The builder's stub records beside the install's, so each is seen to run or not.
const BUILDER_STUB = STUB.replace('process.env.STUB_OUT,', "process.env.STUB_OUT + '.builder',");

const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

/** A repo whose commits each hold the stub install, with `release(name)` committing and tagging one. */
function remote(t) {
  const dir = tempDir(t, 'pact-remote-');
  git(dir, 'init', '-q', '-b', 'main');
  for (const [k, v] of [['user.email', 'test@example.invalid'], ['user.name', 'gate test'], ['commit.gpgsign', 'false'], ['tag.gpgsign', 'false']]) git(dir, 'config', k, v);
  mkdirSync(join(dir, 'gate'));
  writeFileSync(join(dir, 'gate', 'install.mjs'), STUB);
  mkdirSync(join(dir, 'builder'));
  writeFileSync(join(dir, 'builder', 'build.mjs'), BUILDER_STUB);
  let n = 0;
  const release = (name, { annotated = false } = {}) => {
    writeFileSync(join(dir, 'n'), `${(n += 1)}\n`);
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', name);
    git(dir, 'tag', ...(annotated ? ['-a', '-m', name] : []), name);
    return git(dir, 'rev-parse', 'HEAD');
  };
  return { dir, url: pathToFileURL(dir).href, release };
}

/** One bootstrap run in-process: its code, its lines, and what the stub install and builder recorded (null when one never ran). */
async function run(t, url, { argv = ['--default'], home = tempDir(t, 'pact-home-'), env, tty = false, answer } = {}) {
  const { main } = await boot();
  const stubOut = join(tempDir(t, 'pact-stub-'), 'ran.json');
  const lines = [];
  const code = await main({ argv: [...argv, '--home', home], env: { ...(env ?? process.env), STUB_OUT: stubOut }, url, tty, ask: async () => answer, say: l => lines.push(l), stdio: 'ignore' });
  const read = file => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
  return { code, out: lines.join('\n'), ran: read(stubOut), built: read(`${stubOut}.builder`), home };
}

const source = home => join(home, '.pact', 'source');
const clones = home => (existsSync(source(home)) ? readdirSync(source(home)).filter(n => n !== 'clones.json').sort() : []);

test('bootstrap: takes the highest tag named exactly v1.<n>.0, prints it, and ignores every other name', async t => {
  const r = remote(t);
  r.release('v1.2.0');
  const sha = r.release('v1.10.0', { annotated: true });
  for (const name of ['v1.99.1', 'v2.0.0', 'v1.011.0', 'evil-1.50.0', 'v1.60.0-rc1', 'xv1.70.0']) r.release(name);
  const got = await run(t, r.url);
  assert.equal(got.code, 0, got.out);
  assert.match(got.out, new RegExp(`^Release: v1\\.10\\.0 \\(commit ${sha}\\)$`, 'm'));
  assert.deepEqual(clones(got.home), [sha]);
});

test('bootstrap: refuses when no release tag exists, and writes nothing', async t => {
  const r = remote(t);
  r.release('v2.0.0');
  const got = await run(t, r.url);
  assert.equal(got.code, 1, got.out);
  assert.match(got.out, /\[release-none\]/);
  assert.equal(existsSync(join(got.home, '.pact')), false);
});

test('bootstrap: runs the clone\'s install by its full path as a dry run, never with --apply, from the home folder', async t => {
  const r = remote(t);
  const sha = r.release('v1.1.0');
  // The bootstrap hands the install no NODE_OPTIONS.
  const got = await run(t, r.url, { env: { ...process.env, NODE_OPTIONS: '--no-warnings' } });
  assert.equal(got.ran.nodeOptions, null);
  assert.deepEqual(got.ran.argv, [join(source(got.home), sha, 'gate', 'install.mjs'), '--release', 'v1.1.0', '--home', got.home]);
  assert.equal(realpathSync.native(got.ran.cwd), realpathSync.native(got.home));
  const refusedApply = await run(t, r.url, { argv: ['--default', '--apply'] });
  assert.match(refusedApply.out, /\[bootstrap-args\]/);
  assert.equal(refusedApply.ran, null);
});

test('bootstrap: refuses a clone whose head is not the tag\'s commit, and deletes it', async t => {
  const r = remote(t);
  const sha = r.release('v1.1.0');
  const first = await run(t, r.url);
  const clone = join(source(first.home), sha);
  git(clone, '-c', 'user.email=test@example.invalid', '-c', 'user.name=gate test', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'moved');
  const got = await run(t, r.url, { home: first.home });
  assert.equal(got.code, 1, got.out);
  assert.match(got.out, /\[release-head\]/);
  assert.equal(got.ran, null);
  assert.equal(existsSync(clone), false);
  // A fresh clone too: a branch of the tag's name is what git clones, so the head is not the tag's commit.
  writeFileSync(join(r.dir, 'moved'), 'moved\n');
  git(r.dir, 'add', '-A');
  git(r.dir, 'commit', '-q', '-m', 'moved');
  git(r.dir, 'branch', 'v1.1.0');
  const fresh = await run(t, r.url);
  assert.match(fresh.out, /\[release-head\]/);
  assert.equal(fresh.ran, null);
  assert.deepEqual(clones(fresh.home), []);
});

test('bootstrap: with no terminal and neither flag it refuses before it fetches or writes anything', async t => {
  const got = await run(t, 'file:///nowhere-at-all', { argv: [] });
  assert.equal(got.code, 1, got.out);
  assert.match(got.out, /\[bootstrap-choice\]/);
  assert.equal(existsSync(join(got.home, '.pact')), false);
});

test('bootstrap: on a terminal with neither flag it asks, and runs the dry run on the default answer only', async t => {
  const r = remote(t);
  r.release('v1.1.0');
  assert.notEqual((await run(t, r.url, { argv: [], tty: true, answer: '1' })).ran, null);
  for (const answer of ['', 'yes', '3']) {
    const got = await run(t, r.url, { argv: [], tty: true, answer });
    assert.match(got.out, /\[bootstrap-choice\]/, answer);
    assert.equal(got.ran, null, answer);
  }
});

// PACT-105 C25: the builder choice runs the clone's builder and no install.
test('bootstrap: the builder choice, asked or flagged, runs the clone\'s builder for the home folder on the example builder file, and never the install', async t => {
  const r = remote(t);
  const sha = r.release('v1.1.0');
  for (const how of [{ argv: [], tty: true, answer: '2' }, { argv: ['--builder'] }]) {
    const got = await run(t, r.url, how);
    assert.equal(got.code, 0, got.out);
    const clone = join(source(got.home), sha);
    assert.equal(got.ran, null, 'no install ran');
    assert.deepEqual(got.built.argv, [join(clone, 'builder', 'build.mjs'), '--builder', join(clone, 'examples', 'pact-config', 'builder.json')]);
    // The builder writes to the home folder it is told of, so --home reaches it as the home folder.
    assert.equal(got.built.home, got.home);
    assert.equal(got.built.nodeOptions, null);
    assert.match(got.out, /Nothing is installed yet/);
  }
});

test('bootstrap: the builder choice builds from the person\'s own builder file when the pact folder holds one', async t => {
  const r = remote(t);
  r.release('v1.1.0');
  const home = tempDir(t, 'pact-home-');
  mkdirSync(join(home, '.pact'));
  writeFileSync(join(home, '.pact', 'builder.json'), '{ "schema": 1 }\n');
  const got = await run(t, r.url, { argv: ['--builder'], home });
  assert.deepEqual(got.built.argv.slice(1), ['--builder', join(home, '.pact', 'builder.json')]);
});

test('bootstrap: a builder that fails ends the run as a failure, with no next step offered', async t => {
  const r = remote(t);
  r.release('v1.1.0');
  const got = await run(t, r.url, { argv: ['--builder'], env: { ...process.env, STUB_EXIT: '1' } });
  assert.equal(got.code, 1, got.out);
  assert.doesNotMatch(got.out, /Nothing is installed yet/);
});

test('bootstrap: --default leaves an existing configuration as it is', async t => {
  const r = remote(t);
  r.release('v1.1.0');
  const home = tempDir(t, 'pact-home-');
  mkdirSync(join(home, '.pact'));
  writeFileSync(join(home, '.pact', 'config.json'), '{"mine": 1}\n');
  const got = await run(t, r.url, { home });
  assert.equal(got.code, 0, got.out);
  assert.equal(readFileSync(join(home, '.pact', 'config.json'), 'utf8'), '{"mine": 1}\n');
});

test('bootstrap: keeps the last three clones it made, and no other folder is deleted', async t => {
  const r = remote(t);
  const home = tempDir(t, 'pact-home-');
  const other = 'f'.repeat(40);
  mkdirSync(join(source(home), other), { recursive: true });
  const made = [];
  for (const n of [1, 2, 3, 4, 5]) {
    made.push(r.release(`v1.${n}.0`));
    assert.equal((await run(t, r.url, { home })).code, 0);
  }
  assert.deepEqual(clones(home), [...made.slice(2), other].sort());
});

test('bootstrap: refuses a home folder inside a git work tree, or one that is not a full path', async t => {
  const inside = remote(t);
  inside.release('v1.1.0');
  const got = await run(t, inside.url, { home: inside.dir });
  assert.match(got.out, /\[home-work-tree\]/);
  assert.equal(existsSync(join(inside.dir, '.pact')), false);
  assert.match((await run(t, inside.url, { home: 'relative' })).out, /\[home-path\]/);
});

test('bootstrap: a git planted in the folder it runs from, or on a package-folder PATH entry, never runs', async t => {
  const r = remote(t);
  r.release('v1.1.0');
  const cwd = tempDir(t, 'pact-cwd-');
  const bin = join(cwd, 'node_modules', '.bin');
  mkdirSync(bin, { recursive: true });
  // The planted program fails or leaves a mark: either shows it ran.
  const mark = join(cwd, 'planted-ran');
  for (const dir of [cwd, bin]) {
    if (WIN) copyFileSync(process.execPath, join(dir, 'git.exe'));
    else {
      writeFileSync(join(dir, 'git'), `#!/bin/sh\ntouch '${mark}'\nexit 1\n`);
      chmodSync(join(dir, 'git'), 0o755);
    }
  }
  const path = [bin, '.', '', process.env.PATH ?? process.env.Path].join(delimiter);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^path$/i.test(k)));
  // The test process stands in the planted folder, as the bootstrap does under npx, so a relative entry would find it.
  const was = process.cwd();
  process.chdir(cwd);
  let got;
  try {
    got = await run(t, r.url, { env: { ...env, PATH: path } });
  } finally {
    process.chdir(was);
  }
  assert.equal(got.code, 0, got.out);
  assert.equal(existsSync(mark), false);
  const passed = got.ran.path.split(delimiter);
  assert.deepEqual(passed.filter(p => p === bin || p === '.' || p === ''), [], 'the install is handed a PATH without them');
});

test('bootstrap: run through a link to it, as a package\'s bin is, it still runs', t => {
  const dir = tempDir(t, 'pact-bin-');
  let entry = BOOT;
  if (!WIN) symlinkSync(BOOT, (entry = join(dir, 'pact')));
  const r = spawnSync(process.execPath, [entry, '--no-such-option'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /\[bootstrap-args\]/);
});

// PACT-105 decision 167: release candidates, the stable default, the beta channel and an exact tag.
const tagOf = out => /^Release: (\S+) /m.exec(out)?.[1] ?? null;

test('bootstrap: by default it takes the highest stable release and never a release candidate', async t => {
  const r = remote(t);
  const stable = r.release('v1.2.0');
  r.release('v1.3.0-rc.1');
  r.release('v1.3.0-rc.2');
  const got = await run(t, r.url);
  assert.equal(got.code, 0, got.out);
  assert.equal(tagOf(got.out), 'v1.2.0');
  assert.deepEqual(clones(got.home), [stable]);
  // Bad case: with only candidates the default finds no release rather than taking one.
  const only = remote(t);
  only.release('v1.1.0-rc.1');
  const none = await run(t, only.url);
  assert.match(none.out, /\[release-none\]/);
  assert.equal(none.ran, null);
  assert.equal(existsSync(join(none.home, '.pact')), false);
});

test('bootstrap: --channel beta takes the newest release, by number, and a stable release outranks its own candidates', async t => {
  const r = remote(t);
  r.release('v1.2.0');
  r.release('v1.3.0-rc.2');
  const rc10 = r.release('v1.3.0-rc.10', { annotated: true });
  const beta = ['--default', '--channel', 'beta'];
  const first = await run(t, r.url, { argv: beta });
  assert.equal(tagOf(first.out), 'v1.3.0-rc.10');
  assert.deepEqual(clones(first.home), [rc10]);
  const stable = r.release('v1.3.0');
  const second = await run(t, r.url, { argv: beta });
  assert.equal(tagOf(second.out), 'v1.3.0');
  assert.deepEqual(clones(second.home), [stable]);
  // Bad case: a newer candidate beats an older stable on beta, and the stable channel still ignores it.
  r.release('v1.4.0-rc.1');
  assert.equal(tagOf((await run(t, r.url, { argv: beta })).out), 'v1.4.0-rc.1');
  assert.equal(tagOf((await run(t, r.url, { argv: ['--default', '--channel', 'stable'] })).out), 'v1.3.0');
});

test('bootstrap: --release installs exactly the tag named, stable or candidate, and never a higher one', async t => {
  const r = remote(t);
  const old = r.release('v1.2.0');
  const rc = r.release('v1.3.0-rc.1');
  r.release('v1.4.0');
  const exact = await run(t, r.url, { argv: ['--default', '--release', 'v1.2.0'] });
  assert.equal(tagOf(exact.out), 'v1.2.0');
  assert.deepEqual(exact.ran.argv.slice(1, 3), ['--release', 'v1.2.0']);
  assert.deepEqual(clones(exact.home), [old]);
  const cand = await run(t, r.url, { argv: ['--default', '--release', 'v1.3.0-rc.1'] });
  assert.equal(tagOf(cand.out), 'v1.3.0-rc.1');
  assert.deepEqual(cand.ran.argv.slice(1, 3), ['--release', 'v1.3.0-rc.1']);
  assert.deepEqual(clones(cand.home), [rc]);
  // Bad case: a tag that does not exist is refused, though higher releases exist, and nothing is written.
  for (const missing of ['v1.9.0', 'v1.3.0-rc.2', 'v1.3.0']) {
    const got = await run(t, r.url, { argv: ['--default', '--release', missing] });
    assert.equal(got.code, 1, missing);
    assert.match(got.out, /\[release-none\]/, missing);
    assert.equal(got.ran, null);
    assert.equal(existsSync(join(got.home, '.pact')), false);
  }
});

test('bootstrap: refuses a bad channel, a bad or major tag, both together, or a repeat, before it fetches or writes anything', async t => {
  for (const argv of [
    ['--default', '--channel', 'gamma'],
    ['--default', '--channel'],
    ['--default', '--channel', 'beta', '--channel', 'beta'],
    ['--default', '--release', 'v2.0.0'],
    ['--default', '--release', 'v2.1.0-rc.1'],
    ['--default', '--release', 'v1.2'],
    ['--default', '--release', 'v1.2.1'],
    ['--default', '--release', 'v1.2.0-rc1'],
    ['--default', '--release', 'v1.2.0-rc.0'],
    ['--default', '--release', 'main'],
    ['--default', '--release'],
    ['--default', '--channel', 'beta', '--release', 'v1.1.0'],
    ['--default', '--release', 'v1.1.0', '--release', 'v1.1.0'],
  ]) {
    const got = await run(t, 'file:///nowhere-at-all', { argv });
    assert.equal(got.code, 1, argv.join(' '));
    assert.match(got.out, /\[bootstrap-args\]/, argv.join(' '));
    assert.equal(got.ran, null);
    assert.equal(existsSync(join(got.home, '.pact')), false);
  }
});

test('bootstrap: a major release is never taken, by default, on the beta channel or by name', async t => {
  const r = remote(t);
  const one = r.release('v1.1.0');
  r.release('v2.0.0');
  r.release('v2.1.0-rc.1');
  const beta = await run(t, r.url, { argv: ['--default', '--channel', 'beta'] });
  assert.equal(tagOf(beta.out), 'v1.1.0');
  assert.deepEqual(clones(beta.home), [one]);
});
