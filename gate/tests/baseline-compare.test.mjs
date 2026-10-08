// The no-loss compare (#140, T5): each rule seen to fail with a planted list or
// record, beside a control that passes. Records are built here from the real
// baseline, in the shape the runner's record mode writes; the compare is
// called in-process, and its command line is run as a child for the wiring.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BASELINE_SHA256, LISTS_DIR, LIST_FILES, compare, parseRecord, registeredRows } from './baseline-compare.mjs';
import { leakedLines } from './run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SCRIPT = join(HERE, 'baseline-compare.mjs');
const REAL = Object.fromEntries(Object.entries(LIST_FILES).map(([k, f]) => [k, readFileSync(join(REPO, LISTS_DIR, f))]));
const USER = userInfo().username;

const BASE = REAL.baseline
  .toString('utf8')
  .split('\n')
  .filter(Boolean)
  .map(l => {
    const [status, file, name] = l.split('\t');
    return { status, file, name };
  });
/** How many cases the real map moves, and the line a line appended to it lands on. */
const MOVE_LINES = REAL.moves.toString('utf8').split('\n').slice(0, -1);
const MOVED = MOVE_LINES.filter(l => l && !l.startsWith('#')).length;
const NEXT_LINE = MOVE_LINES.length + 1;
const tsv = rows => rows.map(r => `${r.join('\t')}\n`).join('');
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A record as the runner's record mode writes it: its own lines, the junit report, the RESULT line. */
function recordOf(cases, { sep = '\\', suite = null } = {}) {
  const tc = c => {
    const file = `&lt;repo&gt;${sep}gate${sep}tests${sep}${c.file.slice('gate/tests/'.length).split('/').join(sep)}`;
    const head = `<testcase name="${esc(c.name)}" time="0.1" classname="test" file="${file}"`;
    if (c.status === 'skip') return `\t${head}>\n\t\t<skipped type="skipped" message="not run"/>\n\t</testcase>`;
    if (c.status === 'fail') return `\t${head}>\n\t\t<failure type="testCodeFailure" message="x">\nboom\n\t\t</failure>\n\t</testcase>`;
    return `\t${head}/>`;
  };
  const body = cases.map(tc).join('\n');
  const nested = suite ? `\n\t<testsuite name="${esc(suite.name)}" tests="${suite.cases.length}" hostname="<host>">\n${suite.cases.map(tc).join('\n')}\n\t</testsuite>` : '';
  return `run: tier full, cap 4, reporter junit\npick: gate/tests/x.test.mjs (full tier)\n<?xml version="1.0" encoding="utf-8"?>\n<testsuites>\n${body}${nested}\n\t<!-- tests ${cases.length} -->\n</testsuites>\nRESULT: full tier, 37 files, pass\n`;
}

/** The baseline after the real moves: what a run that lost nothing holds. */
function homeRun() {
  const moves = new Map();
  for (const l of REAL.moves.toString('utf8').split('\n')) {
    if (!l || l.startsWith('#')) continue;
    const [of, on, nf, nn] = l.split('\t');
    moves.set(`${of}\t${on}`, { file: nf, name: nn });
  }
  return BASE.map(c => ({ ...c, ...(moves.get(`${c.file}\t${c.name}`) ?? {}) }));
}

/** A test file's source from the repo, as the command line reads it. */
const repoSource = f => {
  try {
    return readFileSync(join(REPO, f), 'utf8');
  } catch {
    return null;
  }
};

const run = (over = {}, { cases = homeRun(), sep = '\\', names = [USER], source = repoSource, record } = {}) => compare({ lists: { ...REAL, ...over }, record: record ?? recordOf(cases, { sep }), names, source });

function fails(r, pattern) {
  assert.equal(r.ok, false, r.lines.join('\n'));
  assert.match(r.lines.at(-1), /^RESULT: compare fail, \d+ problems$/);
  assert.ok(
    r.lines.some(l => pattern.test(l)),
    `no line matches ${pattern}:\n${r.lines.join('\n')}`,
  );
}

/** The output names no local path or name, and none of the planted text. */
function noLeak(r, planted) {
  assert.deepEqual(leakedLines(r.lines.join('\n'), [USER]), [], 'the output holds a local path or name');
  for (const p of planted) assert.ok(!r.lines.join('\n').includes(p), 'the output echoes the planted text');
}

const plusMove = (...rows) => Buffer.concat([REAL.moves, Buffer.from(tsv(rows))]);
const A = BASE.find(c => c.file === 'gate/tests/render.test.mjs' && c.status === 'pass');
const B = BASE.filter(c => c.file === 'gate/tests/render.test.mjs' && c.status === 'pass')[1];
const LISTED_LINUX = BASE.find(c => c.name === 'bad case: an agent file that is a link is refused');
const withStatus = (cases, target, status) => cases.map(c => (c.file === target.file && c.name === target.name ? { ...c, status } : c));
const TABLE_SRC = "import { table } from './tables.mjs';\ntable('render edit list', { rows: [{ id: 'unknown-mark', fails: ['edit-mark'] }] });\n";

// ------------------------------------------------------------ the control

test('control: the real lists and a run that lost nothing pass, with the counts printed', () => {
  const r = run();
  assert.equal(r.ok, true, r.lines.join('\n'));
  assert.equal(r.lines.at(-1), `RESULT: compare pass, unchanged ${BASE.length - MOVED}, moved ${MOVED}, new 0`);
});

test('control: the baseline file is the T1 list, by its hash', () => {
  assert.equal(BASE.length, 1651);
  assert.equal(BASELINE_SHA256.slice(0, 8), '14af7916');
});

test('a new case in the run counts as new, and passes', () => {
  const r = run({}, { cases: [...homeRun(), { status: 'pass', file: 'gate/tests/new.test.mjs', name: 'a new case' }] });
  assert.equal(r.ok, true, r.lines.join('\n'));
  assert.match(r.lines.at(-1), /, new 1$/);
});

// ------------------------------------------------------------ S4's bad cases

test('bad case: a dropped case fails', () => {
  fails(run({}, { cases: homeRun().filter(c => !(c.file === A.file && c.name === A.name)) }), /^gone: gate\/tests\/render\.test\.mjs : /);
});

test('bad case: one of two baseline cases that share a name, dropped, fails', () => {
  const seen = new Set();
  const twice = BASE.find(c => {
    const k = `${c.file}\t${c.name}`;
    if (seen.has(k)) return true;
    seen.add(k);
    return false;
  });
  assert.ok(twice, 'the baseline holds a repeated name');
  const cases = homeRun();
  cases.splice(cases.findIndex(c => c.file === twice.file && c.name === twice.name), 1);
  fails(run({}, { cases }), /^gone: .* \(1 of 2 cases of this name\)$/);
});

test('bad case: a map line to a target missing from the run fails', () => {
  const r = run({ moves: plusMove([A.file, A.name, 'gate/tests/elsewhere.test.mjs', A.name]) });
  fails(r, /^moved, target missing: /);
});

test('bad case: a changed status fails', () => {
  fails(run({}, { cases: withStatus(homeRun(), A, 'fail') }), /^record: a case failed in gate\/tests\/render\.test\.mjs: /);
});

test('bad case: an unlisted case that goes from pass to skip fails', () => {
  fails(run({}, { cases: withStatus(homeRun(), A, 'skip') }), /^status pass -> skip: /);
});

test('bad case: two map lines naming one target fail', () => {
  const to = 'gate/tests/moved.test.mjs';
  const cases = homeRun().filter(c => !(c.file === A.file && c.name === A.name) && !(c.file === B.file && c.name === B.name));
  const r = run({ moves: plusMove([A.file, A.name, to, A.name], [B.file, B.name, to, A.name]) }, { cases: [...cases, { status: 'pass', file: to, name: A.name }] });
  fails(r, /names the same target as line/);
});

test('bad case: a map target that is itself an unchanged baseline case fails', () => {
  fails(run({ moves: plusMove([A.file, A.name, B.file, B.name]) }), /its target is a baseline case that stays where it is/);
});

test('bad case: an edited baseline fails on its hash', () => {
  const edited = Buffer.from(REAL.baseline);
  edited[edited.indexOf('pass')] = 'P'.charCodeAt(0);
  fails(run({ baseline: edited }), /does not match its sha256/);
});

test('bad case: a move line that renames a case to a plain test whose name looks like a row fails', () => {
  const to = 'render edit list: unknown-mark';
  const cases = homeRun().map(c => (c.file === A.file && c.name === A.name ? { ...c, name: to } : c));
  const plain = `import { test } from 'node:test';\ntest('render edit list: unknown-mark', () => {});\n`;
  fails(run({ moves: plusMove([A.file, A.name, A.file, to]) }, { cases, source: f => (f === A.file ? plain : repoSource(f)) }), /the new name is not a row its file registers/);
  // control: the same line passes when the file registers the row.
  const ok = run({ moves: plusMove([A.file, A.name, A.file, to]) }, { cases, source: f => (f === A.file ? TABLE_SRC : repoSource(f)) });
  assert.equal(ok.ok, true, ok.lines.join('\n'));
});

test('bad case: a move line that maps a case onto a real row in a different file fails', () => {
  const to = 'render edit list: unknown-mark';
  const other = 'gate/tests/other.test.mjs';
  const cases = [...homeRun().filter(c => !(c.file === A.file && c.name === A.name)), { status: 'pass', file: other, name: to }];
  fails(run({ moves: plusMove([A.file, A.name, other, to]) }, { cases, source: f => (f === other ? TABLE_SRC : repoSource(f)) }), /changes a name and a file at once/);
});

test('bad case: a rename to anything but "<table>: <row id>" fails', () => {
  const cases = homeRun().map(c => (c.file === A.file && c.name === A.name ? { ...c, name: 'a better name' } : c));
  fails(run({ moves: plusMove([A.file, A.name, A.file, 'a better name']) }, { cases }), /the new name is not "<table>: <row id>"/);
});

test('bad case: a move line that moves no baseline case fails', () => {
  fails(run({ moves: plusMove(['gate/tests/render.test.mjs', 'no such case', 'gate/tests/x.test.mjs', 'no such case']) }), /moves no baseline case/);
});

// ------------------------------------------------------------ leaks: reported by file and line, never echoed

test('bad case: a move line holding a drive-letter path fails, by line number, and the output holds no leak', () => {
  const line = [A.file, A.name, 'C:\\work\\gate\\tests\\x.test.mjs', A.name];
  const r = run({ moves: plusMove(line) });
  fails(r, new RegExp(`^leak: gate/tests/fixtures/baseline-140/moves\\.tsv line ${NEXT_LINE} holds a local path or name$`));
  noLeak(r, ['C:\\work']);
});

test('bad case: a move line holding the user name as a whole word fails; with the names left out of the call it passes', () => {
  const moves = Buffer.concat([REAL.moves, Buffer.from(`# moved by ${USER} on their machine\n`)]);
  const r = run({ moves });
  fails(r, new RegExp(`^leak: gate/tests/fixtures/baseline-140/moves\\.tsv line ${NEXT_LINE} `));
  noLeak(r, [`moved by ${USER}`]);
  const blind = run({ moves }, { names: [] });
  assert.equal(blind.ok, true, blind.lines.join('\n'));
});

test('bad case: an env-cases reason holding a drive-letter path fails, and the output holds no leak', () => {
  const envCases = Buffer.concat([REAL.envCases, Buffer.from(tsv([[A.file, A.name, 'windows', 'seen at D:/builds/pact']]))]);
  const r = run({ envCases });
  fails(r, /^leak: gate\/tests\/fixtures\/baseline-140\/env-cases\.tsv line \d+ holds a local path or name$/);
  noLeak(r, ['D:/builds']);
});

test('bad case: a leak in the baseline or the reporter names is reported the same way', () => {
  const reporterNames = Buffer.concat([REAL.reporterNames, Buffer.from(tsv([[A.file, A.name, '/home/someone/x']]))]);
  const r = run({ reporterNames });
  fails(r, /^leak: gate\/tests\/fixtures\/baseline-140\/reporter-names\.tsv line \d+ /);
  noLeak(r, ['/home/someone']);
});

// ------------------------------------------------------------ the machine-dependent list

test('a listed case that skips off its named platform passes the compare', () => {
  const r = run({}, { cases: withStatus(homeRun(), LISTED_LINUX, 'skip'), sep: '\\' });
  assert.equal(r.ok, true, r.lines.join('\n'));
});

test('bad case: the same listed case skipping on its named platform fails', () => {
  fails(run({}, { cases: withStatus(homeRun(), LISTED_LINUX, 'skip'), sep: '/' }), /^skipped on linux, where it must pass: /);
});

test('a Linux run where the Linux-listed cases pass and the Windows-listed ones skip passes the compare', () => {
  const envRows = REAL.envCases
    .toString('utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split('\t'));
  const onLinux = new Map(envRows.map(([file, name, platform]) => [`${file}\t${name}`, platform === 'linux' ? 'pass' : 'skip']));
  const r = run({}, { cases: homeRun().map(c => ({ ...c, status: onLinux.get(`${c.file}\t${c.name}`) ?? c.status })), sep: '/' });
  assert.equal(r.ok, true, r.lines.join('\n'));
});

test('bad case: a listed case that fails is never accepted', () => {
  fails(run({}, { cases: withStatus(homeRun(), LISTED_LINUX, 'fail'), sep: '\\' }), /^record: a case failed in gate\/tests\/agent-settings\.test\.mjs: /);
});

test('bad case: a malformed env-cases line fails: an unknown platform, or a case not in the baseline', () => {
  fails(run({ envCases: Buffer.concat([REAL.envCases, Buffer.from(tsv([[A.file, A.name, 'macos', 'why']]))]) }), /the platform is not one of linux, windows/);
  fails(run({ envCases: Buffer.concat([REAL.envCases, Buffer.from(tsv([[A.file, 'no such case', 'linux', 'why']]))]) }), /names no baseline case/);
});

// ------------------------------------------------------------ reporter names

test('a reporter-names line maps a baseline case to the name the report gives it', () => {
  const cases = homeRun().map(c => (c.file === A.file && c.name === A.name ? { ...c, name: 'the reported name' } : c));
  fails(run({}, { cases }), /^gone: /);
  const r = run({ reporterNames: Buffer.concat([REAL.reporterNames, Buffer.from(tsv([[A.file, A.name, 'the reported name']]))]) }, { cases });
  assert.equal(r.ok, true, r.lines.join('\n'));
});

// ------------------------------------------------------------ the record

test('bad case: a record with no junit report, or two, fails', () => {
  fails(run({}, { record: 'run: tier full\nRESULT: full tier, 37 files, pass\n' }), /^record: the record holds no single junit report$/);
  const one = recordOf(homeRun());
  fails(run({}, { record: one + one }), /^record: the record holds no single junit report$/);
});

test('bad case: text inside the junit report that is not a tag fails', () => {
  const r = recordOf(homeRun()).replace('<!-- tests', 'stray text\n\t<!-- tests');
  fails(run({}, { record: r }), /^record: the junit report holds text that is not a tag$/);
});

test('bad case: a record whose file paths mix both separators fails', () => {
  const cases = homeRun();
  const mixed = recordOf(cases).replace('&lt;repo&gt;\\gate\\tests\\', '&lt;repo&gt;/gate/tests/');
  fails(run({}, { record: mixed }), /the platform of the record cannot be read/);
});

test('a nested case is named by its suite chain, as the baseline names it', () => {
  const nested = BASE.find(c => c.name.includes(' > '));
  assert.ok(nested, 'the baseline holds a nested case');
  const [suite, ...rest] = nested.name.split(' > ');
  const cases = homeRun().filter(c => !(c.file === nested.file && c.name === nested.name));
  const r = run({}, { record: recordOf(cases, { suite: { name: suite, cases: [{ ...nested, name: rest.join(' > ') }] } }) });
  assert.equal(r.ok, true, r.lines.join('\n'));
  const p = parseRecord(recordOf([], { suite: { name: suite, cases: [{ ...nested, name: rest.join(' > ') }] } }));
  assert.deepEqual(p.cases, [{ file: nested.file, name: nested.name, status: nested.status }]);
});

test('a name the report escapes twice reads as the baseline holds it', () => {
  const quoted = BASE.find(c => c.name.includes('&quot;'));
  const p = parseRecord(recordOf([quoted]));
  assert.equal(p.cases[0].name, quoted.name);
  assert.equal(p.platform, 'windows');
});

// ------------------------------------------------------------ a table's rows, read from source

test('registeredRows finds a table and its rows by string literals, under an import alias too', () => {
  assert.deepEqual([...registeredRows(TABLE_SRC).get('render edit list')], ['unknown-mark']);
  const alias = "import { table as tbl } from './tables.mjs';\ntbl('t', { rows: [{ id: 'a-b', fails: ['x'] }, { why: 'w', id: 'c' }] });\n";
  assert.deepEqual([...registeredRows(alias).get('t')].sort(), ['a-b', 'c']);
});

test('registeredRows reads past regex literals: a row after several says patterns is still found', () => {
  const rows = Array.from({ length: 6 }, (_, i) => `{ id: 'r${i}', fails: ['x'], says: /a (b) [c] {d}/, why: 'w' }`).join(',\n');
  const src = `import { table } from './tables.mjs';\ntable('t', { rows: [\n${rows}\n] });\n`;
  assert.deepEqual([...registeredRows(src).get('t')], ['r0', 'r1', 'r2', 'r3', 'r4', 'r5']);
});

test('the render-edits file registers every row its moves name', () => {
  const src = readFileSync(join(HERE, 'render-edits.test.mjs'), 'utf8');
  const rows = registeredRows(src);
  for (const l of REAL.moves.toString('utf8').split('\n')) {
    if (!l || l.startsWith('#')) continue;
    const [of, , nf, nn] = l.split('\t');
    if (of !== nf) continue;
    const cut = nn.lastIndexOf(': ');
    assert.ok(rows.get(nn.slice(0, cut))?.has(nn.slice(cut + 2)), nn);
  }
});

test('bad case: registeredRows finds no row in a comment, a string, a variable, or a file that does not import the table module', () => {
  const noImport = "table('t', { rows: [{ id: 'a' }] });\n";
  assert.equal(registeredRows(noImport).size, 0);
  const inComment = "import { table } from './tables.mjs';\n// table('t', { rows: [{ id: 'a' }] });\n";
  assert.equal(registeredRows(inComment).size, 0);
  const inString = "import { table } from './tables.mjs';\nconst s = \"table('t', { rows: [{ id: 'a' }] })\";\n";
  assert.equal(registeredRows(inString).size, 0);
  const inVar = "import { table } from './tables.mjs';\nconst ID = 'a';\ntable('t', { rows: [{ id: ID }] });\n";
  assert.deepEqual([...registeredRows(inVar).get('t')], []);
  const otherModule = "import { table } from './other.mjs';\ntable('t', { rows: [{ id: 'a' }] });\n";
  assert.equal(registeredRows(otherModule).size, 0);
});

// ------------------------------------------------------------ the command line

function cli(t, record) {
  const dir = mkdtempSync(join(tmpdir(), 'pact-compare-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const f = join(dir, 'record.txt');
  writeFileSync(f, record);
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, [SCRIPT, f], { cwd: REPO, encoding: 'utf8', env });
}

test('the command line passes a run that lost nothing, with exit 0 and the RESULT line last', t => {
  const r = cli(t, recordOf(homeRun()));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.trimEnd().split('\n').at(-1), `RESULT: compare pass, unchanged ${BASE.length - MOVED}, moved ${MOVED}, new 0`);
});

test('bad case: the command line fails a dropped case with exit 1', t => {
  const r = cli(t, recordOf(homeRun().slice(1)));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^gone: /m);
  assert.match(r.stdout.trimEnd().split('\n').at(-1), /^RESULT: compare fail, 1 problems$/);
});

test('bad case: the command line refuses no record, or an option, with exit 2', t => {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_TEST_CONTEXT;
  for (const args of [[], ['--help'], ['a', 'b']]) {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8', env });
    assert.equal(r.status, 2, r.stdout);
    assert.match(r.stdout, /RESULT: compare refused, usage/);
  }
  const missing = spawnSync(process.execPath, [SCRIPT, join(tmpdir(), 'pact-no-such-record.txt')], { cwd: REPO, encoding: 'utf8', env });
  assert.equal(missing.status, 2, missing.stdout);
  assert.match(missing.stdout, /RESULT: compare refused, no record/);
  t.diagnostic('no record was found, as planned');
});
