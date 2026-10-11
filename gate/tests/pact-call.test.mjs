// How the pact calls the cross script (#45): by its full installed path
// through $HOME, never `~` and never relative, with NODE_OPTIONS cleared, and
// naming both failure exit codes. Since #261 the commands and the exit codes
// sit in the review procedure file, which the rules file points to; the
// commands under test are read from it, never copied here. Only the POSIX
// form is run: the suite never starts PowerShell (#210, the owner's
// decision), so the PowerShell form is checked as text.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { test } from 'node:test';
import { cross, qaPair, report } from './cross-helpers.mjs';
import { REPO } from './text.mjs';
import { read, tempDir } from './tree.mjs';

const WIN = process.platform === 'win32';
const LEAD = '**The cross script**';
const LIVE = '"$HOME/.claude/pact/cross.mjs"';

const PACT_TEXT = () => read(join(REPO, 'claude', 'review.md'));

/** The pact's cross-script paragraph: from its bold lead to the next blank line. */
function paragraph(text = PACT_TEXT()) {
  const lines = text.split('\n');
  const i = lines.findIndex(l => l.startsWith(LEAD));
  assert.ok(i >= 0, `the pact has no paragraph led by ${LEAD}`);
  const out = [];
  for (let j = i; j < lines.length && lines[j].trim() !== ''; j += 1) out.push(lines[j]);
  return out.join('\n');
}

/** The paragraph's code spans that run the script. */
function commands(text) {
  return [...paragraph(text).matchAll(/`([^`\n]+)`/g)].map(m => m[1]).filter(s => s.includes('cross.mjs'));
}

function which(cmd) {
  const r = spawnSync(WIN ? 'where.exe' : 'which', [cmd], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}

// A POSIX shell: Git's own on Windows, the system's elsewhere.
const SH = WIN ? [join(dirname(which('git')), '..', 'bin', 'sh.exe'), join(dirname(which('git')), '..', 'usr', 'bin', 'sh.exe')].find(existsSync) : '/bin/sh';

// #261 C2
test('the paragraph gives one PowerShell and one POSIX command, each through $HOME and clearing NODE_OPTIONS', () => {
  const cmds = commands();
  assert.equal(cmds.length, 2, cmds.join('\n'));
  const [ps, posix] = [cmds.find(c => c.includes('$env:NODE_OPTIONS')), cmds.find(c => c.startsWith('env -u NODE_OPTIONS '))];
  assert.ok(ps && posix, cmds.join('\n'));
  for (const c of cmds) {
    assert.ok(c.includes(`node ${LIVE}`), c);
    assert.ok(!c.includes('~'), `no ~ in ${c}`);
  }
  assert.ok(ps.startsWith('$env:NODE_OPTIONS = $null; node '), ps);
});

// The PowerShell form is never run here (ADR 0048), so it is held word for
// word: a command chained before the call would pass a prefix check (#210).
const EXACT = ['$env:NODE_OPTIONS = $null; node "$HOME/.claude/pact/cross.mjs" ARGUMENTS', 'env -u NODE_OPTIONS node "$HOME/.claude/pact/cross.mjs" ARGUMENTS'];

/** Whether a text's cross-script commands are exactly the documented forms. */
const exactForms = text => JSON.stringify([...commands(text)].sort()) === JSON.stringify([...EXACT].sort());

test('the two commands are exactly the documented forms, and nothing else', () => {
  assert.deepEqual([...commands()].sort(), [...EXACT].sort());
  assert.ok(exactForms(PACT_TEXT()));
});

test('bad case: a command chained before the PowerShell call fails the exact check, though it keeps the prefix and the path', () => {
  const real = PACT_TEXT();
  assert.ok(real.includes(EXACT[0]), 'the pact holds the PowerShell form to plant in');
  const text = real.replace(EXACT[0], () => EXACT[0].replace('node "$HOME', () => 'node ./x.mjs; node "$HOME'));
  const ps = commands(text).find(c => c.includes('$env:NODE_OPTIONS'));
  assert.ok(ps.startsWith('$env:NODE_OPTIONS = $null; node ') && ps.includes(`node ${LIVE}`), 'the plant keeps what the looser checks look for');
  assert.equal(exactForms(text), false);
});

// The review file carries the exit codes and the four data-handling lines.
// #261 C2
test('the review file names both failure exit codes, what each means, and the four data-handling lines', () => {
  const p = PACT_TEXT().replace(/\s+/g, ' ');
  for (const words of [
    '**1:** a report failed a check, and no section was written. Post only the fenced, folded reports it wrote',
    '**2:** a report alone is over the comment limit. Post the section and the reports that fit.',
    'Its last line is always a `RESULT:` line.** Output without one means the script is unavailable: stop and say so.',
    'Post only the fenced reports and sections the cross script wrote. Never rebuild them by hand, and never post the raw report text.',
    'A report the cross script kept local or left out stays a local file.** Name its path to me in chat, never in the record.',
    "A report's \"For the owner\" section holds no line numbers, codes or paths.",
  ]) assert.ok(p.includes(words), words);
});

// A session that skips the review file still runs the right script, and is told to read the file.
// #261 C1
test('the rules file points to the review file and names the installed cross script', () => {
  const rules = read(join(REPO, 'claude', 'CLAUDE.md')).replace(/\s+/g, ' ');
  assert.ok(rules.includes("read the pact's review procedure, `~/.claude/pact/review.md`."), 'the review file pointer');
  assert.ok(rules.includes('the installed script, `~/.claude/pact/cross.mjs`, never a copy in a repo.'), 'the installed script');
});

/** The last non-empty line of the script's stdout. */
const lastOut = r => r.stdout.trimEnd().split('\n').pop();

test("the script's own output always ends with a RESULT line: a usage failure, a refusal, a pass and an oversize report", t => {
  const usage = spawnSync(process.execPath, [join(REPO, 'cross', 'cross.mjs')], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
  assert.equal(usage.status, 1);
  assert.equal(lastOut(usage), 'RESULT: fail');

  const refusal = cross(t, { reports: { ...qaPair(), 'integrity-lens': report('{"lens": "integrity-lens",') } });
  assert.equal(refusal.code, 1, refusal.stdout);
  assert.equal(lastOut(refusal), 'RESULT: fail');

  const pass = cross(t, { reports: qaPair() });
  assert.equal(pass.code, 0, pass.stdout);
  assert.equal(lastOut(pass), 'RESULT: pass');

  const big = { ...qaPair() };
  big['integrity-lens'] = big['integrity-lens'].replace('A synthetic report.', `A synthetic report. ${'x'.repeat(70000)}`);
  const oversize = cross(t, { reports: big });
  assert.equal(oversize.code, 2, oversize.stdout);
  assert.equal(lastOut(oversize), 'RESULT: oversize');
});

test('with the live script missing, the POSIX command exits 1 with no RESULT line: the "unavailable" case is real', t => {
  assert.ok(SH, 'no POSIX shell found; this case must not go unrun');
  const { cwd, home } = setUp(t);
  const missing = join(home, 'elsewhere');
  mkdirSync(missing);
  const r = runSh(cwd, missing, bare(commands().find(c => c.startsWith('env -u NODE_OPTIONS '))));
  const out = `${r.stdout}${r.stderr}`;
  assert.equal(r.status, 1, out);
  assert.doesNotMatch(r.stdout, /^RESULT: /m, out);
  assert.ok(!out.includes('PLANTED') && !out.includes('PRELOAD'), out);
});

/**
 * A working folder holding planted copies a wrong call could reach, a
 * NODE_OPTIONS preload in it, and a home (with a space in its path) holding
 * the real script. Each planted copy prints PLANTED; the preload prints PRELOAD.
 */
function setUp(t) {
  const root = tempDir(t, 'pact-call-');
  const cwd = join(root, 'repo');
  const home = join(root, 'my home');
  const planted = "process.stdout.write('PLANTED\\n');\n";
  for (const rel of ['~/.claude/pact', '$HOME/.claude/pact', '.claude/pact', 'pact', '.']) {
    mkdirSync(join(cwd, ...rel.split('/')), { recursive: true });
    writeFileSync(join(cwd, ...rel.split('/'), 'cross.mjs'), planted);
  }
  writeFileSync(join(cwd, 'preload.cjs'), "process.stdout.write('PRELOAD\\n');\n");
  mkdirSync(join(home, '.claude', 'pact'), { recursive: true });
  cpSync(join(REPO, 'cross', 'cross.mjs'), join(home, '.claude', 'pact', 'cross.mjs'));
  return { cwd, home };
}

function env(extra) {
  const e = { ...process.env, ...extra };
  e.NODE_OPTIONS = '--require ./preload.cjs';
  const key = Object.keys(e).find(k => /^path$/i.test(k)) ?? 'PATH';
  e[key] = `${dirname(process.execPath)}${delimiter}${e[key]}`;
  return e;
}

function runSh(cwd, home, cmd) {
  return spawnSync(SH, ['-c', cmd], { cwd, encoding: 'utf8', env: env({ HOME: home }), timeout: 60_000 });
}

/** The real script, run with no arguments, refuses with its usage line: proof it is what ran. */
function reachedInstalled(r) {
  const out = `${r.stdout}${r.stderr}`;
  assert.match(r.stdout, /^FAIL usage: /m, out);
  assert.equal(r.status, 1, out);
  assert.ok(!out.includes('PLANTED'), `a planted copy ran:\n${out}`);
  assert.ok(!out.includes('PRELOAD'), `NODE_OPTIONS was not cleared:\n${out}`);
}

const bare = c => c.replace(/\s*ARGUMENTS/, '');

test("the pact's POSIX command reaches the installed script, not a planted one", t => {
  assert.ok(SH, 'no POSIX shell found; the POSIX form must not go untested');
  const { cwd, home } = setUp(t);
  const posix = commands().find(c => c.startsWith('env -u NODE_OPTIONS '));
  reachedInstalled(runSh(cwd, home, bare(posix)));
});

// Each wrong call is caught, and for its own reason: the marker it trips.
function caught(r, marker) {
  assert.throws(() => reachedInstalled(r));
  assert.ok(`${r.stdout}${r.stderr}`.includes(marker), `${marker} expected:\n${r.stdout}${r.stderr}`);
}

test('control (POSIX): a call through ~, a single-quoted $HOME, or without clearing NODE_OPTIONS is caught', t => {
  assert.ok(SH, 'no POSIX shell found; the POSIX control must not go unrun');
  const { cwd, home } = setUp(t);
  caught(runSh(cwd, home, 'env -u NODE_OPTIONS node "~/.claude/pact/cross.mjs"'), 'PLANTED');
  caught(runSh(cwd, home, "env -u NODE_OPTIONS node '$HOME/.claude/pact/cross.mjs'"), 'PLANTED');
  caught(runSh(cwd, home, 'node "$HOME/.claude/pact/cross.mjs"'), 'PRELOAD');
});
