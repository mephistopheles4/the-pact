// #126: the default rules file names practices, not skills. A skill is named
// when it appears as a code span (`name`) or as a command (`/name`). Plain
// words that are also skill names ("triage", "prototype") are allowed. The
// gated blocks are out of scope: they are held word for word elsewhere.
// The command definition here is the one scripts/check-skill-flags.ps1 uses.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { OPEN_MARKS, REPO, read, withoutOpenMarks } from './helpers.mjs';

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

test('the gated blocks are skipped: stop-and-escalate still holds its `prototype` span', () => {
  assert.ok(MD.includes('(`prototype`, built as in move'), 'the gated clause no longer names prototype');
  assert.deepEqual(namedSkills(MD), []);
});

test('bad case: one skill name put back in move 3 is caught', () => {
  const planted = MD.replace('test-first at the agreed seams.', 'test-first at the agreed seams (`tdd`).');
  assert.notEqual(planted, MD, 'the plant found nothing to replace');
  assert.deepEqual(namedSkills(withoutOpenMarks(planted)), ['tdd']);
});

test('bad case: a skill name put back in the intro, as a command, is caught', () => {
  const planted = MD.replace('The moves name no\nskills.', 'The moves name no\nskills, except `/to-spec`.');
  assert.notEqual(planted, MD, 'the plant found nothing to replace');
  assert.deepEqual(namedSkills(withoutOpenMarks(planted)), ['/to-spec']);
});

test('command forms: `/name` counts', () => {
  assert.deepEqual(namedSkills('Type `/wayfinder` to chart it.'), ['/wayfinder']);
  assert.deepEqual(namedSkills('Type `/to-spec` now.'), ['/to-spec']);
});

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

test('a code span with the bare name counts', () => {
  assert.deepEqual(namedSkills('Use `grilling` here.'), ['grilling']);
});

test('a gated block is skipped, an open part is not', () => {
  const text = [
    '<!-- pact:begin stop-and-escalate -->',
    'Use (`prototype`) here.',
    '<!-- pact:end stop-and-escalate -->',
    '<!-- pact:begin move-2 -->',
    'Use `prototype` here.',
    '<!-- pact:end move-2 -->',
  ].join('\n');
  assert.deepEqual(namedSkills(text), ['prototype']);
});
