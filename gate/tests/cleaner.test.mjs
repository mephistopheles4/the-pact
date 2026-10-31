// The cleaner (#438) on real git in throwaway repositories: what show names
// back, what remove takes, and what it never does. Each test makes its own
// repository and its own home folder; nothing here reads ~ or this
// repository's worktrees. Claims 9 to 11 wrap the real process call to record
// or stand in for it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, isAbsolute, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { clean, esc, findGit, realOf } from '../../claude/tools/cleaner.mjs';
import { tempDir } from './tree.mjs';

const cp = String.fromCodePoint;

/** git's environment for the fixtures and the cleaner alike: no global or system config, a fixed author. */
function gitEnv(t) {
  const cfg = join(tempDir(t, 'pact-cleaner-cfg-'), 'gitconfig');
  writeFileSync(cfg, '');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: cfg, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' };
  for (const k of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR)$/i.test(k)) delete env[k];
  return env;
}

/** A fixture repository: main with one commit, .claude/ ignored by nothing, .env ignored. */
function makeRepo(t) {
  const env = gitEnv(t);
  const root = realpathSync.native(tempDir(t, 'pact-cleaner-repo-'));
  const git = (cwd, ...args) => {
    const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  git(root, 'init', '-q', '-b', 'main');
  writeFileSync(join(root, '.gitignore'), '.env\nbuild/\n');
  writeFileSync(join(root, 'a.txt'), 'a\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'first');
  const home = tempDir(t, 'pact-cleaner-home-');
  const wt = name => join(root, '.claude', 'worktrees', name);
  const add = (name, ...how) => {
    git(root, 'worktree', 'add', '-q', wt(name), ...(how.length ? how : ['-b', name]));
    return wt(name);
  };
  const io = (over = {}) => ({ env, home, cwd: root, ...over });
  const run = (argv, over) => {
    const r = clean(argv, io(over));
    return { ...r, out: r.lines.join('\n') };
  };
  return { root, env, git, home, wt, add, io, run };
}

const tagsOf = out => (/^RESULT: shown \d+ ?(\S*)$/m.exec(out)?.[1] ?? '').split(',').filter(Boolean);
/** The block show prints for one worktree, up to the next block or the result line. */
const block = (out, name) => {
  const m = new RegExp(`^worktree ${name.replace(/[.]/g, '\\.')}\\n((?: {2}.*\\n?)*)`, 'm').exec(`${out}\n`);
  return m ? m[1] : null;
};
const worktrees = f => f.git(f.root, 'worktree', 'list', '--porcelain').split('\n').filter(l => l.startsWith('worktree ')).length;
const branches = f => f.git(f.root, 'branch', '--format=%(refname)').split('\n').map(r => r.slice('refs/heads/'.length));

/** Output holds no absolute path: not the repository's, the home folder's, nor any drive or root form. */
function noPath(f, out) {
  for (const p of [f.root, f.home, f.root.replace(/\\/g, '/'), f.home.replace(/\\/g, '/')]) assert.ok(!out.includes(p), out);
  assert.doesNotMatch(out, /[A-Za-z]:[\\/]|(?:^|\s)\/(?:tmp|home|Users|var)\//);
}

/** A process call that records each call and passes it through, or answers for it. */
function recording(answer = () => null) {
  const calls = [];
  const spawn = (file, args, opts) => {
    calls.push({ file, args, opts });
    return answer(file, args) ?? spawnSync(file, args, opts);
  };
  return { calls, spawn };
}

// #438 C1
test('show names each linked worktree under .claude/worktrees with its branch, never the main worktree or one elsewhere; a linked worktrees folder makes the run unavailable', t => {
  const f = makeRepo(t);
  f.add('one');
  f.git(f.root, 'worktree', 'add', '-q', join(tempDir(t, 'pact-cleaner-else-'), 'else'), '-b', 'else');
  // A candidate folder that is itself a link: its worktree moved out, a link left in its place.
  const away = join(realpathSync.native(tempDir(t, 'pact-cleaner-away-')), 'moved');
  renameSync(f.add('moved'), away);
  symlinkSync(away, f.wt('moved'), process.platform === 'win32' ? 'junction' : 'dir');
  const r = f.run(['show']);
  assert.equal(r.code, 0, r.out);
  assert.match(block(r.out, 'one'), /^ {2}branch one at [0-9a-f]{7}$/m, r.out);
  assert.equal(block(r.out, 'moved'), '  kept: the folder is a link\n', r.out);
  assert.equal((r.out.match(/^worktree /gm) ?? []).length, 2, r.out);
  assert.doesNotMatch(r.out, /\belse\b|\bmain\b/, r.out);
  assert.equal(tagsOf(r.out).length, 1, r.out);
  f.run(['remove', '--yes', tagsOf(r.out).join(',')]);
  assert.ok(existsSync(join(away, 'a.txt')), 'what the link points to is untouched');

  const g = makeRepo(t);
  const outside = realpathSync.native(tempDir(t, 'pact-cleaner-outside-'));
  g.git(g.root, 'worktree', 'add', '-q', join(outside, 'hidden'), '-b', 'hidden');
  mkdirSync(join(g.root, '.claude'));
  symlinkSync(outside, join(g.root, '.claude', 'worktrees'), process.platform === 'win32' ? 'junction' : 'dir');
  const l = g.run(['show']);
  assert.equal(l.code, 4, l.out);
  assert.doesNotMatch(l.out, /hidden/, l.out);
  assert.equal(l.lines.at(-1), 'RESULT: unavailable');
});

// #438 C2
test('show names changed, untracked and ignored files, a lock, a gone folder and stash refs; names print escaped; no contents, subjects, paths or git text', t => {
  const f = makeRepo(t);
  const w = f.add('busy');
  f.git(w, 'checkout', '-q', '-b', 'busy-stash');
  writeFileSync(join(w, 'a.txt'), 'STASHED CONTENT\n');
  f.git(w, 'stash', 'push', '-q', '-m', 'STASH SUBJECT');
  f.git(w, 'checkout', '-q', 'busy');
  writeFileSync(join(w, 'a.txt'), 'CHANGED CONTENT\n');
  writeFileSync(join(w, 'new.txt'), 'UNTRACKED CONTENT\n');
  writeFileSync(join(w, '.env'), 'IGNORED CONTENT\n');
  mkdirSync(join(w, 'build'));
  writeFileSync(join(w, 'build', 'out.bin'), 'x');
  writeFileSync(join(w, process.platform === 'win32' ? 'x  kept- in use \'tag\'' : 'x  kept: in use "tag"'), 'x');
  writeFileSync(join(w, process.platform === 'win32' ? '```fence' : '```<!--fence'), 'x');
  f.add('a b', '-b', 'ab');
  const odd = `odd\n${cp(0x202e)}name.txt`;
  if (process.platform !== 'win32') writeFileSync(join(w, odd), 'x');
  const s = f.add('stashed');
  writeFileSync(join(s, 'a.txt'), 'S\n');
  f.git(s, 'stash', 'push', '-q', '-m', 'ANOTHER SUBJECT');
  f.add('locked');
  f.git(f.root, 'worktree', 'lock', f.wt('locked'));
  rmSync(f.add('gone'), { recursive: true, force: true });

  const r = f.run(['show']);
  assert.equal(r.code, 0, r.out);
  const busy = block(r.out, 'busy');
  assert.match(busy, /changed files, git will refuse:\n {4}"a\.txt"$/m, r.out);
  assert.match(busy, /untracked files, git will refuse:\n(?: {4}.*\n)* {4}"new\.txt"$/m, r.out);
  assert.match(busy, /ignored, deleted with the folder, with everything inside:\n {4}"\.env"\n {4}"build\/"$/m, r.out);
  // Windows names hold no colon or quote; elsewhere the quote inside is escaped.
  assert.match(busy, process.platform === 'win32' ? /^ {4}"x {2}kept- in use 'tag'"$/m : /^ {4}"x {2}kept: in use \\"tag\\""$/m, 'a name that dresses its line prints in quotes');
  if (process.platform !== 'win32') assert.match(busy, /^ {4}"odd\\u\{a\}\\u\{202e\}name\.txt"$/m, r.out);
  // A run of backticks or a comment opener never starts a line, so it can't close the fenced block the rules file asks for.
  assert.match(busy, /^ {4}"```(?:<!--)?fence"$/m, r.out);
  assert.ok(r.lines.every(l => /^(?:worktree |RESULT: | {2}[a-z]| {4}(?:"|stash@|and \d))/.test(l)), 'every line starts with fixed words or an indent');
  assert.equal(block(r.out, '"a b"'), '  kept: a folder name the cleaner does not read\n', r.out);
  // Only the stash made on its own branch: busy-stash's entry belongs to neither block.
  assert.match(block(r.out, 'stashed'), /^ {2}stash entries made on it, kept: the cleaner never touches stashes:\n {4}stash@\{0\}\n {2}tag /m, r.out);
  assert.doesNotMatch(busy, /stash/, r.out);
  assert.match(block(r.out, 'locked'), /^ {2}locked, git will refuse$/m, r.out);
  assert.match(block(r.out, 'gone'), /^ {2}folder gone, only git's record goes$/m, r.out);
  assert.equal(esc(`a\r\n${cp(0x2066)}b\\${cp(0x2028)} c`), 'a\\u{d}\\u{a}\\u{2066}b\\\\\\u{2028} c');
  assert.doesNotMatch(r.out, /CONTENT|SUBJECT|fatal|error/i, r.out);
  assert.ok(r.lines.every(l => !/[\n\r]/.test(l)), 'one line per entry');
  noPath(f, r.out);
});

// #438 C3
test('a worktree holding a session status file\'s cwd, or the cleaner\'s own, is kept with no tag; a status file that does not read stops the run', t => {
  const f = makeRepo(t);
  const used = f.add('used');
  const here = f.add('here');
  f.add('free');
  const sessions = join(f.home, '.claude', 'sessions');
  mkdirSync(sessions, { recursive: true });
  writeFileSync(join(sessions, '4242.json'), JSON.stringify({ pid: 4242, sessionId: 'SESSIONID-77', cwd: join(used, 'sub') }));
  const r = f.run(['show'], { cwd: here });
  assert.equal(r.code, 0, r.out);
  assert.equal(block(r.out, 'used'), '  kept: in use\n', r.out);
  assert.equal(block(r.out, 'here'), '  kept: in use\n', r.out);
  assert.equal(tagsOf(r.out).length, 1, r.out);
  const rm = f.run(['remove', '--yes', tagsOf(r.out).join(',')], { cwd: here });
  assert.equal(rm.lines.at(-1), 'RESULT: removed 1 left 0 changed 0', rm.out);
  assert.ok(existsSync(used) && existsSync(here));

  // The same, with both cwds reached through a link to the repository.
  const via = join(tempDir(t, 'pact-cleaner-via-'), 'repo');
  symlinkSync(f.root, via, process.platform === 'win32' ? 'junction' : 'dir');
  const linked = f.add('linked');
  writeFileSync(join(sessions, '4242.json'), JSON.stringify({ cwd: join(via, '.claude', 'worktrees', 'linked') }));
  const lr = f.run(['show'], { cwd: join(via, '.claude', 'worktrees', 'here') });
  assert.equal(block(lr.out, 'linked'), '  kept: in use\n', lr.out);
  assert.equal(block(lr.out, 'here'), '  kept: in use\n', lr.out);
  assert.ok(existsSync(linked));

  // A cwd under a link inside a worktree that points out of it, and a cwd that no longer exists reached through a link to the repository.
  const inner = f.add('inner');
  symlinkSync(tempDir(t, 'pact-cleaner-out-'), join(inner, 'out'), process.platform === 'win32' ? 'junction' : 'dir');
  f.add('gone-cwd');
  writeFileSync(join(sessions, '4242.json'), JSON.stringify({ cwd: join(inner, 'out') }));
  writeFileSync(join(sessions, '4343.json'), JSON.stringify({ cwd: join(via, '.claude', 'worktrees', 'gone-cwd', 'deleted') }));
  const ir = f.run(['show'], { cwd: f.root });
  assert.equal(block(ir.out, 'inner'), '  kept: in use\n', ir.out);
  assert.equal(block(ir.out, 'gone-cwd'), '  kept: in use\n', ir.out);
  rmSync(join(sessions, '4343.json'));

  // A network or device path is compared as given, never resolved on disk.
  const seen = [];
  const rp = p => {
    seen.push(p);
    return p;
  };
  for (const p of ['\\\\nohost.invalid\\share\\x', '//nohost.invalid/share/x']) assert.equal(realOf(p, rp), resolve(p));
  assert.deepEqual(seen, []);
  assert.equal(realOf(join(f.root, 'missing', 'leaf'), rp), join(f.root, 'missing', 'leaf'), 'a missing leaf joins onto its deepest folder');
  assert.ok(seen.length >= 1);

  for (const [why, plant] of [
    ['no JSON', () => writeFileSync(join(sessions, 'bad.json'), '{"cwd": "BROKEN-SUBSTRING')],
    ['no string cwd', () => writeFileSync(join(sessions, 'bad.json'), '{"cwd": 5, "sessionId": "SESSIONID-88"}')],
    ['a folder that cannot be listed', () => {
      rmSync(sessions, { recursive: true, force: true });
      writeFileSync(sessions, 'not a folder');
    }],
  ]) {
    plant();
    const u = f.run(['show'], { cwd: here });
    assert.equal(u.code, 4, `${why}: ${u.out}`);
    assert.equal(u.lines.at(-1), 'RESULT: unavailable', why);
    assert.equal(u.lines.at(-2), 'the cleaner is unavailable: the sessions check failed', why);
    assert.doesNotMatch(u.out, /BROKEN|SESSIONID|bad\.json|4242/, why);
  }
  rmSync(sessions, { force: true });
  assert.equal(f.run(['show']).code, 0, 'a missing sessions folder runs');
});

// #438 C4
test('remove with show\'s tags removes each worktree and its branch', t => {
  const f = makeRepo(t);
  f.add('done');
  const tags = tagsOf(f.run(['show']).out);
  const r = f.run(['remove', '--yes', tags.join(',')]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^worktree done: removed$/m, r.out);
  assert.equal(r.lines.at(-1), 'RESULT: removed 1 left 0 changed 0');
  assert.equal(worktrees(f), 1);
  assert.deepEqual(branches(f), ['main']);
});

// #438 C5
test('remove never forces: an untracked file, a lock and a submodule each leave their worktree, with a fixed reason and exit 1', t => {
  const f = makeRepo(t);
  const sub = makeRepo(t);
  f.git(f.root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sub.root, 'sub');
  f.git(f.root, 'commit', '-q', '-m', 'sub');
  writeFileSync(join(f.add('untracked'), 'new.txt'), 'x');
  f.add('locked');
  f.git(f.root, 'worktree', 'lock', f.wt('locked'));
  f.git(f.add('withsub'), '-c', 'protocol.file.allow=always', 'submodule', 'update', '-q', '--init');
  const tags = tagsOf(f.run(['show']).out);
  assert.equal(tags.length, 3);
  const r = f.run(['remove', '--yes', tags.join(',')]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^worktree untracked: left, git refused: it holds changed or untracked files$/m, r.out);
  assert.match(r.out, /^worktree locked: left, git refused: it is locked$/m, r.out);
  assert.match(r.out, /^worktree withsub: left, git refused it$/m, r.out);
  assert.equal(r.lines.at(-1), 'RESULT: removed 0 left 3 changed 0');
  assert.equal(worktrees(f), 4);
  assert.doesNotMatch(r.out, /fatal|error|cannot|submodules/i, r.out);
  noPath(f, r.out);
});

// #438 C6
test('commits found nowhere else keep the worktree and its branch, detached or not; a commit on another branch does not', t => {
  const f = makeRepo(t);
  const own = f.add('own');
  f.git(own, 'commit', '-q', '--allow-empty', '-m', 'only here');
  const det = f.add('det', '--detach');
  f.git(det, 'commit', '-q', '--allow-empty', '-m', 'only here, detached');
  const shared = f.add('shared');
  f.git(shared, 'commit', '-q', '--allow-empty', '-m', 'also on copy');
  f.git(f.root, 'branch', 'copy', 'shared');
  const r = f.run(['show']);
  assert.equal(block(r.out, 'own'), '  kept: commits found nowhere else\n', r.out);
  assert.equal(block(r.out, 'det'), '  kept: commits found nowhere else\n', r.out);
  assert.match(block(r.out, 'shared'), /^ {2}tag [0-9a-f]{10}$/m, r.out);
  // git keeps a branch unmerged into HEAD; the cleaner says so and counts it left.
  const rm = f.run(['remove', '--yes', tagsOf(r.out).join(',')]);
  assert.match(rm.out, /^worktree shared: left, the folder is gone\n {2}the branch stays: shared$/m, rm.out);
  assert.equal(rm.lines.at(-1), 'RESULT: removed 0 left 1 changed 0', rm.out);
  assert.ok(existsSync(own) && existsSync(det) && !existsSync(shared));
  assert.ok(branches(f).includes('own') && branches(f).includes('shared'));
});

// #438 C7
test('nothing outside the yes: changed facts and a worktree added after show are not touched', t => {
  const f = makeRepo(t);
  for (const b of ['main', 'dev']) f.git(f.root, 'update-ref', `refs/remotes/origin/${b}`, 'main');
  f.git(f.root, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  const ign = f.add('ign');
  const many = f.add('many');
  for (let i = 1; i <= 25; i += 1) writeFileSync(join(many, `${String(i).padStart(2, '0')}.env`), 'x');
  writeFileSync(join(many, '.gitignore'), '*.env\n');
  f.git(many, 'add', '.gitignore');
  f.git(many, 'commit', '-q', '-m', 'ignore');
  f.git(f.root, 'branch', 'many-copy', 'many');
  const moved = f.add('moved');
  f.add('dev');
  const r = f.run(['show']);
  const tags = tagsOf(r.out);
  assert.equal(tags.length, 4, r.out);
  assert.match(block(r.out, 'many'), /and 5 more$/m, r.out);
  writeFileSync(join(ign, '.env'), 'x');
  rmSync(join(many, '25.env'));
  writeFileSync(join(many, '26.env'), 'x');
  // On a copy branch too, so only the tag over the tip can catch it.
  f.git(moved, 'commit', '-q', '--allow-empty', '-m', 'new');
  f.git(f.root, 'branch', 'moved-copy', 'moved');
  f.git(f.root, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/dev');
  f.add('late');
  const rm = f.run(['remove', '--yes', tags.join(',')]);
  assert.equal(rm.code, 1, rm.out);
  assert.equal(rm.lines.at(-1), 'RESULT: removed 0 left 0 changed 4', rm.out);
  assert.equal(worktrees(f), 6);
});

// #438 C8
test('the default branch is kept while its worktree goes; a branch name outside the allowed set keeps both; a tag of the same name changes nothing', t => {
  const f = makeRepo(t);
  f.git(f.root, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
  f.git(f.root, 'branch', 'trunk');
  f.git(f.root, 'update-ref', 'refs/remotes/origin/trunk', 'trunk');
  f.add('t', 'trunk');
  f.git(f.root, 'branch', 'odd+name');
  f.add('o', 'odd+name');
  // A tag named trunk at a commit on no branch: a read of `trunk` rather than refs/heads/trunk would keep t.
  const loose = f.git(f.root, 'commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'loose');
  f.git(f.root, 'tag', 'trunk', loose);
  const r = f.run(['show']);
  const tip = f.git(f.root, 'rev-parse', '--short=7', 'refs/heads/trunk');
  assert.match(block(r.out, 't'), new RegExp(`^ {2}branch trunk at ${tip}\\n {2}branch kept: the default branch\\n {2}tag [0-9a-f]{10}\\n$`), r.out);
  assert.equal(block(r.out, 'o'), '  kept: a branch name the cleaner does not read\n', r.out);
  const rm = f.run(['remove', '--yes', tagsOf(r.out).join(',')]);
  assert.equal(rm.code, 0, rm.out);
  assert.match(rm.out, /^worktree t: removed; branch trunk kept: the default branch$/m, rm.out);
  assert.ok(!existsSync(f.wt('t')) && branches(f).includes('trunk') && existsSync(f.wt('o')));

  const g = makeRepo(t);
  g.add('m', '-b', 'master');
  const s = g.run(['show']);
  assert.match(block(s.out, 'm'), /^ {2}branch kept: the default branch$/m, 'main and master, when origin/HEAD is not known');
});

// #438 C9
test('every git call names git by an absolute path with the fixed flags and an empty hooks folder; reads end with their revision; removals are the two fixed lists', t => {
  const f = makeRepo(t);
  f.add('a');
  const d = f.add('d', '--detach');
  f.git(d, 'commit', '-q', '--allow-empty', '-m', 'x');
  const rec = recording();
  // The four variables that point git elsewhere, in any case, reach the cleaner and must not reach git.
  const env = { ...f.env, GIT_DIR: join(f.home, 'x'), git_work_tree: f.home, Git_Index_File: join(f.home, 'i'), GIT_COMMON_DIR: f.home };
  const tags = tagsOf(f.run(['show'], { spawn: rec.spawn, env }).out);
  assert.equal(f.run(['remove', '--yes', tags.join(',')], { spawn: rec.spawn, env }).code, 0);
  const files = new Set(rec.calls.map(c => c.file));
  assert.equal(files.size, 1);
  assert.match([...files][0], /^(?:[A-Za-z]:\\|\/)/);
  const removals = [];
  let reads = 0;
  for (const { args, opts } of rec.calls) {
    const [lock, c1, v1, c2, v2, c3, v3, cDir, dir, ...rest] = args;
    assert.deepEqual([lock, c1, v1, c2, v2, c3, cDir], ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'log.showSignature=false', '-c', '-C']);
    assert.match(v3, /^core\.hooksPath=/);
    assert.ok(v3.slice('core.hooksPath='.length).startsWith(f.home) && opts.cwd.startsWith(f.home), 'the run folders are under the home folder');
    assert.equal(opts.shell, undefined);
    assert.ok(!Object.keys(opts.env).some(k => /^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR)$/i.test(k)));
    assert.ok(dir === f.root || dir.startsWith(f.root));
    for (const bad of ['--force', '-f', '-D', '--delete', 'push', 'prune']) assert.ok(!rest.includes(bad), rest.join(' '));
    if (rest[0] === 'rev-list') {
      reads += 1;
      assert.equal(rest.at(-2), '--end-of-options');
      assert.equal(rest.filter(a => a === '--not').length % 2, 0, 'the revision is not under a negation');
    }
    if (rest[0] === 'worktree' && rest[1] === 'remove') removals.push(rest.slice(0, 2).concat(rest.length));
    if (rest[0] === 'branch') removals.push([...rest.slice(0, 2), rest.length]);
  }
  assert.equal(reads, 4, 'one read per worktree, in each command');
  assert.deepEqual(removals, [['worktree', 'remove', 3], ['branch', '-d', 3]]);
});

// #438 C10
test('a hook planted through core.hooksPath does not run, and a git in --repo, the cwd or a relative PATH entry is not run', t => {
  const f = makeRepo(t);
  const hooks = tempDir(t, 'pact-cleaner-hooks-');
  const mark = join(f.home, 'ran');
  writeFileSync(join(hooks, 'reference-transaction'), `#!/bin/sh\necho hook > '${mark.replace(/\\/g, '/')}'\n`, { mode: 0o755 });
  f.git(f.root, 'config', 'core.hooksPath', hooks);
  const stub = `echo stub > "${mark}"\n`;
  for (const n of ['git', 'git.cmd', 'git.bat']) writeFileSync(join(f.root, n), `#!/bin/sh\n${stub}`, { mode: 0o755 });
  f.add('a');
  // The control: the planted hook runs for a plain git call.
  f.git(f.root, 'branch', 'probe');
  assert.ok(existsSync(mark), 'the planted hook runs without the cleaner');
  rmSync(mark);
  const env = { ...f.env, PATH: `.${delimiter}${f.env.PATH ?? f.env.Path}` };
  const tags = tagsOf(f.run(['show', '--repo', f.root], { env }).out);
  const r = f.run(['remove', '--repo', f.root, '--yes', tags.join(',')], { env });
  assert.equal(r.code, 0, r.out);
  assert.ok(!existsSync(mark), 'neither the hook nor a stub ran');
  // A relative PATH entry is skipped even where it resolves, from this process's folder, to a planted git.
  const stubs = tempDir(t, 'pact-cleaner-stubs-');
  for (const n of ['git', 'git.exe']) writeFileSync(join(stubs, n), stub);
  const rel = relative(process.cwd(), stubs);
  if (!isAbsolute(rel)) {
    const found = findGit({ PATH: `${rel}${delimiter}${env.PATH}` });
    assert.ok(found && isAbsolute(found) && !found.startsWith(stubs), found);
  }
});

// #438 C11
test('a folder still there after git said it removed it: the branch is not tried, and the report says what stays', t => {
  const f = makeRepo(t);
  const w = f.add('stuck');
  symlinkSync(tempDir(t, 'pact-cleaner-target-'), join(w, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  const tags = tagsOf(f.run(['show']).out);
  const rec = recording((file, args) => (args.includes('worktree') && args.includes('remove') ? { status: 0, stdout: '', stderr: '' } : null));
  const r = f.run(['remove', '--yes', tags.join(',')], { spawn: rec.spawn });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^worktree stuck: left\n {2}the folder stays: remove it by hand\n {2}it holds a link: remove the link first\n {2}the branch stays: stuck$/m, r.out);
  assert.ok(!rec.calls.some(c => c.args.includes('branch')), 'the branch is not tried');
  assert.equal(r.lines.at(-1), 'RESULT: removed 0 left 1 changed 0');

  // A file planted in the run's hooks folder before the removal call leaves the worktree untouched.
  const g = makeRepo(t);
  g.add('h');
  const plant = recording((file, args) => {
    const hooksArg = args.find(a => a.startsWith('core.hooksPath='));
    if (args.includes('status')) writeFileSync(join(hooksArg.slice('core.hooksPath='.length), 'post-checkout'), 'x');
    return null;
  });
  const hr = g.run(['remove', '--yes', tagsOf(g.run(['show']).out).join(',')], { spawn: plant.spawn });
  assert.match(hr.out, /^worktree h: left, the run's hooks folder changed$/m, hr.out);
  assert.ok(!plant.calls.some(c => c.args.includes('remove')), 'no removal call');
  assert.ok(existsSync(g.wt('h')));
});

// #438 C12
test('a usage fault refuses with nothing run; no git, or one older than 2.36, is unavailable', t => {
  const f = makeRepo(t);
  for (const argv of [['show', '--worktree', '../x'], ['show', '--worktree', '.x'], ['show', '--worktree', '-x'], ['remove', '--yes', 'xyz'], ['show', '--yes', 'abcdef0123'], ['show', '--bogus'], ['remove'], ['wipe'], []]) {
    const rec = recording();
    const r = f.run(argv, { spawn: rec.spawn });
    assert.equal(r.code, 2, `${argv.join(' ')}: ${r.out}`);
    assert.match(r.lines.at(-1), /^RESULT: refused \d+$/);
    assert.equal(rec.calls.length, 0);
  }
  const none = f.run(['show'], { env: { ...f.env, PATH: tempDir(t, 'pact-cleaner-nopath-'), Path: undefined } });
  assert.equal(none.code, 4, none.out);
  const old = f.run(['show'], { spawn: recording(() => ({ status: 0, stdout: 'git version 2.35.9\n', stderr: '' })).spawn });
  assert.equal(old.code, 4, old.out);
  assert.match(old.out, /older than 2\.36/);
  // The floor itself runs.
  const floor = f.run(['show'], { spawn: recording((file, args) => (args.at(-1) === 'version' ? { status: 0, stdout: 'git version 2.36.0\n', stderr: '' } : null)).spawn });
  assert.equal(floor.code, 0, floor.out);
  // A run folder that can't be deleted at the end keeps the result line and prints no path.
  const held = f.run(['show'], { rm: () => { throw Object.assign(new Error(`EBUSY: ${f.home}`), { code: 'EBUSY' }); } });
  assert.equal(held.code, 0, held.out);
  assert.match(held.lines.at(-1), /^RESULT: shown 0$/);
  noPath(f, `${none.out}\n${old.out}\n${held.out}`);
});
