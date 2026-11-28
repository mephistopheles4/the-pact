// The review output module (#53, slice 4), driven through its command line as
// the install script runs it. Judged on what it prints and what it leaves on
// disk. The install script's own use of it is tested in install-edits.test.mjs.
// The last test reads the review procedure's own text, claude/review.md.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { GATE, REPO, lastLine } from './text.mjs';
import { tempDir } from './tree.mjs';

const WIN = process.platform === 'win32';
const REVIEW = join(GATE, 'review.mjs');
const FAULTS = pathToFileURL(join(REPO, 'gate', 'tests', 'fixtures', 'render-faults.mjs')).href;
const sha256 = b => createHash('sha256').update(b).digest('hex');

/** The two inputs, as the install script hands them over. */
function inputs(t) {
  const d = tempDir(t, 'pact-review-in-');
  const rules = Buffer.from('# Rules\nRendered.\n');
  const diff = Buffer.from('--- default/CLAUDE.md\n+++ configured/CLAUDE.md\n@@ -1,0 +2,1 @@\n+x\n');
  writeFileSync(join(d, 'CLAUDE.md'), rules);
  writeFileSync(join(d, 'config.diff'), diff);
  return { rules, diff, rulesFile: join(d, 'CLAUDE.md'), diffFile: join(d, 'config.diff') };
}

function review(t, folder, home, { fault, faultDir, own } = {}) {
  const i = inputs(t);
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  if (own) Object.assign(env, { HOME: own, USERPROFILE: own });
  const pre = fault ? ['--import', FAULTS] : [];
  if (fault) env.PACT_FAULT = fault;
  if (faultDir) env.PACT_FAULT_DIR = faultDir;
  const r = spawnSync(process.execPath, [...pre, REVIEW, folder, home ?? tempDir(t, 'pact-review-home-'), i.rulesFile, i.diffFile], { encoding: 'utf8', env });
  return { code: r.status, stdout: r.stdout, out: r.stdout + r.stderr, ...i };
}

function wrote(r, folder) {
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.stdout.split('\n'), [`REVIEW ${sha256(r.rules)} ${sha256(r.diff)}`, 'RESULT: pass', '']);
  assert.deepEqual(readdirSync(folder).sort(), ['config.diff', 'rendered-rules.txt']);
  assert.deepEqual(readFileSync(join(folder, 'rendered-rules.txt')), r.rules);
  assert.deepEqual(readFileSync(join(folder, 'config.diff')), r.diff);
}

function refusedWith(r, rule, reason) {
  assert.equal(r.code, 1, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.match(r.stdout, new RegExp(`^FAIL ${rule}: `, 'm'), r.out);
  if (reason) assert.match(r.stdout, reason, r.out);
  assert.doesNotMatch(r.stdout, /^REVIEW /m, r.out);
}

// ------------------------------------------------------------ where it writes

/** The refusal for a folder in or under a home folder's .claude or .pact folder, by real path. */
const KEPT = /in or under a Claude or pact folder of a home folder/;

test('a new folder is created and gets both files, byte for byte', t => {
  const f = join(tempDir(t), 'review');
  wrote(review(t, f), f);
});

test('an existing empty folder gets both files', t => {
  const f = tempDir(t);
  wrote(review(t, f), f);
});

test('folders that only share a prefix with a pact folder or .claude are not refused', t => {
  const base = tempDir(t);
  const home = join(base, 'home');
  mkdirSync(home);
  for (const f of [join(home, '.pact2'), join(base, '.claude2'), join(base, 'claude'), join(base, 'x.claude')]) {
    wrote(review(t, f, home), f);
  }
});

test('bad case: a folder that is not empty refuses, and leaves what was there alone', t => {
  const f = tempDir(t);
  writeFileSync(join(f, 'notes.txt'), 'mine\n');
  refusedWith(review(t, f), 'review-folder', /the review folder is not empty/);
  assert.deepEqual(readdirSync(f), ['notes.txt']);
});

test('bad case: a folder that is a link refuses', t => {
  const target = tempDir(t);
  const f = join(tempDir(t), 'link');
  symlinkSync(target, f, 'junction');
  refusedWith(review(t, f), 'review-folder', /the review folder is a link/);
  assert.deepEqual(readdirSync(target), []);
});

test('bad case: a folder whose parent does not exist refuses, and nothing is created', t => {
  const f = join(tempDir(t), 'missing', 'review');
  refusedWith(review(t, f), 'review-folder', /parent folder does not exist/);
  assert.ok(!existsSync(join(f, '..')));
});

test('bad case: a relative folder refuses', t => {
  refusedWith(review(t, 'review'), 'review-folder', /must be a full path/);
});

test('bad case: a path that names a file refuses', t => {
  const f = join(tempDir(t), 'file');
  writeFileSync(f, 'x');
  refusedWith(review(t, f), 'review-folder', /not a folder/);
});

for (const [label, make] of [
  [
    'the pact folder of the home folder itself',
    (base, home) => {
      mkdirSync(join(home, '.pact'));
      return join(home, '.pact');
    },
  ],
  [
    'a folder under the pact folder of the home folder',
    (base, home) => {
      mkdirSync(join(home, '.pact'));
      return join(home, '.pact', 'review');
    },
  ],
  [
    'a folder deep under the pact folder of the home folder',
    (base, home) => {
      mkdirSync(join(home, '.pact', 'deep'), { recursive: true });
      return join(home, '.pact', 'deep', 'review');
    },
  ],
]) {
  test(`bad case: ${label} refuses, and a folder the run created is removed`, t => {
    const base = tempDir(t);
    const home = join(base, 'home');
    mkdirSync(home);
    const f = make(base, home);
    const existed = existsSync(f);
    refusedWith(review(t, f, home), 'review-folder', KEPT);
    if (!existed) assert.ok(!existsSync(f), 'the created folder was left behind');
    assert.ok(!existsSync(join(f, 'rendered-rules.txt')));
  });
}

for (const name of ['.claude', '.Claude', '.CLAUDE']) {
  test(`bad case: a folder under one named ${name} refuses, even when it is not the Claude home folder`, t => {
    const base = tempDir(t);
    mkdirSync(join(base, name));
    const f = join(base, name, 'review');
    refusedWith(review(t, f), 'review-folder', /in or under a folder named \.claude/);
    assert.ok(!existsSync(f));
  });
}

test('bad case: a folder named .claude itself refuses', t => {
  const f = join(tempDir(t), '.claude');
  refusedWith(review(t, f), 'review-folder', /in or under a folder named \.claude/);
  assert.ok(!existsSync(f));
});

test('bad case: a folder reached through a linked parent that leads into a .claude folder refuses', t => {
  const real = tempDir(t);
  mkdirSync(join(real, '.claude'));
  const link = join(tempDir(t), 'innocent');
  symlinkSync(join(real, '.claude'), link, 'junction');
  const f = join(link, 'review');
  refusedWith(review(t, f), 'review-folder', /in or under a folder named \.claude/);
  assert.deepEqual(readdirSync(join(real, '.claude')), []);
});

test('bad case: a folder reached through a linked parent that leads into the pact folder of the home folder refuses', t => {
  const home = tempDir(t, 'pact-review-home-');
  const pact = join(home, '.pact');
  mkdirSync(pact);
  const link = join(tempDir(t), 'innocent');
  symlinkSync(pact, link, 'junction');
  refusedWith(review(t, join(link, 'review'), home), 'review-folder', KEPT);
  assert.deepEqual(readdirSync(pact), []);
});

test('bad case: the pact folder of the home folder named in another case refuses', { skip: !WIN && process.platform !== 'darwin' && 'case folds only on Windows and macOS (not run)' }, t => {
  const base = tempDir(t);
  const home = join(base, 'Home');
  mkdirSync(join(home, '.pact'), { recursive: true });
  refusedWith(review(t, join(base, 'HOME', '.PACT', 'review'), home), 'review-folder', KEPT);
});

test('bad case: a folder in your own pact folder refuses when the run names another home', t => {
  // The home folder the environment names stands in for yours.
  const mine = tempDir(t, 'pact-review-mine-');
  mkdirSync(join(mine, '.pact'));
  refusedWith(review(t, join(mine, '.pact', 'review'), undefined, { own: mine }), 'review-folder', KEPT);
  assert.deepEqual(readdirSync(join(mine, '.pact')), []);
});

/** The 8.3 short name Windows gives `p`, or null when it gives none. */
function shortName(p) {
  // Verbatim, so Node does not escape the quotes cmd.exe reads.
  const r = spawnSync('cmd.exe', ['/d', '/s', '/c', `\"for %I in (\"${p}\") do @echo %~sI\"`], { encoding: 'utf8', windowsVerbatimArguments: true });
  const s = r.status === 0 ? r.stdout.trim() : '';
  return s && s.toLowerCase() !== p.toLowerCase() ? s : null;
}

test('bad case: a .claude folder named by its short name refuses', { skip: !WIN && 'short names are Windows only (not run)' }, t => {
  const base = tempDir(t);
  mkdirSync(join(base, '.claude'));
  const short = shortName(join(base, '.claude'));
  if (!short || /\.claude$/i.test(short)) {
    t.skip('this volume gives no short names (not run)');
    return;
  }
  refusedWith(review(t, join(short, 'review')), 'review-folder', /in or under a folder named \.claude/);
  assert.deepEqual(readdirSync(join(base, '.claude')), []);
});

test('bad case: a .claude folder named with a trailing dot refuses, and nothing reaches the .claude folder', { skip: !WIN && 'Windows only (not run)' }, t => {
  // Win32 drops the dot, so this spelling could name .claude; Node keeps it,
  // so here it names a folder that does not exist. Either way it must refuse.
  // (The install script hands over GetFullPath's spelling, which drops the dot:
  // install-edits.test.mjs covers that path.)
  const base = tempDir(t);
  mkdirSync(join(base, '.claude'));
  refusedWith(review(t, `${join(base, '.claude.')}\\review`), 'review-folder');
  assert.deepEqual(readdirSync(join(base, '.claude')), []);
});

// ------------------------------------------------------------ how it writes

test('bad case: a file planted at a review name after the empty-folder check refuses: the create is exclusive', t => {
  const f = tempDir(t);
  const r = review(t, f, undefined, { fault: 'review-plant' });
  refusedWith(r, 'review-write', /rendered-rules\.txt could not be created as a new file/);
  assert.equal(readFileSync(join(f, 'rendered-rules.txt'), 'utf8'), 'planted\n', 'the planted file was overwritten');
});

test('bad case: a failed second write refuses, and takes away the first file and the folder the run created', t => {
  const f = join(tempDir(t), 'review');
  const r = review(t, f, undefined, { fault: 'review-fail-diff' });
  refusedWith(r, 'review-write', /config\.diff could not be created as a new file/);
  assert.ok(!existsSync(f), 'the folder the run created was left behind');
});

test('bad case: a failed second write in an existing folder takes away the first file and keeps the folder', t => {
  const f = tempDir(t);
  refusedWith(review(t, f, undefined, { fault: 'review-fail-diff' }), 'review-write');
  assert.deepEqual(readdirSync(f), []);
});

/** A fake user home whose .claude is a junction out to a folder of another name; returns its parts. */
function outwardClaude(t) {
  const fakeHome = tempDir(t, 'pact-review-userhome-');
  const target = join(tempDir(t), 'claude-data');
  mkdirSync(target);
  symlinkSync(target, join(fakeHome, '.claude'), 'junction');
  return { fakeHome, target };
}

function reviewAs(t, fakeHome, folder) {
  const i = inputs(t);
  const env = { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [REVIEW, folder, tempDir(t, 'pact-review-home-'), i.rulesFile, i.diffFile], { encoding: 'utf8', env });
  return { code: r.status, stdout: r.stdout, out: r.stdout + r.stderr };
}

test('bad case: a folder under the real .claude refuses with another Claude home named, when .claude links out to a folder of another name', t => {
  const { fakeHome, target } = outwardClaude(t);
  refusedWith(reviewAs(t, fakeHome, join(fakeHome, '.claude', 'review')), 'review-folder', /in or under a folder named \.claude/);
  assert.deepEqual(readdirSync(target), []);
});

test('bad case: the real default Claude folder reached by another name refuses, with another Claude home named', t => {
  const { fakeHome, target } = outwardClaude(t);
  const other = join(tempDir(t), 'innocent');
  symlinkSync(target, other, 'junction');
  refusedWith(reviewAs(t, fakeHome, join(other, 'review')), 'review-folder', KEPT);
  assert.deepEqual(readdirSync(target), []);
});

test('bad case: an input that cannot be read refuses, and nothing is created', t => {
  const f = join(tempDir(t), 'review');
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [REVIEW, f, tempDir(t), join(tempDir(t), 'none.md'), join(tempDir(t), 'none.diff')], { encoding: 'utf8', env });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /^FAIL review-input: /m);
  assert.ok(!existsSync(f));
});

test('bad case: a switch in place of an argument is a usage failure', t => {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [REVIEW, '--skip', tempDir(t), 'a', 'b'], { encoding: 'utf8', env });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^FAIL usage: /m);
});

test('it never echoes the folder or home path', t => {
  const C = 'CANARYreview';
  const base = tempDir(t);
  mkdirSync(join(base, C, '.claude'), { recursive: true });
  const r = review(t, join(base, C, '.claude', 'review'));
  assert.equal(r.code, 1, r.out);
  assert.ok(!r.out.includes(C), r.out);
  const ok = join(tempDir(t), C);
  const p = review(t, ok);
  assert.equal(p.code, 0, p.out);
  assert.ok(!p.out.includes(C), p.out);
});

// ------------------------------------------------------------ the procedure's text

test("review.md's coverage hint item names the tool, the scratch folder and the cap, changes no disposition, and step 2 stays off the network", () => {
  const text = readFileSync(join(REPO, 'claude', 'review.md'), 'utf8').replace(/\r\n/g, '\n');
  const section = name => (text.split(`\n## ${name}\n`)[1] ?? '').split('\n## ')[0];
  const item = (/\n- \*\*The coverage hint\.\*\*[\s\S]*?(?=\n- |$)/.exec(section('Handling the reports'))?.[0] ?? '').replace(/\s+/g, ' ');
  for (const says of [
    'When `coverage` is on the tools list and the session is not a cloud session',
    'to a scratch file outside the repo',
    'run `coverage ask` from that folder',
    'at most ten a round',
    '`> Coverage hint: skipped (cap).`',
    'The hint changes no sort, severity, disposition, `auto` mark or route',
    'never the JSON line printed before it, which goes in no post',
    'a refused run puts its `REFUSED` line there',
    'a round that sends any logs one checkpoint line for them, naming the repo and the count sent, counting each run that reached `jev`, a failed one included',
  ]) {
    assert.ok(item.includes(says), `the item does not say: ${says}`);
  }
  assert.ok(section('The threat model').replace(/\s+/g, ' ').includes('Never ask it over a network or in a cloud session'), "step 2's network sentence is gone");
});
