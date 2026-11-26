// The tree check (spec 0007 S12): review.md's one command, run here as a
// session runs it, before and after an agent no harness holds to its tools.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { childEnv } from './gate-run.mjs';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const REVIEW = readFileSync(join(REPO, 'claude', 'review.md'), 'utf8').replaceAll('\r\n', '\n');

/** The command's script: the one fenced `node -e '…'` block, without its list indent. */
function script() {
  const blocks = [...REVIEW.matchAll(/^( *)```sh\n\1node -e '\n([\s\S]*?)\n\1'\n\1```$/gm)];
  assert.equal(blocks.length, 1, 'review.md holds one fenced node -e command');
  const [, indent, body] = blocks[0];
  return body.split('\n').map(l => l.slice(indent.length)).join('\n');
}

const env = () => Object.fromEntries(Object.entries(childEnv()).filter(([k]) => !/^GIT_/i.test(k)));

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd, env: env(), encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args[0]} failed: ${r.stderr}`);
}

function run(cwd, over = {}) {
  const e = { ...env(), ...over };
  for (const k of Object.keys(over)) if (over[k] === undefined) for (const have of Object.keys(e)) if (have.toLowerCase() === k.toLowerCase()) delete e[have];
  return spawnSync(process.execPath, ['-e', script()], { cwd, env: e, encoding: 'utf8' });
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

test('C10: the tree check is one command that either shell passes on unchanged, repeats itself across a git status, and runs no program git’s config names or the tree holds', t => {
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
});

test('C10: bad case: the tree check’s record differs after each change an agent could make', t => {
  const { main, linked } = repos(t);
  for (const dir of [main, linked]) {
    const tag = dir === main ? 'main' : 'linked';
    const changes = {
      'a tracked file’s content': () => writeFileSync(join(dir, 'tracked.txt'), 'two\n'),
      'an untracked file’s content': () => writeFileSync(join(dir, 'untracked.txt'), 'theirs\n'),
      'an ignored file’s content': () => writeFileSync(join(dir, 'ignored', 'cache'), 'b\n'),
      'a new empty folder': () => mkdirSync(join(dir, 'empty')),
      'a deleted file': () => rmSync(join(dir, 'untracked.txt')),
      'the index alone': () => git(dir, 'rm', '-q', '--cached', 'tracked.txt'),
      'an assume-unchanged mark': () => git(dir, 'update-index', '--assume-unchanged', '.gitignore'),
      'git’s config': () => git(dir, 'config', `pact.${tag}`, 'x'),
      'a hook': () => writeFileSync(join(main, '.git', 'hooks', `post-checkout-${tag}`), 'x\n'),
      'an info file': () => writeFileSync(join(main, '.git', 'info', 'attributes'), `${tag}\n`),
      'a new ref': () => git(dir, 'update-ref', `refs/heads/planted-${tag}`, 'HEAD'),
      'HEAD': () => git(dir, 'symbolic-ref', 'HEAD', `refs/heads/planted-${tag}`),
    };
    for (const [what, change] of Object.entries(changes)) {
      const before = record(dir);
      change();
      assert.notEqual(record(dir), before, `${tag}: ${what}`);
    }
  }
});
