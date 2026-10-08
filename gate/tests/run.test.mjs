// The test runner, run.mjs (#140): its pure pick and scrub, then its shell end
// to end on tiny planted folders. Each planted folder is a throwaway repo with
// a copy of the runner and the copy-list module in its gate/tests, so the
// runner finds its own folder and the repo root as it does in this tree.
//
// This file must stay out of the install tier, or fast stops running it, so it
// never names the install script or imports the harness, even inside a string:
// those plants live in fixtures/run/ and in strings built at run time.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tempDir } from './helpers.mjs';
import { CAP, PLAIN_NAME, leakedLines, makeScrub, namesInstallScript, parseArgs, pick, relativeImports, stringLiterals } from './run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'fixtures', 'run');
const WIN = process.platform === 'win32';
const HARNESS = ['install', 'harness.mjs'].join('-');
/** An import line for `spec`, built at run time so this file's own source holds no import of it. */
const imp = spec => `import '${spec}';\n`;
const entries = names => names.map(name => ({ name, file: true }));

// ------------------------------------------------------------ pick

test('pick: full is every top-level test file; fast holds none from the install tier', () => {
  const sources = new Map([
    ['a.test.mjs', "import { test } from 'node:test';\n"],
    ['b.test.mjs', imp(`./${HARNESS}`)],
    [HARNESS, ''],
  ]);
  const full = pick({ tier: 'full', entries: entries(['b.test.mjs', 'a.test.mjs']), sources });
  assert.deepEqual(full.refused, []);
  assert.deepEqual(
    full.files.map(f => f.file),
    ['a.test.mjs', 'b.test.mjs'],
  );
  assert.equal(full.files[1].reason, `install tier: imports ${HARNESS}`);
  const fast = pick({ tier: 'fast', entries: entries(['a.test.mjs', 'b.test.mjs']), sources });
  assert.deepEqual(
    fast.files.map(f => f.file),
    ['a.test.mjs'],
  );
});

test('pick: a file that names the install script, written out or in pieces, is in the install tier, never fast', () => {
  const sources = new Map([
    ['out.test.mjs', readFileSync(join(FIX, 'written-out.txt'), 'utf8')],
    ['pieces.test.mjs', readFileSync(join(FIX, 'in-pieces.txt'), 'utf8')],
    ['plain.test.mjs', "spawnSync('pwsh', ['-File', 'scripts/check-skill-flags.ps1']);\n"],
  ]);
  const ents = entries(['out.test.mjs', 'pieces.test.mjs', 'plain.test.mjs']);
  assert.deepEqual(
    pick({ tier: 'fast', entries: ents, sources }).files.map(f => f.file),
    ['plain.test.mjs'],
  );
  const full = pick({ tier: 'full', entries: ents, sources }).files;
  assert.match(full.find(f => f.file === 'out.test.mjs').reason, /^install tier: names /);
  assert.match(full.find(f => f.file === 'pieces.test.mjs').reason, /^install tier: names /);
});

test('pick: a file reaching the harness through a re-exporting helper, two helpers deep, or a dynamic import is in the install tier', () => {
  const sources = new Map([
    ['re.test.mjs', imp('./re.mjs')],
    ['re.mjs', `export * from '${'./' + HARNESS}';\n`],
    ['deep.test.mjs', imp('./h1.mjs')],
    ['h1.mjs', imp('./sub/h2.mjs')],
    ['sub/h2.mjs', imp(`../${HARNESS}`)],
    ['dyn.test.mjs', `await import('${'./fixtures/d.mjs'}');\n`],
    ['fixtures/d.mjs', imp(`../${HARNESS}`)],
    ['near.test.mjs', imp('./h3.mjs')],
    ['h3.mjs', imp('./other.mjs')],
    ['other.mjs', ''],
    [HARNESS, ''],
  ]);
  const ents = entries(['re.test.mjs', 'deep.test.mjs', 'dyn.test.mjs', 'near.test.mjs']);
  const full = pick({ tier: 'full', entries: ents, sources }).files;
  const reason = f => full.find(x => x.file === f).reason;
  assert.equal(reason('re.test.mjs'), `install tier: imports re.mjs -> ${HARNESS}`);
  assert.equal(reason('deep.test.mjs'), `install tier: imports h1.mjs -> sub/h2.mjs -> ${HARNESS}`);
  assert.equal(reason('dyn.test.mjs'), `install tier: imports fixtures/d.mjs -> ${HARNESS}`);
  assert.equal(reason('near.test.mjs'), 'fast tier');
  assert.deepEqual(
    pick({ tier: 'fast', entries: ents, sources }).files.map(f => f.file),
    ['near.test.mjs'],
  );
});

test('pick: a helper that names the install script as data does not put its importers in the install tier', () => {
  // The copy-list module is such a helper: S4 keeps its importers out.
  const sources = new Map([
    ['uses.test.mjs', imp('./list.mjs')],
    ['list.mjs', readFileSync(join(FIX, 'written-out.txt'), 'utf8')],
  ]);
  assert.deepEqual(
    pick({ tier: 'fast', entries: entries(['uses.test.mjs']), sources }).files.map(f => f.file),
    ['uses.test.mjs'],
  );
});

test('pick: names outside the plain set, option-shaped names and entries that are not files are refused', () => {
  const odd = ['-x.test.mjs', 'odd name.test.mjs', 'b$.test.mjs', 'é.test.mjs', 'a\u0001b.test.mjs'];
  const r = pick({ tier: 'full', entries: [...entries(['ok.test.mjs', ...odd]), { name: 'dir.test.mjs', file: false }], sources: new Map() });
  assert.deepEqual(
    r.files.map(f => f.file),
    ['ok.test.mjs'],
  );
  assert.deepEqual(r.refused.map(x => x.name).sort(), [...odd, 'dir.test.mjs'].sort());
  assert.ok(PLAIN_NAME.test('install-smoke.test.mjs'));
});

test('pick: an unknown tier throws', () => {
  assert.throws(() => pick({ tier: 'changed', entries: [], sources: new Map() }), /unknown tier/);
});

test('the literal reader: comments are skipped, template pieces kept, a regex holding a quote is not a string', () => {
  assert.deepEqual(stringLiterals("// 'no'\nconst a = 'x'; /* \"no\" */ const b = `p${a}q`; const r = /'/; const c = \"y\";"), ['x', 'p', 'q', 'y']);
  assert.equal(namesInstallScript("const n = 'inst' + 'all.ps1';"), true);
  assert.equal(namesInstallScript("const n = 'install.ps2';"), false);
  assert.deepEqual(relativeImports("import a from './a.mjs';\nimport 'node:fs';\nexport * from \"../b.mjs\";\nawait import('./c.mjs');"), ['./a.mjs', '../b.mjs', './c.mjs']);
});

test('parseArgs: unknown tiers, reporters and options, and a missing value, are usage errors', () => {
  assert.deepEqual(parseArgs(['full', '--reporter', 'tap']).opts, { tier: 'full', reporter: 'tap', record: null, list: false });
  assert.equal(parseArgs(['fast', '--reporter=junit']).opts.reporter, 'junit');
  for (const bad of [[], ['nope'], ['changed'], ['full', 'fast'], ['full', '--reporter', 'xml'], ['full', '--reporter'], ['full', '--record'], ['full', '--bogus'], ['full', '--base', '-x']]) {
    assert.ok(parseArgs(bad).error, bad.join(' '));
  }
});

// ------------------------------------------------------------ the record scrub

test('the scrub: repo, temp and home folders, in every form, and the user name become placeholders', () => {
  const scrub = makeScrub({
    repo: 'C:\\Users\\alice\\src\\pact',
    home: 'C:\\Users\\alice',
    tmp: 'C:\\Users\\alice\\AppData\\Local\\Temp',
    user: 'alice',
    aliases: [['C:\\Users\\ALICE~1\\AppData\\Local\\Temp', 'C:\\Users\\alice\\AppData\\Local\\Temp']],
    win: true,
  });
  const text = [
    'at C:\\Users\\alice\\src\\pact\\gate\\tests\\x.test.mjs:3',
    'file:///C:/Users/alice/src/pact/gate/run.mjs',
    'c:/users/ALICE/src/pact/a and C:\\\\Users\\\\alice\\\\src\\\\pact\\\\b',
    'C:\\Users\\ALICE~1\\AppData\\Local\\Temp\\pact-x and C:\\Users\\ALICE~1\\.claude',
    'C:\\Users\\alice\\.claude and user alice, not malice',
    'see https://example.com/a',
  ].join('\n');
  const out = scrub(text);
  assert.deepEqual(leakedLines(out), []);
  assert.equal(
    out,
    [
      'at <repo>\\gate\\tests\\x.test.mjs:3',
      'file:///<repo>/gate/run.mjs',
      '<repo>/a and <repo>\\\\b',
      '<tmp>\\pact-x and <home>\\.claude',
      '<home>\\.claude and user <user>, not malice',
      'see https://example.com/a',
    ].join('\n'),
  );
});

test('the scrub on a POSIX tree, and the leak check on what survives', () => {
  const scrub = makeScrub({ repo: '/home/bob/pact', home: '/home/bob', tmp: '/tmp', user: 'bob', win: false });
  const out = scrub('/home/bob/pact/x /tmp/y /home/bob/.z file:///home/bob/pact/q');
  assert.deepEqual(leakedLines(out), []);
  assert.equal(out, '<repo>/x <tmp>/y <home>/.z file://<repo>/q');
  assert.deepEqual(leakedLines('ok\nD:\\other\\x\nhttps://a.b/c\n/home/eve/x\n/Users/eve/y\nfile:///E:/z'), [2, 4, 5, 6]);
});

// ------------------------------------------------------------ the shell, end to end

/** A throwaway repo whose gate/tests holds the runner, the copy list and `files`. */
function plant(t, files = {}) {
  const root = join(tempDir(t, 'pact-run-'), 'repo');
  const tests = join(root, 'gate', 'tests');
  mkdirSync(tests, { recursive: true });
  for (const f of ['run.mjs', 'copy-list.mjs']) copyFileSync(join(HERE, f), join(tests, f));
  for (const [rel, text] of Object.entries(files)) {
    const p = join(tests, ...rel.split('/'));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  return { root, tests };
}

/** The env a session's shell gives the runner: this process's, without the test runner's own context. */
function shellEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function runIn(p, args, { env = shellEnv(), cwd = tmpdir() } = {}) {
  const r = spawnSync(process.execPath, [join(p.tests, 'run.mjs'), ...args], { cwd, env, encoding: 'utf8', timeout: 120_000 });
  const lines = r.stderr.split(/\r?\n/).filter(Boolean);
  return { code: r.status, signal: r.signal, stdout: r.stdout, stderr: r.stderr, last: lines[lines.length - 1] };
}

const PASSING = "import { test } from 'node:test';\ntest('planted pass', () => {});\n";
const FAILING = "import { test } from 'node:test';\ntest('planted fail', () => { throw new Error('planted'); });\n";

test('shell: a passing pick exits 0; the cap, the reporter and each file reach node; the last line names the tier and count', t => {
  // Six files, each holding a marker while it runs: at a cap of four, at most four are seen at once.
  const holder = name => `import { test } from 'node:test';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const live = join(process.cwd(), 'live');
test('held ${name}', async () => {
  mkdirSync(join(live, '${name}'), { recursive: true });
  let max = 0;
  const end = Date.now() + 2500;
  while (Date.now() < end) {
    max = Math.max(max, readdirSync(live).length);
    await new Promise(r => setTimeout(r, 50));
  }
  rmSync(join(live, '${name}'), { recursive: true });
  writeFileSync(join(process.cwd(), 'seen-${name}'), String(max));
});
`;
  const names = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  const p = plant(t, Object.fromEntries(names.map(n => [`${n}.test.mjs`, holder(n)])));
  const r = runIn(p, ['full', '--reporter', 'tap']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^TAP version 13$/m);
  for (const n of names) assert.match(r.stdout, new RegExp(`^ok \\d+ - held ${n}$`, 'm'));
  for (const n of names) assert.match(r.stderr, new RegExp(`^pick: gate/tests/${n}\\.test\\.mjs \\(fast tier\\)$`, 'm'));
  const max = Math.max(...names.map(n => Number(readFileSync(join(p.root, `seen-${n}`), 'utf8'))));
  assert.equal(CAP, 4);
  assert.equal(max, 4, 'at most four files run at once, and four did');
  assert.equal(r.last, 'RESULT: full tier, 6 files, pass');
});

test('shell: a failing test makes the run exit non-zero', t => {
  const p = plant(t, { 'a.test.mjs': PASSING, 'b.test.mjs': FAILING });
  const r = runIn(p, ['fast']);
  assert.equal(r.code, 1);
  assert.equal(r.last, 'RESULT: fast tier, 2 files, fail (exit 1)');
});

test('shell: a test that kills its parent node makes the run exit non-zero', t => {
  const p = plant(t, {
    'a.test.mjs': PASSING,
    'k.test.mjs': "import { test } from 'node:test';\ntest('kill the parent', async () => { process.kill(process.ppid); await new Promise(r => setTimeout(r, 5000)); });\n",
  });
  const r = runIn(p, ['full']);
  assert.notEqual(r.code, 0);
  assert.match(r.last, /^RESULT: full tier, 2 files, fail \((?:exit \d+|node killed by SIG\w+)\)$/);
});

test('shell: an empty pick exits 2 and never starts node', t => {
  // The only test file is in the install tier, so fast picks nothing.
  const p = plant(t, { 'i.test.mjs': imp(`./${HARNESS}`) + PASSING, [HARNESS]: '' });
  const r = runIn(p, ['fast', '--reporter', 'tap']);
  assert.equal(r.code, 2);
  assert.equal(r.stdout, '');
  assert.equal(r.last, 'RESULT: fast tier, 0 files, refused (an empty pick runs nothing)');
  const none = runIn(plant(t), ['full']);
  assert.equal(none.code, 2);
  assert.equal(none.stdout, '');
});

test('shell: an unknown tier, an unknown reporter, an unknown option, a base and a record inside the repo exit 2', t => {
  const p = plant(t, { 'a.test.mjs': PASSING });
  for (const args of [['nope'], ['changed'], ['full', '--reporter', 'xml'], ['full', '--base', '-x'], ['full', '--base', 'main'], ['full', '--record', join(p.root, 'rec.txt')], []]) {
    const r = runIn(p, args);
    assert.equal(r.code, 2, args.join(' '));
    assert.equal(r.stdout, '', args.join(' '));
    assert.match(r.last, /^RESULT: refused, /, args.join(' '));
  }
  assert.ok(!existsSync(join(p.root, 'rec.txt')));
});

test('shell: odd and option-shaped test-file names refuse the run with exit 2, printed with odd characters replaced', t => {
  const p = plant(t, { 'a.test.mjs': PASSING, 'odd name$.test.mjs': PASSING, '-x.test.mjs': PASSING });
  const r = runIn(p, ['full', '--reporter', 'tap']);
  assert.equal(r.code, 2);
  assert.equal(r.stdout, '', 'node never ran');
  assert.match(r.stderr, /^refused: gate\/tests\/odd name\?\.test\.mjs \(a name outside the plain set\)$/m);
  assert.match(r.stderr, /^refused: gate\/tests\/-x\.test\.mjs \(a name outside the plain set\)$/m);
  assert.equal(r.last, 'RESULT: full tier, 1 files, refused (2 test-file names refused)');
});

test('shell: a control character in a test-file name is printed replaced', { skip: WIN && 'Windows file names cannot hold control characters (the Linux run covers it)' }, t => {
  const p = plant(t, { 'a\u0001b.test.mjs': PASSING });
  const r = runIn(p, ['full']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /^refused: gate\/tests\/a\?b\.test\.mjs \(a name outside the plain set\)$/m);
});

test('shell: fast and full run with no git on PATH and no git repo', t => {
  const p = plant(t, { 'a.test.mjs': PASSING });
  const empty = tempDir(t, 'pact-nopath-');
  const env = {};
  for (const [k, v] of Object.entries(shellEnv())) if (!/^path$/i.test(k)) env[k] = v;
  env.PATH = empty;
  assert.ok(!existsSync(join(p.root, '.git')));
  for (const tier of ['fast', 'full']) {
    const r = runIn(p, [tier], { env, cwd: empty });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.last, `RESULT: ${tier} tier, 1 files, pass`);
  }
});

test('shell: stdout is clean TAP even when the runner inherits a test runner\'s context', t => {
  const p = plant(t, { 'a.test.mjs': PASSING, 'b.test.mjs': PASSING });
  const r = runIn(p, ['full', '--reporter', 'tap'], { env: { ...shellEnv(), NODE_TEST_CONTEXT: 'child-v8' } });
  assert.equal(r.code, 0, r.stderr);
  const lines = r.stdout.split('\n').filter(Boolean);
  assert.equal(lines[0], 'TAP version 13');
  const bad = lines.filter(l => !/^(?:TAP version \d+|(?:not )?ok \d+|1\.\.\d+|#|\s+\S|Bail out!)/.test(l));
  assert.deepEqual(bad, []);
  assert.equal(lines.filter(l => /^ok \d+ - planted pass$/.test(l)).length, 2);
  assert.ok(lines.includes('# pass 2'));
});

// Node 20 refuses a test-name filter in NODE_OPTIONS outright; Node 22 and later honour it.
const NAME_FILTER_IN_OPTIONS = spawnSync(process.execPath, ['-e', '0'], { env: { ...process.env, NODE_OPTIONS: '--test-name-pattern=x' } }).status === 0;

test('shell: an inherited test-name filter in NODE_OPTIONS cannot narrow the run', { skip: !NAME_FILTER_IN_OPTIONS && 'this Node refuses a test-name filter in NODE_OPTIONS (the preload case covers it)' }, t => {
  const p = plant(t, { 'two.test.mjs': "import { test } from 'node:test';\ntest('first', () => {});\ntest('second', () => {});\n" });
  const r = runIn(p, ['full', '--reporter', 'tap'], { env: { ...shellEnv(), NODE_OPTIONS: '--test-name-pattern=first' } });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^ok \d+ - first$/m);
  assert.match(r.stdout, /^ok \d+ - second$/m);
  assert.match(r.stdout, /^# pass 2$/m);
});

test('shell: an inherited preload in NODE_OPTIONS never reaches node --test or the test files', t => {
  const marks = tempDir(t, 'pact-marks-');
  const preload = join(tempDir(t, 'pact-preload-'), 'preload.cjs');
  // It marks only the processes the runner starts: node --test itself, and each test file.
  writeFileSync(
    preload,
    `const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
if (process.execArgv.includes('--test') || /\\.test\\.mjs$/.test(process.argv[1] ?? '')) writeFileSync(join(${JSON.stringify(marks)}, 'reached-' + process.pid), '');
`,
  );
  const p = plant(t, { 'a.test.mjs': PASSING });
  const r = runIn(p, ['full'], { env: { ...shellEnv(), NODE_OPTIONS: `--require ${JSON.stringify(preload.replace(/\\/g, '/'))}` } });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.last, 'RESULT: full tier, 1 files, pass');
  assert.deepEqual(readdirSync(marks), [], 'the preload ran in a process the runner started');
});

test('shell: --record writes a scrubbed copy with only placeholders, outside the repo', t => {
  const p = plant(t, {
    'r.test.mjs': `import { test } from 'node:test';
import { homedir, tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
test('planted paths', () => { throw new Error(['REPO=' + process.cwd(), 'HOME=' + homedir(), 'TMP=' + tmpdir(), 'URL=' + pathToFileURL(homedir()).href].join(' | ')); });
`,
  });
  const rec = join(tempDir(t, 'pact-rec-'), 'record.txt');
  const r = runIn(p, ['full', '--reporter', 'tap', '--record', rec]);
  assert.equal(r.code, 1);
  assert.equal(r.last, 'RESULT: full tier, 1 files, fail (exit 1)');
  const text = readFileSync(rec, 'utf8');
  assert.deepEqual(leakedLines(text), [], 'the record holds no local path');
  for (const local of [p.root, homedir(), tmpdir()]) assert.ok(!text.toLowerCase().includes(local.toLowerCase()), 'a local folder survived the scrub');
  assert.match(text, /REPO=<repo>/);
  assert.match(text, /HOME=<home>/);
  assert.match(text, /TMP=<tmp>/);
  assert.match(text, /URL=file:\/\/\/?<home>/);
  assert.match(text, /^not ok \d+ - planted paths$/m);
  assert.equal(text.trimEnd().split('\n').pop(), 'RESULT: full tier, 1 files, fail (exit 1)');
});

test('shell: a local path that survives the scrub fails the record closed: exit 3 and no file', t => {
  const p = plant(t, { 'q.test.mjs': `import { test } from 'node:test';\ntest('left over', () => { console.log('at ' + 'Q:' + '\\\\nowhere\\\\x'); });\n` });
  const rec = join(tempDir(t, 'pact-rec-'), 'record.txt');
  const r = runIn(p, ['full', '--record', rec]);
  assert.equal(r.code, 3);
  assert.match(r.last, /^RESULT: full tier, 1 files, pass; record refused$/);
  assert.ok(!existsSync(rec), 'no record is written');
});

test('shell: --list prints the pick and runs nothing', t => {
  const p = plant(t, { 'a.test.mjs': FAILING });
  const r = runIn(p, ['full', '--list']);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, 'gate/tests/a.test.mjs\tfast tier\n');
  assert.equal(r.last, 'RESULT: full tier, 1 files, listed, not run');
});
