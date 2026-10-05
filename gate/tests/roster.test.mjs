// The roster list and the reverse routing check (#45, from #35's "The
// changeover"). The gate refuses a roster name that is not installed, in the
// pact or in an installed agent file, and a lens file that names any reviewer
// but itself. Each planted bad case asserts the rule it must fail on.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { LENSES, OLD_REVIEWERS, ROSTER } from '../pact-text.mjs';
import { REPO, failRules, lastLine, plainAgent, read, runSeamA, sealedFamiliar, stage, tempDir, writeTree } from './helpers.mjs';

const MD = 'claude/CLAUDE.md';
// A lens that the state after the QA swap does not install (#47).
const ABSENT = 'unstated-lens';

function file(root, rel) {
  return join(root, ...rel.split('/'));
}

function edit(root, rel, fn) {
  const p = file(root, rel);
  writeFileSync(p, fn(readFileSync(p, 'utf8')));
}

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

test("the roster's nine lenses are the cross script's lenses", () => {
  const src = read(join(REPO, 'cross', 'cross.mjs'));
  const areas = src.slice(src.indexOf('const AREAS'), src.indexOf(']);', src.indexOf('const AREAS')));
  const names = [...areas.matchAll(/lenses: \[([^\]]*)\]/g)].flatMap(m => [...m[1].matchAll(/'([a-z-]+)'/g)].map(x => x[1]));
  assert.equal(names.length, 9);
  assert.deepEqual(names.sort(), [...LENSES].sort());
});

// ------------------------------------------------------------ the state after ticket 2 (the QA swap)

test('the real tree passes: the pact and the agents name only installed reviewers', t => {
  const r = seam(t);
  assert.equal(r.code, 0, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: pass', r.out);
  assert.ok(!failRules(r.stdout).some(x => x.startsWith('roster')), r.out);
});

// ------------------------------------------------------------ the pact

// Each place the pact names reviewers: a string there, after which a plant goes.
const PLACES = {
  'move 2': '`plan-reviewer` reviews the spec.',
  'move 4': 'Then run the QA pair,',
  'the security route': 'however small: `security-reviewer` on the',
  'what no skill overrides': '`integrity-lens`, in move 4.',
  'the tier table': '| **Thorough** | On an issue: `to-spec`, `plan-reviewer`,',
  'the reading-agents paragraph': '**Reading agents.** `plan-reviewer`,',
};

for (const [place, at] of Object.entries(PLACES)) {
  for (const [form, plant] of [
    ['in a code span', `\`${ABSENT}\``],
    ['as plain text', ABSENT],
  ]) {
    test(`bad case: a roster name that is not installed, ${form}, in ${place}`, t => {
      const r = seam(t, {}, root =>
        edit(root, MD, s => {
          assert.ok(s.includes(at), `the pact no longer holds ${JSON.stringify(at)}`);
          return s.replace(at, () => `${at} ${plant}`);
        }),
      );
      expectRule(r, 'roster', MD);
      assert.ok(fails(r.stdout, 'roster').some(l => l.includes(`names ${ABSENT}, which is not installed`)), r.out);
    });
  }
}

test('bad case: an old reviewer that is not installed, named in the pact', t => {
  // The QA swap removed test-reviewer; the pact may not name it again.
  const r = seam(t, {}, root => edit(root, MD, s => s.replace(PLACES['move 4'], () => `${PLACES['move 4']} \`test-reviewer\``)));
  expectRule(r, 'roster', MD);
  assert.ok(fails(r.stdout, 'roster').some(l => l.includes('names test-reviewer, which is not installed')), r.out);
});

test('bad case: the retired checker, back with its old tools, has no allow-list entry and fails', t => {
  const r = seam(t, { 'claude/agents/result-checker.md': plainAgent('result-checker', [], 'tools: [Read, Glob, Grep, Bash, PowerShell, ToolSearch, mcp__Claude_Browser__*]') });
  expectRule(r, 'tools', 'claude/agents/result-checker.md');
});

test('bad case: a roster name in another case, or with a non-ASCII hyphen, still counts', t => {
  for (const plant of ['Unstated-Lens', 'unstated‑lens', 'UNSTATED–LENS']) {
    const r = seam(t, {}, root => edit(root, MD, s => s.replace(PLACES['move 2'], () => `${PLACES['move 2']} ${plant}`)));
    expectRule(r, 'roster', MD);
  }
});

test('bad case: a roster name wrapped at its hyphen, or written with a minus sign, still counts', t => {
  // result-checker's advisory A1 on #45: a line wrap is the likely accident.
  for (const plant of ['unstated-\n   lens', 'unstated‑\nlens', 'unstated−lens']) {
    const r = seam(t, {}, root => edit(root, MD, s => s.replace(PLACES['move 2'], () => `${PLACES['move 2']} See ${plant}.`)));
    expectRule(r, 'roster', MD);
  }
  const r = seam(t, { 'claude/agents/probe.md': plainAgent('probe').replace('Body.', 'Hand off to unstated-\nlens.') });
  expectRule(r, 'roster', 'claude/agents/probe.md');
});

test('the roster check names the line where a wrapped name starts', t => {
  const r = seam(t, {}, root => edit(root, MD, s => s.replace(PLACES['move 2'], () => `${PLACES['move 2']} See unstated-\n   lens.`)));
  const at = read(join(REPO, 'claude', 'CLAUDE.md')).split('\n').findIndex(l => l.includes(PLACES['move 2'])) + 1;
  assert.ok(fails(r.stdout, 'roster').some(l => l.startsWith(`${MD} line ${at}: names ${ABSENT}`)), r.out);
});

test('whole words only: a roster name inside a longer word, and names off the roster, pass', t => {
  const r = seam(t, {}, root =>
    edit(root, MD, s => s.replace(PLACES['move 2'], () => `${PLACES['move 2']} See preunstated-lens, unstated-lenses, unstated_lens and \`fable\`.`)),
  );
  assert.equal(r.code, 0, r.out);
});

test('canary: the roster check prints the roster constant, never the planted spelling', t => {
  const plant = 'UnStAtEd‑LeNs';
  const r = seam(t, {}, root => edit(root, MD, s => s.replace(PLACES['move 2'], () => `${PLACES['move 2']} ${plant}`)));
  expectRule(r, 'roster', MD);
  assert.ok(!r.stdout.includes('UnStAtEd'), r.out);
  assert.ok(!r.stdout.includes('‑'), r.out);
});

// ------------------------------------------------------------ installed agent files

test('bad case: an installed agent whose body names a roster name that is not installed', t => {
  const r = seam(t, { 'claude/agents/probe.md': plainAgent('probe').replace('Body.', `Hand off to \`${ABSENT}\`.`) });
  expectRule(r, 'roster', 'claude/agents/probe.md');
});

test('bad case: an installed agent whose description names a roster name that is not installed', t => {
  const r = seam(t, { 'claude/agents/probe.md': plainAgent('probe').replace('A test agent.', `A test agent beside ${ABSENT}.`) });
  expectRule(r, 'roster', 'claude/agents/probe.md');
});

test('bad case: a sealed familiar whose body names a roster name that is not installed', t => {
  const r = seam(t, {}, root => sealedFamiliar(root, 'probe', { body: `Hand off to ${ABSENT}.\n` }));
  expectRule(r, 'roster', 'familiars/probe.md');
});

test('bad case: with security-reviewer gone, plan-reviewer, which names it, fails', t => {
  const r = seam(t, {}, root => rmSync(file(root, 'claude/agents/security-reviewer.md')));
  expectRule(r, 'roster', 'claude/agents/plan-reviewer.md');
});

test('an installed agent that names an installed reviewer, or itself, passes', t => {
  const r = seam(t, { 'claude/agents/probe.md': plainAgent('probe').replace('Body.', 'Hand off to `security-reviewer`; probe is my name.') });
  assert.equal(r.code, 0, r.out);
});

// ------------------------------------------------------------ lens files name only themselves

const lensAgent = (name, { description = 'A test lens.', body = 'Body.\n' } = {}) =>
  plainAgent(name).replace('A test agent.', description).replace('Body.\n', body);

test('a lens file that names only itself passes', t => {
  const r = seam(t, { [`claude/agents/${ABSENT}.md`]: lensAgent(ABSENT, { body: `I am \`${ABSENT}\`.\n` }) });
  assert.equal(r.code, 0, r.out);
});

test('bad case: a lens whose description names an installed old reviewer', t => {
  const r = seam(t, { [`claude/agents/${ABSENT}.md`]: lensAgent(ABSENT, { description: 'Replaces plan-reviewer.' }) });
  expectRule(r, 'roster-lens', `claude/agents/${ABSENT}.md`);
});

test('bad case: a sealed lens familiar whose description names an installed old reviewer', t => {
  const r = seam(t, {}, root =>
    sealedFamiliar(root, ABSENT, { lines: [`name: ${ABSENT}`, 'description: Replaces plan-reviewer.', 'tools: [Read, Glob, Grep]'] }),
  );
  expectRule(r, 'roster-lens', `familiars/${ABSENT}.md`);
});

test('bad case: a lens whose body names its partner, installed or not', t => {
  const alone = seam(t, { 'claude/agents/data-lens.md': lensAgent('data-lens', { body: 'Never read `adversarial-lens`.\n' }) });
  expectRule(alone, 'roster-lens', 'claude/agents/data-lens.md');
  const both = seam(t, {
    'claude/agents/data-lens.md': lensAgent('data-lens', { body: 'Never read `adversarial-lens`.\n' }),
    'claude/agents/adversarial-lens.md': lensAgent('adversarial-lens'),
  });
  expectRule(both, 'roster-lens', 'claude/agents/data-lens.md');
  // The real QA pair, installed together, may not name each other either.
  const real = seam(t, {}, root => edit(root, 'claude/agents/integrity-lens.md', s => s.replace('# integrity-lens', '# integrity-lens\n\nNever read `behaviour-lens`.')));
  expectRule(real, 'roster-lens', 'claude/agents/integrity-lens.md');
});

test('bad case: a lens that names an installed old reviewer in its body, as plain text', t => {
  const r = seam(t, { [`claude/agents/${ABSENT}.md`]: lensAgent(ABSENT, { body: 'Read what security-reviewer found.\n' }) });
  expectRule(r, 'roster-lens', `claude/agents/${ABSENT}.md`);
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
  assert.ok(found.size > 0, 'the search found nothing: it is not looking');
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
