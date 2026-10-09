// The no-loss compare (#140, T5): each rule seen to fail with a planted list or
// record, beside a control that passes. Records are built here from the real
// baseline, in the shape the runner's record mode writes; the compare is
// called in-process, and its command line is run as a child for the wiring.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir, userInfo } from 'node:os';
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
const TABLE_SRC = "import { test } from 'node:test';\nimport { table } from './tables.mjs';\nfor (const c of table('render edit list', { rows: [{ id: 'unknown-mark', fails: ['edit-mark'] }] })) test(c.name, c.fn);\n";

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

test('a listed case that skips off its named platform passes the compare; unlisted, the same skip fails', () => {
  // A Windows-listed case passes in the baseline; on a Linux record it may skip. Linux-listed cases pass there.
  const LISTED_WINDOWS = BASE.find(c => c.name === 'bad case: a node.cmd shim is not accepted as Node');
  assert.equal(LISTED_WINDOWS.status, 'pass', 'the case passes in the baseline, so a skip is a change');
  const linuxRun = homeRun().map(c => (c.status === 'skip' ? { ...c, status: 'pass' } : c));
  const cases = withStatus(linuxRun, LISTED_WINDOWS, 'skip');
  const r = run({}, { cases, sep: '/' });
  assert.equal(r.ok, true, r.lines.join('\n'));
  const unlisted = Buffer.from(REAL.envCases.toString('utf8').split('\n').filter(l => !l.includes(LISTED_WINDOWS.name)).join('\n'));
  fails(run({ envCases: unlisted }, { cases, sep: '/' }), /^status pass -> skip: gate\/tests\/install\.test\.mjs : bad case: a node\.cmd shim/);
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
  fails(run({ envCases: Buffer.concat([REAL.envCases, Buffer.from(tsv([[A.file, A.name, 'linux']]))]) }), /: not "<file>\\t<name>\\t<platform>\\t<why>"$/);
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

test('bad case: a record that names no file for its cases fails, as Node 20\'s junit reporter writes', () => {
  const bare = recordOf(homeRun()).replace(/ file="[^"]*"/g, '');
  fails(run({}, { record: bare }), /^record: the junit report names no test file under the repo for its cases/);
});

test('bad case: a case whose path only ends in a test file, outside the repo, is not that file\'s case', () => {
  const cases = homeRun();
  const decoy = recordOf(cases).replace(`file="&lt;repo&gt;\\gate\\tests\\${A.file.slice('gate/tests/'.length)}"`, `file="&lt;tmp&gt;\\gate\\tests\\${A.file.slice('gate/tests/'.length)}"`);
  assert.notEqual(decoy, recordOf(cases), 'the plant changed a path');
  const r = run({}, { record: decoy });
  fails(r, /^record: cases are reported under \(outside gate\/tests\), which is not a top-level test file$/);
});

test('bad case: a failed case\'s path is printed with odd characters replaced', () => {
  const odd = withStatus(homeRun(), A, 'fail').map(c => (c.file === A.file && c.name === A.name ? { ...c, file: 'gate/tests/re`nder.test.mjs' } : c));
  const r = run({}, { cases: odd });
  fails(r, /^record: a case failed in gate\/tests\/re\?nder\.test\.mjs$/);
});

test('bad case: a record of another tier, or one whose run did not pass, fails, and says so where the user is named runner', () => {
  // The Linux image's user is runner: a fixed line holding that word would be withheld there.
  const names = [USER, 'runner'];
  const fast = recordOf(homeRun()).replace('run: tier full,', 'run: tier fast,');
  fails(run({}, { record: fast, names }), /^record: it is not one full-tier run/);
  const failed = recordOf(homeRun()).replace('RESULT: full tier, 37 files, pass', 'RESULT: full tier, 37 files, fail (exit 1)');
  fails(run({}, { record: failed, names }), /^record: its last line is not the full-tier pass$/);
  const two = `run: tier full, cap 4\n${recordOf(homeRun())}`;
  fails(run({}, { record: two, names }), /^record: it is not one full-tier run/);
});

test('bad case: a hand-kept line holding an email address fails, by line number, and the output holds no leak', () => {
  const moves = Buffer.concat([REAL.moves, Buffer.from('# moved by someone@example.org\n')]);
  const r = run({ moves }, { names: [] });
  fails(r, new RegExp(`^leak: gate/tests/fixtures/baseline-140/moves\\.tsv line ${NEXT_LINE} holds a local path or name$`));
  noLeak(r, ['someone@example.org']);
});

test('bad case: a record whose file paths mix both separators fails', () => {
  const cases = homeRun();
  const mixed = recordOf(cases).replace('&lt;repo&gt;\\gate\\tests\\', '&lt;repo&gt;/gate/tests/');
  fails(run({}, { record: mixed }), /the platform of the record cannot be read/);
});

test('bad case: cases reported under a module that is not a test file fail, as when a helper calls test()', () => {
  const cases = [...homeRun(), { status: 'pass', file: 'gate/tests/tables.mjs', name: 'render edit list: unknown-mark' }];
  fails(run({}, { cases }), /^record: cases are reported under gate\/tests\/tables\.mjs, which is not a top-level test file$/);
});

test('a failure\'s text may hold record mode\'s placeholders, and still parses', () => {
  const failed = recordOf(withStatus(homeRun(), A, 'fail')).replace('\nboom\n', '\n    at TestContext.&lt;anonymous> (file://<repo>/gate/tests/render.test.mjs:1:1)\n    at node:internal/test_<user>:1:1\n');
  fails(run({}, { record: failed }), /^record: a case failed in gate\/tests\/render\.test\.mjs: /);
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

/** A test file's source: the table import, then each table registered in a top-level loop. */
const IMP = "import { test } from 'node:test';\nimport { table } from './tables.mjs';\n";
const loop = (name, spec) => `for (const c of table('${name}', ${spec})) test(c.name, c.fn);\n`;

test('registeredRows finds a registered table and its rows by string literals', () => {
  assert.deepEqual([...registeredRows(TABLE_SRC).get('render edit list')], ['unknown-mark']);
  const src = IMP + loop('t', "{ rows: [{ id: 'a-b', fails: ['x'] }, { why: 'w', id: 'c' }] }");
  assert.deepEqual([...registeredRows(src).get('t')].sort(), ['a-b', 'c']);
});

test('registeredRows reads past regex literals: a row after several says patterns is still found', () => {
  const rows = Array.from({ length: 6 }, (_, i) => `{ id: 'r${i}', fails: ['x'], says: /a (b) [c] {d}/, why: 'w' }`).join(',\n');
  assert.deepEqual([...registeredRows(IMP + loop('t', `{ rows: [\n${rows}\n] }`)).get('t')], ['r0', 'r1', 'r2', 'r3', 'r4', 'r5']);
});

test('the render-edits file registers every row its moves name', () => {
  const src = readFileSync(join(HERE, 'render-edits.test.mjs'), 'utf8');
  const rows = registeredRows(src);
  for (const l of REAL.moves.toString('utf8').split('\n')) {
    if (!l || l.startsWith('#')) continue;
    const [of, , nf, nn] = l.split('\t');
    if (of !== nf || nf !== 'gate/tests/render-edits.test.mjs') continue;
    const cut = nn.lastIndexOf(': ');
    assert.ok(rows.get(nn.slice(0, cut))?.has(nn.slice(cut + 2)), nn);
  }
});

// #170 moved pact-text's cases into a table too: every same-file move, in
// any file, names a row that file registers.
test('every test file registers every row its moves name', () => {
  let checked = 0;
  for (const l of REAL.moves.toString('utf8').split('\n')) {
    if (!l || l.startsWith('#')) continue;
    const [of, , nf, nn] = l.split('\t');
    if (of !== nf) continue;
    const rows = registeredRows(readFileSync(join(REPO, ...nf.split('/')), 'utf8'));
    const cut = nn.lastIndexOf(': ');
    assert.ok(rows.get(nn.slice(0, cut))?.has(nn.slice(cut + 2)), `${nf}: ${nn}`);
    checked += 1;
  }
  assert.ok(checked > 0, 'no same-file move was checked');
});

test("each of T5's map lines pairs an old render-edits case with the row whose why is its old label", () => {
  // The old loops named a case from its label; each row keeps that label as its why, word for word.
  const OLD = { 'render edit list': why => `bad case: ${why} refuses`, 'render block path': why => `bad case: a block path with ${why} refuses on its text` };
  const src = readFileSync(join(HERE, 'render-edits.test.mjs'), 'utf8');
  const whyOf = new Map();
  for (const table of Object.keys(OLD)) {
    const body = src.slice(src.indexOf(`table('${table}'`), src.indexOf('test(c.name, c.fn)', src.indexOf(`table('${table}'`)));
    for (const m of body.matchAll(/\{ id: '([a-z0-9-]+)', .*?why: '((?:[^'\\]|\\.)*)' \}/g)) whyOf.set(`${table}: ${m[1]}`, m[2].replace(/\\'/g, "'"));
  }
  assert.equal(whyOf.size, 51, 'the two tables hold 51 rows');
  let paired = 0;
  for (const l of REAL.moves.toString('utf8').split('\n')) {
    if (!l || l.startsWith('#')) continue;
    const [of, on, nf, nn] = l.split('\t');
    if (of !== 'gate/tests/render-edits.test.mjs' || nf !== of) continue;
    const table = nn.slice(0, nn.lastIndexOf(': '));
    assert.equal(on, OLD[table](whyOf.get(nn)), `${nn} is paired with another case`);
    paired += 1;
  }
  assert.equal(paired, 51);
});

test('bad case: registeredRows finds no row in a comment, a string, a variable, an alias, or a file that does not import the table module', () => {
  assert.equal(registeredRows(loop('t', "{ rows: [{ id: 'a' }] }")).size, 0, 'no import');
  assert.equal(registeredRows(`${IMP}// ${loop('t', "{ rows: [{ id: 'a' }] }")}`).size, 0, 'a comment');
  assert.equal(registeredRows(`${IMP}const s = "${loop('t', "{ rows: [{ id: 'a' }] }").trim()}";\n`).size, 0, 'a string');
  assert.deepEqual([...registeredRows(`${IMP}const ID = 'a';\n${loop('t', '{ rows: [{ id: ID }] }')}`).get('t')], [], 'a variable');
  assert.equal(registeredRows(`import { table } from './other.mjs';\n${loop('t', "{ rows: [{ id: 'a' }] }")}`).size, 0, 'another module');
  assert.equal(registeredRows("import { table as tb } from './tables.mjs';\nfor (const c of tb('t', { rows: [{ id: 'a' }] })) test(c.name, c.fn);\n").size, 0, 'an alias');
});

test('bad case: an id key in a base input or a plant is not a row', () => {
  const spec = "{ base: () => ({ id: 'b' }), rows: [{ id: 'a', plant: x => ({ ...x, id: 'c' }), fails: ['x'], why: 'w' }] }";
  assert.deepEqual([...registeredRows(IMP + loop('t', spec)).get('t')], ['a']);
  // And the compare refuses a rename onto it, with a plain test of that name standing in.
  const to = 't: b';
  const cases = homeRun().map(c => (c.file === A.file && c.name === A.name ? { ...c, name: to } : c));
  const src = `${IMP}${loop('t', spec)}test('t: b', () => {});\n`;
  fails(run({ moves: plusMove([A.file, A.name, A.file, to]) }, { cases, source: f => (f === A.file ? src : repoSource(f)) }), /the new name is not a row its file registers/);
});

test('bad case: a table that is never registered, or registered only inside a function or a branch, holds no row', () => {
  const rows = "{ rows: [{ id: 'r', fails: ['x'], why: 'w' }] }";
  assert.equal(registeredRows(`${IMP}table('t', ${rows});\n`).size, 0, 'never registered');
  assert.equal(registeredRows(`${IMP}function never() {\n  ${loop('t', rows)}}\n`).size, 0, 'inside a function');
  assert.equal(registeredRows(`${IMP}if (process.env.NEVER) {\n  ${loop('t', rows)}}\n`).size, 0, 'inside a branch');
  // And the compare refuses a rename onto the dead row, with a plain test of that name standing in.
  const to = 't: r';
  const cases = homeRun().map(c => (c.file === A.file && c.name === A.name ? { ...c, name: to } : c));
  const src = `${IMP}function never() {\n  ${loop('t', rows)}}\ntest('t: r', () => {});\n`;
  fails(run({ moves: plusMove([A.file, A.name, A.file, to]) }, { cases, source: f => (f === A.file ? src : repoSource(f)) }), /the new name is not a row its file registers/);
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

test('bad case: the command line reads the host and user names itself: a printed line holding either is withheld', t => {
  // Failed cases in files named for the host and the user: their file names are printed, unless the names are known.
  const host = hostname();
  const named = [...homeRun(), { status: 'fail', file: `gate/tests/${host}.test.mjs`, name: 'x' }, { status: 'fail', file: `gate/tests/${USER}.test.mjs`, name: 'y' }];
  const r = cli(t, recordOf(named));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.deepEqual(leakedLines(r.stdout, [host, USER]), [], 'the output holds the host or user name');
  assert.equal(r.stdout.split('\n').filter(l => l === '(a line withheld: it held a local path or name)').length, 2, r.stdout);
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
