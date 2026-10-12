// The rules file's lens offers and sensitive route (#262, phase 1): the rules
// file names no permission mode; the offers paragraph sits once in the Lenses
// section, outside every open mark, names the security pair and holds its
// fence; and the sensitive-work default asks for the one-line why in the tier
// proposal and holds the backstop at Test. These read the pact's source as
// text; phase 2 extends the paragraph check when the four parts get marks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { OPEN_MARKS, REPO } from './text.mjs';

const SOURCE = readFileSync(join(REPO, 'claude', 'CLAUDE.md'), 'utf8');
const flat = s => s.replace(/\s+/g, ' ');

// Claude Code's permission modes, by the names a rules file would use for them. Bare words such as
// "plan", "auto" or "default" are ordinary prose here, so only the modes' own names and phrases count.
const MODE_RE = /\b(?:acceptEdits|bypassPermissions|dontAsk)\b|--permission-mode\b|\b(?:auto|plan|permission|accept[- ]edits|bypass[- ]permissions|don't[- ]ask) mode\b/gi;

/** The permission-mode names a text holds, in order. */
function modeNames(text) {
  return flat(text).match(MODE_RE) ?? [];
}

const OPENING = '**Lenses are offers.**';
const SECURITY_PAIR = ['`adversarial-lens`', '`data-lens`'];
// The fence: what starting a skill never lifts (#262 S3).
const FENCE = ['the sensitive-route flag', 'the Guards below', 'the decisions that are always mine', "the review procedure's read before anything is posted"];
const SENSITIVE_OPENING = 'Sensitive work gets more checking when I choose it.';
const ONE_LINE_WHY = 'say why in one line in your tier proposal and recommend the route';
const BACKSTOP = 'If I decline it, or nobody answers, offer the security pair once more at Test when the change matches the list.';

/** The paragraph that starts on line `i`: its lines up to the next blank line. */
function paragraphAt(lines, i) {
  const end = lines.findIndex((l, k) => k > i && l.trim() === '');
  return lines.slice(i, end < 0 ? lines.length : end);
}

/** The line ranges, [begin, end], of every open mark's pair in `lines`. */
function openRanges(lines) {
  const at = s => lines.findIndex(l => l.trim() === s);
  return OPEN_MARKS.map(n => [at(`<!-- pact:begin ${n} -->`), at(`<!-- pact:end ${n} -->`)]);
}

/** A phrase as a pattern that matches it across the source's line wrapping. */
const loose = phrase => new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'));

/** Where a rules-file source breaks the offers rules (#262 S3, S5), as plain sentences; empty when it keeps them. */
function offersProblems(src) {
  const out = [];
  const lines = src.split('\n');
  const starts = lines.map((l, i) => (l.startsWith(OPENING) ? i : -1)).filter(i => i >= 0);
  if (flat(src).split(OPENING).length - 1 !== starts.length) out.push('the offers paragraph opening sits inside a line');
  if (starts.length !== 1) out.push(`the offers paragraph occurs ${starts.length} times, not once`);
  for (const i of starts) {
    const lensesAt = lines.indexOf('## Lenses');
    const nextHead = lines.findIndex((l, k) => k > lensesAt && l.startsWith('## '));
    if (lensesAt < 0 || i < lensesAt || (nextHead >= 0 && i > nextHead)) out.push('the offers paragraph sits outside the Lenses section');
    const para = paragraphAt(lines, i);
    const last = i + para.length - 1;
    for (const [b, e] of openRanges(lines)) if (b >= 0 && e >= 0 && last > b && i < e) out.push('the offers paragraph sits inside an open mark');
    const text = flat(para.join('\n'));
    for (const lens of SECURITY_PAIR) if (!text.includes(lens)) out.push(`the offers paragraph doesn't name ${lens}`);
    for (const item of FENCE) if (!text.includes(item)) out.push(`the offers paragraph's fence lacks "${item}"`);
  }
  const sens = lines.findIndex(l => l.startsWith(SENSITIVE_OPENING));
  if (sens < 0) out.push('no sensitive-work default');
  else {
    const text = flat(paragraphAt(lines, sens).join('\n'));
    if (!text.includes(ONE_LINE_WHY)) out.push('the sensitive-work default does not require the one-line why in the tier proposal');
    if (!text.includes(BACKSTOP)) out.push('the sensitive-work default lacks the backstop at Test');
  }
  return out;
}

// #262 C1
test('the rules file names no permission mode', () => {
  assert.deepEqual(modeNames(SOURCE), []);
});

// #262 C1
test('bad case: a permission mode named in the rules file is caught, and ordinary prose is not', () => {
  assert.deepEqual(modeNames('Run in auto\n  mode when I am away.'), ['auto mode']);
  assert.deepEqual(modeNames('Pass --permission-mode bypassPermissions.'), ['--permission-mode', 'bypassPermissions']);
  assert.deepEqual(modeNames('A plan is made in Plan mode.'), ['Plan mode']);
  assert.deepEqual(modeNames('Plan, then build. The default is auto-taken. A target I can know gets a plan.'), []);
});

// #262 C2, C3
test('the offers paragraph sits once in Lenses, outside every open mark, with the security pair and its fence; the sensitive default holds the why and the backstop', () => {
  assert.deepEqual(offersProblems(SOURCE), []);
});

// #262 C2
test('bad case: a planted copy of the offers paragraph inside a part is caught', () => {
  const para = paragraphAt(SOURCE.split('\n'), SOURCE.split('\n').findIndex(l => l.startsWith(OPENING))).join('\n');
  const moved = SOURCE.replace(`${para}\n`, '').replace('  <!-- pact:end move-4-extra -->', `${para}\n  <!-- pact:end move-4-extra -->`);
  assert.notEqual(moved, SOURCE);
  const problems = offersProblems(moved);
  assert.ok(problems.includes('the offers paragraph sits inside an open mark'), problems.join('\n'));
  assert.ok(problems.includes('the offers paragraph sits outside the Lenses section'), problems.join('\n'));
  // A second copy, kept in place, is caught too.
  assert.ok(offersProblems(SOURCE.replace('  <!-- pact:end move-1 -->', `${para}\n  <!-- pact:end move-1 -->`)).includes('the offers paragraph occurs 2 times, not once'));
});

// #262 C2, C3
test('bad case: a paragraph that drops a security lens or a fence item, or a default that drops the why or the backstop, is caught', () => {
  const cut = (phrase, to) => {
    const lessOne = SOURCE.replace(loose(phrase), to);
    assert.notEqual(lessOne, SOURCE, `"${phrase}" is in the source`);
    return offersProblems(lessOne);
  };
  // The offers paragraph names the pair once, as "`adversarial-lens` and `data-lens`".
  assert.deepEqual(cut('`adversarial-lens` and `data-lens`, comes with', '`adversarial-lens`, comes with'), ["the offers paragraph doesn't name `data-lens`"]);
  assert.deepEqual(cut('the Guards below,', ''), ['the offers paragraph\'s fence lacks "the Guards below"']);
  assert.deepEqual(cut('say why in one line in your tier proposal', 'say why'), ['the sensitive-work default does not require the one-line why in the tier proposal']);
  assert.deepEqual(cut(`${BACKSTOP} `, ''), ['the sensitive-work default lacks the backstop at Test']);
});
