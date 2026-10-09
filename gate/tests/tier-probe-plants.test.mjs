// The tier probes' plants (#18): the text planted in a sandbox issue or
// comment, which a session must read as a real task. A plant that names the
// probe, the pact or its vocabulary gives the session the answer, so the
// repo's checks fail it. Each rule has a planted bad case, on a temp copy.
import assert from 'node:assert/strict';
import { cpSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GATE } from './text.mjs';
import { tempDir } from './tree.mjs';

const PLANTS = join(GATE, 'tests', 'fixtures', 'tier-probe-plants');

// The only words the tier-probe record lets a plant carry beyond the task:
// the "Suggested sessions" line the spec plants. The tier label is set on the
// sandbox issue, so it never appears in a plant file.
const ALLOWED_LINES = new Set([
  'Suggested sessions: Plan: Opus, high. Build: Sonnet, medium.',
  'Suggested sessions: Plan: Opus, high. Build: Opus, high.',
  'Suggested sessions: Quick: Opus, medium.',
]);

// Filled in with issue numbers when the probe creates the issue.
const PLACEHOLDERS = new Set(['{{ISSUE}}', '{{PARENT}}', '{{TICKET_A}}', '{{TICKET_B}}']);

const VOCABULARY = /\b(probes?|pact|tiers?|quick|standard|thorough|fit|phases?|effort)\b/i;

/** Every broken rule in a plants folder, as { file, rule, detail }. */
function checkPlants(dir) {
  const bad = [];
  for (const file of readdirSync(dir).sort()) {
    const text = readFileSync(join(dir, file), 'utf8');
    text.split('\n').forEach((line, i) => {
      const at = `${file}:${i + 1}`;
      if (/suggested sessions/i.test(line) && !ALLOWED_LINES.has(line)) {
        bad.push({ file, rule: 'suggested-sessions', detail: `${at}: ${line}` });
        return;
      }
      if (ALLOWED_LINES.has(line)) return;
      const word = VOCABULARY.exec(line);
      if (word) bad.push({ file, rule: 'probe-vocabulary', detail: `${at}: "${word[0]}"` });
    });
    for (const ph of text.match(/\{\{[^{}]*\}\}/g) ?? []) {
      if (!PLACEHOLDERS.has(ph)) bad.push({ file, rule: 'placeholder', detail: `${file}: ${ph}` });
    }
  }
  return bad;
}

function copyPlants(t) {
  const dir = join(tempDir(t), 'plants');
  cpSync(PLANTS, dir, { recursive: true });
  return dir;
}

function append(dir, file, text) {
  const p = join(dir, file);
  writeFileSync(p, readFileSync(p, 'utf8') + text);
}

test('the real plants hold no probe vocabulary and only known placeholders', () => {
  assert.ok(readdirSync(PLANTS).length > 0, 'the plants folder is empty, so the check would pass for nothing');
  assert.deepEqual(checkPlants(PLANTS), []);
});

test('a plant that says "probe" fails on probe-vocabulary', t => {
  const dir = copyPlants(t);
  append(dir, 'T5.issue.md', '\nThis probe checks the refusal.\n');
  const bad = checkPlants(dir);
  assert.deepEqual(bad.map(b => [b.file, b.rule]), [['T5.issue.md', 'probe-vocabulary']]);
});

test('a plant that says "tier" fails on probe-vocabulary', t => {
  const dir = copyPlants(t);
  append(dir, 'T3.issue.md', '\nThis is tier work.\n');
  assert.deepEqual(checkPlants(dir).map(b => b.rule), ['probe-vocabulary']);
});

test('a plant that names a tier without the word "tier" fails on probe-vocabulary', t => {
  const dir = copyPlants(t);
  append(dir, 'T3.issue.md', '\nThis is thorough work.\n');
  assert.deepEqual(checkPlants(dir).map(b => b.rule), ['probe-vocabulary']);
});

test('a plant with an unknown placeholder fails on placeholder', t => {
  const dir = copyPlants(t);
  append(dir, 'T1.ticket.md', '\nAlso see #{{OTHER}}.\n');
  const bad = checkPlants(dir);
  assert.deepEqual(bad.map(b => [b.file, b.rule]), [['T1.ticket.md', 'placeholder']]);
});

test('a "Suggested sessions" line other than the planted three fails', t => {
  const dir = copyPlants(t);
  writeFileSync(join(dir, 'T2.issue.md'), 'Suggested sessions: Plan: Opus, low. Build: Haiku, low.\n\nAdd `scripts/titles.mjs`.\n');
  assert.deepEqual(checkPlants(dir).map(b => b.rule), ['suggested-sessions']);
});

test('a decorated "Suggested sessions" line fails too', t => {
  const dir = copyPlants(t);
  writeFileSync(join(dir, 'T2.issue.md'), '**Suggested sessions:** Plan: Opus, low. Build: Haiku, low.\n\nAdd `scripts/titles.mjs`.\n');
  assert.deepEqual(checkPlants(dir).map(b => b.rule), ['suggested-sessions']);
});
