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
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, hostname, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tempDir } from './tree.mjs';
import { COPY_DIRS, COPY_FILES } from './copy-list.mjs';
import { CAP, MAX_CHANGED, PLAIN_NAME, leakedLines, makeScrub, namesInstallScript, parseArgs, pathNames, pick, relativeImports, stringLiterals, verdict } from './run.mjs';

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

test('pick: a helper name with odd characters is printed with them replaced', () => {
  const odd = 'hé$.mjs';
  const sources = new Map([
    ['a.test.mjs', imp(`./${odd}`)],
    [odd, imp(`./${HARNESS}`)],
    [HARNESS, ''],
  ]);
  const [f] = pick({ tier: 'full', entries: entries(['a.test.mjs']), sources }).files;
  assert.equal(f.reason, `install tier: imports h??.mjs -> ${HARNESS}`);
});

test('pick: an unknown tier throws', () => {
  assert.throws(() => pick({ tier: 'nope', entries: [], sources: new Map() }), /unknown tier/);
});

// ------------------------------------------------------------ pick: the changed tier (S5)

// The real copy list; its install-script entry is never written out here, which would put this file in the install tier.
const COPY = { dirs: COPY_DIRS, files: COPY_FILES };
const INSTALL_SCRIPT_PATH = COPY_FILES.find(f => f.startsWith('scripts/'));
const PASS_SRC = "import { test } from 'node:test';\n";

/** A planted tree for the changed tier: a fast file, two install files, the smoke file and the harness. */
function changedTree(extra = {}) {
  return new Map([
    ['plain.test.mjs', PASS_SRC],
    ['agent.test.mjs', `${imp(`./${HARNESS}`)}const f = join(REPO, 'claude', 'agents', 'scout.md');\n`],
    ['other-install.test.mjs', `${imp(`./${HARNESS}`)}const f = 'familiars/x.md';\n`],
    [SMOKE_NAME, imp(`./${HARNESS}`)],
    [HARNESS, ''],
    ...Object.entries(extra),
  ]);
}
const SMOKE_NAME = 'install-smoke.test.mjs';

/** The changed tier's picks alone (picks only), as { files: Map(file -> reason), unmapped }. */
function changedPicks(sources, changed, opts = {}) {
  const names = [...sources.keys()].filter(k => !k.includes('/') && k.endsWith('.test.mjs'));
  const r = pick({ tier: 'changed', entries: entries(names), sources, copyList: COPY, changed, withFast: false, ...opts });
  return { files: new Map(r.files.map(f => [f.file, f.reason])), unmapped: r.unmapped, refused: r.refused };
}

test('changed: a changed test file runs itself, and only itself when nothing else maps', () => {
  const r = changedPicks(changedTree(), ['gate/tests/plain.test.mjs']);
  assert.deepEqual([...r.files.keys()], ['plain.test.mjs']);
  assert.equal(r.files.get('plain.test.mjs'), 'changed');
  assert.deepEqual(r.unmapped, []);
});

test('changed: gate code, and the install script, select the full tier', () => {
  assert.ok(INSTALL_SCRIPT_PATH, 'the copy list holds the install script');
  for (const p of ['gate/seam-a.mjs', 'gate/grimoire/check.mjs', INSTALL_SCRIPT_PATH]) {
    const r = changedPicks(changedTree(), [p]);
    assert.deepEqual([...r.files.keys()].sort(), ['agent.test.mjs', 'install-smoke.test.mjs', 'other-install.test.mjs', 'plain.test.mjs'], p);
    assert.match(r.files.get('plain.test.mjs'), /^gate code changed: /, p);
  }
});

test('changed: a payload path picks finely: the smoke set and the files that name it, not an install file that does not', () => {
  const r = changedPicks(changedTree(), ['claude/agents/scout.md']);
  assert.deepEqual([...r.files.keys()].sort(), ['agent.test.mjs', 'install-smoke.test.mjs']);
  assert.equal(r.files.get('agent.test.mjs'), 'names claude/agents/scout.md');
  assert.equal(r.files.get(SMOKE_NAME), 'install smoke set: payload claude/agents/scout.md');
  assert.deepEqual(r.unmapped, []);
});

test('changed: the example configuration picks the files that name it, here config-install and install-edits', () => {
  const sources = changedTree({
    'config-install.test.mjs': `${imp(`./${HARNESS}`)}const EXAMPLE = readFileSync(join(REPO, 'examples', 'pact-config', 'config.json'));\n`,
    'install-edits.test.mjs': `${imp(`./${HARNESS}`)}const block = readFileSync(join(REPO, 'examples', 'pact-config', 'blocks', 'x.md'));\n`,
  });
  const r = changedPicks(sources, ['examples/pact-config/config.json']);
  assert.deepEqual([...r.files.keys()].sort(), ['config-install.test.mjs', 'install-edits.test.mjs']);
  assert.equal(r.files.get('install-edits.test.mjs'), 'names examples/pact-config/config.json');
});

test('changed: a helper two imports deep picks every test that reaches it, and no other', () => {
  const sources = changedTree({
    'deep.test.mjs': imp('./h1.mjs'),
    'mid.test.mjs': imp('./sub/h2.mjs'),
    'h1.mjs': imp('./sub/h2.mjs'),
    'sub/h2.mjs': '',
  });
  const r = changedPicks(sources, ['gate/tests/sub/h2.mjs']);
  assert.deepEqual([...r.files.keys()].sort(), ['deep.test.mjs', 'mid.test.mjs']);
  assert.equal(r.files.get('deep.test.mjs'), 'imports changed gate/tests/sub/h2.mjs');
});

test('changed: a path only a test\'s text names, written out, in pieces or through a helper, picks that test', () => {
  const sources = changedTree({
    'out.test.mjs': "const p = 'notes/plans/today.md';\n",
    'pieces.test.mjs': "const p = join(root, 'notes', 'plans');\n",
    'via.test.mjs': imp('./names.mjs'),
    'names.mjs': "export const P = ['notes', 'plans', 'today.md'];\n",
    'file.test.mjs': "const p = `${dir}/today.md`;\n",
    'none.test.mjs': "const p = 'notes/other.md';\n",
  });
  const r = changedPicks(sources, ['notes/plans/today.md']);
  assert.deepEqual([...r.files.keys()].sort(), ['file.test.mjs', 'out.test.mjs', 'pieces.test.mjs', 'via.test.mjs']);
  assert.equal(r.files.get('via.test.mjs'), 'names notes/plans/today.md in names.mjs');
  assert.deepEqual(r.unmapped, []);
});

test('changed: a new ADR picks docs-index, by the real docs-index source', () => {
  const sources = changedTree({ 'docs-index.test.mjs': readFileSync(join(HERE, 'docs-index.test.mjs'), 'utf8') });
  const r = changedPicks(sources, ['docs/adr/0099-a-new-decision.md']);
  assert.deepEqual([...r.files.keys()], ['docs-index.test.mjs']);
});

test('changed: an unmapped path runs the fast tier, plus the smoke set under the copy list, and is listed', () => {
  const root = changedPicks(changedTree(), ['CONTEXT.md']);
  assert.deepEqual([...root.files.keys()], ['plain.test.mjs']);
  assert.equal(root.files.get('plain.test.mjs'), 'fast tier: a changed path is unmapped');
  assert.deepEqual(root.unmapped, ['CONTEXT.md']);
  const payload = changedPicks(changedTree(), ['cross/unnamed.mjs']);
  assert.deepEqual([...payload.files.keys()].sort(), ['install-smoke.test.mjs', 'plain.test.mjs']);
  assert.deepEqual(payload.unmapped, ['cross/unnamed.mjs']);
});

test('changed: a test file or module in the tests folder maps by imports and its file name, not by a test naming its folder', () => {
  const sources = changedTree({ 'lister.test.mjs': "const d = join(REPO, 'gate', 'tests');\n", 'orphan.mjs': '' });
  const own = changedPicks(sources, ['gate/tests/plain.test.mjs']);
  assert.deepEqual([...own.files.keys()], ['plain.test.mjs']);
  assert.deepEqual(own.unmapped, []);
  const orphan = changedPicks(sources, ['gate/tests/orphan.mjs']);
  assert.deepEqual(orphan.unmapped, ['gate/tests/orphan.mjs'], 'a module nothing imports or names is unmapped, so fast runs');
  assert.equal(orphan.files.get('lister.test.mjs'), 'fast tier: a changed path is unmapped');
  const fixture = changedPicks(sources, ['gate/tests/fixtures/x.txt']);
  assert.deepEqual([...fixture.files.keys()], ['lister.test.mjs'], 'a fixture is named by its folder');
});

test('changed: a module in the tests folder that a test loads by path, not by import, picks that test', () => {
  const sources = changedTree({
    'loader.test.mjs': `${imp(`./${HARNESS}`)}spawnSync(process.execPath, [join(HERE, 'fixtures', 'driver.mjs')]);\n`,
    'importer.test.mjs': imp('./fixtures/driver.mjs'),
    'fixtures/driver.mjs': '',
  });
  const r = changedPicks(sources, ['gate/tests/fixtures/driver.mjs']);
  assert.deepEqual([...r.files.keys()].sort(), ['importer.test.mjs', 'loader.test.mjs']);
  assert.equal(r.files.get('loader.test.mjs'), 'names gate/tests/fixtures/driver.mjs');
  assert.equal(r.files.get('importer.test.mjs'), 'imports changed gate/tests/fixtures/driver.mjs');
  assert.deepEqual(r.unmapped, []);
});

test('changed: more changed paths than the bound select every test, without mapping each', () => {
  const many = Array.from({ length: MAX_CHANGED + 1 }, (_, i) => `notes/n${i}.md`);
  const r = changedPicks(changedTree(), many);
  assert.deepEqual([...r.files.keys()].sort(), ['agent.test.mjs', 'install-smoke.test.mjs', 'other-install.test.mjs', 'plain.test.mjs']);
  assert.equal(r.files.get('agent.test.mjs'), `over ${MAX_CHANGED} changed paths (${MAX_CHANGED + 1})`);
  assert.deepEqual(r.unmapped, []);
  const at = changedPicks(changedTree(), many.slice(0, MAX_CHANGED));
  assert.deepEqual([...at.files.keys()], ['plain.test.mjs'], 'at the bound, each path is still mapped');
});

test('changed: deleted and renamed paths count as changed paths like any other', () => {
  // The git side lists a deletion and both sides of a rename; pick maps each path it is given.
  const sources = changedTree({ 'old.test.mjs': "const p = 'notes/old.md';\n", 'new.test.mjs': "const p = 'notes/new.md';\n" });
  const r = changedPicks(sources, ['notes/old.md', 'notes/new.md', 'gate/tests/gone.test.mjs']);
  assert.deepEqual([...r.files.keys()].sort(), ['new.test.mjs', 'old.test.mjs', 'plain.test.mjs']);
  assert.deepEqual(r.unmapped, ['gate/tests/gone.test.mjs'], 'a deleted test file runs nothing itself, so fast runs');
});

test('changed: with the fast tier on, fast is added and never an install file that no rule picked', () => {
  const sources = changedTree();
  const names = [...sources.keys()].filter(k => !k.includes('/') && k.endsWith('.test.mjs'));
  const r = pick({ tier: 'changed', entries: entries(names), sources, copyList: COPY, changed: ['docs/nothing.md'], withFast: true });
  assert.deepEqual(
    r.files.map(f => f.file),
    ['plain.test.mjs'],
  );
  const none = pick({ tier: 'changed', entries: entries(names), sources, copyList: COPY, changed: [], withFast: true });
  assert.deepEqual(
    none.files.map(f => [f.file, f.reason]),
    [['plain.test.mjs', 'fast tier']],
  );
  assert.deepEqual(pick({ tier: 'changed', entries: entries(names), sources, copyList: COPY, changed: [], withFast: false }).files, []);
});

test('changed: a payload change with no smoke file throws rather than run without it', () => {
  const sources = changedTree();
  sources.delete(SMOKE_NAME);
  assert.throws(() => changedPicks(sources, ['claude/CLAUDE.md']), /smoke set/);
});

test('changed: a path with a control character is printed with it replaced', () => {
  const r = changedPicks(changedTree({ 'n.test.mjs': "const p = 'notes/a\u0001b';\n" }), ['notes/a\u0001b', 'odd\u0007name']);
  assert.match(r.files.get('n.test.mjs'), /^names notes\/a\?b;/);
  assert.deepEqual(r.unmapped, ['odd\u0007name'], 'pick returns the raw path; the shell prints it replaced');
});

test('pathNames: the file name and every run of two or more segments', () => {
  assert.deepEqual(pathNames('Docs/ADR/x.md').sort(), ['adr/x.md', 'docs/adr', 'docs/adr/x.md', 'x.md'].sort());
  assert.deepEqual(pathNames('AGENTS.md'), ['agents.md']);
});

test('the literal reader: comments are skipped, template pieces kept, a regex holding a quote is not a string', () => {
  assert.deepEqual(stringLiterals("// 'no'\nconst a = 'x'; /* \"no\" */ const b = `p${a}q`; const r = /'/; const c = \"y\";"), ['x', 'p', 'q', 'y']);
  assert.equal(namesInstallScript("const n = 'inst' + 'all.ps1';"), true);
  assert.equal(namesInstallScript("const n = 'install.ps2';"), false);
  assert.deepEqual(relativeImports("import a from './a.mjs';\nimport 'node:fs';\nexport * from \"../b.mjs\";\nawait import('./c.mjs');"), ['./a.mjs', '../b.mjs', './c.mjs']);
});

test('parseArgs: unknown tiers, reporters and options, and a missing value, are usage errors', () => {
  assert.deepEqual(parseArgs(['full', '--reporter', 'tap']).opts, { tier: 'full', reporter: 'tap', record: null, base: null, list: false });
  assert.equal(parseArgs(['fast', '--reporter=junit']).opts.reporter, 'junit');
  assert.equal(parseArgs(['changed']).opts.base, null, 'no base given; the shell uses the branch refs/heads/main');
  assert.equal(parseArgs(['changed', '--base', 'origin/main']).opts.base, 'origin/main');
  assert.equal(parseArgs(['changed', '--base=v1']).opts.base, 'v1');
  for (const bad of [[], ['nope'], ['full', 'fast'], ['full', '--reporter', 'xml'], ['full', '--reporter'], ['full', '--record'], ['full', '--bogus'], ['full', '--base', '-x'], ['full', '--base', 'main'], ['fast', '--base', 'main'], ['changed', '--base', '-x'], ['changed', '--base=-x'], ['changed', '--base'], ['changed', '--base=']]) {
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

test('the scrub replaces the host name, whole words only, in any case', () => {
  const scrub = makeScrub({ repo: '/r/x', home: '/h/x', tmp: '/t/x', user: 'bob', host: 'Build-Box7', win: false });
  assert.equal(scrub('<testsuites hostname="BUILD-BOX7"> build-box7 build-box77'), '<testsuites hostname="<host>"> <host> build-box77');
});

test('the leak check: Git Bash, WSL and network-share paths, and a named word, are leaks', () => {
  const text = ['at /c/Users/eve/x', 'at /mnt/d/work/x', "at '\\\\fileserver\\share\\x'", 'host BUILD-BOX7 here', 'fine <repo>\\\\gate\\\\tests and /r/x', 'not build-box77'].join('\n');
  assert.deepEqual(leakedLines(text, ['build-box7']), [1, 2, 3, 4]);
  assert.deepEqual(leakedLines('BUILD-BOX7'), [], 'with no words named, a bare name is not a path');
});

test('verdict: only a clean exit 0 with no error or signal is a pass', () => {
  assert.deepEqual(verdict({ code: 0, signal: null }), { result: 'pass', code: 0 });
  assert.deepEqual(verdict({ error: 'ENOENT' }), { result: 'fail (node did not start: ENOENT)', code: 1 });
  assert.deepEqual(verdict({ code: null, signal: 'SIGKILL' }), { result: 'fail (node killed by SIGKILL)', code: 1 });
  assert.deepEqual(verdict({ code: null, signal: null }), { result: 'fail (exit null)', code: 1 });
  assert.deepEqual(verdict({ code: 3, signal: null }), { result: 'fail (exit 3)', code: 1 });
  assert.deepEqual(verdict({ error: 'EACCES', code: 0, signal: null }).code, 1, 'an error wins over a zero code');
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
  for (const args of [['nope'], ['changed', '--base', '-x'], ['full', '--reporter', 'xml'], ['full', '--base', '-x'], ['full', '--base', 'main'], ['full', '--record', join(p.root, 'rec.txt')], []]) {
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
import { homedir, hostname, tmpdir } from 'node:os';
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

test('shell: a junit reporter reaches node, so stdout is junit XML', t => {
  const p = plant(t, { 'a.test.mjs': PASSING });
  const r = runIn(p, ['full', '--reporter', 'junit']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^<\?xml /);
  assert.match(r.stdout, /<testsuites>/);
  assert.match(r.stdout, /<testcase name="planted pass"/);
  assert.doesNotMatch(r.stdout, /^TAP version/m);
});

/** A link to `target` at `at`: a junction on Windows, which needs no admin rights, a symlink elsewhere. */
function link(target, at) {
  symlinkSync(target, at, WIN ? 'junction' : 'dir');
}

test('shell: started through a linked folder, the runner still runs and prints its last line', t => {
  const p = plant(t, { 'a.test.mjs': PASSING });
  const via = join(tempDir(t, 'pact-link-'), 'linked');
  link(p.root, via);
  const r = spawnSync(process.execPath, [join(via, 'gate', 'tests', 'run.mjs'), 'full'], { cwd: tmpdir(), env: shellEnv(), encoding: 'utf8', timeout: 120_000 });
  const lines = r.stderr.split(/\r?\n/).filter(Boolean);
  assert.equal(lines[lines.length - 1], 'RESULT: full tier, 1 files, pass');
  assert.equal(r.status, 0);
});

test('shell: a record path into the repo through a link is refused with exit 2', t => {
  const p = plant(t, { 'a.test.mjs': PASSING });
  const via = join(tempDir(t, 'pact-link-'), 'linked');
  link(p.root, via);
  const r = runIn(p, ['full', '--record', join(via, 'rec.txt')]);
  assert.equal(r.code, 2);
  assert.match(r.last, /^RESULT: refused, --record must name a file outside the repo$/);
  assert.ok(!existsSync(join(p.root, 'rec.txt')), 'no record is written inside the repo');
});

test('shell: --record replaces the host name', t => {
  const p = plant(t, { 'h.test.mjs': "import { describe, test } from 'node:test';\nimport { hostname } from 'node:os';\ndescribe('suite', () => { test('host', () => { throw new Error('HOST=' + hostname()); }); });\n" });
  const rec = join(tempDir(t, 'pact-rec-'), 'record.txt');
  const r = runIn(p, ['full', '--reporter', 'junit', '--record', rec]);
  assert.equal(r.code, 1, r.last);
  const text = readFileSync(rec, 'utf8');
  assert.match(text, /HOST=<host>/);
  assert.match(text, /hostname="<host>"/);
  assert.ok(!new RegExp(`(?<![A-Za-z0-9])${hostname().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'i').test(text), 'the host name survived the scrub');
});
// ------------------------------------------------------------ the shell: the changed tier, on a planted git repo

/** git in `cwd`, with no inherited GIT_ variables; throws on failure. */
function g(cwd, ...args) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^GIT_/i.test(k)) env[k] = v;
  const r = spawnSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd, env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

/** A planted repo committed on main, with `files` beside the runner; returns the plant. */
function gitPlant(t, files = {}, root = {}) {
  const p = plant(t, files);
  for (const [rel, text] of Object.entries(root)) {
    const at = join(p.root, ...rel.split('/'));
    mkdirSync(dirname(at), { recursive: true });
    writeFileSync(at, text);
  }
  g(p.root, 'init', '-q', '-b', 'main');
  g(p.root, 'config', 'user.email', 'test@example.invalid');
  g(p.root, 'config', 'user.name', 'gate test');
  g(p.root, 'config', 'commit.gpgsign', 'false');
  g(p.root, 'add', '-A');
  g(p.root, 'commit', '-q', '-m', 'base');
  return p;
}

const unmappedLines = stderr => stderr.split(/\r?\n/).filter(l => l.startsWith('unmapped: ')).map(l => l.slice('unmapped: '.length).replace(/ \(no rule maps it, so the fast tier runs\)$/, ''));

test('shell: changed reads the merge-base diff, staged, unstaged, deleted, renamed and untracked paths, and skips ignored ones', t => {
  const p = gitPlant(t, { 'a.test.mjs': PASSING }, { 'notes/edit.md': 'a\n', 'notes/staged.md': 'a\n', 'notes/gone.md': 'a\n', 'notes/old-name.md': 'a\n', 'notes/committed.md': 'a\n', 'notes/undone.md': 'a\n', '.gitignore': 'ignored.md\n' });
  g(p.root, 'checkout', '-q', '-b', 'work');
  writeFileSync(join(p.root, 'notes', 'committed.md'), 'b\n');
  g(p.root, 'commit', '-q', '-am', 'on the branch');
  // main moves on after the branch: its change is not the branch's, so it must not count.
  g(p.root, 'checkout', '-q', 'main');
  writeFileSync(join(p.root, 'notes', 'main-only.md'), 'a\n');
  g(p.root, 'add', 'notes/main-only.md');
  g(p.root, 'commit', '-q', '-m', 'on main after the branch');
  g(p.root, 'checkout', '-q', 'work');
  // A staged change that the working copy then undoes still counts.
  writeFileSync(join(p.root, 'notes', 'undone.md'), 'b\n');
  g(p.root, 'add', 'notes/undone.md');
  writeFileSync(join(p.root, 'notes', 'undone.md'), 'a\n');
  writeFileSync(join(p.root, 'notes', 'edit.md'), 'b\n');
  writeFileSync(join(p.root, 'notes', 'staged.md'), 'b\n');
  g(p.root, 'add', 'notes/staged.md');
  g(p.root, 'rm', '-q', 'notes/gone.md');
  g(p.root, 'mv', 'notes/old-name.md', 'notes/new-name.md');
  writeFileSync(join(p.root, 'notes', 'fresh.md'), 'new\n');
  writeFileSync(join(p.root, 'ignored.md'), 'x\n');
  const r = runIn(p, ['changed', '--list'], { cwd: p.root });
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(unmappedLines(r.stderr), ['notes/committed.md', 'notes/edit.md', 'notes/fresh.md', 'notes/gone.md', 'notes/new-name.md', 'notes/old-name.md', 'notes/staged.md', 'notes/undone.md']);
  assert.match(r.stderr, /^run: tier changed, base main \([0-9a-f]{7}\), merge-base [0-9a-f]{7}, 8 changed paths, /m);
  assert.equal(r.stdout, 'gate/tests/a.test.mjs\tfast tier: a changed path is unmapped; fast tier\n');
});

test('shell: changed runs the picks, and a payload path brings in the smoke set', t => {
  const p = gitPlant(t, {
    'a.test.mjs': PASSING,
    'install-smoke.test.mjs': imp(`./${HARNESS}`) + PASSING,
    'names.test.mjs': imp(`./${HARNESS}`) + "const f = ['claude', 'agents', 'scout.md'];\n" + PASSING,
    'other.test.mjs': imp(`./${HARNESS}`) + PASSING,
    [HARNESS]: '',
  }, { 'claude/agents/scout.md': 'a\n' });
  writeFileSync(join(p.root, 'claude', 'agents', 'scout.md'), 'b\n');
  const r = runIn(p, ['changed', '--reporter', 'tap']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /^pick: gate\/tests\/names\.test\.mjs \(names claude\/agents\/scout\.md\)$/m);
  assert.match(r.stderr, /^pick: gate\/tests\/install-smoke\.test\.mjs \(install smoke set: payload claude\/agents\/scout\.md\)$/m);
  assert.match(r.stderr, /^pick: gate\/tests\/a\.test\.mjs \(fast tier\)$/m);
  assert.doesNotMatch(r.stderr, /other\.test\.mjs/);
  assert.equal(r.last, 'RESULT: changed tier, 3 files, pass');
  assert.match(r.stdout, /^# pass 3$/m);
});

test('shell: changed resolves the base before any other git call, and refuses one that is not a commit', t => {
  const p = gitPlant(t, { 'a.test.mjs': PASSING });
  const trace = join(tempDir(t, 'pact-trace-'), 'trace.txt');
  const r = runIn(p, ['changed', '--list'], { env: { ...shellEnv(), GIT_TRACE: trace } });
  assert.equal(r.code, 0, r.stderr);
  const cmds = [...readFileSync(trace, 'utf8').matchAll(/built-in: git (?:-c \S+ )*(\S+)/g)].map(m => m[1]);
  assert.equal(cmds[0], 'rev-parse', cmds.join(' '));
  assert.ok(cmds.includes('merge-base') && cmds.includes('diff') && cmds.includes('ls-files'), cmds.join(' '));
  for (const base of ['no-such-ref', 'HEAD:a', '--output=x']) {
    const bad = runIn(p, ['changed', `--base=${base}`]);
    assert.equal(bad.code, 2, base);
    assert.equal(bad.stdout, '', base);
    assert.match(bad.last, /^RESULT: refused, /, base);
  }
  assert.ok(!existsSync(join(p.root, 'x')), 'no option-shaped base reached git');
});

test('shell: an inherited GIT_DIR cannot point changed at another repo', t => {
  const p = gitPlant(t, { 'a.test.mjs': PASSING });
  const other = gitPlant(t, { 'b.test.mjs': PASSING }, { 'elsewhere.md': 'a\n' });
  writeFileSync(join(other.root, 'elsewhere.md'), 'b\n');
  const r = runIn(p, ['changed', '--list'], { env: { ...shellEnv(), GIT_DIR: join(other.root, '.git'), GIT_WORK_TREE: other.root } });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /, 0 changed paths, /);
  assert.deepEqual(unmappedLines(r.stderr), []);
});

test('shell: changed outside a git repo exits 2 and starts no node', t => {
  const p = plant(t, { 'a.test.mjs': PASSING });
  const r = runIn(p, ['changed']);
  assert.equal(r.code, 2);
  assert.equal(r.stdout, '');
  assert.match(r.last, /^RESULT: refused, the base main does not resolve to a commit$/);
});

test('shell: an untracked file with a control character in its name prints with it replaced', { skip: WIN && 'Windows file names cannot hold control characters (the Linux run covers it)' }, t => {
  const p = gitPlant(t, { 'a.test.mjs': PASSING });
  writeFileSync(join(p.root, 'odd\u0001name.md'), 'x\n');
  const r = runIn(p, ['changed', '--list']);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(unmappedLines(r.stderr), ['odd?name.md']);
  assert.doesNotMatch(r.stderr, /\u0001/);
});
test('shell: with no --base, a tag named main cannot stand in for the main branch', t => {
  const p = gitPlant(t, { 'a.test.mjs': PASSING }, { 'gate/x.mjs': 'a\n' });
  g(p.root, 'checkout', '-q', '-b', 'work');
  writeFileSync(join(p.root, 'gate', 'x.mjs'), 'b\n');
  g(p.root, 'commit', '-q', '-am', 'gate code on the branch');
  g(p.root, 'tag', 'main', 'HEAD');
  const r = runIn(p, ['changed', '--list']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /^run: tier changed, base main \([0-9a-f]{7}\), merge-base [0-9a-f]{7}, 1 changed paths, /m);
  assert.match(r.stderr, /^pick: gate\/tests\/a\.test\.mjs \(gate code changed: gate\/x\.mjs; fast tier\)$/m);
});

test('shell: a runner in a tree nested inside another git repo exits 2 and starts no node', t => {
  const outer = gitPlant(t, { 'o.test.mjs': PASSING });
  const root = join(outer.root, 'nested');
  const tests = join(root, 'gate', 'tests');
  mkdirSync(tests, { recursive: true });
  for (const f of ['run.mjs', 'copy-list.mjs']) copyFileSync(join(HERE, f), join(tests, f));
  writeFileSync(join(tests, 'a.test.mjs'), PASSING);
  const r = runIn({ root, tests }, ['changed']);
  assert.equal(r.code, 2, r.stderr);
  assert.equal(r.stdout, '');
  assert.equal(r.last, 'RESULT: refused, the runner is not at the top of its own git repository');
});

test('shell: an unmapped path with an odd character prints with it replaced', t => {
  const p = gitPlant(t, { 'a.test.mjs': PASSING });
  writeFileSync(join(p.root, 'odd$name.md'), 'x\n');
  const r = runIn(p, ['changed', '--list']);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(unmappedLines(r.stderr), ['odd?name.md']);
  assert.doesNotMatch(r.stderr, /odd\$name/);
});