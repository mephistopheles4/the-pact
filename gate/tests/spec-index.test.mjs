// The spec index check: the spec index names every spec file in its folder
// under "## All specs", once, and holds both its sections. The parse rules are
// in the spec on #581 (S4). Whose text counts is not this check's job: it
// reads the working tree.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from './text.mjs';

const DIR = join(REPO, 'docs', 'spec');
const READ_FIRST = '## Read these first';
const ALL = '## All specs';
/** A counted index line: a bullet whose text is a link; group 1 is the target. */
const FILE_LINE = /^- \[[^\]]*\]\(([^)]+)\)/;

/** The spec files of a folder listing: top-level `*.md` but README.md. */
const specFiles = names => names.filter(n => n.endsWith('.md') && n !== 'README.md');

/** One problem line per fault in the index, `[]` when it is whole. `readme` is null when the file is missing. */
const indexProblems = (files, readme) => {
  if (readme === null) return ['docs/spec/README.md: missing'];
  const lines = readme.split(/\r?\n/);
  const problems = [READ_FIRST, ALL].filter(h => !lines.includes(h)).map(h => `docs/spec/README.md: missing section "${h}"`);
  const start = lines.indexOf(ALL);
  const section = start < 0 ? [] : lines.slice(start + 1);
  const end = section.findIndex(l => l.startsWith('## '));
  const counted = (end < 0 ? section : section.slice(0, end)).map(l => FILE_LINE.exec(l)?.[1]).filter(Boolean);
  for (const f of files) {
    const n = counted.filter(t => t === f).length;
    if (n === 0) problems.push(`${f}: no line under "${ALL}"`);
    if (n > 1) problems.push(`${f}: ${n} lines under "${ALL}", want one`);
  }
  return problems;
};

const README = ['# Specs', '', READ_FIRST, '', 'None yet.', '', ALL, '', '- [0002-b](0002-b.md) — second', '- history: [#9](https://example.test/9) — old', '- [0001-a](0001-a.md) — first', ''].join('\n');

// #581 C8a
test('spec index: the real docs/spec folder is whole', () => {
  assert.ok(existsSync(DIR), 'docs/spec/ is missing');
  const readme = existsSync(join(DIR, 'README.md')) ? readFileSync(join(DIR, 'README.md'), 'utf8') : null;
  assert.deepEqual(indexProblems(specFiles(readdirSync(DIR)), readme), []);
});

// #581 C8b
test('spec index: a spec file with no line is a problem, and only top-level .md files but README are spec files', () => {
  assert.deepEqual(specFiles(['README.md', '0001-a.md', 'notes.txt', 'sub']), ['0001-a.md']);
  assert.deepEqual(indexProblems(['0001-a.md', '0002-b.md', '0003-c.md'], README), ['0003-c.md: no line under "## All specs"']);
});

// #581 C8b
test('spec index: a spec file with two lines is a problem', () => {
  const twice = README.replace('- [0001-a](0001-a.md) — first', '- [0001-a](0001-a.md) — first\n- [0001-a](0001-a.md) — again');
  assert.deepEqual(indexProblems(['0001-a.md', '0002-b.md'], twice), ['0001-a.md: 2 lines under "## All specs", want one']);
});

// #581 C8b
test('spec index: a missing section and a missing README are problems', () => {
  assert.deepEqual(indexProblems([], README.replace(READ_FIRST, '## Start here')), ['docs/spec/README.md: missing section "## Read these first"']);
  assert.deepEqual(indexProblems([], README.replace(ALL, '## Everything')), ['docs/spec/README.md: missing section "## All specs"']);
  assert.deepEqual(indexProblems([], null), ['docs/spec/README.md: missing']);
});

// #581 C8c
test('spec index: a well-formed index passes: history line, CRLF, a link under both sections, no specs', () => {
  assert.deepEqual(indexProblems(['0001-a.md', '0002-b.md'], README), []);
  assert.deepEqual(indexProblems(['0001-a.md', '0002-b.md'], README.replace(/\n/g, '\r\n')), []);
  const both = README.replace('None yet.', '- [0001-a](0001-a.md) — read first');
  assert.deepEqual(indexProblems(['0001-a.md', '0002-b.md'], both), []);
  assert.deepEqual(indexProblems(['0001-a.md', '0002-b.md'], `${README}\n## Later\n\n- [0001-a](0001-a.md) — beyond the section\n`), []);
  assert.deepEqual(indexProblems([], ['# Specs', READ_FIRST, 'None yet.', ALL, 'None yet.'].join('\n')), []);
});
