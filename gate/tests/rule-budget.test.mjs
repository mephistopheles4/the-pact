// The pact's word budget and its reasons table (ADR 0129). The rules file,
// rendered from the default configuration with both pact tools on, and each
// agent file stay within a budget, so adding a rule means cutting one. Every
// rule in that render has a row in the reasons table naming the gap no other
// guardrail covers, and every row names a rule. Raising a budget changes a
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
const REASONS = join(REPO, 'docs', 'rule-reasons.md');
const RULES = 'the rules file';

// Each budget is the smallest multiple of 50 above the file's size after the
// #450 cuts (S5.1), measured on the rebased branch. The rules file's rose to
// 4,100 for #462's sentence as a spec change, so no other rule was trimmed for it.
const BUDGETS = Object.freeze({
  [RULES]: 4100,
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

/**
 * The rules in a rendered rules file (S5.2): each `##` heading, and each
 * paragraph or list item outside a table that opens with a bold span, named by
 * that span joined across line wraps, with inline code and trailing spaces,
 * commas, colons and full stops removed. The renderer's notice is not a rule.
 */
function ruleNames(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const names = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      names.push(line.slice(3).trim());
      continue;
    }
    const opens = /^(?:- )?\*\*/.exec(line);
    const starts = line.startsWith('- ') || i === 0 || lines[i - 1].trim() === '';
    if (!opens || !starts) continue;
    let span = line.slice(opens[0].length);
    for (let j = i + 1; !span.includes('**') && j < lines.length; j++) span += ` ${lines[j].trim()}`;
    const name = span
      .slice(0, span.indexOf('**'))
      .replace(/`[^`]*`/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[\s,:.]+$/, '')
      .trim();
    if (name !== 'Configuration in effect') names.push(name);
  }
  return names;
}

/** The rows of the reasons table: `{ rule, reason }`, header and rule line left out. */
function reasonRows(md) {
  return md
    .replace(/\r/g, '')
    .split('\n')
    .filter(l => l.startsWith('| ') && !l.startsWith('| Rule |') && !/^\| -/.test(l))
    .map(l => {
      const cells = l.slice(2, -2).split(' | ');
      return { rule: cells[0].trim(), reason: (cells[1] ?? '').trim() };
    });
}

/** What keeps the rules and the rows from matching one to one. */
function reasonGaps(rules, rows) {
  const named = new Set(rows.map(r => r.rule));
  const ruled = new Set(rules);
  return [
    ...rules.filter(r => !named.has(r)).map(r => `a rule with no reason row: ${r}`),
    ...rows.filter(r => !ruled.has(r.rule)).map(r => `a reason row naming no rule: ${r.rule}`),
    ...rows.filter(r => r.reason === '').map(r => `a reason row with no reason: ${r.rule}`),
    ...rules.filter((r, i) => rules.indexOf(r) !== i).map(r => `a rule named twice: ${r}`),
  ];
}

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

// #450 C4, C6
test('every rule in the rules file has its reason, and every reason its rule', t => {
  assert.deepEqual(reasonGaps(ruleNames(renderDefault(t)), reasonRows(readFileSync(REASONS, 'utf8'))), []);
});

// #450 C4
test('the reasons check fails on a rule with no row, a row with no rule, an empty reason, and a rule named twice', t => {
  const rules = ruleNames(renderDefault(t));
  const rows = reasonRows(readFileSync(REASONS, 'utf8'));
  const added = ruleNames(`${rules.map(r => `- **${r}.** Text.`).join('\n')}\n- **A rule nobody wrote a reason for.** Text.\n`);
  assert.deepEqual(reasonGaps(added, rows), ['a rule with no reason row: A rule nobody wrote a reason for']);
  assert.deepEqual(reasonGaps(rules, [...rows, { rule: 'A rule that is gone', reason: 'Once it covered a gap.' }]), ['a reason row naming no rule: A rule that is gone']);
  const emptied = rows.map((r, i) => (i === 0 ? { ...r, reason: '' } : r));
  assert.deepEqual(reasonGaps(rules, emptied), [`a reason row with no reason: ${rows[0].rule}`]);
  assert.deepEqual(reasonGaps([...rules, rules[0]], rows), [`a rule named twice: ${rules[0]}`]);
});

// #450 C4
test('a rule is named by its bold span, joined across wraps, without inline code or trailing punctuation', () => {
  const text = ['## A section', '', '- **These decisions are always mine:** text', '', '**Before you run a lens, read the', 'review procedure, `~/.claude/pact/review.md`.** Cross the reports.', '', '| **Quick** | a table cell |', 'Text with **bold** inside.'].join('\n');
  assert.deepEqual(ruleNames(text), ['A section', 'These decisions are always mine', 'Before you run a lens, read the review procedure']);
});
