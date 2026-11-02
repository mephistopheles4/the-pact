// The pact's word budget (ADR 0129). The rules file, rendered from the default
// configuration with both pact tools on, and each agent file stay within a
// budget, so adding a rule means cutting one. Raising a budget changes a
// built-in default that bounds something, so it is a spec change.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { runCore } from './gate-run.mjs';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const SOURCE = join(REPO, 'claude', 'CLAUDE.md');
const AGENTS = join(REPO, 'claude', 'agents');
const RULES = 'the rules file';

// Each budget is the smallest multiple of 50 above the file's size after the
// #450 cuts (S5.1), measured on the rebased branch. The rules file's is the
// same measure after the #464 T4 cut.
const BUDGETS = Object.freeze({
  [RULES]: 2250,
  'adversarial-lens': 1800,
  'behaviour-lens': 1450,
  'conventions-lens': 1100,
  'data-lens': 2000,
  'executability-lens': 1600,
  'integrity-lens': 1900,
  'reader-lens': 1350,
  scout: 600,
  'unstated-lens': 1000,
});

/** Words: runs of non-whitespace, so CRLF and LF count the same. */
const words = text => text.split(/\s+/).filter(Boolean).length;

/** One line per file whose words go past its budget: name, count and budget. */
const overBudget = files => files.filter(f => words(f.text) > BUDGETS[f.name]).map(f => `${f.name}: ${words(f.text)} words, budget ${BUDGETS[f.name]}`);

/** `source` rendered from the default configuration plus both pact tools. */
function renderDefault(t, source = SOURCE) {
  const home = tempDir(t, 'pact-budget-home-');
  const out = tempDir(t, 'pact-budget-out-');
  const pact = join(home, 'pact');
  mkdirSync(pact);
  cpSync(join(REPO, 'builder', 'default-config', 'blocks'), join(pact, 'blocks'), { recursive: true });
  const config = JSON.parse(readFileSync(join(REPO, 'builder', 'default-config', 'config.json'), 'utf8'));
  writeFileSync(join(pact, 'config.json'), `${JSON.stringify({ ...config, tools: ['poster', 'cleaner'] }, null, 2)}\n`);
  const r = runCore('render', [source, out, home]);
  assert.equal(r.code, 0, r.lines.join('\n'));
  return readFileSync(join(out, 'CLAUDE.md'), 'utf8');
}

const agentFiles = () =>
  readdirSync(AGENTS)
    .filter(f => f.endsWith('.md'))
    .map(f => ({ name: f.slice(0, -'.md'.length), text: readFileSync(join(AGENTS, f), 'utf8') }));

// #450 C3
test('the rules file and each agent stay within their word budgets', t => {
  const files = [{ name: RULES, text: renderDefault(t) }, ...agentFiles()];
  assert.deepEqual(overBudget(files), []);
});

// #450 C3
test('every agent file has a budget, and every budget names a file', () => {
  assert.deepEqual(agentFiles().map(f => f.name).sort(), Object.keys(BUDGETS).filter(k => k !== RULES).sort());
});

// #450 C3
test('the budget check fails on a rules file padded past its budget', t => {
  const padded = join(tempDir(t, 'pact-budget-src-'), 'CLAUDE.md');
  const source = readFileSync(SOURCE, 'utf8');
  writeFileSync(padded, source.replace('\n## The moves\n', `\n${'padding '.repeat(BUDGETS[RULES])}\n\n## The moves\n`));
  assert.equal(overBudget([{ name: RULES, text: renderDefault(t, padded) }]).length, 1);
});
