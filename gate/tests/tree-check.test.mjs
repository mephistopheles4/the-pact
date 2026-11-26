// The tree check (spec 0007 S12): review.md's one command, run here as a
// session runs it, before and after an agent no harness holds to its tools.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { childEnv } from './gate-run.mjs';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const REVIEW = readFileSync(join(REPO, 'claude', 'review.md'), 'utf8').replaceAll('\r\n', '\n');

/** The command's script: the one fenced block that leaves for the home folder and runs `node -e` on the top folder, without its list indent. */
function script() {
  const blocks = [...REVIEW.matchAll(/^( *)```sh\n\1cd ~\n\1node -e '\n([\s\S]*?)\n\1' "<top folder>"\n\1```$/gm)];
  assert.equal(blocks.length, 1, 'review.md holds one fenced node -e command');
  const [, indent, body] = blocks[0];
  return body.split('\n').map(l => l.slice(indent.length)).join('\n');
}

const env = () => Object.fromEntries(Object.entries(childEnv()).filter(([k]) => !/^GIT_/i.test(k)));

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd, env: env(), encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args[0]} failed: ${r.stderr}`);
}

const head = cwd => spawnSync('git', ['rev-parse', 'HEAD'], { cwd, env: env(), encoding: 'utf8' }).stdout.trim();

/** The command on `tree`, started from a folder outside it. */
function run(tree, over = {}) {
  const e = { ...env(), ...over };
  for (const k of Object.keys(over)) if (over[k] === undefined) for (const have of Object.keys(e)) if (have.toLowerCase() === k.toLowerCase()) delete e[have];
  return spawnSync(process.execPath, ['-e', script(), tree], { cwd: tmpdir(), env: e, encoding: 'utf8' });
}

function record(cwd) {
  const r = run(cwd);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

/** A repo with a tracked, an untracked and an ignored file, and a linked worktree of it. */
function repos(t) {
  const root = tempDir(t, 'pact-tree-check-');
  const main = join(root, 'main');
  mkdirSync(main);
  git(main, 'init', '-q');
  writeFileSync(join(main, '.gitignore'), 'ignored/\n');
  writeFileSync(join(main, 'tracked.txt'), 'one\n');
  git(main, 'add', '.');
  git(main, 'commit', '-q', '-m', 'start');
  const linked = join(root, 'linked');
  git(main, 'worktree', 'add', '-q', linked);
  for (const dir of [main, linked]) {
    writeFileSync(join(dir, 'untracked.txt'), 'mine\n');
    mkdirSync(join(dir, 'ignored'));
    writeFileSync(join(dir, 'ignored', 'cache'), 'a\n');
  }
  return { root, main, linked };
}

test('C10: the tree check holds no quote, so either shell passes it on unchanged, repeats itself across a git status, runs no program git’s config names or the tree holds, and fails on what it can’t read', t => {
  assert.doesNotMatch(script(), /['"]/);
  const { root, main, linked } = repos(t);
  const marker = join(root, 'fsmonitor-ran');
  const hook = join(root, 'mark.cjs');
  writeFileSync(hook, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x');\n`);
  git(main, 'config', 'core.fsmonitor', `node "${hook.replaceAll('\\', '/')}"`);
  for (const dir of [main, linked]) {
    const before = record(dir);
    assert.ok(!existsSync(marker), 'the command ran the fsmonitor program');
    // Control: git status runs it, and rewrites the index's cached file times.
    writeFileSync(join(dir, 'tracked.txt'), 'one\n');
    git(dir, 'status');
    assert.ok(existsSync(marker), 'control: git status runs the fsmonitor program');
    rmSync(marker);
    assert.equal(record(dir), before);
  }
  // Windows looks for a program in the child's working folder first: a copy of
  // Node named git.exe in the tree takes none of the command's arguments.
  if (process.platform === 'win32') {
    copyFileSync(process.execPath, join(main, 'git.exe'));
    const planted = run(main, { NoDefaultCurrentDirectoryInExePath: undefined });
    assert.equal(planted.status, 0, `the command ran the tree’s git.exe: ${planted.stderr}`);
  }
  // A folder it can't read as a work tree fails the run, never an empty record.
  assert.notEqual(run(root).status, 0);
  // So does a name that is not text, which Node reads back as another name: a
  // lone surrogate on Windows, a byte that is no UTF-8 on Linux (macOS takes neither).
  if (process.platform !== 'darwin') {
    const odd = process.platform === 'win32' ? join(linked, '\uD800x') : Buffer.concat([Buffer.from(`${linked}/`), Buffer.from([0xff, 0x41])]);
    writeFileSync(odd, 'a\n');
    assert.notEqual(run(linked).status, 0, 'a name that is not text was left out');
    rmSync(odd);
  }
  // And a file or folder that no read opens (root opens both).
  if (process.platform !== 'win32' && process.getuid() !== 0) {
    for (const path of [join(linked, 'untracked.txt'), join(linked, 'ignored')]) {
      chmodSync(path, 0o000);
      assert.notEqual(run(linked).status, 0, `unreadable: ${path}`);
      chmodSync(path, 0o755);
    }
  }
});

test('C10: the tree check takes the folder from its last argument, so a session that pipes the script to node gets the same record, and a run naming no folder fails', t => {
  const { root, main } = repos(t);
  const away = { cwd: root, env: env(), encoding: 'utf8' };
  const piped = spawnSync(process.execPath, ['-', main], { ...away, input: script() });
  assert.equal(piped.status, 0, piped.stderr);
  assert.equal(piped.stdout, record(main));
  // Started inside a work tree, so a run that fell back to where it stands would print a record.
  const inside = { ...away, cwd: main };
  assert.notEqual(spawnSync(process.execPath, ['-e', script()], inside).status, 0, 'node -e with no folder');
  assert.notEqual(spawnSync(process.execPath, ['-'], { ...inside, input: script() }).status, 0, 'a piped run with no folder');
});

test('C10: bad case: the tree check starts no fetch, which runs a program the repo’s config names', t => {
  const root = tempDir(t, 'pact-tree-fetch-');
  const repo = join(root, 'repo');
  for (const dir of ['kept', 'gone']) mkdirSync(join(repo, dir), { recursive: true });
  git(repo, 'init', '-q');
  for (const dir of ['kept', 'gone']) writeFileSync(join(repo, dir, 'file.txt'), `${dir}\n`);
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'start');
  // An index holding a folder as one entry, whose tree object is missing from a partial clone.
  git(repo, 'sparse-checkout', 'init', '--cone', '--sparse-index');
  git(repo, 'sparse-checkout', 'set', 'kept');
  const tree = spawnSync('git', ['rev-parse', 'HEAD:gone'], { cwd: repo, env: env(), encoding: 'utf8' }).stdout.trim();
  rmSync(join(repo, '.git', 'objects', tree.slice(0, 2), tree.slice(2)), { force: true });
  const marker = join(root, 'fetch-ran');
  const hook = join(root, 'mark.cjs');
  writeFileSync(hook, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x');\n`);
  for (const [key, value] of [['core.repositoryformatversion', '1'], ['extensions.partialClone', 'origin'], ['remote.origin.url', repo], ['remote.origin.promisor', 'true'], ['remote.origin.uploadpack', `node "${hook.replaceAll('\\', '/')}"`]]) git(repo, 'config', key, value);
  const quiet = () => {
    const r = run(repo);
    assert.ok(!existsSync(marker), 'the command ran the program the fetch names');
    return r;
  };
  const listed = quiet();
  assert.equal(listed.status, 0, listed.stderr);
  // Told to list the folder's files instead, git leaves them out and goes on: the run fails.
  git(repo, 'config', '--worktree', 'index.sparse', 'false');
  assert.notEqual(quiet().status, 0, 'an index listed short fails the run');
  // Control: a plain listing fetches, and runs it.
  spawnSync('git', ['ls-files', '--stage'], { cwd: repo, env: env() });
  assert.ok(existsSync(marker), 'control: git ls-files runs the program');
});

test('C10: bad case: the tree check’s record differs after each change an agent could make', t => {
  const { root, main, linked } = repos(t);
  // The session compares the last line alone, so that line must differ too.
  const last = text => text.trimEnd().split('\n').at(-1);
  // No hash is cut short: someone who writes a file before the pass could match a short one.
  for (const line of record(main).trimEnd().split('\n')) assert.match(line, /^[0-9a-f]{64} /);
  for (const dir of [main, linked]) {
    const tag = dir === main ? 'main' : 'linked';
    const shared = join(main, '.git');
    // This work tree's own git folder.
    const own = dir === main ? shared : join(shared, 'worktrees', 'linked');
    const changes = {
      'a tracked file’s content': () => writeFileSync(join(dir, 'tracked.txt'), 'two\n'),
      'an untracked file’s content': () => writeFileSync(join(dir, 'untracked.txt'), 'theirs\n'),
      'an ignored file’s content': () => writeFileSync(join(dir, 'ignored', 'cache'), 'b\n'),
      'a new empty folder': () => mkdirSync(join(dir, 'empty')),
      'staged content alone': () => git(dir, 'add', 'tracked.txt'),
      'the index alone': () => git(dir, 'rm', '-q', '--cached', 'tracked.txt'),
      'an assume-unchanged mark': () => git(dir, 'update-index', '--assume-unchanged', '.gitignore'),
      'git’s config': () => git(dir, 'config', `pact.${tag}`, 'x'),
      'a hook': () => writeFileSync(join(main, '.git', 'hooks', `post-checkout-${tag}`), 'x\n'),
      'an info file': () => writeFileSync(join(main, '.git', 'info', 'attributes'), `${tag}\n`),
      'a new ref': () => git(dir, 'update-ref', `refs/heads/planted-${tag}`, 'HEAD'),
      'a ref of this work tree alone': () => git(dir, 'update-ref', 'refs/worktree/planted', 'HEAD'),
      'the packed refs': () => writeFileSync(join(shared, 'packed-refs'), `# pack-refs with: peeled \n${head(dir)} refs/tags/planted-${tag}\n`),
      'the stash log': () => {
        mkdirSync(join(shared, 'logs', 'refs'), { recursive: true });
        writeFileSync(join(shared, 'logs', 'refs', 'stash'), `${tag}\n`);
      },
      'this work tree’s config': () => writeFileSync(join(own, 'config.worktree'), `# ${tag}\n`),
      'a rebase to-do list': () => {
        mkdirSync(join(own, 'rebase-merge'));
        writeFileSync(join(own, 'rebase-merge', 'git-rebase-todo'), 'exec true\n');
      },
      'a merge in progress': () => writeFileSync(join(own, 'MERGE_HEAD'), `${'0'.repeat(40)}\n`),
      'HEAD': () => git(dir, 'symbolic-ref', 'HEAD', `refs/heads/planted-${tag}`),
    };
    for (const [what, change] of Object.entries(changes)) {
      const before = record(dir);
      change();
      assert.notEqual(last(record(dir)), last(before), `${tag}: ${what}`);
    }
    // A hook in the folder git's config names instead.
    const elsewhere = join(root, `hooks-${tag}`);
    mkdirSync(elsewhere);
    git(dir, 'config', 'core.hooksPath', elsewhere);
    const before = record(dir);
    writeFileSync(join(elsewhere, 'pre-commit'), 'x\n');
    assert.notEqual(last(record(dir)), last(before), `${tag}: a hook in the folder core.hooksPath names`);
  }
});
