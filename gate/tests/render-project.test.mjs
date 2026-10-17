// The renderer's project mode (#53, slice 5): the project rules file, from the
// user's effective values and the project's tighter ones. Driven through its
// command line, as the install script runs it, and judged on what it prints
// and the file it writes. The expected file and digest are built here, never
// taken from the renderer.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { copyGate, plantModule } from './gate-files.mjs';
import { moduleResult, table } from './tables.mjs';
import { RENDER, lastLine } from './text.mjs';
import { tempDir } from './tree.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const PROJECT_REL = ['.claude', 'pact-config.json'];
const OUTPUT = 'pact-project.md';

/** The project rules file the tests expect, for the usage pause at `n`. */
function expectedFile(n) {
  return [
    '# Pact settings for this project',
    '',
    "The pact's installer wrote this file from this project's pact configuration. Each line can only make the pact stricter here.",
    '',
    `- **Usage pause.** In this project, wait for my go-ahead when the weekly limit is above ${n}% or above the line in my user rules, whichever is lower.`,
    '',
  ].join('\n');
}

/** A Claude home folder, with a user file holding `user` when given. */
function userHome(t, user) {
  const h = tempDir(t, 'pact-render-home-');
  if (user !== undefined) {
    mkdirSync(join(h, 'pact'));
    writeFileSync(join(h, 'pact', 'config.json'), user);
  }
  return h;
}

/** A project folder, with a project file holding `content` when given. */
function project(t, content) {
  const p = tempDir(t, 'pact-render-project-');
  if (content !== undefined) {
    mkdirSync(join(p, '.claude'));
    writeFileSync(join(p, ...PROJECT_REL), content);
  }
  return p;
}

function render(t, home, proj, script = RENDER) {
  const dir = tempDir(t, 'pact-render-out-');
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [script, 'project', dir, home, proj], { encoding: 'utf8', env });
  let bytes = null;
  try {
    bytes = readFileSync(join(dir, OUTPUT));
  } catch {}
  return { code: r.status, stdout: r.stdout, out: r.stdout + r.stderr, dir, bytes };
}

function refusedWith(r, rule, reason) {
  assert.equal(r.code, 1, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.match(r.stdout, new RegExp(`^FAIL ${rule}: `, 'm'), r.out);
  if (reason) assert.match(r.stdout, reason, r.out);
  assert.doesNotMatch(r.stdout, /^(RENDERED|CONFIG|PROJECT|DIGEST|VALUE) /m, r.out);
  assert.deepEqual(readdirSync(r.dir), [], 'a refused render writes no file');
}

const projectFile = n => `{"schema": 1, "settings": {"usage-pause": ${n}}}\n`;
const userFile = n => `{"schema": 1, "settings": {"usage-pause": ${n}}}\n`;

// ------------------------------------------------------------ layering

test('with no user file, a project value under the default installs: the lower-of line, the hashes, the digest', t => {
  const pbytes = Buffer.from(projectFile(60));
  const r = render(t, userHome(t), project(t, pbytes));
  assert.equal(r.code, 0, r.out);
  assert.equal(r.bytes.toString('utf8'), expectedFile(60));
  const digest = sha256(`project ${sha256(pbytes)}\n`).slice(0, 12);
  assert.deepEqual(r.stdout.trim().split('\n'), [
    `RENDERED ${sha256(r.bytes)}`,
    'CONFIG none',
    `PROJECT ${sha256(pbytes)}`,
    `DIGEST ${digest}`,
    'VALUE usage-pause 60',
    'RESULT: pass',
  ]);
  assert.deepEqual(readdirSync(r.dir), [OUTPUT]);
});

test('a project value tighter than the user\'s own installs, and the digest covers both files', t => {
  const ubytes = Buffer.from(userFile(90));
  const pbytes = Buffer.from(projectFile(80));
  const r = render(t, userHome(t, ubytes), project(t, pbytes));
  assert.equal(r.code, 0, r.out);
  assert.equal(r.bytes.toString('utf8'), expectedFile(80));
  const digest = sha256(`user ${sha256(ubytes)}\nproject ${sha256(pbytes)}\n`).slice(0, 12);
  assert.match(r.stdout, new RegExp(`^CONFIG user ${sha256(ubytes)}$`, 'm'));
  assert.match(r.stdout, new RegExp(`^DIGEST ${digest}$`, 'm'));
  assert.match(r.stdout, /^VALUE usage-pause 80$/m);
});

test('bad case: a project value looser than the user\'s but tighter than the default refuses', t => {
  refusedWith(render(t, userHome(t, userFile(50)), project(t, projectFile(60))), 'project-looser', /usage-pause 60 is not tighter than the user's effective value, 50/);
});

test('bad case: a project value equal to the user\'s effective value refuses: tighter means strictly', t => {
  refusedWith(render(t, userHome(t), project(t, projectFile(75))), 'project-looser', /usage-pause 75 is not tighter than the user's effective value, 75/);
});

test('bad case: a project value looser than the default refuses', t => {
  refusedWith(render(t, userHome(t), project(t, projectFile(80))), 'project-looser');
});

// #142: the session limit layers like the weekly one: a project may only set it tighter.
test('bad case: a project session value looser than the user\'s refuses', t => {
  const user = '{"schema": 1, "settings": {"usage-pause-session": 50}}\n';
  refusedWith(render(t, userHome(t, user), project(t, '{"schema": 1, "settings": {"usage-pause-session": 60}}\n')), 'project-looser', /usage-pause-session 60 is not tighter than the user's effective value, 50/);
});

// #142: with no session value in the user file there is no session line to loosen, so a project's is tighter.
test('with no user session value, a project session value installs its lower-of line', t => {
  const r = render(t, userHome(t), project(t, '{"schema": 1, "settings": {"usage-pause-session": 60}}\n'));
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^VALUE usage-pause-session 60$/m, r.out);
  assert.match(r.bytes.toString('utf8'), /^- \*\*Session usage pause\.\*\* In this project, wait for my go-ahead when the 5-hour session limit is above 60% or above the line in my user rules, whichever is lower\.$/m);
});

test('bad case: a project file with an edit refuses, even an empty edit list', t => {
  refusedWith(render(t, userHome(t), project(t, '{"schema": 1, "settings": {"usage-pause": 60}, "edits": [{"mark": "moves", "op": "remove"}]}\n')), 'project-edit');
  refusedWith(render(t, userHome(t), project(t, '{"schema": 1, "settings": {"usage-pause": 60}, "edits": []}\n')), 'project-edit');
});

for (const [label, content, rule, reason] of [
  ['another top-level key', '{"schema": 1, "settings": {"usage-pause": 60}, "notes": "x"}\n', 'project-key', /qualities or costLimits/],
  ['an unknown setting', '{"schema": 1, "settings": {"usage-pause": 60, "other": 1}}\n', 'project-settings'],
  ['a value of the wrong type', '{"schema": 1, "settings": {"usage-pause": "60"}}\n', 'project-value'],
  ['a value out of range', '{"schema": 1, "settings": {"usage-pause": -1}}\n', 'project-value'],
  ['a fraction', '{"schema": 1, "settings": {"usage-pause": 60.5}}\n', 'project-value'],
  ['an unknown schema', '{"schema": 2, "settings": {"usage-pause": 60}}\n', 'project-schema'],
  ['no value at all', '{"schema": 1, "settings": {}}\n', 'project-empty'],
  ['no settings', '{"schema": 1}\n', 'project-empty', /no qualities and no costLimits/],
  ['malformed JSON', '{"schema": 1,\n', 'project-json'],
  ['a key given twice', '{"schema": 1, "settings": {"usage-pause": 60, "Usage-Pause": 10}}\n', 'project-json'],
  ['a list, not an object', '[1]\n', 'project-json'],
  ['a byte-order mark', '\ufeff{"schema": 1, "settings": {"usage-pause": 60}}\n', 'bom'],
  ['a carriage return', '{"schema": 1,\r\n "settings": {"usage-pause": 60}}\n', 'characters'],
]) {
  test(`bad case: a project file with ${label} refuses`, t => {
    refusedWith(render(t, userHome(t), project(t, content)), rule, reason);
  });
}

// ------------------------------------------------------------ a project's own qualities list (#262 S25)

const Q_ROWS = [
  { quality: 'Performance efficiency', measure: 'p95 under 200 ms on checkout', lenses: ['behaviour-lens'] },
  { quality: 'Security', measure: 'ASVS 5.0 level 2', lenses: ['adversarial-lens', 'data-lens'] },
  { quality: 'Compatibility', measure: '', lenses: ['conventions-lens'] },
];
const qFile = (rows, extra = {}) => `${JSON.stringify({ schema: 1, ...extra, qualities: rows })}\n`;

// #262 C21
test('a project qualities list, alone, renders its table from its fields under fixed text, and reports its row count', t => {
  const pbytes = Buffer.from(qFile(Q_ROWS));
  const r = render(t, userHome(t), project(t, pbytes));
  assert.equal(r.code, 0, r.out);
  const want = [
    '# Pact settings for this project',
    '',
    "The pact's installer wrote this file from this project's pact configuration. Each setting line can only make the pact stricter here, and the qualities list takes the place of the one in my user rules.",
    '',
    '## Qualities for this project',
    '',
    'In this project, this list takes the place of the Qualities table in my user rules: the qualities that matter here, each with its measure and the lenses that check it.',
    '',
    '| Quality | Measure | Lens |',
    '| --- | --- | --- |',
    '| Performance efficiency | p95 under 200 ms on checkout | `behaviour-lens` |',
    '| Security | ASVS 5.0 level 2 | `adversarial-lens`, `data-lens` |',
    '| Compatibility |  | `conventions-lens` |',
    '',
  ].join('\n');
  assert.equal(r.bytes.toString('utf8'), want);
  assert.match(r.stdout, /^QUALITIES 3$/m);
  // Beside a value, the setting line comes first.
  const both = render(t, userHome(t), project(t, qFile(Q_ROWS.slice(0, 1), { settings: { 'usage-pause': 60 } })));
  assert.equal(both.code, 0, both.out);
  assert.match(both.bytes.toString('utf8'), /% or above the line in my user rules, whichever is lower\.\n\n## Qualities for this project\n/);
});

// #262 C21: a bar in a field is escaped, so the table stays three columns.
test('a bar in a project quality field is escaped in the table, so the row keeps three cells', t => {
  const r = render(t, userHome(t), project(t, qRow({ measure: 'p95 | p99, a\\|b under 1 s' })));
  assert.equal(r.code, 0, r.out);
  assert.ok(r.bytes.toString('utf8').split('\n').includes('| Performance efficiency | p95 \\| p99, a\\\\\\|b under 1 s | `behaviour-lens` |'), r.bytes.toString('utf8'));
});

const qRow = (over, base = Q_ROWS[0]) => qFile([{ ...base, ...over }]);
// #262 C21, thinned by the gate's install-mechanics cut: a row's shape, each field one line.
for (const c of table('render project qualities', {
  module: 'gate/render.mjs',
  base: () => ({ project: qFile(Q_ROWS) }),
  run: (tree, t) => {
    const r = render(t, userHome(t), project(t, tree.project));
    return { ...moduleResult(r.code, r.stdout, r.stderr), files: readdirSync(r.dir) };
  },
  everyRow: r => assert.deepEqual(r.files, [], 'a refused render writes no file'),
  rows: [
    { id: 'measure-line-break', plant: () => ({ project: qRow({ measure: 'fast\n# Heading' }) }), fails: ['project-qualities'], why: 'a second line' },
    { id: 'measure-not-text', plant: () => ({ project: qRow({ measure: 5 }) }), fails: ['project-qualities'], why: 'a measure is text' },
    { id: 'lenses-none', plant: () => ({ project: qRow({ lenses: [] }) }), fails: ['project-qualities'], why: 'at least one' },
    { id: 'rows-none', plant: () => ({ project: qFile([]) }), fails: ['project-qualities'], why: 'a list holds a row' },
    { id: 'rows-too-many', plant: () => ({ project: qFile(Array.from({ length: 10 }, (_, i) => ({ ...Q_ROWS[0], quality: `Q${i}` }))) }), fails: ['project-qualities'], why: 'at most nine, as the install reads the count' },
    { id: 'row-extra-field', plant: () => ({ project: qRow({ note: 'x' }) }), fails: ['project-qualities'], why: 'only the three fields' },
    { id: 'row-missing-field', plant: () => ({ project: qFile([{ quality: 'Security', lenses: ['data-lens'] }]) }), fails: ['project-qualities'], why: 'all three fields' },
    { id: 'qualities-not-list', plant: () => ({ project: `${JSON.stringify({ schema: 1, qualities: { Security: 'x' } })}\n` }), fails: ['project-qualities'], why: 'a list' },
  ],
})) test(c.name, c.fn);

// ------------------------------------------------------------ a project's own Cost limits and Enough (#278, T2)

const C_ROWS = [
  { cost: 'Tests added', counted: 'Tests beyond one per acceptance claim', limit: '2 per change', atLimit: 'A trade-off for me' },
  { cost: ' Hardening ', counted: 'Guards for paths that are not security findings', limit: '0', atLimit: '' },
];
const EQ_ROWS = [
  { quality: 'Functional suitability', measure: 'the acceptance claims', lenses: ['behaviour-lens'], enoughCosts: ['Tests added'] },
  { quality: 'Security', measure: 'ASVS 5.0 level 1', lenses: ['adversarial-lens'], enough: ' ASVS L1 ', enoughCosts: [' hardening ', 'HARDENING'] },
  { quality: 'Compatibility', measure: '', lenses: ['conventions-lens'] },
];
const cFile = (costLimits, qualities = EQ_ROWS, extra = {}) => `${JSON.stringify({ schema: 1, ...extra, qualities, costLimits })}\n`;
const cRow = (over, base = C_ROWS[0]) => cFile([{ ...base, ...over }]);

/** The home part's fixed text, as the rules file states it between the Cost limits heading and its table. */
function homeFixedText() {
  const rules = readFileSync(new URL('../../claude/CLAUDE.md', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const from = rules.indexOf('## Cost limits\n\n') + '## Cost limits\n\n'.length;
  return rules.slice(from, rules.indexOf('\n\n*Scriptorium builds this.*', from));
}

// #288 C2, C7: a project's Cost limits replace the home list there, under the home part's own fixed text.
test('a project costLimits list renders its table under the home part\'s fixed text, and an Enough column on the qualities; it reports both counts', t => {
  const pbytes = Buffer.from(cFile(C_ROWS));
  const r = render(t, userHome(t), project(t, pbytes));
  assert.equal(r.code, 0, r.out);
  const want = [
    '# Pact settings for this project',
    '',
    "The pact's installer wrote this file from this project's pact configuration. Each setting line can only make the pact stricter here, and the qualities list and the Cost limits list take the place of the ones in my user rules.",
    '',
    '## Qualities for this project',
    '',
    'In this project, this list takes the place of the Qualities table in my user rules: the qualities that matter here, each with its measure and the lenses that check it.',
    '',
    '| Quality | Measure | Lens | Enough |',
    '| --- | --- | --- | --- |',
    '| Functional suitability | the acceptance claims | `behaviour-lens` | Tests added |',
    '| Security | ASVS 5.0 level 1 | `adversarial-lens` | ASVS L1 · Hardening |', // the spelling is the cost row's, trimmed, and a repeat shows once
    '| Compatibility |  | `conventions-lens` |  |',
    '',
    '## Cost limits for this project',
    '',
    'In this project, this list takes the place of the Cost limits table in my user rules.',
    '',
    homeFixedText(),
    '',
    '| Cost | Counted as | Limit | At the limit |',
    '| --- | --- | --- | --- |',
    '| Tests added | Tests beyond one per acceptance claim | 2 per change | A trade-off for me |',
    '| Hardening | Guards for paths that are not security findings | 0 |  |',
    '',
  ].join('\n');
  assert.equal(r.bytes.toString('utf8'), want);
  assert.match(r.stdout, /^QUALITIES 3$/m);
  assert.match(r.stdout, /^COST-LIMITS 2$/m);
  assert.ok(r.stdout.indexOf('QUALITIES 3') < r.stdout.indexOf('COST-LIMITS 2'), 'COST-LIMITS follows QUALITIES');
});

// #288 C1: Enough on a project quality alone, with a level and no cost.
test('a project quality may carry an Enough level and no cost, with no costLimits key; the Enough column appears only when some row sets one', t => {
  const withLevel = render(t, userHome(t), project(t, qRow({ enough: 'ASVS | L1' })));
  assert.equal(withLevel.code, 0, withLevel.out);
  assert.ok(withLevel.bytes.toString('utf8').split('\n').includes('| Performance efficiency | p95 under 200 ms on checkout | `behaviour-lens` | ASVS \\| L1 |'), withLevel.bytes.toString('utf8'));
  assert.doesNotMatch(withLevel.stdout, /COST-LIMITS/);
  assert.doesNotMatch(withLevel.bytes.toString('utf8'), /Cost limits/);
});

// #288 C12: a configuration from before the change renders as it did.
test('a project qualities list with no Enough field renders the three-column table it did before; a costLimits key, or a blank level, does not add the column', t => {
  const r = render(t, userHome(t), project(t, qFile(Q_ROWS)));
  assert.equal(r.code, 0, r.out);
  assert.match(r.bytes.toString('utf8'), /^\| Quality \| Measure \| Lens \|$/m);
  assert.doesNotMatch(r.bytes.toString('utf8'), /Enough|Cost limits/);
  assert.doesNotMatch(r.stdout, /COST-LIMITS/);
  const withCosts = render(t, userHome(t), project(t, cFile(C_ROWS, Q_ROWS)));
  assert.equal(withCosts.code, 0, withCosts.out);
  assert.match(withCosts.bytes.toString('utf8'), /^\| Quality \| Measure \| Lens \|$/m, 'no row sets an Enough: no column');
  assert.match(withCosts.bytes.toString('utf8'), /^## Cost limits for this project$/m);
  assert.doesNotMatch(render(t, userHome(t), project(t, qRow({ enough: '   ' }))).bytes.toString('utf8'), /Enough/, 'a blank level sets nothing');
});

// #288 C2: the project's rows replace the home list, under a copy of the home part's fixed text held equal to it, byte for byte.
test('the fixed text a project\'s Cost limits render under is the home part\'s, byte for byte', t => {
  const out = render(t, userHome(t), project(t, cFile(C_ROWS))).bytes.toString('utf8');
  assert.ok(out.includes(`\n${homeFixedText()}\n`), 'the home part\'s fixed text appears whole');
  assert.ok(homeFixedText().length > 1500, 'the extract found the whole text');
});

// #288 C3, C4, C5, C6, C9: each shape or reference refusal, with its rule id, and nothing written.
for (const c of table('render project cost limits', {
  module: 'gate/render.mjs',
  base: () => ({ project: cFile(C_ROWS) }),
  run: (tree, t) => {
    const r = render(t, userHome(t), project(t, tree.project));
    return { ...moduleResult(r.code, r.stdout, r.stderr), files: readdirSync(r.dir) };
  },
  everyRow: r => assert.deepEqual(r.files, [], 'a refused render writes no file'),
  rows: [
    { id: 'without-qualities', plant: () => ({ project: `${JSON.stringify({ schema: 1, costLimits: C_ROWS })}\n` }), fails: ['project-cost-limits-alone'], why: 'every name resolves in one file' },
    { id: 'enough-cost-unknown', plant: () => ({ project: cFile(C_ROWS, [{ ...EQ_ROWS[0], enoughCosts: ['Linting'] }]) }), fails: ['project-enough-cost'], why: 'an Enough name finds a project cost row' },
    { id: 'enough-cost-no-list', plant: () => ({ project: `${JSON.stringify({ schema: 1, qualities: EQ_ROWS.slice(0, 1) })}\n` }), fails: ['project-enough-cost'], why: 'a project with no costLimits can name no cost' },
    { id: 'cost-empty', plant: () => ({ project: cRow({ cost: '  ' }) }), fails: ['project-cost-limits'], why: 'a cost row has a name' },
    { id: 'cost-missing', plant: () => ({ project: cFile([{ counted: 'x' }]) }), fails: ['project-cost-limits'], why: 'a cost row has a name' },
    { id: 'unknown-field', plant: () => ({ project: cRow({ lenses: ['data-lens'] }) }), fails: ['project-cost-limits'], why: 'a cost names no lenses of its own' },
    { id: 'bar-in-field', plant: () => ({ project: cRow({ counted: 'a | b' }) }), fails: ['project-cost-limits'], why: 'a bar would start a new cell' },
    { id: 'line-break-in-field', plant: () => ({ project: cRow({ atLimit: 'a\n# Heading' }) }), fails: ['project-cost-limits'], why: 'a second line' },
    { id: 'field-not-text', plant: () => ({ project: cRow({ limit: 2 }) }), fails: ['project-cost-limits'], why: 'a limit is text' },
    { id: 'duplicate', plant: () => ({ project: cFile([C_ROWS[0], { ...C_ROWS[1], cost: 'Tests added' }]) }), fails: ['project-cost-limits'], why: 'one name, one row' },
    { id: 'duplicate-by-case', plant: () => ({ project: cFile([C_ROWS[0], { ...C_ROWS[1], cost: ' TESTS ADDED ' }]) }), fails: ['project-cost-limits'], why: 'names match ignoring case and surrounding space' },
    { id: 'ten-rows', plant: () => ({ project: cFile(Array.from({ length: 10 }, (_, i) => ({ cost: `C${i}` }))) }), fails: ['project-cost-limits'], why: 'at most nine, as the install reads the count' },
    { id: 'no-rows', plant: () => ({ project: cFile([]) }), fails: ['project-cost-limits'], why: 'a list holds a row' },
    { id: 'not-a-list', plant: () => ({ project: cFile({ cost: 'x' }) }), fails: ['project-cost-limits'], why: 'a list' },
    { id: 'accepted-risks-key', plant: () => ({ project: cFile(C_ROWS, EQ_ROWS, { acceptedRisks: [] }) }), fails: ['project-key'], why: 'accepted risks live only in a threat model' },
    { id: 'enough-line-break', plant: () => ({ project: cFile(C_ROWS, [{ ...EQ_ROWS[0], enough: 'a\nb' }]) }), fails: ['project-qualities'], why: 'a level is one line' },
    { id: 'enough-costs-blank-name', plant: () => ({ project: cFile(C_ROWS, [{ ...EQ_ROWS[0], enoughCosts: ['  '] }]) }), fails: ['project-qualities'], why: 'a name in enoughCosts is text' },
    { id: 'enough-costs-not-list', plant: () => ({ project: cFile(C_ROWS, [{ ...EQ_ROWS[0], enoughCosts: 'Tests added' }]) }), fails: ['project-qualities'], why: 'a list of names' },
  ],
})) test(c.name, c.fn);

test('bad case: no project file refuses, saying there is no project configuration', t => {
  refusedWith(render(t, userHome(t), project(t)), 'project-none', /there is no project configuration/);
});

test('bad case: a bad user file refuses a project render too', t => {
  refusedWith(render(t, userHome(t, '{"schema": 1, "settings": {"usage-pause": 900}}\n'), project(t, projectFile(60))), 'config-value');
});

test('bad case: a project file that is a folder refuses', t => {
  const p = project(t);
  mkdirSync(join(p, ...PROJECT_REL), { recursive: true });
  refusedWith(render(t, userHome(t), p), 'project-file', /not a regular file/);
});

test('bad case: a project .claude folder that is a link refuses', t => {
  const p = project(t);
  const elsewhere = tempDir(t);
  writeFileSync(join(elsewhere, 'pact-config.json'), projectFile(60));
  symlinkSync(elsewhere, join(p, '.claude'), 'junction');
  refusedWith(render(t, userHome(t), p), 'project-file', /is a link/);
});

test('bad case: a project file that is a dangling link refuses', t => {
  const p = project(t);
  mkdirSync(join(p, '.claude'));
  symlinkSync(join(tempDir(t), 'gone'), join(p, ...PROJECT_REL), 'junction');
  refusedWith(render(t, userHome(t), p), 'project-file', /is a link/);
});

test('bad case: a project file over 64 KiB refuses', t => {
  refusedWith(render(t, userHome(t), project(t, `${projectFile(60)}${' '.repeat(64 * 1024)}`)), 'project-size');
});

// ------------------------------------------------------------ the scanner on the output

/** A copy of the gate's renderer and its imports, with `from` replaced by `to` in the renderer. */
function plantedRenderer(t, from, to) {
  const g = copyGate(tempDir(t, 'pact-render-gate-'));
  plantModule(g, 'render', from, to);
  return join(g, 'render.mjs');
}

const LEAD = "'# Pact settings for this project',";

test('control: an unchanged copy of the renderer passes the project render', t => {
  const r = render(t, userHome(t), project(t, projectFile(60)), plantedRenderer(t, LEAD, LEAD));
  assert.equal(r.code, 0, r.out);
});

test('bad case: a project template holding a refused character fails the text scanner, and no file is left', t => {
  const r = render(t, userHome(t), project(t, projectFile(60)), plantedRenderer(t, LEAD, "'# Pact settings for this project\\u202e',"));
  refusedWith(r, 'invisible');
});
