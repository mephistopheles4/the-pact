// The cleaner (#438) on real git in throwaway repositories: what show names
// back, what remove takes, and what it never does. Each test makes its own
// repository and its own home folder; nothing here reads ~ or this
// repository's worktrees. Claims 9 to 11 wrap the real process call to record
// or stand in for it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, ftruncateSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync, writeSync } from 'node:fs';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
// #442: the new exports are reached through the namespace, so this file still loads on the base.
import * as cleaner from '../../claude/tools/cleaner.mjs';
import { clean, esc, findGit, realOf, walkTree } from '../../claude/tools/cleaner.mjs';
import { tempDir } from './tree.mjs';

const cp = String.fromCodePoint;
// #454: the two reasons the walk keeps a worktree for, word for word.
const LINK_KEEP = 'holds a link: remove the link itself first, never with a recursive delete, then the folder by hand';
const GIT_KEEP = 'holds a .git entry below its root, which git does not see';
const linkKind = process.platform === 'win32' ? 'junction' : 'dir';

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
    return answer(file, args, opts) ?? spawnSync(file, args, opts);
  };
  return { calls, spawn };
}

/**
 * #442 C12: plant a real link. A local Windows run without Developer Mode
 * cannot make one and goes on without it; a CI job that cannot fails.
 */
function plantLink(target, path, type) {
  try {
    symlinkSync(target, path, type);
    return true;
  } catch (e) {
    if (process.env.CI) throw e;
    return false;
  }
}

/**
 * #442: a fake folder tree for the walk, over `root`, a fresh empty folder, so
 * a call that skips the fake finds nothing. `spec` maps an absolute path to
 * 'dir', 'file', 'other' or { link: target }; every ancestor of a path is a
 * folder. It records each call, and `check` fails if any call went through a
 * link in a part other than the last (a readdir's own path counts as a part).
 */
function fakeIo(root, spec, { fail = {} } = {}) {
  const kinds = new Map([[root, 'dir'], ...Object.entries(spec)]);
  for (const p of [...kinds.keys()]) {
    for (let up = dirname(p); ; up = dirname(up)) {
      if (!kinds.has(up)) kinds.set(up, 'dir');
      if (dirname(up) === up) break;
    }
  }
  const calls = [];
  const bad = [];
  const note = (op, path, last) => {
    calls.push({ op, path });
    for (let q = last ? path : dirname(path); ; q = dirname(q)) {
      if (typeof kinds.get(q) === 'object') bad.push(`${op} ${path}`);
      if (dirname(q) === q) break;
    }
  };
  const err = code => Object.assign(new Error(code), { code });
  const dirent = (p, k) => ({
    name: basename(p),
    isSymbolicLink: () => typeof k === 'object',
    isDirectory: () => k === 'dir',
    isFile: () => k === 'file',
  });
  return {
    calls,
    readdir(cur) {
      note('readdir', cur, true);
      if (fail[cur]) throw err(fail[cur]);
      const k = kinds.get(cur);
      if (k === undefined) throw err('ENOENT');
      if (k !== 'dir') throw err('ENOTDIR');
      return [...kinds].filter(([p]) => p !== cur && dirname(p) === cur).map(([p, v]) => dirent(p, v));
    },
    readlink(p) {
      note('readlink', p, false);
      const k = kinds.get(p);
      if (typeof k !== 'object') throw err('EINVAL');
      return k.link;
    },
    check: () => assert.deepEqual(bad, [], 'a call went through a link'),
  };
}

/** realOf with a spy for the real-path call. */
function spied(p, io, platform = process.platform) {
  const seen = [];
  const result = realOf(p, x => {
    seen.push(x);
    return x;
  }, platform, io);
  return { seen, result };
}

/** The path comes back as given, with no real-path call and no call through a link. */
function expectGiven(p, io, platform) {
  const { seen, result } = spied(p, io, platform);
  assert.equal(result, resolve(p));
  assert.deepEqual(seen, []);
  io.check();
}

// #464 T4: the how-to the rules file gave up comes with the name-back, once, last, and only when there are tags.
const HOW_TO_LINES = [
  "Show the blocks above as printed, in a fenced code block, in chat only; a record gets the RESULT line's counts, never the tags or the blocks.",
  "Run remove --yes with these tags only after the owner's own yes in chat to these blocks, outside a goal. Never remove a worktree or delete a local branch another way. What it leaves, leave, and say so.",
];
test('show prints how to use its tags once, just before the result line, only when it has tags; remove never prints it', t => {
  const f = makeRepo(t);
  assert.doesNotMatch(f.run(['show']).out, /Show the blocks/, 'nothing to remove, no how-to');
  f.add('a b', '-b', 'ab');
  const kept = f.run(['show']);
  assert.match(kept.out, /RESULT: shown 0/);
  assert.doesNotMatch(kept.out, /Show the blocks/, 'only kept worktrees, no tags, no how-to');
  f.add('one');
  f.add('two');
  const r = f.run(['show']);
  assert.equal(tagsOf(r.out).length, 2, r.out);
  assert.deepEqual(r.lines.slice(-3, -1), HOW_TO_LINES);
  assert.doesNotMatch(r.out, /clean_up|\/brigade done/, 'the how-to names no command that no longer exists');
  assert.equal(r.lines.filter(l => HOW_TO_LINES.includes(l)).length, 2, 'once, not per block');
  assert.doesNotMatch(f.run(['remove', '--yes', tagsOf(r.out).join(',')]).out, /Show the blocks/);
});

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
  // An ignored link, which git leaves along with the folder.
  writeFileSync(join(f.root, '.git', 'info', 'exclude'), 'out\n');
  const outside = tempDir(t, 'pact-cleaner-ignored-');
  writeFileSync(join(outside, 'kept.txt'), 'x');
  symlinkSync(outside, join(f.add('lnk'), 'out'), process.platform === 'win32' ? 'junction' : 'dir');

  const r = f.run(['show']);
  assert.equal(r.code, 0, r.out);
  const busy = block(r.out, 'busy');
  assert.match(busy, /changed files, git will refuse:\n {4}"a\.txt"$/m, r.out);
  assert.match(busy, /untracked files, git will refuse:\n(?: {4}.*\n)* {4}"new\.txt"$/m, r.out);
  assert.match(busy, /ignored, deleted with the folder, with everything inside:\n {4}"\.env"\n {4}"build\/"$/m, r.out);
  // Windows names hold no colon or quote; elsewhere the quote inside is escaped.
  assert.match(busy, process.platform === 'win32' ? /^ {4}"x {2}kept- in use 'tag'"$/m : /^ {4}"x {2}kept: in use \\"tag\\""$/m, 'a name that dresses its line prints in quotes');
  if (process.platform !== 'win32') assert.match(busy, /^ {4}"odd\\u\{a\}\\u\{202e\}name\.txt"$/m, r.out);
  // A run of backticks or a comment opener never starts a line, so it can't close the fenced block show's own last lines ask for.
  assert.match(busy, /^ {4}"```(?:<!--)?fence"$/m, r.out);
  assert.ok(r.lines.filter(l => !HOW_TO_LINES.includes(l)).every(l => /^(?:worktree |RESULT: | {2}[a-z]| {4}(?:"|stash@|and \d))/.test(l)), 'every line starts with fixed words or an indent');
  assert.equal(block(r.out, '"a b"'), '  kept: a folder name the cleaner does not read\n', r.out);
  // Only the stash made on its own branch: busy-stash's entry belongs to neither block.
  assert.match(block(r.out, 'stashed'), /^ {2}stash entries made on it, kept: the cleaner never touches stashes:\n {4}stash@\{0\}\n {2}tag /m, r.out);
  assert.doesNotMatch(busy, /stash/, r.out);
  assert.match(block(r.out, 'locked'), /^ {2}locked, git will refuse$/m, r.out);
  assert.match(block(r.out, 'gone'), /^ {2}folder gone, only git's record goes$/m, r.out);
  assert.match(block(r.out, 'gone'), /^ {2}tag [0-9a-f]{10}$/m, 'a record whose folder is gone stays a candidate (#454 C5)');
  // #454: a link anywhere keeps the worktree in every run, so the ignored-links line is no longer reached.
  assert.equal(block(r.out, 'lnk'), `  kept: ${LINK_KEEP}\n  links:\n    "out"\n`, r.out);
  assert.equal(esc(`a\r\n${cp(0x2066)}b\\${cp(0x2028)} c`), 'a\\u{d}\\u{a}\\u{2066}b\\\\\\u{2028} c');
  assert.doesNotMatch(r.out, /CONTENT|SUBJECT|fatal|error/i, r.out);
  assert.ok(r.lines.every(l => !/[\n\r]/.test(l)), 'one line per entry');
  noPath(f, r.out);
});

// #438 C3
test('a worktree holding a session status file\'s cwd, or the cleaner\'s own, is kept with no tag; a status file that does not read stops the run', async t => {
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
  assert.equal(realOf('/net/nohost.invalid/x', rp, 'darwin'), resolve('/net/nohost.invalid/x'), 'macOS autofs');
  // A local path that reaches a share through a link is not resolved either (a dangling link stands in for the share).
  const toShare = join(tempDir(t, 'pact-cleaner-share-'), 'share');
  const linkMade = plantLink('//nohost.invalid/share', toShare, 'dir');
  if (linkMade) assert.equal(realOf(join(toShare, 'x'), rp), join(toShare, 'x'));
  assert.deepEqual(seen, []);
  // A missing leaf: the walk stops at the deepest folder it listed, which alone is resolved, and the rest is joined back on.
  const gone = join(f.root, 'missing', 'leaf');
  const rpMissing = p => {
    seen.push(p);
    if (p.startsWith(join(f.root, 'missing'))) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return p;
  };
  assert.equal(realOf(gone, rpMissing), gone);
  assert.deepEqual(seen, [f.root]);
  if (process.platform === 'win32') assert.equal(realOf(`\\\\?\\${f.root}`), realpathSync.native(f.root), 'a device prefix before a drive letter is local');

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

  // #442: the walk never touches another host. Each claim is its own subtest, so a run on the base shows each failure apart.
  const SHARE = '//nohost.invalid/share';
  const fresh = st => tempDir(st, 'pact-cleaner-fake-');

  await t.test('C1: a link to a link to a share (absolute target) is given back, with no real-path call', st => {
    const root = fresh(st);
    expectGiven(join(root, 'a', 'x'), fakeIo(root, { [join(root, 'a')]: { link: join(root, 'b') }, [join(root, 'b')]: { link: SHARE } }));
  });

  await t.test('C2: the same with a relative target', st => {
    const root = fresh(st);
    expectGiven(join(root, 'a', 'x'), fakeIo(root, { [join(root, 'a')]: { link: 'b' }, [join(root, 'b')]: { link: SHARE } }));
  });

  if (process.platform === 'win32') {
    await t.test('C3: a link target in an NT form, or root- or drive-relative, is given back', st => {
      for (const target of ['\\??\\GLOBALROOT\\Device\\Mup\\nohost.invalid\\s', '\\Device\\Mup\\nohost.invalid\\s', '\\??\\UNC\\nohost.invalid\\s', '\\x', 'C:x']) {
        const root = fresh(st);
        expectGiven(join(root, 'lnk', 'x'), fakeIo(root, { [join(root, 'lnk')]: { link: target } }));
      }
    });
  }

  await t.test('C4: two links pointing at each other are given back with no hang; a chain is given back past 40 links, not at 40', st => {
    const root = fresh(st);
    expectGiven(join(root, 'a', 'x'), fakeIo(root, { [join(root, 'a')]: { link: 'b' }, [join(root, 'b')]: { link: 'a' } }));
    const chain = n => Object.fromEntries([[join(root, 'real'), 'dir'], ...Array.from({ length: n }, (_, i) => [join(root, `l${i}`), { link: i === n - 1 ? 'real' : `l${i + 1}` }])]);
    expectGiven(join(root, 'l0', 'x'), fakeIo(root, chain(41)));
    const { seen, result } = spied(join(root, 'l0', 'x'), fakeIo(root, chain(40)));
    assert.deepEqual(seen, [join(root, 'real')]);
    assert.equal(result, join(root, 'real', 'x'));
  });

  if (process.platform !== 'win32') {
    await t.test('C5: a link to the root, then net/host, is given back and nothing under /net is read', st => {
      const root = fresh(st);
      const io = fakeIo(root, { [join(root, 'lnk')]: { link: '/' } });
      expectGiven(join(root, 'lnk', 'net', 'nohost.invalid'), io);
      assert.ok(io.calls.every(c => !/^\/net(?:\/|$)/i.test(c.path)), 'a call under /net');
    });
  }

  await t.test('C6: a part the listing does not show is joined on unresolved, and nothing touches it', st => {
    const root = fresh(st);
    const io = fakeIo(root, { [join(root, 'real')]: 'dir' });
    const { seen, result } = spied(join(root, 'real', 'ghost', 'x'), io);
    assert.deepEqual(seen, [join(root, 'real')]);
    assert.equal(result, join(root, 'real', 'ghost', 'x'));
    assert.ok(io.calls.every(c => !c.path.includes('ghost')), 'a call named the unshown part');
    io.check();
  });

  await t.test('C6: a listing that fails other than ENOENT or ENOTDIR gives the path back', st => {
    const root = fresh(st);
    expectGiven(join(root, 'real', 'x'), fakeIo(root, { [join(root, 'real')]: 'dir' }, { fail: { [join(root, 'real')]: 'EACCES' } }));
  });

  await t.test('C6: an entry that is neither a folder nor a link is not gone into', st => {
    const root = fresh(st);
    const io = fakeIo(root, { [join(root, 'dev')]: 'other' });
    const { seen, result } = spied(join(root, 'dev', 'x'), io);
    assert.deepEqual(seen, [root]);
    assert.equal(result, join(root, 'dev', 'x'));
    assert.ok(io.calls.every(c => c.path !== join(root, 'dev')), 'the entry was listed');
  });

  await t.test('C6: more than 4096 steps give the path back', st => {
    const root = fresh(st);
    const p = `${join(root, 'x')}${`${sep}..${sep}x`.repeat(2100)}`;
    expectGiven(p, fakeIo(root, { [join(root, 'x')]: 'dir' }));
  });

  if (process.platform === 'win32') {
    await t.test('C6: a short name or a trailing dot beside a link is not shown, so not touched', st => {
      for (const part of ['LNK~1', 'lnk.']) {
        const root = fresh(st);
        const io = fakeIo(root, { [join(root, 'lnk')]: { link: SHARE } });
        const { seen, result } = spied(join(root, part, 'x'), io);
        assert.deepEqual(seen, [root], part);
        assert.equal(result, join(root, part, 'x'));
        assert.ok(io.calls.every(c => !c.path.includes(part) && c.op === 'readdir'), part);
      }
    });

    await t.test('C6: two entries that fold to the part, or one that is a link, give the path back', st => {
      for (const [spec, part] of [
        [{ Lnk: { link: SHARE }, lnk: 'dir' }, 'LNK'],
        [{ kx: 'dir', [`${cp(0x212a)}x`]: { link: SHARE } }, 'Kx'],
        [{ Lnk: { link: 'real' }, real: 'dir' }, 'lnk'], // a single case match that is a link, to a plain local folder
      ]) {
        const root = fresh(st);
        const io = fakeIo(root, Object.fromEntries(Object.entries(spec).map(([k, v]) => [join(root, k), v])));
        expectGiven(join(root, part, 'x'), io);
        // Only listings of the folders on the way down to root: nothing under it, so nothing of either entry.
        assert.ok(io.calls.every(c => c.op === 'readdir' && (c.path === root || root.startsWith(c.path.endsWith(sep) ? c.path : c.path + sep))), part);
      }
    });
  }

  await t.test('C7: a chain of plain local links ends in one real-path call, on the physical folder', st => {
    const root = fresh(st);
    const spec = { [join(root, 'real')]: 'dir', [join(root, 'a')]: { link: 'b' }, [join(root, 'b')]: { link: join(root, 'real') } };
    const io = fakeIo(root, spec);
    const { seen, result } = spied(join(root, 'a', 'x'), io);
    assert.deepEqual(seen, [join(root, 'real')]);
    assert.equal(result, join(root, 'real', 'x'));
    assert.deepEqual(io.calls.filter(c => c.op === 'readlink').map(c => c.path), [join(root, 'a'), join(root, 'b')]);
    io.check();
    if (process.platform === 'win32') {
      const via = fakeIo(root, { ...spec, [join(root, 'c')]: { link: `\\\\?\\${join(root, 'real')}` } });
      const again = spied(join(root, 'c', 'x'), via);
      assert.deepEqual(again.seen, [join(root, 'real')]);
      assert.equal(again.result, join(root, 'real', 'x'));
    }
  });

  await t.test('C8: real links, absolute and relative, to a link to a share: given back, no real-path call (the ask\'s Done-when)', st => {
    const root = fresh(st);
    if (!plantLink(SHARE, join(root, 'b'), 'dir')) return st.skip('no link rights on this host');
    assert.ok(plantLink(join(root, 'b'), join(root, 'a'), 'dir') && plantLink('b', join(root, 'r'), 'dir'));
    const seen = [];
    const rp = p => {
      seen.push(p);
      return p;
    };
    for (const via of ['a', 'r']) assert.equal(realOf(join(root, via, 'x'), rp), join(root, via, 'x'), via);
    assert.deepEqual(seen, []);
    if (process.platform === 'win32') {
      mkdirSync(join(root, 'real'));
      symlinkSync(join(root, 'real'), join(root, 'j'), 'junction');
      const j = readdirSync(root, { withFileTypes: true }).find(e => e.name === 'j');
      assert.ok(j.isSymbolicLink(), 'the listing marks a junction as a link');
    }
  });

  await t.test('C9: /net on Linux, /net in any case and /Network/Servers on macOS: given back, no real-path call', () => {
    const seen = [];
    const rp = p => {
      seen.push(p);
      return p;
    };
    for (const [p, platform] of [['/net/nohost.invalid/x', 'linux'], ['/NeT/nohost.invalid/x', 'darwin'], ['/network/SERVERS/nohost.invalid/x', 'darwin']]) {
      assert.equal(realOf(p, rp, platform), resolve(p), `${platform} ${p}`);
    }
    assert.deepEqual(seen, []);
  });

  await t.test('C10: plainTarget says which link targets may be followed', () => {
    const plain = (t, platform) => cleaner.plainTarget(t, platform);
    for (const t of ['C:\\x', 'C:/x', '\\\\?\\C:\\x', 'rel\\x']) assert.equal(plain(t, 'win32'), true, t);
    for (const t of ['\\\\nohost.invalid\\s', '\\\\?\\UNC\\nohost.invalid\\s', '\\??\\UNC\\nohost.invalid\\s', '\\??\\GLOBALROOT\\Device\\Mup\\nohost.invalid\\s', '\\Device\\Mup\\nohost.invalid\\s', '\\x', 'C:x']) {
      assert.equal(plain(t, 'win32'), false, t);
    }
    assert.equal(plain('//nohost.invalid/s', 'linux'), false);
    for (const t of ['/x', 'rel/x']) assert.equal(plain(t, 'linux'), true, t);
  });

  await t.test('C11a: a sessions folder that is a link makes the run unavailable, and no path prints', st => {
    const f = makeRepo(st);
    mkdirSync(join(f.home, '.claude'), { recursive: true });
    if (!plantLink(SHARE, join(f.home, '.claude', 'sessions'), 'dir')) return st.skip('no link rights on this host');
    const r = f.run(['show']);
    assert.equal(r.code, 4, r.out);
    assert.equal(r.lines.at(-1), 'RESULT: unavailable');
    assert.equal(r.lines.at(-2), 'the cleaner is unavailable: the sessions check failed');
    assert.doesNotMatch(r.out, /nohost\.invalid/);
    noPath(f, r.out);
  });

  await t.test('C11b: a status file that is a link makes the run unavailable, and no path prints', st => {
    const f = makeRepo(st);
    const used = f.add('used');
    const sessions = join(f.home, '.claude', 'sessions');
    mkdirSync(sessions, { recursive: true });
    const real = join(tempDir(st, 'pact-cleaner-status-'), 'real.json');
    writeFileSync(real, JSON.stringify({ cwd: join(used, 'sub') }));
    if (!plantLink(real, join(sessions, '4242.json'), 'file')) return st.skip('no link rights on this host');
    const r = f.run(['show']);
    assert.equal(r.code, 4, r.out);
    assert.equal(r.lines.at(-1), 'RESULT: unavailable');
    assert.equal(r.lines.at(-2), 'the cleaner is unavailable: the sessions check failed');
    noPath(f, r.out);
  });

  // #442 C15: only on CI's gate-windows, never on the owner's host: an lstat on a junction whose target is a network path in NT form.
  if (process.platform === 'win32' && process.env.CI) {
    await t.test('C15: lstat on a junction set to \\??\\UNC\\nohost.invalid throws (any code, printed; gate-windows saw ENOENT), consistent with following the target', st => {
      const dir = tempDir(st, 'pact-cleaner-junction-');
      const junction = join(dir, 'j');
      mkdirSync(junction);
      // Node's 'junction' rewrites its target to a local path, so the reparse point is set by a DeviceIoControl call.
      const script = join(dir, 'set.ps1');
      writeFileSync(script, [
        'param($Dir, $Target)',
        'Add-Type -TypeDefinition @"',
        'using System; using System.IO; using System.Runtime.InteropServices; using System.Text; using Microsoft.Win32.SafeHandles;',
        'public static class Rp {',
        '  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]',
        '  static extern SafeFileHandle CreateFile(string n, uint access, uint share, IntPtr sa, uint disp, uint flags, IntPtr t);',
        '  [DllImport("kernel32.dll", SetLastError=true)]',
        '  static extern bool DeviceIoControl(SafeFileHandle h, uint code, byte[] inb, int inLen, IntPtr outb, int outLen, out int ret, IntPtr ov);',
        '  public static void Set(string dir, string target) {',
        '    using (var h = CreateFile(dir, 0x40000000, 7, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero)) {',
        '      if (h.IsInvalid) throw new IOException("open " + Marshal.GetLastWin32Error());',
        '      byte[] sub = Encoding.Unicode.GetBytes(target);',
        '      int pathLen = sub.Length + 4;',
        '      var buf = new byte[16 + pathLen];',
        '      BitConverter.GetBytes(0xA0000003u).CopyTo(buf, 0);',
        '      BitConverter.GetBytes((ushort)(8 + pathLen)).CopyTo(buf, 4);',
        '      BitConverter.GetBytes((ushort)sub.Length).CopyTo(buf, 10);',
        '      BitConverter.GetBytes((ushort)(sub.Length + 2)).CopyTo(buf, 12);',
        '      sub.CopyTo(buf, 16);',
        '      int ret;',
        '      if (!DeviceIoControl(h, 0x000900A4, buf, buf.Length, IntPtr.Zero, 0, out ret, IntPtr.Zero)) throw new IOException("set " + Marshal.GetLastWin32Error());',
        '    }',
        '  }',
        '}',
        '"@',
        '[Rp]::Set($Dir, $Target)',
        '',
      ].join('\n'));
      const r = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', script, junction, '\\??\\UNC\\nohost.invalid\\s'], { encoding: 'utf8' });
      assert.equal(r.status, 0, `the junction was not set: ${r.stdout}${r.stderr}`);
      // gate-windows saw ENOENT, which libuv also gives a failed network lookup: lstat followed the target, so the walk never calls it.
      let thrown;
      assert.throws(() => lstatSync(junction), e => {
        thrown = e;
        return true;
      });
      st.diagnostic(`C15: lstat failed with ${thrown.code} (errno ${thrown.errno})`);
    });
  }

  // #442 C16: the walk calls no lstat, stat, realpath, exists or access. The fake io has only readdir and readlink, so this pins the source.
  await t.test('C16: the walk\'s code names no lstat, stat, realpath, exists or access call', () => {
    const src = readFileSync(new URL('../../claude/tools/cleaner.mjs', import.meta.url), 'utf8');
    const start = src.indexOf('\nfunction walk(');
    const body = src.slice(start, src.indexOf('\n}\n', start));
    assert.ok(start > 0 && body.length > 400, 'the walk was not found');
    assert.doesNotMatch(body, /\b(?:lstat|stat|realpath|exists|access)(?:Sync)?\b|\.native\b/);
  });
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
  const tags = tagsOf(f.run(['show']).out);
  // #454: a link already there at read time keeps the worktree, so this one appears between the read and git's call.
  const target = tempDir(t, 'pact-cleaner-target-');
  const rec = recording((file, args) => {
    if (!(args.includes('worktree') && args.includes('remove'))) return null;
    symlinkSync(target, join(w, 'link'), linkKind);
    return { status: 0, stdout: '', stderr: '' };
  });
  const r = f.run(['remove', '--yes', tags.join(',')], { spawn: rec.spawn });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^worktree stuck: left\n {2}the folder stays: remove it by hand\n {2}it holds a link: remove the link itself first, never with a recursive delete\n {2}the branch stays: stuck$/m, r.out);
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

  // Planted between the worktree's removal and the branch's: the branch is not tried.
  const late = recording((file, args, opts) => {
    if (!args.includes('remove')) return null;
    const r = spawnSync(file, args, opts);
    writeFileSync(join(args.find(a => a.startsWith('core.hooksPath=')).slice('core.hooksPath='.length), 'post-checkout'), 'x');
    return r;
  });
  const lr = g.run(['remove', '--yes', tagsOf(g.run(['show']).out).join(',')], { spawn: late.spawn });
  assert.match(lr.out, /^worktree h: left, the folder is gone\n {2}the branch stays: h$/m, lr.out);
  assert.ok(!late.calls.some(c => c.args.includes('branch')), 'the branch is not tried');
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

// ------------------------------------------------------------ --recoverable (#446, grimoire 484 S2.8)

// --recoverable needs git 2.45. Where the real git is older, as in the Linux
// image's, a stand-in answers `git version` alone, so every other call still
// runs on real git; C3 below pins the floor itself with a stubbed version.
const realGit = /^git version (\d+)\.(\d+)/.exec(spawnSync('git', ['version'], { encoding: 'utf8' }).stdout ?? '');
const realGitOld = !realGit || Number(realGit[1]) * 1000 + Number(realGit[2]) < 2045;
/** A recording process call that passes every call through, but answers `git version` as 2.45.0 where the real git is older. */
const recorded = () => recording((file, args) => (realGitOld && args.at(-1) === 'version' ? { status: 0, stdout: 'git version 2.45.0\n', stderr: '' } : null));
/** The folder a recorded git call reads, from its `-C`. */
const dirOf = call => call.args[call.args.indexOf('-C') + 1];
const carries = args => args.some((a, i) => a === '-c' && args[i + 1] === 'status.showUntrackedFiles=normal');
/** Rewrites a file in place: on Windows git hides a worktree's `.git` file, and a hidden file can't be opened to replace it. */
function overwrite(p, text) {
  const fd = openSync(p, 'r+');
  try {
    ftruncateSync(fd, 0);
    writeSync(fd, text, 0);
  } finally {
    closeSync(fd);
  }
}

// #446 C1
test('--recoverable keeps, with no tag, a worktree holding ignored files or links, or hidden edits, and lists them; without it the ignored files and hidden edits are candidates as before, and a link keeps its worktree', t => {
  const f = makeRepo(t);
  writeFileSync(join(f.add('envwt'), '.env'), 'IGNORED CONTENT\n');
  writeFileSync(join(f.root, '.git', 'info', 'exclude'), 'out\n');
  // The link's target holds a file: git lists no empty folder, and on Windows a junction reads as a folder.
  const linkTarget = tempDir(t, 'pact-cleaner-ignored-');
  writeFileSync(join(linkTarget, 'kept.txt'), 'x');
  symlinkSync(linkTarget, join(f.add('lnkwt'), 'out'), process.platform === 'win32' ? 'junction' : 'dir');
  const hidden = f.add('hidden');
  f.git(hidden, 'update-index', '--assume-unchanged', 'a.txt');
  writeFileSync(join(hidden, 'a.txt'), 'EDITED CONTENT\n');
  f.add('plain');

  const r = f.run(['show', '--recoverable'], { spawn: recorded().spawn });
  assert.equal(r.code, 0, r.out);
  assert.equal(block(r.out, 'envwt'), '  kept: holds ignored files, which are not in git\n  ignored files:\n    ".env"\n', r.out);
  // The link is walked first (#454): the ignored link is a link, and the names git lists under a junction are its target's.
  assert.equal(block(r.out, 'lnkwt'), `  kept: ${LINK_KEEP}\n  links:\n    "out"\n`, r.out);
  assert.equal(block(r.out, 'hidden'), '  kept: hides edits from git\n  files git does not check for edits:\n    "a.txt"\n', r.out);
  assert.match(block(r.out, 'plain'), /^ {2}tag [0-9a-f]{10}$/m, r.out);
  assert.equal(tagsOf(r.out).length, 1, 'only plain is a candidate');
  assert.doesNotMatch(r.out, /CONTENT/, r.out);
  noPath(f, r.out);

  const before = f.run(['show']);
  assert.equal(tagsOf(before.out).length, 3, 'without the flag, all but the link are candidates (#454)');
  assert.match(block(before.out, 'envwt'), /^ {2}tag /m, before.out);
  assert.equal(block(before.out, 'lnkwt'), `  kept: ${LINK_KEEP}\n  links:\n    "out"\n`, before.out);
  assert.doesNotMatch(block(before.out, 'hidden'), /changed files/, 'git hides the edit from the name-back without the flag');
});

// #446 C2
test('--recoverable keeps a worktree where a filter program could run: a worktree-scope, included or local filter key, or a populated submodule, with no status call and no call inside the submodule', t => {
  const kept = '  kept: a filter program could run\n';
  const cases = [];
  // A worktree-scope key, on one worktree of two.
  const wc = makeRepo(t);
  wc.git(wc.root, 'config', 'extensions.worktreeConfig', 'true');
  wc.git(wc.add('wcfg'), 'config', '--worktree', 'filter.x.clean', 'cat');
  wc.add('other');
  cases.push([wc, 'wcfg', kept]);
  // A key in a file the local config includes.
  const inc = makeRepo(t);
  const incFile = join(tempDir(t, 'pact-cleaner-inc-'), 'inc.cfg');
  writeFileSync(incFile, '[filter "x"]\n\tclean = cat\n');
  inc.git(inc.root, 'config', 'include.path', incFile);
  inc.add('inc');
  cases.push([inc, 'inc', kept]);
  // A local override of the LFS filter's process.
  const lfs = makeRepo(t);
  lfs.git(lfs.root, 'config', 'filter.lfs.process', 'x');
  lfs.add('lfs');
  cases.push([lfs, 'lfs', kept]);
  // A populated submodule, beside a worktree whose submodule is not populated.
  const sm = makeRepo(t);
  const sub = makeRepo(t);
  sm.git(sm.root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sub.root, 'sub');
  sm.git(sm.root, 'commit', '-q', '-m', 'sub');
  sm.git(sm.add('withsub'), '-c', 'protocol.file.allow=always', 'submodule', 'update', '-q', '--init');
  sm.add('nosub');
  cases.push([sm, 'withsub', `${kept}  populated submodules:\n    "sub"\n`]);

  for (const [f, name, want] of cases) {
    const rec = recorded();
    const r = f.run(['show', '--recoverable'], { spawn: rec.spawn });
    assert.equal(r.code, 0, `${name}: ${r.out}`);
    assert.equal(block(r.out, name), want, `${name}: ${r.out}`);
    const path = f.wt(name);
    assert.ok(!rec.calls.some(c => c.args.includes('status') && dirOf(c) === path), `${name}: no status call`);
    assert.ok(!rec.calls.some(c => dirOf(c).startsWith(join(path, 'sub'))), `${name}: no git call inside the submodule`);
    noPath(f, r.out);
  }
  assert.match(block(wc.run(['show', '--recoverable'], { spawn: recorded().spawn }).out, 'other'), /^ {2}tag /m, 'a worktree-scope key keeps only its own worktree');
  assert.match(block(sm.run(['show', '--recoverable'], { spawn: recorded().spawn }).out, 'nosub'), /^ {2}tag /m, 'a submodule that is not populated keeps nothing');
});

// #446 C3
test('--recoverable: a system-scope LFS filter keeps nothing; a local showUntrackedFiles=no hides nothing; a tag from a run without the flag does not pass; every git call carries the pins; git 2.44 is unavailable', t => {
  // Only a system-scope LFS filter: a candidate.
  const sys = makeRepo(t);
  const sysFile = join(tempDir(t, 'pact-cleaner-sys-'), 'gitconfig');
  writeFileSync(sysFile, '[filter "lfs"]\n\tprocess = x\n');
  const sysEnv = { ...sys.env, GIT_CONFIG_SYSTEM: sysFile };
  delete sysEnv.GIT_CONFIG_NOSYSTEM;
  sys.add('sysonly');
  const s = sys.run(['show', '--recoverable'], { env: sysEnv, spawn: recorded().spawn });
  assert.match(block(s.out, 'sysonly'), /^ {2}tag [0-9a-f]{10}$/m, s.out);

  // status.showUntrackedFiles=no in the local config, an untracked file and an ignored .env: kept.
  const q = makeRepo(t);
  q.git(q.root, 'config', 'status.showUntrackedFiles', 'no');
  const quiet = q.add('quiet');
  writeFileSync(join(quiet, 'new.txt'), 'x');
  writeFileSync(join(quiet, '.env'), 'x');
  const qr = q.run(['show', '--recoverable'], { spawn: recorded().spawn });
  assert.equal(block(qr.out, 'quiet'), '  kept: holds changed or untracked files\n  untracked files:\n    "new.txt"\n  ignored files:\n    ".env"\n', qr.out);

  // A tag from a run without the flag does not pass remove --recoverable; the flag's own tag does.
  const f = makeRepo(t);
  const plain = f.add('plain');
  const old = tagsOf(f.run(['show']).out);
  const rm = f.run(['remove', '--recoverable', '--yes', old.join(',')], { spawn: recorded().spawn });
  assert.equal(rm.code, 1, rm.out);
  assert.equal(rm.lines.at(-1), 'RESULT: removed 0 left 0 changed 1', rm.out);
  assert.ok(existsSync(plain));
  const rec = recorded();
  const fresh = tagsOf(f.run(['show', '--recoverable'], { spawn: rec.spawn }).out);
  assert.notDeepEqual(fresh, old);
  const ok = f.run(['remove', '--recoverable', '--yes', fresh.join(',')], { spawn: rec.spawn });
  assert.equal(ok.lines.at(-1), 'RESULT: removed 1 left 0 changed 0', ok.out);
  assert.ok(!existsSync(plain));
  // Every git call of both runs carries the two pins; a run without the flag carries neither.
  assert.ok(rec.calls.length > 0);
  for (const { args, opts } of rec.calls) {
    assert.ok(carries(args), args.join(' '));
    assert.equal(opts.env.GIT_NO_LAZY_FETCH, '1');
  }
  const bare = recording();
  f.add('again');
  f.run(['show'], { spawn: bare.spawn });
  assert.ok(bare.calls.length > 0 && bare.calls.every(c => !carries(c.args) && c.opts.env.GIT_NO_LAZY_FETCH === undefined));

  // The git floor: 2.44 is unavailable with the flag and runs without it; 2.45 runs.
  const v = ver => recording((file, args) => (args.at(-1) === 'version' ? { status: 0, stdout: `git version ${ver}\n`, stderr: '' } : null)).spawn;
  const low = f.run(['show', '--recoverable'], { spawn: v('2.44.9') });
  assert.equal(low.code, 4, low.out);
  assert.equal(low.lines.at(-2), 'the cleaner is unavailable: git is missing or older than 2.45');
  assert.equal(low.lines.at(-1), 'RESULT: unavailable');
  assert.equal(f.run(['show'], { spawn: v('2.44.9') }).code, 0);
  assert.equal(f.run(['show', '--recoverable'], { spawn: v('2.45.0') }).code, 0);
  // The flag is a switch, given once.
  const twice = f.run(['show', '--recoverable', '--recoverable']);
  assert.equal(twice.code, 2, twice.out);
  assert.match(twice.out, /^REFUSED usage\/repeated argument 3$/m, twice.out);
});

// #446 C4 (Test round 1, adversarial-lens F1 to F5 and F9)
test('--recoverable also keeps on a local lfs. or hook. key, the main worktree\'s too, a changed or untracked file, a submodule path through a link, a submodule folder holding files, or a read that fails', t => {
  const kept = reason => new RegExp(`^ {2}kept: ${reason}$`, 'm');
  // A local LFS extension beside a system-scope LFS filter (F1), and a config-set hook (F2): no status runs.
  // git 2.54 and later refuse every command while a hook's event has no command, so the hook case sets both.
  for (const [key, value, ...more] of [['lfs.extension.x.clean', 'x'], ['hook.x.event', 'reference-transaction', 'hook.x.command', 'true']]) {
    const f = makeRepo(t);
    f.git(f.root, 'config', key, value);
    if (more.length) f.git(f.root, 'config', ...more);
    const path = f.add('w');
    const rec = recorded();
    const r = f.run(['show', '--recoverable'], { spawn: rec.spawn });
    assert.match(block(r.out, 'w'), kept('a filter program could run'), `${key}: ${r.out}`);
    assert.ok(!rec.calls.some(c => c.args.includes('status') && dirOf(c) === path), `${key}: no status call`);
  }
  // A worktree-scope hook key on the main worktree, where branch -d runs, keeps every worktree (F2).
  const m = makeRepo(t);
  m.git(m.root, 'config', 'extensions.worktreeConfig', 'true');
  m.git(m.root, 'config', '--worktree', 'hook.x.command', 'x');
  m.add('a');
  m.add('b');
  const mr = m.run(['show', '--recoverable'], { spawn: recorded().spawn });
  assert.equal(tagsOf(mr.out).length, 0, mr.out);
  assert.match(block(mr.out, 'a'), kept('a filter program could run'), mr.out);

  // A changed or untracked file keeps the worktree, whatever git's untracked cache says (F4).
  const c = makeRepo(t);
  writeFileSync(join(c.add('edited'), 'a.txt'), 'changed\n');
  writeFileSync(join(c.add('untracked'), 'new.txt'), 'x');
  const cr = c.run(['show', '--recoverable'], { spawn: recorded().spawn });
  assert.equal(block(cr.out, 'edited'), '  kept: holds changed or untracked files\n  changed files:\n    "a.txt"\n', cr.out);
  assert.equal(block(cr.out, 'untracked'), '  kept: holds changed or untracked files\n  untracked files:\n    "new.txt"\n', cr.out);

  // Submodule paths: through a link (F3), a folder holding files with no .git (F5), a file where the folder goes (F9).
  const s = makeRepo(t);
  const sub = makeRepo(t);
  s.git(s.root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sub.root, 'mods/sub');
  s.git(s.root, 'commit', '-q', '-m', 'sub');
  const linked = s.add('linked');
  rmSync(join(linked, 'mods'), { recursive: true, force: true });
  symlinkSync(tempDir(t, 'pact-cleaner-share-'), join(linked, 'mods'), process.platform === 'win32' ? 'junction' : 'dir');
  writeFileSync(join(s.add('unseen'), 'mods', 'sub', 'notes.txt'), 'x');
  const odd = s.add('odd');
  rmSync(join(odd, 'mods', 'sub'), { recursive: true, force: true });
  writeFileSync(join(odd, 'mods', 'sub'), 'x');
  s.add('clean');
  const sr = s.run(['show', '--recoverable'], { spawn: recorded().spawn });
  assert.equal(block(sr.out, 'linked'), '  kept: a submodule path goes through a link\n  submodule paths:\n    "mods/sub"\n', sr.out);
  assert.equal(block(sr.out, 'unseen'), '  kept: a submodule folder holds files git does not see\n  submodule folders:\n    "mods/sub"\n', sr.out);
  assert.match(block(sr.out, 'odd'), kept('a read failed, so it is kept'), sr.out);
  assert.match(block(sr.out, 'clean'), /^ {2}tag [0-9a-f]{10}$/m, 'an empty submodule folder keeps nothing, and one bad worktree leaves the run going');
  noPath(s, sr.out);

  // Test round 2, adversarial-lens: a main-config hook keeps a gone record too (F1); a worktree-scope
  // core.worktree keeps it (F2); a branch naming a missing object keeps that worktree alone (F6);
  // a .git file naming another gitdir keeps it with no git call inside (F7); every call pins stat trust (F3).
  const g = makeRepo(t);
  g.git(g.root, 'config', 'extensions.worktreeConfig', 'true');
  g.git(g.root, 'config', '--worktree', 'hook.x.command', 'x');
  rmSync(g.add('gonewt'), { recursive: true, force: true });
  const gr = g.run(['show', '--recoverable'], { spawn: recorded().spawn });
  assert.match(block(gr.out, 'gonewt'), kept('a filter program could run'), gr.out);
  const d = makeRepo(t);
  d.git(d.root, 'config', 'extensions.worktreeConfig', 'true');
  const real = d.add('decoyed');
  writeFileSync(join(real, '.env'), 'x');
  d.git(real, 'config', '--worktree', 'core.worktree', tempDir(t, 'pact-cleaner-decoy-'));
  const dr = d.run(['show', '--recoverable'], { spawn: recorded().spawn });
  assert.match(block(dr.out, 'decoyed'), kept('its config points git at another folder'), dr.out);
  const mo = makeRepo(t);
  mo.add('missing');
  mo.add('fine');
  writeFileSync(join(mo.root, '.git', 'refs', 'heads', 'missing'), `${'1'.repeat(40)}\n`);
  const mr2 = mo.run(['show', '--recoverable'], { spawn: recorded().spawn });
  assert.equal(mr2.code, 0, mr2.out);
  assert.match(block(mr2.out, 'missing'), kept('a read failed, so it is kept'), mr2.out);
  assert.match(block(mr2.out, 'fine'), /^ {2}(?:tag [0-9a-f]{10}|kept: a read failed, so it is kept)$/m, 'the run goes on past the bad branch');
  const pt = makeRepo(t);
  const pw = pt.add('pointed');
  const other = pt.add('other');
  overwrite(join(pw, '.git'), readFileSync(join(other, '.git'), 'utf8'));
  const prec = recorded();
  const pr = pt.run(['show', '--recoverable'], { spawn: prec.spawn });
  assert.match(block(pr.out, 'pointed'), kept('its .git file names another git folder'), pr.out);
  assert.ok(!prec.calls.some(c => dirOf(c) === pw), 'no git call inside it');
  for (const c of prec.calls) for (const pin of ['core.checkStat=default', 'core.trustctime=true']) assert.ok(c.args.includes(pin), pin);
  // The admin folder's commondir must name the main repository's git folder too (extra read, adversarial-lens F1).
  const cd = makeRepo(t);
  const cdw = cd.add('common');
  const admin = join(cd.root, '.git', 'worktrees', 'common');
  writeFileSync(join(admin, 'commondir'), `${makeRepo(t).root.replace(/\\/g, '/')}/.git\n`);
  const crec = recorded();
  const cmr = cd.run(['show', '--recoverable'], { spawn: crec.spawn });
  assert.match(block(cmr.out, 'common'), kept('its .git file names another git folder'), cmr.out);
  assert.ok(!crec.calls.some(c => dirOf(c) === cdw), 'no git call inside it');

  // A gitlink path that could climb out of the worktree is never joined (Test round 2, data-lens F3).
  const climb = makeRepo(t);
  const cw = climb.add('climb');
  for (const bad of ['../escape', 'a/../../x', '/abs', 'C:/x', 'a\\b', 'a//b']) {
    const rec = recorded();
    const answer = recording((file, args, opts) => (args.includes('ls-files') && args.includes('--stage') ? { status: 0, stdout: `160000 ${'0'.repeat(40)} 0\t${bad}\0`, stderr: '' } : rec.spawn(file, args, opts)));
    const r = climb.run(['show', '--recoverable', '--worktree', 'climb'], { spawn: answer.spawn });
    assert.match(block(r.out, 'climb'), kept('a read failed, so it is kept'), `${bad}: ${r.out}`);
  }
  assert.ok(existsSync(cw));
});

// #446 C5 (Test, integrity-lens F1 to F4): the branches no earlier case reached.
test('--recoverable keeps on a failed config read (the main worktree\'s keeps all), an admin folder outside .git/worktrees, and one worktree\'s failed read alone; without the flag a failed read makes the run unavailable', t => {
  const kept = reason => new RegExp(`^ {2}kept: ${reason}$`, 'm');
  // A config read that fails for one worktree keeps it as a program that could run (F1).
  const f = makeRepo(t);
  const one = f.add('one');
  f.add('two');
  const failConfigIn = dir => recording((file, args, opts) => {
    if (args.includes('config') && dirOf({ args }) === dir) return { status: 128, stdout: '', stderr: 'fatal' };
    return realGitOld && args.at(-1) === 'version' ? { status: 0, stdout: 'git version 2.45.0\n', stderr: '' } : spawnSync(file, args, opts);
  });
  const r1 = f.run(['show', '--recoverable'], { spawn: failConfigIn(one).spawn });
  assert.match(block(r1.out, 'one'), kept('a filter program could run'), r1.out);
  assert.match(block(r1.out, 'two'), /^ {2}tag [0-9a-f]{10}$/m, r1.out);
  // The same for the main worktree keeps every worktree.
  const r2 = f.run(['show', '--recoverable'], { spawn: failConfigIn(f.root).spawn });
  assert.equal(tagsOf(r2.out).length, 0, r2.out);
  assert.match(block(r2.out, 'two'), kept('a filter program could run'), r2.out);

  // A .git file naming an admin folder outside <main>/.git/worktrees, whose gitdir and commondir both look right (F2).
  const g = makeRepo(t);
  const moved = g.add('moved');
  const realAdmin = join(g.root, '.git', 'worktrees', 'moved');
  const outside = join(tempDir(t, 'pact-cleaner-admin-'), 'moved');
  mkdirSync(outside);
  for (const n of ['HEAD', 'gitdir', 'commondir', 'index']) if (existsSync(join(realAdmin, n))) writeFileSync(join(outside, n), readFileSync(join(realAdmin, n)));
  writeFileSync(join(outside, 'commondir'), `${join(g.root, '.git').replace(/\\/g, '/')}\n`);
  overwrite(join(moved, '.git'), `gitdir: ${outside.replace(/\\/g, '/')}\n`);
  const gr = g.run(['show', '--recoverable'], { spawn: recorded().spawn });
  assert.match(block(gr.out, 'moved'), kept('its .git file names another git folder'), gr.out);

  // One worktree's failed read in the main loop keeps it alone, and the other's tag stands (F3).
  const h = makeRepo(t);
  h.add('bad');
  h.add('good');
  const failRevList = recording((file, args, opts) => {
    if (args.includes('rev-list') && args.at(-1) === 'refs/heads/bad') return { status: 128, stdout: '', stderr: 'fatal' };
    return realGitOld && args.at(-1) === 'version' ? { status: 0, stdout: 'git version 2.45.0\n', stderr: '' } : spawnSync(file, args, opts);
  });
  const hr = h.run(['show', '--recoverable'], { spawn: failRevList.spawn });
  assert.equal(hr.code, 0, hr.out);
  assert.match(block(hr.out, 'bad'), kept('a read failed, so it is kept'), hr.out);
  assert.match(block(hr.out, 'good'), /^ {2}branch good at [0-9a-f]{7}\n {2}tag [0-9a-f]{10}\n$/, hr.out);

  // Without the flag, the same failure, or a failed status, makes the whole run unavailable, as at the base (F4).
  const plain = h.run(['show'], { spawn: failRevList.spawn });
  assert.equal(plain.code, 4, plain.out);
  assert.equal(plain.lines.at(-1), 'RESULT: unavailable');
  const failStatus = recording((file, args, opts) => (args.includes('status') ? { status: 128, stdout: '', stderr: 'fatal' } : spawnSync(file, args, opts)));
  const ps = h.run(['show'], { spawn: failStatus.spawn });
  assert.equal(ps.code, 4, ps.out);
  assert.equal(ps.lines.at(-1), 'RESULT: unavailable');
});

// #492 C1 to C3: a stopped background session's lock is unlocked for the removal and put back on a refusal; any other lock stands.
const sessionLock = (f, name, reason = `claude session ${name} (pid 4321)`) => f.git(f.root, 'worktree', 'lock', '--reason', reason, f.wt(name));
const lockOf = (f, name) => {
  const rec = f.git(f.root, 'worktree', 'list', '--porcelain').split(/\r?\n\r?\n/).find(r => r.split(/\r?\n/)[0].endsWith(`/${name}`));
  return /^locked ?(.*)$/m.exec(rec ?? '')?.[1] ?? null;
};
test('a worktree locked by a stopped session shows that and is removed with its branch', t => {
  const f = makeRepo(t);
  f.add('stopped');
  sessionLock(f, 'stopped');
  const r = f.run(['show']);
  assert.match(block(r.out, 'stopped'), /^ {2}locked by a stopped session; remove unlocks it$/m, r.out);
  assert.doesNotMatch(r.out, /locked, git will refuse|pid|4321/, r.out);
  const rm = f.run(['remove', '--yes', tagsOf(r.out).join(',')]);
  assert.equal(rm.code, 0, rm.out);
  assert.match(rm.out, /^worktree stopped: removed$/m, rm.out);
  assert.equal(worktrees(f), 1);
  assert.deepEqual(branches(f), ['main']);
});

test('a lock with any other reason is left, still locked', t => {
  const f = makeRepo(t);
  // Each reason is one step off the exact form: another folder's name, a pid that is no number, free text, a missing bracket, an empty pid, a pid with a letter in it.
  const reasons = {
    named: 'claude session someone-else (pid 4321)',
    digits: 'claude session digits (pid four)',
    words: 'kept for a reason',
    bracket: 'claude session bracket (pid 4321',
    nopid: 'claude session nopid (pid )',
    mixed: 'claude session mixed (pid 4x)',
  };
  for (const [name, reason] of Object.entries(reasons)) {
    f.add(name);
    sessionLock(f, name, reason);
  }
  const r = f.run(['show']);
  for (const name of Object.keys(reasons)) assert.match(block(r.out, name), /^ {2}locked, git will refuse$/m, `${name}: ${r.out}`);
  const rm = f.run(['remove', '--yes', tagsOf(r.out).join(',')]);
  assert.equal(rm.code, 1, rm.out);
  assert.equal(rm.lines.at(-1), 'RESULT: removed 0 left 6 changed 0');
  assert.equal(worktrees(f), 7);
  for (const [name, reason] of Object.entries(reasons)) assert.equal(lockOf(f, name), reason, name);
});

test('a session-locked worktree that git refuses is locked again with the same reason', t => {
  const f = makeRepo(t);
  writeFileSync(join(f.add('busy'), 'a.txt'), 'changed\n');
  sessionLock(f, 'busy');
  const r = f.run(['show']);
  const rm = f.run(['remove', '--yes', tagsOf(r.out).join(',')]);
  assert.equal(rm.code, 1, rm.out);
  assert.match(rm.out, /^worktree busy: left, git refused: it holds changed or untracked files$/m, rm.out);
  assert.doesNotMatch(rm.out, /the lock was not put back/, rm.out);
  assert.equal(lockOf(f, 'busy'), 'claude session busy (pid 4321)');
  assert.ok(existsSync(f.wt('busy')));
});

// #454 C1, C2, C3, C5, C7: git lists no folder link to an empty folder, so the cleaner walks the tree itself.
/** A recording process call that answers every `status` as clean, so only the cleaner's own walk can see a link or a .git entry. */
const cleanStatus = () => recording((file, args) => (args.includes('status') ? { status: 0, stdout: '', stderr: '' } : realGitOld && args.at(-1) === 'version' ? { status: 0, stdout: 'git version 2.45.0\n', stderr: '' } : null));
test('every run keeps, with no tag, a worktree holding a link at any depth or a .git entry below its root, lists them, and never reads through a link', t => {
  const f = makeRepo(t);
  const target = tempDir(t, 'pact-cleaner-target-');
  mkdirSync(join(target, 'sub'));
  writeFileSync(join(target, 'file.txt'), 'x');
  symlinkSync(tempDir(t, 'pact-cleaner-away-'), join(target, 'inner'), linkKind);
  const deep = f.add('deep');
  mkdirSync(join(deep, 'a', 'b'), { recursive: true });
  symlinkSync(target, join(deep, 'a', 'b', 'out'), linkKind);
  // A file link needs the symlink right on Windows; where an account lacks it, only that part is left out.
  let fileLink = true;
  try {
    symlinkSync(join(f.root, 'a.txt'), join(deep, 'flink'), 'file');
  } catch {
    fileLink = false;
  }
  mkdirSync(join(deep, 'sub', '.GIT'), { recursive: true });
  const gitonly = f.add('gitonly');
  mkdirSync(join(gitonly, 'vendor', '.git'), { recursive: true });
  // A .git FILE below the root is an entry git does not see either; it names no git folder of ours.
  mkdirSync(join(gitonly, 'pkg'));
  writeFileSync(join(gitonly, 'pkg', '.git'), 'gitdir: elsewhere\n');
  f.add('plain');
  for (const flags of [[], ['--recoverable']]) {
    const label = flags.join(' ') || 'default';
    const read = [];
    const readdir = (d, o) => {
      read.push(resolve(d));
      return readdirSync(d, o);
    };
    const r = f.run(['show', ...flags], { spawn: cleanStatus().spawn, readdir });
    assert.equal(r.code, 0, `${label}: ${r.out}`);
    assert.equal(block(r.out, 'deep'), `  kept: ${LINK_KEEP}\n  links:\n    "a/b/out"\n${fileLink ? '    "flink"\n' : ''}  .git entries:\n    "sub/.GIT"\n`, `${label}: ${r.out}`);
    assert.equal(block(r.out, 'gitonly'), `  kept: ${GIT_KEEP}\n  .git entries:\n    "pkg/.git"\n    "vendor/.git"\n`, `${label}: ${r.out}`);
    assert.match(block(r.out, 'plain'), /^ {2}tag [0-9a-f]{10}$/m, `${label}: ${r.out}`);
    assert.equal(tagsOf(r.out).length, 1, `${label}: only plain is a candidate`);
    assert.doesNotMatch(r.out, /inner|file\.txt/, `${label}: nothing behind a link is listed`);
    assert.ok(!read.some(d => d.startsWith(resolve(target))), `${label}: no folder behind a link is read`);
    noPath(f, r.out);
  }
});

// #454 C2: a symlink the index tracks is a link all the same; the walk never asks git. POSIX only: Windows may check it out as a file,
// and a skip there would need a line in windows-skips.txt, so the test returns instead.
test('a worktree that checks out a tracked symlink is kept for it', t => {
  if (process.platform === 'win32') return;
  const f = makeRepo(t);
  symlinkSync('a.txt', join(f.root, 'tlink'));
  f.git(f.root, 'add', 'tlink');
  f.git(f.root, 'commit', '-q', '-m', 'link');
  f.add('tracked');
  const r = f.run(['show'], { spawn: recorded().spawn });
  assert.equal(block(r.out, 'tracked'), `  kept: ${LINK_KEEP}\n  links:\n    "tlink"\n`, r.out);
});

// #454 C8: on Windows git's status reads through a junction, so the names under a link are its target's, outside the worktree.
test('names git lists under a link are never printed, in a block kept for the link or for changed files', t => {
  const f = makeRepo(t);
  const target = tempDir(t, 'pact-cleaner-target-');
  writeFileSync(join(target, 'TARGETFILE.txt'), 'x');
  writeFileSync(join(target, '.env'), 'SECRET CONTENT\n');
  const w = f.add('under');
  mkdirSync(join(w, 'x'));
  symlinkSync(target, join(w, 'x', 'j'), linkKind);
  writeFileSync(join(w, 'own.txt'), 'x');
  // What git would name: the worktree's own file, a retargeted tracked link (an edit, so it stays), the target's files as seen through
  // the link, and on Windows one of them in another letter case.
  const seen = `?? own.txt\0 M x/j\0?? x/j/TARGETFILE.txt\0!! x/j/.env\0!! x/j/\0${process.platform === 'win32' ? '?? X/J/UPPER.txt\0' : ''}`;
  const status = recording((file, args) => (args.includes('status') ? { status: 0, stdout: seen, stderr: '' } : realGitOld && args.at(-1) === 'version' ? { status: 0, stdout: 'git version 2.45.0\n', stderr: '' } : null));
  for (const flags of [[], ['--recoverable']]) {
    const label = flags.join(' ') || 'default';
    const r = f.run(['show', ...flags], { spawn: status.spawn });
    assert.equal(block(r.out, 'under'), `  kept: ${flags.length ? 'holds changed or untracked files' : LINK_KEEP}\n  links:\n    "x/j"\n  changed files:\n    "x/j"\n  untracked files:\n    "own.txt"\n`, `${label}: ${r.out}`);
    assert.doesNotMatch(r.out, /TARGETFILE|\.env|SECRET|UPPER/, `${label}: ${r.out}`);
  }
});

// #454 C4, C7: a gitlink at a path whose .git is no repository does not hide that .git from the keep; the cleaner's own read of the index failing keeps one worktree.
test('a staged gitlink over a .git folder that is no repository still keeps its worktree; a failing index read keeps that worktree alone', t => {
  const f = makeRepo(t);
  const w = f.add('fake');
  mkdirSync(join(w, 'sub', '.git'), { recursive: true });
  writeFileSync(join(w, 'sub', '.git', 'note.txt'), 'UNTRACKED CONTENT\n');
  // A HEAD alone is not a repository: git needs objects and refs too before it refuses a submodule, so only those two make it populated.
  writeFileSync(join(w, 'sub', '.git', 'HEAD'), 'ref: refs/heads/main\n');
  const head = f.git(w, 'rev-parse', 'HEAD');
  f.git(w, 'update-index', '--add', '--cacheinfo', `160000,${head},sub`);
  f.add('good');
  f.add('bad');
  const r = f.run(['show'], { spawn: cleanStatus().spawn });
  assert.equal(block(r.out, 'fake'), `  kept: ${GIT_KEEP}\n  .git entries:\n    "sub/.git"\n`, r.out);

  mkdirSync(join(f.wt('bad'), 'v', '.git'), { recursive: true });
  const failing = recording((file, args) => (args.includes('ls-files') && resolve(args[args.indexOf('-C') + 1]) === resolve(f.wt('bad')) ?{ status: 1, stdout: '', stderr: 'nope' } : args.includes('status') ? { status: 0, stdout: '', stderr: '' } : realGitOld && args.at(-1) === 'version' ? { status: 0, stdout: 'git version 2.45.0\n', stderr: '' } : null));
  const g = f.run(['show'], { spawn: failing.spawn });
  assert.equal(g.code, 0, g.out);
  assert.equal(block(g.out, 'bad'), '  kept: a read failed, so it is kept\n', g.out);
  assert.match(block(g.out, 'good'), /^ {2}tag [0-9a-f]{10}$/m, g.out);
});

// #454 C3: a link beyond Node's flag: a folder whose real path differs from where the walk found it.
test('the walk treats a folder whose real path differs as a link and does not enter it', t => {
  const f = makeRepo(t);
  const w = f.add('odd');
  mkdirSync(join(w, 'x', 'y'), { recursive: true });
  const seen = [];
  const real = p => (resolve(p) === resolve(w, 'x', 'y') ? join(tempDir(t, 'pact-cleaner-elsewhere-'), 'y') : realpathSync.native(p));
  const readdir = (d, o) => {
    seen.push(resolve(d));
    return readdirSync(d, o);
  };
  const { links } = walkTree(w, readdir, real, process.platform);
  assert.deepEqual(links, ['x/y']);
  assert.ok(!seen.includes(resolve(w, 'x', 'y')), 'that folder is not read');
  // A root that is itself a link, swapped in after the caller's check, is a failed read, so its worktree is kept.
  const elsewhere = tempDir(t, 'pact-cleaner-elsewhere-');
  assert.throws(() => walkTree(w, readdir, p => (resolve(p) === resolve(w) ? elsewhere : realpathSync.native(p)), process.platform));
});

// #454 C1: the block of a kept worktree names what a removal by hand would lose; remove leaves one that gained a link after show.
test('a worktree kept for a link also names its changed, untracked and ignored files; remove leaves one that gained a link after show, and git is not called for it', t => {
  const f = makeRepo(t);
  writeFileSync(join(f.root, '.git', 'info', 'exclude'), 'out\n');
  const w = f.add('edits');
  writeFileSync(join(w, 'a.txt'), 'EDITED CONTENT\n');
  writeFileSync(join(w, 'new.txt'), 'x');
  writeFileSync(join(w, '.env'), 'SECRET CONTENT\n');
  symlinkSync(tempDir(t, 'pact-cleaner-target-'), join(w, 'out'), linkKind);
  const r = f.run(['show']);
  assert.equal(block(r.out, 'edits'), `  kept: ${LINK_KEEP}\n  links:\n    "out"\n  changed files:\n    "a.txt"\n  untracked files:\n    "new.txt"\n  ignored files:\n    ".env"\n`, r.out);
  assert.doesNotMatch(r.out, /CONTENT/, r.out);
  noPath(f, r.out);

  const late = f.add('late');
  const tags = tagsOf(f.run(['show']).out);
  assert.equal(tags.length, 1, 'only late is a candidate');
  symlinkSync(tempDir(t, 'pact-cleaner-target-'), join(late, 'out'), linkKind);
  const rec = recording();
  const rm = f.run(['remove', '--yes', tags.join(',')], { spawn: rec.spawn });
  assert.equal(rm.code, 1, rm.out);
  assert.equal(rm.lines.at(-1), 'RESULT: removed 0 left 0 changed 1');
  assert.ok(!rec.calls.some(c => c.args.includes('worktree') && c.args.includes('remove')), 'git is not asked to remove it');
  assert.ok(existsSync(late));
});

// #454 C4: a walk that swallowed its own error would hand the worktree to git with its links unseen.
test('a walk that cannot read a worktree keeps that worktree alone, in every run', t => {
  const f = makeRepo(t);
  f.add('bad');
  f.add('good');
  const throwing = (dir, opts) => {
    if (resolve(dir).startsWith(f.wt('bad'))) throw Object.assign(new Error(`EACCES: permission denied, scandir '${dir}'`), { code: 'EACCES' });
    return readdirSync(dir, opts);
  };
  for (const flags of [[], ['--recoverable']]) {
    const label = flags.join(' ') || 'default';
    const r = f.run(['show', ...flags], { readdir: throwing, spawn: recorded().spawn });
    assert.equal(r.code, 0, `${label}: ${r.out}`);
    assert.equal(block(r.out, 'bad'), '  kept: a read failed, so it is kept\n', `${label}: ${r.out}`);
    assert.match(block(r.out, 'good'), /^ {2}tag [0-9a-f]{10}$/m, `${label}: ${r.out}`);
    assert.doesNotMatch(r.out, /EACCES|permission|scandir/, `${label}: no error text is printed`);
    noPath(f, r.out);
  }
});

// #454 C5: git calls a record prunable when its .git file is gone, though the folder is still there.
test('a record git calls prunable over a folder still there is walked, so a link in it keeps the worktree', t => {
  const f = makeRepo(t);
  const w = f.add('orphan');
  rmSync(join(w, '.git'), { force: true });
  assert.match(f.git(f.root, 'worktree', 'list', '--porcelain'), /prunable/, 'git calls the record prunable, so this reaches the branch it names');
  symlinkSync(tempDir(t, 'pact-cleaner-target-'), join(w, 'out'), linkKind);
  const r = f.run(['show']);
  assert.equal(r.code, 0, r.out);
  assert.equal(block(r.out, 'orphan'), `  kept: ${LINK_KEEP}\n  links:\n    "out"\n`, r.out);
});

// #454 C1, on the platform where the bug is: real git lists nothing for an ignored junction to an empty folder.
test('on Windows an ignored junction to an empty folder keeps its worktree in both modes, and the files behind a junction are never named', { skip: process.platform !== 'win32' }, t => {
  const f = makeRepo(t);
  writeFileSync(join(f.root, '.git', 'info', 'exclude'), 'out\n');
  const w = f.add('empty');
  symlinkSync(tempDir(t, 'pact-cleaner-empty-'), join(w, 'out'), 'junction');
  const full = tempDir(t, 'pact-cleaner-full-');
  writeFileSync(join(full, 'TARGETFILE.txt'), 'x');
  writeFileSync(join(full, '.env'), 'SECRET CONTENT\n');
  mkdirSync(join(f.add('nested'), 'x'));
  symlinkSync(full, join(f.wt('nested'), 'x', 'j'), 'junction');
  for (const flags of [[], ['--recoverable']]) {
    const label = flags.join(' ') || 'default';
    const r = f.run(['show', ...flags], { spawn: recorded().spawn });
    assert.equal(block(r.out, 'empty'), `  kept: ${LINK_KEEP}\n  links:\n    "out"\n`, `${label}: ${r.out}`);
    assert.match(block(r.out, 'nested'), new RegExp(`^ {2}kept: (?:${LINK_KEEP}|holds changed or untracked files)\\n {2}links:\\n {4}"x/j"\\n`), `${label}: ${r.out}`);
    assert.equal(tagsOf(r.out).length, 0, `${label}: no tag`);
    assert.doesNotMatch(r.out, /TARGETFILE|\.env|SECRET/, `${label}: ${r.out}`);
  }
});
