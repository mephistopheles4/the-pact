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
// Settings keys and hyphenated or curly-apostrophe spellings count too (#262's move 4, integrity-lens).
const MODE_RE = /\b(?:acceptEdits|bypassPermissions|dontAsk|permissionMode|defaultMode)\b|--permission-mode\b|\b(?:auto|plan|permission|accept[- ]edits|bypass[- ]permissions|don['’]t[- ]ask)[- ]mode\b/gi;

/** The permission-mode names a text holds, in order. */
function modeNames(text) {
  return flat(text).match(MODE_RE) ?? [];
}

const OPENING = '**Lenses are offers.**';
const SECURITY_PAIR = ['`adversarial-lens`', '`data-lens`'];
// The fence: what starting a skill never lifts (#262 S3), held by its verb as well as its items.
const FENCE = ['never lifts the sensitive-route flag or its offer at Test', 'the Guards below', 'the decisions that are always mine', "the review procedure's read before anything is posted"];
// Update 1's clause on the security pair, in the offers paragraph itself.
const TEST_OFFER = "and once more at Test if I didn't take it";
// The owner's answers to move 4's q8 and q9: a decline that only reaches the session second-hand stays
// open, and the one-line exception never covers a list match.
const OFFER_PHRASES = [
  ['reaches you only by relay, prompt, message or file still counts, but stays open in the result until I answer in chat', "the offers paragraph doesn't keep a second-hand decline open"],
  ["that matches nothing on the list and that you haven't flagged as sensitive", "the one-line exception doesn't exclude a list match"],
];
// q10: the review procedure, which holds the read before posting, is read before any post.
const POINTER = "**Before you run a lens or post to the record, read the pact's review procedure,";
const SENSITIVE_OPENING = 'Sensitive work gets more checking when I choose it.';
// S5 with update 1, and move 4's q7 (a list match obliges the flag; an unanswered flag or offer stays open)
// and q9 (the backstop fires on any list match where the route wasn't taken).
const BACKSTOP = "If I didn't take the route, offer the security pair once more at Test when the change matches the list.";
const SENSITIVE_PHRASES = [
  ['When the work matches that list, or you think it sensitive otherwise,', 'a list match does not oblige the flag'],
  ['say why in one line in your tier proposal and recommend the route', 'the sensitive-work default does not require the one-line why in the tier proposal'],
  [BACKSTOP, 'the sensitive-work default lacks the backstop at Test'],
  ["A flag or an offer I haven't answered stays open, in one line, in every hand-off and in the result.", "an unanswered flag or offer doesn't stay open"],
];

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
    if (!text.includes(TEST_OFFER)) out.push("the offers paragraph lacks the security pair's offer at Test");
    for (const [phrase, problem] of OFFER_PHRASES) if (!text.includes(phrase)) out.push(problem);
  }
  const sens = lines.findIndex(l => l.startsWith(SENSITIVE_OPENING));
  if (sens < 0) out.push('no sensitive-work default');
  else {
    const text = flat(paragraphAt(lines, sens).join('\n'));
    for (const [phrase, problem] of SENSITIVE_PHRASES) if (!text.includes(phrase)) out.push(problem);
  }
  if (!flat(src).includes(POINTER)) out.push('the review procedure is not read before posting');
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
  assert.deepEqual(modeNames('Run in auto-mode, or dontAsk, acceptEdits or accept edits mode.'), ['auto-mode', 'dontAsk', 'acceptEdits', 'accept edits mode']);
  assert.deepEqual(modeNames('Set permissionMode, or defaultMode, or don’t ask mode, or bypass permissions mode.'), ['permissionMode', 'defaultMode', 'don’t ask mode', 'bypass permissions mode']);
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
  for (const item of FENCE.filter(i => i !== 'the Guards below')) assert.ok(cut(item, 'x').includes(`the offers paragraph's fence lacks "${item}"`), item);
  assert.deepEqual(cut('never lifts the sensitive-route flag', 'lifts the sensitive-route flag'), [`the offers paragraph's fence lacks "${FENCE[0]}"`]);
  assert.deepEqual(cut(`, ${TEST_OFFER}`, ''), ["the offers paragraph lacks the security pair's offer at Test"]);
  assert.ok(cut('`adversarial-lens` and `data-lens`, comes with', '`data-lens`, comes with').includes("the offers paragraph doesn't name `adversarial-lens`"));
  assert.deepEqual(cut('say why in one line in your tier proposal', 'say why'), ['the sensitive-work default does not require the one-line why in the tier proposal']);
  assert.deepEqual(cut(`${BACKSTOP} `, ''), ['the sensitive-work default lacks the backstop at Test']);
});

// #262 C2, C3, and move 4's q7 to q10
test("bad case: a text that drops the list match's flag, the open flag, the second-hand decline, the list-match limit on the one-line exception or the pointer is caught", () => {
  const cut = phrase => {
    const lessOne = SOURCE.replace(loose(phrase), 'x');
    assert.notEqual(lessOne, SOURCE, `"${phrase}" is in the source`);
    return offersProblems(lessOne);
  };
  for (const [phrase, problem] of [...OFFER_PHRASES, ...SENSITIVE_PHRASES]) assert.deepEqual(cut(phrase), [problem], phrase);
  assert.deepEqual(cut(POINTER), ['the review procedure is not read before posting']);
  assert.deepEqual(cut('or its offer at Test, the Guards below'), [`the offers paragraph's fence lacks "${FENCE[0]}"`, 'the offers paragraph\'s fence lacks "the Guards below"']);
});
