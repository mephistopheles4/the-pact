// The threat model's word cap (#544, the spec's S10): the threat model stays
// at or under 3,600 words, so a session reads all of it. The count is the file
// split on whitespace, with its table of contents and mermaid blocks left out.
// Raising the cap, or leaving more out of the count, changes a built-in default
// that bounds something, so it is a spec change.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { stripToc } from '../../docs/toc.mjs';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

// PACT-105 T8 (ADR 0173): raised from 3,050 for spec 0007 S15's text on Codex,
// Antigravity, the bootstrap and the release tags, which didn't fit, so that no
// security text was cut (the lead session's flagged pick, spec 0007 S2 item 47;
// the owner reviews it). PACT-39 drops the word budgets.
const CAP = 3600;

// PACT-105 T8 (ADR 0173): the charts don't count. They were dropped twice to fit
// the count (PACT-65, PACT-101), and a chart is for the reader's eye.

// A fence line as Markdown reads it: up to three spaces, then three or more
// backticks or tildes; a backtick fence's info string holds no backtick.
const FENCE = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})(.*?)\r?$/;

/** The text without its closed mermaid blocks. An unclosed one stays, so it hides nothing. */
const withoutCharts = text => {
  const kept = [];
  let open;
  for (const line of text.split('\n')) {
    const [, run, info] = FENCE.exec(line) ?? [];
    if (!open) {
      if (run) open = { run, chart: info.trim() === 'mermaid', lines: [line] };
      else kept.push(line);
      continue;
    }
    open.lines.push(line);
    // It closes on the same character, a run at least as long, and nothing after.
    if (run?.startsWith(open.run) && !info.trim()) {
      if (!open.chart) kept.push(...open.lines);
      open = undefined;
    }
  }
  return [...kept, ...(open?.lines ?? [])].join('\n');
};

/** Words: runs of non-whitespace, so CRLF and LF count the same, with the table of contents (PACT-78) and mermaid blocks left out. */
const words = text => withoutCharts(stripToc(text)).split(/\s+/).filter(Boolean).length;

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
  assert.equal(words(text), 3601);
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

// PACT-105 C27
test('threat-model cap: a mermaid chart does not count, however big', () => {
  const chart = `\`\`\`mermaid\r\nflowchart LR\r\n${'  a --> b\r\n'.repeat(CAP)}\`\`\`\r\n`;
  assert.deepEqual(overCap('at cap', `${'word\n'.repeat(CAP)}${chart}`), []);
});

// PACT-105 C27
test('threat-model cap: prose around a chart, in another fence or after an unclosed one still counts', () => {
  const chart = '```mermaid\nflowchart LR\n  a --> b\n```\n';
  const prose = 'word\n'.repeat(CAP + 1);
  assert.deepEqual(overCap('between', `${chart}${prose}${chart}`), [`between: ${CAP + 1} words, cap ${CAP}`]);
  assert.equal(words(`\`\`\`text\n${prose}\`\`\`\n`), CAP + 3);
  assert.equal(words(`\`\`\`mermaid\n${prose}`), CAP + 2);
  assert.equal(words(`\`\`\`mermaid\nx\n  \`\`\`\n${prose}\`\`\`text\nz\n\`\`\`\n`), CAP + 4);
  assert.equal(words(`\`\`\`mermaid\nx\n\`\`\`\`\n${prose}${chart}`), CAP + 1);
  assert.equal(words(`\`\`\`\`text\n\`\`\`mermaid\n${prose}\`\`\`\n\`\`\`\`\n`), CAP + 5);
});

// PACT-78 C4
test('threat-model cap: a table of contents does not count, and one word past the cap outside it still does', () => {
  const toc = `<!-- toc -->\n\n${'- [Heading](#heading)\n'.repeat(50)}\n<!-- /toc -->\n\n`;
  assert.deepEqual(overCap('at cap', `${toc}${'word\n'.repeat(CAP)}`), []);
  assert.deepEqual(overCap('over', `${toc}${'word\n'.repeat(CAP + 1)}`), [`over: ${CAP + 1} words, cap ${CAP}`]);
});
