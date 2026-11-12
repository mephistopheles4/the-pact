// The word budget of this repo's agent-facing docs (#548). Each doc stays within
// a budget, so adding to one means cutting from it, and how a rule came to be goes
// in an ADR or a dated log, not here. A budget is the smallest multiple of 50 above
// the doc's size when it was set; raising one is a spec change. The two docs that
// needed no cut are budgeted at their size too.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from './text.mjs';

const BUDGETS = Object.freeze({
  'AGENTS.md': 1750,
  'CONTEXT.md': 2150,
  'docs/agents/domain.md': 300,
  'docs/agents/gate-tests.md': 3300,
  'docs/agents/install.md': 2800,
  'docs/agents/issue-tracker.md': 3850,
  'docs/agents/parallel-sessions.md': 300,
  'docs/agents/triage-labels.md': 550,
  'docs/agents/work-records.md': 600,
  'docs/cleaner.md': 4200,
  'docs/install.md': 7950,
  'docs/poster.md': 8300,
  'docs/reference.md': 2200,
  'docs/rule-reasons.md': 1150,
});

/** Words: runs of non-whitespace, so CRLF and LF count the same. */
const words = text => text.split(/\s+/).filter(Boolean).length;

/** One line per doc whose words go past its budget: path, count and budget. */
const overBudget = docs => docs.filter(d => words(d.text) > BUDGETS[d.path]).map(d => `${d.path}: ${words(d.text)} words, budget ${BUDGETS[d.path]}`);

// #548 C4
test('each agent-facing doc stays within its word budget', () => {
  assert.deepEqual(overBudget(Object.keys(BUDGETS).map(path => ({ path, text: readFileSync(join(REPO, path), 'utf8') }))), []);
});

// #548 C4
test('the doc budget check fails a doc one word past its budget, and passes it at the budget', () => {
  const at = n => 'word\n'.repeat(n);
  assert.deepEqual(overBudget([{ path: 'CONTEXT.md', text: at(BUDGETS['CONTEXT.md']) }]), []);
  assert.deepEqual(overBudget([{ path: 'CONTEXT.md', text: at(BUDGETS['CONTEXT.md'] + 1) }]), [`CONTEXT.md: ${BUDGETS['CONTEXT.md'] + 1} words, budget ${BUDGETS['CONTEXT.md']}`]);
});
