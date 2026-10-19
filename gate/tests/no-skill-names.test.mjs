// #126: the default rules file names practices, not skills. A skill is named
// when it appears as a code span (`name`) or as a command (`/name`). Plain
// words that are also skill names ("triage", "prototype") are allowed. The
// gated blocks are out of scope: they are held word for word elsewhere.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { OPEN_MARKS, REPO, withoutOpenMarks } from './text.mjs';
import { read } from './tree.mjs';

// Today's 14 skill names (spec revision 2, "Testing Decisions").
const SKILLS = [
  'triage', 'to-spec', 'to-tickets', 'wayfinder', 'implement', 'grilling', 'domain-modeling',
  'codebase-design', 'prototype', 'tdd', 'diagnosing-bugs', 'diataxis',
  'setup-matt-pocock-skills', 'grill-with-docs',
];
const NAME = '[A-Za-z0-9][A-Za-z0-9._-]*';
const COMMAND_RE = new RegExp(`^/(${NAME})$`);
const NAME_RE = new RegExp(`^${NAME}$`);

/** The text with every gated block (a pact block that is not an open part) removed. */
function outsideGated(text) {
  return text.replace(/^[ \t]*<!-- pact:begin ([a-z0-9-]+) -->$[\s\S]*?^[ \t]*<!-- pact:end \1 -->$/gm, (whole, name) =>
    OPEN_MARKS.includes(name) ? whole : '',
  );
}

/** The known skill names that `text` names as a code span or a command, outside the gated blocks. */
function namedSkills(text) {
  const found = [];
  for (const m of outsideGated(text).matchAll(/`([^`\n]+)`/g)) {
    const span = m[1];
    const name = COMMAND_RE.exec(span)?.[1] ?? (NAME_RE.test(span) ? span : null);
    if (name && SKILLS.includes(name)) found.push(span);
  }
  return found;
}

const MD = read(join(REPO, 'claude', 'CLAUDE.md'));

test('the default render names no skill outside the gated blocks', () => {
  assert.deepEqual(namedSkills(withoutOpenMarks(MD)), []);
});

test('the source file names no skill either, in its open parts or outside them', () => {
  assert.deepEqual(namedSkills(MD), []);
});

// #261 C1
test('bad case: one skill name put back in the checkpoint move is caught', () => {
  const planted = MD.replace('such as a test.', 'such as a test (`tdd`).');
  assert.notEqual(planted, MD, 'the plant found nothing to replace');
  assert.deepEqual(namedSkills(withoutOpenMarks(planted)), ['tdd']);
});

// #261 C1
test('bad case: a skill name put back in the intro to the moves, as a command, is caught', () => {
  const planted = MD.replace('The moves are how I work,', 'The moves are how I work (`/to-spec`),');
  assert.notEqual(planted, MD, 'the plant found nothing to replace');
  assert.deepEqual(namedSkills(withoutOpenMarks(planted)), ['/to-spec']);
});

// #272's sweep cut two checks of this file's helper, a command span and a bare span counted, which the two bad cases above each catch.

test('command forms: a bare /name in prose does not count', () => {
  assert.deepEqual(namedSkills('Type /wayfinder to chart it.'), []);
});

test('command forms: a placeholder `/<skill>` does not count', () => {
  assert.deepEqual(namedSkills('Type `/<skill> <argument>` to start.'), []);
});

test('command forms: a span holding more than the command does not count', () => {
  assert.deepEqual(namedSkills('Type `/triage 126` to start.'), []);
});

test('plain words that are skill names do not count, and an unknown code span does not count', () => {
  assert.deepEqual(namedSkills('I triage it, and a prototype is built. Run `gh issue view`, or `/effort`.'), []);
});
test('a gated block is skipped, an open part is not', () => {
  const text = [
    '<!-- pact:begin stop-and-escalate -->',
    'Use (`prototype`) here.',
    '<!-- pact:end stop-and-escalate -->',
    '<!-- pact:begin moves -->',
    'Use `prototype` here.',
    '<!-- pact:end moves -->',
  ].join('\n');
  assert.deepEqual(namedSkills(text), ['prototype']);
});
