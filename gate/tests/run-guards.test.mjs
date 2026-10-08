// Guards over the real tree for the test runner (#140), each with a planted
// bad case it is seen to catch. Guard 1: the full tier is every top-level test
// file, checked against a listing this file builds itself. Guard 3: the
// install smoke file exists and is in the install tier. This file imports
// nothing from the runner: it runs the runner's --list mode as a child.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tempDir } from './helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SMOKE = 'install-smoke.test.mjs';
const HARNESS = ['install', 'harness.mjs'].join('-');

/** The runner's --list output for a tier in `dir`, as { names, reasons }; throws unless it exits 0. */
function listed(dir, tier) {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [join(dir, 'run.mjs'), tier, '--list'], { env, encoding: 'utf8', timeout: 60_000 });
  if (r.status !== 0) throw new Error(`run.mjs ${tier} --list exited ${r.status}`);
  const rows = r.stdout
    .split('\n')
    .filter(Boolean)
    .map(l => l.split('\t'));
  const reasons = new Map(rows.map(([p, why]) => [p.replace(/^gate\/tests\//, ''), why]));
  return { names: [...reasons.keys()], reasons };
}

/** Guard 1: the top-level test files, by a plain listing, that the full tier leaves out or adds. */
export function fullTierGaps(dir) {
  const plain = readdirSync(dir)
    .filter(n => n.endsWith('.test.mjs'))
    .sort();
  const full = listed(dir, 'full').names;
  return { missing: plain.filter(n => !full.includes(n)), extra: full.filter(n => !plain.includes(n)) };
}

/** Guard 3: what is wrong with the smoke file, or [] when it exists and is in the install tier. */
export function smokeProblems(dir) {
  if (!existsSync(join(dir, SMOKE))) return ['the smoke file is missing'];
  const out = [];
  const why = listed(dir, 'full').reasons.get(SMOKE) ?? '';
  if (!why.startsWith('install tier')) out.push(`the full tier gives the smoke file as "${why}", not the install tier`);
  if (listed(dir, 'fast').names.includes(SMOKE)) out.push('the fast tier runs the smoke file');
  return out;
}

/** A planted tests folder: the runner, the copy list and `files`. */
function plantDir(t, files) {
  const dir = tempDir(t, 'pact-guard-');
  for (const f of ['run.mjs', 'copy-list.mjs']) copyFileSync(join(HERE, f), join(dir, f));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

const PASSING = "import { test } from 'node:test';\ntest('p', () => {});\n";
const SMOKE_SRC = `import '${'./' + HARNESS}';\n${PASSING}`;

test('guard 1: the full tier is every top-level test file in the real tree', () => {
  const gaps = fullTierGaps(HERE);
  assert.deepEqual(gaps, { missing: [], extra: [] });
  assert.ok(readdirSync(HERE).filter(n => n.endsWith('.test.mjs')).length > 30, 'the listing found the real test files');
});

test('guard 1 catches a narrowed full-tier filter in the runner', t => {
  const dir = plantDir(t, { 'a.test.mjs': PASSING, 'b.test.mjs': PASSING, 'c.test.mjs': PASSING });
  assert.deepEqual(fullTierGaps(dir), { missing: [], extra: [] });
  const src = readFileSync(join(dir, 'run.mjs'), 'utf8');
  const anchor = '.filter(e => e.name.endsWith(TEST_SUFFIX))';
  assert.ok(src.includes(anchor), 'the plant found its anchor in the runner');
  writeFileSync(join(dir, 'run.mjs'), src.replace(anchor, ".filter(e => e.name.endsWith(TEST_SUFFIX) && !e.name.startsWith('b'))"));
  assert.deepEqual(fullTierGaps(dir), { missing: ['b.test.mjs'], extra: [] });
});

test('guard 3: the smoke file exists in the real tree and is in the install tier', () => {
  assert.deepEqual(smokeProblems(HERE), []);
});

test('guard 3 catches a missing smoke file, and one outside the install tier', t => {
  const good = plantDir(t, { 'a.test.mjs': PASSING, [SMOKE]: SMOKE_SRC, [HARNESS]: '' });
  assert.deepEqual(smokeProblems(good), []);
  const missing = plantDir(t, { 'a.test.mjs': PASSING, [HARNESS]: '' });
  assert.deepEqual(smokeProblems(missing), ['the smoke file is missing']);
  const outside = plantDir(t, { 'a.test.mjs': PASSING, [SMOKE]: PASSING, [HARNESS]: '' });
  assert.deepEqual(smokeProblems(outside), ['the full tier gives the smoke file as "fast tier", not the install tier', 'the fast tier runs the smoke file']);
});

test('the runner\'s own test files are in the fast tier, so fast runs them', () => {
  const fast = listed(HERE, 'fast').names;
  for (const f of ['run.test.mjs', 'run-guards.test.mjs']) assert.ok(fast.includes(f), f);
});

// ------------------------------------------------------------ the documented commands clear NODE_OPTIONS

const REPO = join(HERE, '..', '..');
const WIN = process.platform === 'win32';

/** AGENTS.md's "Running the gate's tests" section. */
function section() {
  const text = readFileSync(join(REPO, 'AGENTS.md'), 'utf8');
  const start = text.indexOf("## Running the gate's tests\n");
  assert.ok(start >= 0, 'AGENTS.md has no "Running the gate\'s tests" section');
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end < 0 ? undefined : end);
}

/** The section's code spans that start node on the runner. */
function runnerCommands(text) {
  return [...text.matchAll(/`([^`\n]+)`/g)].map(m => m[1]).filter(s => /\bnode\b/.test(s) && s.includes('run.mjs'));
}

const PS_FORM = '$env:NODE_OPTIONS = $null; node gate/tests/run.mjs ';
const POSIX_FORM = 'env -u NODE_OPTIONS node gate/tests/run.mjs ';

/** What is wrong with a section's runner commands: [] when there is one PowerShell and one POSIX form, each clearing NODE_OPTIONS. */
export function commandProblems(text) {
  const cmds = runnerCommands(text);
  const out = cmds.filter(c => !c.startsWith(PS_FORM) && !c.startsWith(POSIX_FORM)).map(c => `a runner command that keeps NODE_OPTIONS: ${c}`);
  if (!cmds.some(c => c.startsWith(PS_FORM))) out.push('no PowerShell form');
  if (!cmds.some(c => c.startsWith(POSIX_FORM))) out.push('no POSIX form');
  return out;
}

test('AGENTS.md gives the runner in one PowerShell and one POSIX form, each clearing NODE_OPTIONS', () => {
  assert.deepEqual(commandProblems(section()), []);
});

test('the command check catches a runner command that keeps NODE_OPTIONS', () => {
  const planted = `${section()}\n- Or just run \`node gate/tests/run.mjs full\`.\n`;
  assert.deepEqual(commandProblems(planted), ['a runner command that keeps NODE_OPTIONS: node gate/tests/run.mjs full']);
});

test('the Linux container script starts the runner with NODE_OPTIONS cleared', () => {
  const sh = readFileSync(join(HERE, 'fixtures', 'linux', 'run.sh'), 'utf8');
  const lines = sh.split('\n').filter(l => /\bnode\b.*run\.mjs/.test(l) && !l.trim().startsWith('#'));
  assert.deepEqual(lines, ['env -u NODE_OPTIONS node gate/tests/run.mjs full --reporter tap']);
});

function which(cmd) {
  const r = spawnSync(WIN ? 'where.exe' : 'which', [cmd], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}

/**
 * Run a documented command, with `<tier>` as full, in a planted repo whose
 * inherited NODE_OPTIONS preloads a script that marks the runner's own
 * process. Returns { status, last, marked }.
 */
function runDocumented(t, cmd, pwsh = WIN) {
  const root = join(tempDir(t, 'pact-doc-'), 'repo');
  const tests = join(root, 'gate', 'tests');
  mkdirSync(tests, { recursive: true });
  for (const f of ['run.mjs', 'copy-list.mjs']) copyFileSync(join(HERE, f), join(tests, f));
  writeFileSync(join(tests, 'a.test.mjs'), PASSING);
  const marks = tempDir(t, 'pact-doc-marks-');
  const preload = join(tempDir(t, 'pact-doc-preload-'), 'preload.cjs');
  writeFileSync(preload, `if (/run\\.mjs$/.test(process.argv[1] ?? '')) require('node:fs').writeFileSync(require('node:path').join(${JSON.stringify(marks)}, 'runner-' + process.pid), '');\n`);
  const env = { ...process.env, NODE_OPTIONS: `--require ${JSON.stringify(preload.replace(/\\/g, '/'))}` };
  delete env.NODE_TEST_CONTEXT;
  const line = cmd.replace('<tier>', 'full');
  const r = pwsh
    ? spawnSync(which('pwsh'), ['-NoProfile', '-NonInteractive', '-Command', line], { cwd: root, env, encoding: 'utf8', timeout: 120_000 })
    : spawnSync('/bin/sh', ['-c', line], { cwd: root, env, encoding: 'utf8', timeout: 120_000 });
  const lines = (r.stderr ?? '').split(/\r?\n/).filter(Boolean);
  return { status: r.status, last: lines[lines.length - 1], marked: readdirSync(marks).length > 0 };
}

test('the documented command for this shell keeps an inherited preload out of the runner itself', t => {
  const form = WIN ? PS_FORM : POSIX_FORM;
  assert.ok(!WIN || which('pwsh'), 'no pwsh found; this case must not go unrun');
  const cmd = runnerCommands(section()).find(c => c.startsWith(form));
  assert.ok(cmd, `no documented ${WIN ? 'PowerShell' : 'POSIX'} form`);
  const r = runDocumented(t, cmd);
  assert.equal(r.last, 'RESULT: full tier, 1 files, pass');
  assert.equal(r.status, 0);
  assert.equal(r.marked, false, 'the inherited preload ran in the runner');
});

test('a documented command without the clearing lets the preload into the runner, so the case above can fail', t => {
  const r = runDocumented(t, 'node gate/tests/run.mjs <tier>');
  assert.equal(r.marked, true, 'the planted preload did not run in the runner');
});