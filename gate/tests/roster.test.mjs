// The roster list (#45, from #35's "The changeover") and the name search that
// keeps retired reviewers out of the repo. The gate's reverse routing check on
// the pact's text went with the thin gate (#261); a retired reviewer's tools
// are still refused by the tool allow-list.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { LENSES, OLD_REVIEWERS, ROSTER } from '../pact-text.mjs';
import { runSeamA } from './gate-run.mjs';
import { stage } from './payload.mjs';
import { REPO, failRules, lastLine, plainAgent } from './text.mjs';
import { read, tempDir, writeTree } from './tree.mjs';

function seam(t, files = {}, prep) {
  const root = stage(t, files);
  if (prep) prep(root);
  return runSeamA(root);
}

/** The FAIL lines of one rule, as "file[ line N]: reason". */
function fails(stdout, rule) {
  return stdout
    .split('\n')
    .filter(l => l.startsWith(`FAIL ${rule}: `))
    .map(l => l.slice(`FAIL ${rule}: `.length));
}

function expectRule(r, rule, fileName) {
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.notEqual(r.code, 0, r.out);
  assert.ok(failRules(r.stdout).includes(rule), `expected rule "${rule}" in:\n${r.out}`);
  if (fileName) assert.ok(fails(r.stdout, rule).some(l => l.startsWith(`${fileName}`)), `expected ${fileName} under "${rule}" in:\n${r.out}`);
}

// ------------------------------------------------------------ the roster list

test('the roster list holds thirteen names: the four of today and the nine lenses', () => {
  assert.equal(ROSTER.length, 13);
  assert.equal(new Set(ROSTER).size, 13);
  assert.deepEqual([...OLD_REVIEWERS].sort(), ['plan-reviewer', 'result-checker', 'security-reviewer', 'test-reviewer']);
  assert.equal(LENSES.length, 9);
  assert.deepEqual([...ROSTER].sort(), [...OLD_REVIEWERS, ...LENSES].sort());
  assert.ok(Object.isFrozen(ROSTER) && Object.isFrozen(LENSES) && Object.isFrozen(OLD_REVIEWERS));
});

// #264: the review file's table of pairs names every lens the roster does, and no other.
test("the roster's nine lenses are the lenses in the review file's table of pairs", () => {
  const src = read(join(REPO, 'claude', 'review.md'));
  const from = src.indexOf('**The pairs.**');
  const table = src.slice(from, src.indexOf('**The template.**', from));
  assert.ok(from >= 0 && table.includes('| --- |'), 'the table of pairs is missing');
  // Nine reviews, one row each: a deleted row changes the count even when its lenses appear in another row.
  assert.equal(table.split('\n').filter(l => /^\| .+ \| `[a-z-]+-lens`/.test(l)).length, 9);
  const names = new Set([...table.matchAll(/`([a-z][a-z-]*-lens)`/g)].map(m => m[1]));
  assert.deepEqual([...names].sort(), [...LENSES].sort());
});

// ------------------------------------------------------------ a retired reviewer's tools

test('bad case: the retired checker, back with its old tools, has no allow-list entry and fails', t => {
  const r = seam(t, { 'claude/agents/result-checker.md': plainAgent('result-checker', [], 'tools: [Read, Glob, Grep, Bash, PowerShell, ToolSearch, mcp__Claude_Browser__*]') });
  expectRule(r, 'tools', 'claude/agents/result-checker.md');
});
// ------------------------------------------------------------ the name search

// The five places the name search skips: records, the cloud copy (#41), and
// historical snapshots that tests depend on.
const SKIP = ['docs/adr/', 'docs/log/', 'docs/plans/', 'cloud-sessions/', 'gate/tests/fixtures/'];
// The roster list itself must hold the four old names for as long as the gate
// refuses them (#35, "The roster"), so its one defining line, and this file,
// which tests that list and plants the names, are not searched (#47).
const ROSTER_LINE = /^export const OLD_REVIEWERS = .*$/m;
const ROSTER_HOME = { 'gate/pact-text.mjs': text => text.replace(ROSTER_LINE, ''), 'gate/tests/roster.test.mjs': () => '' };

/** The old reviewers named, as whole words, in `files` ({ rel: text }), outside the skipped places. */
function nameSearch(files) {
  const found = new Map();
  for (const [rel, text] of Object.entries(files)) {
    if (SKIP.some(p => rel.startsWith(p))) continue;
    const searched = ROSTER_HOME[rel] ? ROSTER_HOME[rel](text) : text;
    for (const name of OLD_REVIEWERS) {
      if (new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`, 'i').test(searched)) found.set(name, [...(found.get(name) ?? []), rel]);
    }
  }
  return found;
}

/** The reviewers a tree installs: agent files in claude/agents and familiars. */
function installedIn(root) {
  return new Set(OLD_REVIEWERS.filter(n => existsSync(join(root, 'claude', 'agents', `${n}.md`)) || existsSync(join(root, 'familiars', `${n}.md`))));
}

test('the name search finds only the installed reviewers', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8' }).split('\0').filter(Boolean);
  const files = Object.fromEntries(tracked.filter(rel => existsSync(join(REPO, rel))).map(rel => [rel, readFileSync(join(REPO, rel), 'latin1')]));
  const found = nameSearch(files);
  // From the security swap (#100) no old reviewer is installed or named, so the search finds none. It is
  // still looking: the same files with one old name planted in the README are caught.
  assert.ok(nameSearch({ ...files, 'README.md': `${files['README.md']}\nAsk security-reviewer.\n` }).has('security-reviewer'), 'the search is not looking');
  const installed = installedIn(REPO);
  for (const [name, where] of found) assert.ok(installed.has(name), `${name} is named in ${where.join(', ')} but not installed`);
});

test('bad case: outside its one defining line, the roster file is searched', () => {
  const found = nameSearch({ 'gate/pact-text.mjs': "export const OLD_REVIEWERS = Object.freeze(['result-checker']);\n// result-checker\n" });
  assert.deepEqual([...found.keys()], ['result-checker']);
  assert.equal(nameSearch({ 'gate/pact-text.mjs': "export const OLD_REVIEWERS = Object.freeze(['result-checker']);\n" }).size, 0);
});

test('bad case: the name search reports a reviewer that is named but not installed', t => {
  const root = tempDir(t);
  writeTree(root, { 'claude/agents/plan-reviewer.md': 'x', 'README.md': 'Ask `plan-reviewer` and `result-checker`.', 'docs/log/old.md': 'test-reviewer' });
  const found = nameSearch({ 'README.md': read(join(root, 'README.md')), 'docs/log/old.md': read(join(root, 'docs', 'log', 'old.md')) });
  const installed = installedIn(root);
  const missing = [...found.keys()].filter(n => !installed.has(n));
  assert.deepEqual(missing, ['result-checker'], 'a skipped place is not searched, an installed name passes, a missing one is reported');
});
