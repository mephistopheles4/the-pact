// The Lens dispositions table check in the poster's pre-post scan (#285, T2
// of #280). Every case runs the poster's post() in-process as a dry run, with
// a gh that fails any call, so a refusal is seen to send nothing. Each bad
// case is a table row, but the state-word cases (#336 C4), which share one
// test; the eleven recorded tables are fixtures, each reduced
// to its label line and table with every unread cell a placeholder.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { DISPOSITIONS, post, scan, tableCheck } from '../../claude/tools/poster.mjs';
import { table } from './tables.mjs';
import { REPO } from './text.mjs';
import { tempDir, writeTree } from './tree.mjs';

const TARGET = 'tester/sandbox';
// Synthetic machine values: never this machine's.
const MACHINE = { home: '/srv/home/tester', tmp: '/tmp', user: 'tester', host: 'buildhost' };
const FENCE3 = '`'.repeat(3);
const FENCE4 = '`'.repeat(4);

// Every cell a row plants carries this mark, so a row can show its output quotes no cell.
const MARK = 'zq';
const LABEL = '### Lens dispositions';
const HEADER = '| Finding | Lens | Disposition | Rerun |';
const SEP = '| --- | --- | --- | --- |';
const ROWS = [
  `| new ${MARK} F1 | behaviour-lens | fixed | none |`,
  `| new ${MARK} F2 | integrity-lens | taken, ${MARK} as asked | none |`,
  `| new ${MARK} F3 | reader-lens | dismissed: ${MARK} it reads well | none |`,
  `| | data-lens | skipped, because ${MARK} no data moves | none |`,
  `| new ${MARK} F4 | adversarial-lens | fixed (auto: ${MARK} chose X because Y) | ${MARK} once |`,
  `| new ${MARK} F5 | conventions-lens | fixed (auto, reversed) | none |`,
  `| new ${MARK} F6 | unstated-lens | open | |`,
  `| new ${MARK} F7 | behaviour-lens | fixed (auto) | none |`,
];
const body = (...lines) => `${lines.join('\n')}\n`;
const BASE = body('A review.', '', LABEL, '', HEADER, SEP, ...ROWS, '', 'After the table.');
/** The base with its row `i` (from 0) replaced. */
const row = (i, text) => tree => ({ ...tree, 'body.md': tree['body.md'].replace(ROWS[i], text) });
const swap = (from, to) => tree => ({ ...tree, 'body.md': tree['body.md'].replace(from, to) });
const asBody = text => () => ({ 'body.md': text });

/**
 * A dry run of an issue comment carrying the tree's body, with a gh that
 * records any call; in a table's shape. A table expects a gate module's exit 1
 * and "RESULT: fail"; the poster refuses with exit 2, which `refusedQuietly`
 * asserts on `real`.
 */
function runBody(tree, t) {
  const dir = tempDir(t, 'pact-poster-table-');
  writeTree(dir, tree);
  const calls = [];
  const r = post(['issue-comment', '--repo', TARGET, '--body', join(dir, 'body.md'), '--issue', '5', '--dry-run'], { gh: (...a) => (calls.push(a), { ok: false, stdout: '', stderr: '' }), env: {}, ...MACHINE });
  const lastLine = r.lines.at(-1) ?? '';
  return {
    code: r.code === 2 ? 1 : r.code,
    fails: r.lines.filter(l => l.startsWith('REFUSED ')).map(l => l.split(' ')[1]),
    last: /^RESULT: refused [1-9][0-9]*$/.test(lastLine) ? 'RESULT: fail' : /^RESULT: dry-run [a-z-]+$/.test(lastLine) ? 'RESULT: pass' : lastLine,
    out: r.lines.join('\n'),
    real: r,
    calls,
  };
}

/** Every refusal row: exit 2, nothing sent, each refusal naming a rule, the body, a line and a column, and no cell text. */
function refusedQuietly(r) {
  assert.equal(r.real.code, 2, r.out);
  assert.equal(r.calls.length, 0, 'a refusal calls no gh');
  for (const l of r.real.lines.slice(0, -1)) assert.match(l, /^REFUSED table\/[a-z]+ body [1-9][0-9]*:[1-9][0-9]*$/, r.out);
  assert.ok(!r.out.includes(MARK), `the output quotes a cell: ${r.out}`);
}

// #280 C7: each rule refuses a planted table, with nothing sent and no cell text in the output.
for (const c of table('poster dispositions table', {
  module: 'claude/tools/poster.mjs',
  base: () => ({ 'body.md': BASE }),
  run: runBody,
  everyRow: refusedQuietly,
  rows: [
    { id: 'header-extra-words', plant: swap(HEADER, '| Finding | Lens | Disposition | Rerun, if any |'), fails: ['table/header'], why: "the template's header has no more words" },
    { id: 'header-bold', plant: swap(HEADER, '| Finding | Lens | **Disposition** | Rerun |'), fails: ['table/header'], why: 'bold is refused, though the trigger reads past it' },
    { id: 'header-three-columns', plant: swap(`${HEADER}\n${SEP}`, '| Lens or read | Disposition | Rerun |\n| --- | --- | --- |'), fails: ['table/header'], why: 'a header of other columns, and its rows are not read' },
    { id: 'header-five-columns', plant: swap(HEADER, '| Finding | Lens | Disposition | Rerun | Note |'), fails: ['table/header'], why: 'a column too many' },
    { id: 'cells-short-row', plant: row(0, `| new ${MARK} F1 | behaviour-lens | fixed |`), fails: ['table/cells'], why: 'a row a cell short' },
    { id: 'cells-long-row', plant: row(0, `| new ${MARK} F1 | behaviour-lens | fixed | none | ${MARK} |`), fails: ['table/cells'], why: 'a row a cell long' },
    { id: 'cells-empty-lens', plant: row(0, `| new ${MARK} F1 | | fixed | none |`), fails: ['table/cells'], why: 'every row names its lens' },
    { id: 'disposition-capital', plant: row(0, `| new ${MARK} F1 | behaviour-lens | Fixed | none |`), fails: ['table/disposition'], why: 'the words are lower case' },
    { id: 'disposition-bold', plant: row(6, `| new ${MARK} F6 | unstated-lens | **open: ${MARK} q5** | |`), fails: ['table/disposition'], why: 'a word inside bold markup' },
    { id: 'disposition-other-word', plant: row(0, `| new ${MARK} F1 | behaviour-lens | changed by rev 4 | none |`), fails: ['table/disposition'], why: 'a word that is not on the list' },
    { id: 'disposition-longer-word', plant: row(0, `| new ${MARK} F1 | behaviour-lens | fixedly | none |`), fails: ['table/disposition'], why: 'a word must end at a non-letter' },
    { id: 'disposition-empty', plant: row(0, `| new ${MARK} F1 | behaviour-lens | | none |`), fails: ['table/disposition'], why: 'an empty disposition' },
    { id: 'skipped-for', plant: row(3, `| | data-lens | skipped, for the same ${MARK} reason | none |`), fails: ['table/skipped'], why: 'skipped takes ", because"' },
    { id: 'skipped-bare', plant: row(3, '| | data-lens | skipped | none |'), fails: ['table/skipped'], why: 'skipped with no reason' },
    { id: 'auto-comma-as', plant: row(4, `| new ${MARK} F4 | adversarial-lens | fixed (auto, as ${MARK} asked) | none |`), fails: ['table/auto'], why: 'auto takes a colon, a bracket or ", reversed"' },
    { id: 'auto-no-comma', plant: row(5, `| new ${MARK} F5 | conventions-lens | fixed (auto reversed) | none |`), fails: ['table/auto'], why: 'reversed takes its comma' },
    { id: 'two-rules-in-one-cell', plant: row(3, '| | data-lens | skipped (auto, x) | none |'), fails: ['table/skipped', 'table/auto'], why: 'each rule a cell breaks is named' },
    { id: 'in-a-fold', plant: swap(`${LABEL}\n\n${HEADER}`, `${LABEL}\n\n<details><summary>Table</summary>\n\n| Finding | Lens | Disposition | Rerun, if any |`), fails: ['table/header'], why: 'a fold hides nothing from the check' },
    { id: 'after-a-closed-fence', plant: swap(`${LABEL}\n`, `${LABEL}\n\n${FENCE3}text\na line\n${FENCE3}\n\n| Finding | Lens | Disposition | Rerun, if any |\n${SEP}\n`), fails: ['table/header'], why: 'a closed fence ends where it closes' },
    { id: 'fence-too-short', plant: asBody(body(LABEL, '', '<details><summary>a lens</summary>', '', `${FENCE3}text`, 'A report quoting', FENCE3, '### Lens dispositions', '', '| Finding | Lens | Disposition | Rerun, if any |', SEP, `| new ${MARK} | x-lens | fixed | none |`, FENCE3, '', '</details>')), fails: ['table/header'], why: 'a three-backtick line inside a three-backtick fence closes it' },
    { id: 'info-string-backtick', plant: asBody(body(LABEL, '', `${FENCE3}a${'`'}b`, '| Finding | Lens | Disposition | Rerun |', SEP, `| new ${MARK} | x-lens | changed | none |`)), fails: ['table/disposition'], why: 'a backtick run whose info string holds a backtick opens no fence' },
    { id: 'title-case-label', plant: asBody(body('**Lens Dispositions**', '', HEADER, SEP, `| new ${MARK} | x-lens | done | none |`)), fails: ['table/disposition'], why: 'the label is read in any case' },
    { id: 'crlf', plant: tree => ({ 'body.md': tree['body.md'].replace(ROWS[0], `| new ${MARK} F1 | behaviour-lens | Fixed | none |`).replace(/\n/g, '\r\n') }), fails: ['table/disposition'], why: 'a body with Windows line ends' },
    { id: 'lone-cr', plant: tree => ({ 'body.md': tree['body.md'].replace(ROWS[0], `| new ${MARK} F1 | behaviour-lens | Fixed | none |`).replace(/\n/g, '\r') }), fails: ['table/disposition'], why: 'CommonMark ends a line at a lone carriage return' },
    { id: 'pipe-line-above-header', plant: tree => ({ 'body.md': tree['body.md'].replace(HEADER, `| ${MARK} a stray line |\n${HEADER}`).replace(ROWS[0], `| new ${MARK} F1 | behaviour-lens | Fixed | none |`) }), fails: ['table/disposition'], why: 'the header is the line before the delimiter row' },
    { id: 'all-dash-row', plant: row(0, '| - | - | - | - |'), fails: ['table/state', 'table/disposition'], why: 'only the line after the header is the delimiter row' },
  ],
})) test(c.name, c.fn);

/** The refusals the check gives `text`, as rule ids. */
const rules = text => tableCheck(text).map(r => r.rule);

// #280 C7: what passes.
test("the template's form passes, with fixed (auto), open, an empty Finding cell and an empty Rerun cell", () => {
  assert.deepEqual(tableCheck(BASE), []);
});

// #280 C7, with q3 on #285: " (auto" is the mark only where the word ends, so reason text that starts with it passes.
test('reason text holding "(automatically)" or "(auto-take: ...)" passes', () => {
  for (const cell of ['fixed (automatically)', 'fixed (auto-take: as asked)', 'fixed: moved to (automated) checks']) assert.deepEqual(rules(body(LABEL, '', HEADER, SEP, `| new a | b | ${cell} | c |`)), [], cell);
  assert.deepEqual(rules(body(LABEL, '', HEADER, SEP, '| new a | b | fixed (auto reversed) | c |')), ['table/auto'], 'the mark still needs its form');
});

// #280 C7: case and spacing aside, the header is the template's.
test('a header in other case and spacing passes', () => {
  assert.deepEqual(rules(body(LABEL, '', '|finding|  LENS |Disposition|   rerun|', SEP, ROWS[0])), []);
});

// #280 C7: the trigger needs the label before the table, and a Disposition header cell.
test('an unlabelled table, a table above its label and a table with no Disposition column pass', () => {
  const bad = '| Finding | Lens | Disposition | Rerun, if any |';
  assert.deepEqual(rules(body('A plain table.', '', bad, SEP, '| new a | b | changed | d |')), []);
  assert.deepEqual(rules(body(bad, SEP, '| new a | b | changed | d |', '', LABEL)), []);
  // An escape or gap table, in its own table, under the label.
  assert.deepEqual(rules(body(LABEL, '', HEADER, SEP, ROWS[0], '', '| Escape | Lens | After auto-take |', '| --- | --- | --- |', '| a defect | behaviour-lens | yes |')), []);
});

// #280 C7: a fenced table is never read, in either fence character, and a fence that never closes runs to the end.
test('a table inside a fence is never read', () => {
  const bad = ['| Finding | Lens | Disposition | Rerun, if any |', SEP, '| new a | | changed |'];
  assert.deepEqual(rules(body(LABEL, '', FENCE3, ...bad, FENCE3)), []);
  assert.deepEqual(rules(body(LABEL, '', '~~~text', ...bad, '~~~')), []);
  assert.deepEqual(rules(body(LABEL, '', `   ${FENCE3}text`, ...bad)), [], 'a fence indented three spaces, never closed');
  // Each line below would close the fence under a looser closing rule, and the broken table after it would then be read.
  for (const closer of ['~~~', '`'.repeat(2), `${FENCE3} x`]) assert.deepEqual(rules(body(LABEL, '', `${FENCE3}text`, closer, ...bad)), [], `${JSON.stringify(closer)} closes no backtick fence`);
  assert.deepEqual(rules(body(LABEL, '', '~~~~', '~~~', ...bad)), [], 'a shorter tilde run closes no longer one');
  // A backtick in the info string bars only a backtick fence: a tilde fence still opens.
  assert.deepEqual(rules(body(LABEL, '', `~~~a${'`'}b`, ...bad, '~~~')), []);
});

// #280 C7: the check holds on a real post, before any gh call, not only on a dry run.
test('a real post with a broken table is refused before any gh call', t => {
  const dir = tempDir(t, 'pact-poster-table-');
  writeTree(dir, { 'body.md': body(LABEL, '', HEADER, SEP, '| new a | b | changed | c |') });
  const calls = [];
  const r = post(['issue-comment', '--repo', TARGET, '--body', join(dir, 'body.md'), '--issue', '5'], { gh: (...a) => (calls.push(a), { ok: true, stdout: '{"login":"tester"}', stderr: '' }), env: {}, ...MACHINE });
  assert.equal(r.code, 2, r.lines.join('\n'));
  assert.deepEqual(r.lines, ['REFUSED table/disposition body 5:15', 'RESULT: refused 1']);
  assert.equal(calls.length, 0);
});

// #280 C7: the scan and the table check number lines alike, so a body with lone carriage returns points to one line.
test('with lone carriage returns, the scan and the table check name the same lines', t => {
  const token = 'n' + 'pm_' + 'E5'.repeat(18);
  const r = runBody({ 'body.md': [LABEL, '', token, HEADER, SEP, '| new a | b | changed | c |', ''].join('\r') }, t);
  assert.deepEqual(r.real.lines, ['REFUSED secret/token body 3:1', 'REFUSED table/disposition body 6:15', 'RESULT: refused 2']);
});

// #280 C7, ADR 0076: a body full of broken rows names the first fifty and counts the rest, so the result line stays in view.
test('table refusals past fifty are counted, not listed', t => {
  const r = runBody({ 'body.md': body(LABEL, '', HEADER, SEP, ...Array(5000).fill('|')) }, t);
  assert.equal(r.real.code, 2);
  assert.equal(r.real.lines.length, 52, r.real.lines.slice(-3).join('\n'));
  assert.equal(r.real.lines[50], 'NOTE: 4950 more table refusals not listed');
  assert.equal(r.real.lines.at(-1), 'RESULT: refused 5000');
});

// #280 C7: the review procedure's fold, a four-backtick fence holding a three-backtick line, stays closed to the check.
test('a Disposition table inside a four-backtick fence that holds a three-backtick line is never read', () => {
  const report = ['<details><summary>a lens: findings</summary>', '', `${FENCE4}text`, 'A report quoting:', `${FENCE3}text`, 'code', FENCE3, LABEL, '', '| Finding | Lens | Disposition | Rerun, if any |', SEP, '| new a | | changed |', FENCE4, '', '</details>'];
  assert.deepEqual(rules(body(LABEL, '', ...report)), []);
});

// #280 C7: lengthening only the fence clears the fence-too-short row.
test('the too-short fence row passes once only its fence is lengthened', () => {
  const inside = ['A report quoting', FENCE3, '### Lens dispositions', '', '| Finding | Lens | Disposition | Rerun, if any |', SEP, '| new a | x-lens | fixed | none |'];
  assert.deepEqual(rules(body(LABEL, '', `${FENCE3}text`, ...inside, FENCE3)), ['table/header']);
  assert.deepEqual(rules(body(LABEL, '', `${FENCE4}text`, ...inside, FENCE4)), []);
});

// #280 C7: each refusal is named where it sits, every hit counted.
test('each refusal names its line and column, and a rule broken twice is named twice', () => {
  const r = tableCheck(body(LABEL, '', HEADER, SEP, '| new a | b | **open: q5** | c |', '| new a | | fixed | c |', '| new a | b | **open** | c |'));
  assert.deepEqual(r, [
    { rule: 'table/disposition', where: 'body 5:15' },
    { rule: 'table/cells', where: 'body 6:10' },
    { rule: 'table/disposition', where: 'body 7:15' },
  ]);
});

// #336 C4: a read row's Finding cell starts with a state word, or is exactly the withheld text; a refusal names the cell's place, never its text.
test('a Finding cell without a state word is refused as table/state at its column, and a skipped row\'s Finding cell is not read', t => {
  const row = finding => body(LABEL, '', HEADER, SEP, `| ${finding} | b | fixed | c |`);
  for (const finding of [`${MARK} F1`, `**new** ${MARK}`, `newer ${MARK}`, `New ${MARK}`, `withheld, see chat ${MARK}`]) {
    const r = runBody({ 'body.md': row(finding) }, t);
    refusedQuietly(r);
    assert.deepEqual(r.real.lines, ['REFUSED table/state body 5:3', 'RESULT: refused 1'], finding);
  }
  // An empty cell's column is its start, right after the pipe.
  assert.deepEqual(tableCheck(row('')), [{ rule: 'table/state', where: 'body 5:2' }], 'an empty Finding cell');
  for (const finding of [`new ${MARK}`, `updated ${MARK}`, `unchanged ${MARK}`, `absent ${MARK}`, 'withheld, see chat']) assert.deepEqual(rules(row(finding)), [], finding);
  for (const finding of ['', `${MARK} F1`]) assert.deepEqual(rules(body(LABEL, '', HEADER, SEP, `| ${finding} | b | skipped, because ${MARK} | c |`)), [], `skipped: ${JSON.stringify(finding)}`);
});

// #280 C7: the secret scan still reads folds and fences; the check's reading rules never narrow it.
test('a credential inside a fold or a fence is still refused by the secret scan', t => {
  const token = 'n' + 'pm_' + 'E5'.repeat(18);
  for (const text of [body(LABEL, '', '<details><summary>a</summary>', '', token, '', '</details>'), body(LABEL, '', `${FENCE4}text`, token, FENCE4)]) {
    const r = runBody({ 'body.md': text }, t);
    assert.equal(r.real.code, 2, r.out);
    assert.deepEqual(r.fails, ['secret/token'], r.out);
    assert.ok(!r.out.includes(token));
  }
});

// #280 C7: the check is a line scan; a worst case at the size limit stays well inside its budget.
test('a worst-case body at the 65,536-character limit finishes within two seconds', t => {
  const unit = [`${FENCE3}a${'`'}b`, 'Lens dispositions', '| Finding | Lens | Disposition | Rerun |', SEP, '| new a | b | c (auto (auto (auto | d |', '|'.repeat(40), '~~~~', '| x |', '~~~~'].join('\n') + '\n';
  const fill = s => s.repeat(Math.ceil(65536 / s.length)).slice(0, 65536);
  const head = body(LABEL, HEADER, SEP);
  const bodies = {
    'many short units': fill(unit),
    // One line as long as the limit allows: a cost per cell that grows with the line would show here.
    'one line of pipes under a template header': head + '|'.repeat(65536 - head.length),
    'one line of backticks and a line separator': fill('`').slice(0, 65534) + String.fromCharCode(0x2028) + 'x',
    'one line of backticks and a lone carriage return': fill('`').slice(0, 65534) + '\rx',
  };
  for (const [name, text] of Object.entries(bodies)) {
    assert.equal([...text].length, 65536, name);
    const start = performance.now();
    const r = runBody({ 'body.md': text }, t);
    const ms = performance.now() - start;
    assert.ok(ms < 2000, `${name}: ${Math.round(ms)} ms`);
    // Any refusal here is the table check's, so a size refusal can't stand in for it.
    assert.ok(r.fails.every(f => f.startsWith('table/')), `${name}: ${r.out.slice(0, 300)}`);
    if (name === 'many short units') assert.ok(r.fails.length > 0, 'the units are refused');
  }
});

const REVIEW = () => readFileSync(join(REPO, 'claude', 'review.md'), 'utf8').replace(/\r\n/g, '\n');

// #280 C7: the words and the header are the review procedure's.
test("the check's header and words are the review procedure's", () => {
  const review = REVIEW();
  const section = review.slice(review.indexOf('## Lens dispositions'), review.indexOf('## Escapes and gaps'));
  assert.ok(section.includes(`\`| ${DISPOSITIONS.header.join(' | ')} |\``), 'the header row, in a code span');
  const words = [...section.matchAll(/^- `([a-z]+)`/gm)].map(m => m[1]);
  assert.deepEqual(words, [...DISPOSITIONS.words]);
  assert.ok(section.includes(`\`skipped${DISPOSITIONS.skipped}`), 'the skipped form');
  // Every "(auto" the section writes is one of the check's forms, and each form is written.
  const forms = [...section.matchAll(/\(auto(:|\)|, reversed|[^]?)/g)].map(m => m[1]);
  assert.deepEqual([...new Set(forms)].sort(), [...DISPOSITIONS.afterAuto].sort());
  assert.equal(section.split('| Finding |').length, 2, 'one header row');
});

// #336 C6: the state words are the four the review procedure's sentence names, in its order.
test("the check's state words are the review procedure's", () => {
  const flat = REVIEW().replace(/\s+/g, ' ');
  const sentence = flat.match(/The Finding cell starts with the finding's state word, one of ([^.]*?), in lower case and with no markup, then a space and the finding\./);
  assert.ok(sentence, 'the state-word sentence');
  assert.deepEqual([...sentence[1].matchAll(/`([a-z]+)`/g)].map(m => m[1]), [...DISPOSITIONS.states]);
});

// #336 C10 (ASVS 5.0 V16): no refusal of any table/ rule holds the text of the cell it refuses.
test('a body breaking every table/ rule, with a marker in each cell, is refused with no marker in the output', t => {
  const M = 'vq9marker';
  const text = body(
    LABEL, '',
    `| Finding ${M} | Lens | Disposition | Rerun |`, SEP, `| new ${M} | ${M} | fixed | ${M} |`, '',
    HEADER, SEP,
    `| new ${M} | ${M} | fixed ${M} |`,
    `| new ${M} | | fixed ${M} | ${M} |`,
    `| new ${M} | ${M} | changed ${M} | ${M} |`,
    `| ${M} | ${M} | skipped for ${M} | ${M} |`,
    `| new ${M} | ${M} | fixed (auto as ${M}) | ${M} |`,
    `| ${M} | ${M} | fixed ${M} | ${M} |`,
  );
  const r = runBody({ 'body.md': text }, t);
  assert.equal(r.real.code, 2, r.out);
  assert.deepEqual([...new Set(r.fails)].sort(), ['table/auto', 'table/cells', 'table/disposition', 'table/header', 'table/skipped', 'table/state'], r.out);
  assert.ok(!r.out.includes(M), `a refusal quotes a cell: ${r.out}`);
});

// #280 C9: the review procedure says what open means, where escapes and gaps go, that a table may be unchecked, and what a hidden-character refusal asks; it names no tool.
test('the review procedure carries open, the separate escape table, the unchecked sentence and the hidden-characters sentence, and names no tool', () => {
  const review = REVIEW();
  const flat = review.replace(/\s+/g, ' ');
  assert.match(flat, /- `open`, for a finding I haven't settled yet\. It needs nothing after it; a later table gives the finding its final word\./);
  assert.ok(flat.includes('Escape and gap rows go in a table of their own under that review\'s Lens dispositions table, with no Disposition column.'));
  assert.ok(flat.includes("A tool may check this table's shape before it posts; where none does, the table is unchecked. A retrospective that counts these tables reads each one tolerantly and counts the rows it can't read."));
  assert.ok(flat.includes('Where a tool refuses a report for hidden characters, keep the report local and tell me, as for a personal detail; never strip them to post it.'));
  assert.doesNotMatch(review, /poster|tools\/|\.mjs/i);
});

// ---------------------------------------------------------------- the recorded tables (C8)

const FIXTURES = join(REPO, 'gate', 'tests', 'fixtures', 'dispositions');
// The source comment of each, and its result in the spec's Problem Statement (#280, revision 5).
const RECORDED = {
  '264-6116107060.md': ['table/header'],
  '262-6123498208.md': ['table/disposition', 'table/disposition', 'table/cells'],
  '262-6123660188.md': ['table/disposition'],
  '262-6123794198.md': ['table/disposition'],
  '262-6123826851.md': ['table/header'],
  '262-6124562507.md': ['table/skipped'],
  '262-6127820354.md': [],
  '262-6128002230.md': [],
  '262-6133517113.md': ['table/auto'],
  '282-6149289326.md': [],
  '282-6149452307.md': [],
};
const fixture = name => readFileSync(join(FIXTURES, name), 'utf8');

// #336 C7: each fixture's table/state refusals, one for each read row that isn't skipped (every Finding cell is the placeholder).
const STATE_COUNTS = {
  '262-6123498208.md': 30,
  '262-6123660188.md': 8,
  '262-6123794198.md': 2,
  '262-6123826851.md': 0,
  '262-6124562507.md': 13,
  '262-6127820354.md': 7,
  '262-6128002230.md': 1,
  '262-6133517113.md': 21,
  '264-6116107060.md': 0,
  '282-6149289326.md': 5,
  '282-6149452307.md': 3,
};

// #280 C8: each fixture gives its recorded result under the five earlier rules; #336 C7: and its table/state count.
test('the eleven recorded tables give the results the spec records', () => {
  assert.deepEqual(readdirSync(FIXTURES).sort(), Object.keys(RECORDED).sort());
  assert.deepEqual(Object.keys(STATE_COUNTS).sort(), Object.keys(RECORDED).sort());
  for (const [name, want] of Object.entries(RECORDED)) {
    const got = rules(fixture(name));
    assert.deepEqual(got.filter(r => r !== 'table/state').sort(), [...want].sort(), name);
    assert.equal(got.filter(r => r === 'table/state').length, STATE_COUNTS[name], `${name}: table/state`);
  }
});

// #280 C8: a fixture holds its label line and its table, and every cell the check doesn't read is the placeholder.
test('each fixture holds only its label line and table, with placeholders in every unread cell', () => {
  // Any markup, the word, the form after it (", because" or ", for"; " (auto" and its next character, or ", reversed"), and the placeholder.
  const dispositionCell = /^(?:\*\*)?[a-z]*(?:, because|, for)?(?: x)?(?: \(auto(?:, reversed|.))?(?: x)?(?:\*\*)?$/;
  for (const name of Object.keys(RECORDED)) {
    const lines = fixture(name).split('\n').filter(l => l !== '');
    assert.match(lines[0], /^(?:#{1,6} |\*\*)?Lens dispositions(?:\*\*)?$/, `${name}: the label line is its markup and the label only`);
    assert.ok(lines.length >= 3 && lines.slice(1).every(l => l.startsWith('|') && l.endsWith('|')), `${name}: only table lines after the label`);
    assert.ok(lines[2].split('|').slice(1, -1).every(c => /^ ?:?-+:? ?$/.test(c)), `${name}: the delimiter row`);
    const head = lines[1].split('|').slice(1, -1).map(c => c.trim().toLowerCase());
    for (const l of lines.slice(3)) {
      const cells = l.split('|').slice(1, -1).map(c => c.trim());
      cells.forEach((c, i) => {
        if (head[i] === 'disposition' && cells.length === head.length) assert.match(c, dispositionCell, `${name}: ${l}`);
        // The check reads only whether a Lens cell is empty.
        else if (head[i] === 'lens' && cells.length === head.length) assert.ok(c === 'x' || c === '', `${name}: ${l}`);
        else assert.equal(c, 'x', `${name}: ${l}`);
      });
    }
  }
});

// #280 C8: the fixtures carry nothing the poster's scan refuses. The home-path guard reads them with every tracked file.
test("the poster's scan finds nothing in any fixture", () => {
  for (const name of Object.keys(RECORDED)) assert.deepEqual(scan([{ field: 'body', text: fixture(name) }], { env: {}, ...MACHINE, surface: 'issue-comment' }), [], name);
});
