// The pact's word budget (ADR 0129). The rules file, rendered from the default
// configuration with both pact tools on, stays within a budget, so adding a
// rule means cutting one. The agent files carry no budget: the owner dropped
// the per-agent caps (#575). Raising a budget changes a
// built-in default that bounds something, so it is a spec change.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { runCore } from './gate-run.mjs';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const SOURCE = join(REPO, 'claude', 'CLAUDE.md');
const RULES = 'the rules file';

// The budget is the smallest multiple of 50 above the rules file's size after
// the #464 T4 cut; it is 2450 since #525: the free hand's 202 words (2247 + 202 = 2449).
const BUDGETS = Object.freeze({
  [RULES]: 2450,
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

// #450 C3
test('the rules file stays within its word budget', t => {
  assert.deepEqual(overBudget([{ name: RULES, text: renderDefault(t) }]), []);
});

// #450 C3
test('the budget check fails on a rules file padded past its budget', t => {
  const padded = join(tempDir(t, 'pact-budget-src-'), 'CLAUDE.md');
  const source = readFileSync(SOURCE, 'utf8');
  writeFileSync(padded, source.replace('\n## The moves\n', `\n${'padding '.repeat(BUDGETS[RULES])}\n\n## The moves\n`));
  assert.equal(overBudget([{ name: RULES, text: renderDefault(t, padded) }]).length, 1);
});
