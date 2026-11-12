// The threat model's word cap (#544, the spec's S10): docs/threat-model.md stays
// at or under 3,000 words, so a session reads all of it. The count is the
// whole file split on whitespace, mermaid included, as the rule budget counts.
// Raising the cap changes a built-in default that bounds something, so it is a
// spec change.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const CAP = 3000;

/** Words: runs of non-whitespace, so CRLF and LF count the same. */
const words = text => text.split(/\s+/).filter(Boolean).length;

/** A line naming the file, its count and the cap when the file goes past it, else nothing. */
const overCap = (name, text) => (words(text) > CAP ? [`${name}: ${words(text)} words, cap ${CAP}`] : []);

// #544 C9
test('threat-model cap: the threat model is at or under the cap', () => {
  assert.deepEqual(overCap('docs/threat-model.md', readFileSync(join(REPO, 'docs', 'threat-model.md'), 'utf8')), []);
});

// #544 C9
test('threat-model cap: a copy padded to one word past the cap is reported over', t => {
  const padded = join(tempDir(t, 'pact-threat-cap-'), 'threat-model.md');
  const source = readFileSync(join(REPO, 'docs', 'threat-model.md'), 'utf8');
  writeFileSync(padded, `${source}\n${'padding '.repeat(CAP + 1 - words(source))}\n`);
  const text = readFileSync(padded, 'utf8');
  assert.equal(words(text), 3001);
  assert.deepEqual(overCap('padded', text), [`padded: ${CAP + 1} words, cap ${CAP}`]);
});

// #544 C9
test('threat-model cap: a copy at exactly the cap passes', () => {
  assert.deepEqual(overCap('at cap', 'word '.repeat(CAP / 2) + 'word\r\n'.repeat(CAP / 2)), []);
});

// #544 C9
test('threat-model cap: words are runs of non-whitespace, whatever the separator', () => {
  assert.equal(words('a b\r\nc\td\n- e '), 6);
});
