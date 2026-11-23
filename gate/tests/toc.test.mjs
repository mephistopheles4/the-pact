// The long docs' tables of contents (PACT-78): docs/toc.mjs writes each
// covered doc's table from its headings, and these tests fail while one is
// missing or stale, while a doc that isn't covered holds one, and while an
// in-repo anchor link into a tracked doc misses the anchors toc.mjs computes.
// The fix for a table is `node docs/toc.mjs`; for an anchor link, correct the
// link or the heading.
import assert from 'node:assert/strict';
import { posix } from 'node:path';
import { test } from 'node:test';
import { TOC_CLOSE, TOC_OPEN, covered, headings, problems, stripToc, tocBlock, trackedDocs, withToc } from '../../docs/toc.mjs';
import { REPO } from './text.mjs';

const FIX = 'run `node docs/toc.mjs`';

/** A doc of `n` body lines after a title and the headings given. */
const doc = (heads, n = 120) => `# Title\n\nIntro line.\n\n${heads.map(h => `${h}\n\nText.\n`).join('\n')}${'line\n'.repeat(n)}`;
const LONG = doc(['## One', '### One a', '## Two']);

// PACT-78 C1, C6
test('toc: every covered doc holds a current table, and no other doc holds one', () => {
  const files = trackedDocs(REPO);
  assert.ok(files.length > 20, `git ls-files listed ${files.length} Markdown files`);
  assert.deepEqual(problems(files), [], FIX);
});

// PACT-78 C2
test('toc: the check reports a covered doc with no table, a stale one, and a table in a doc that is not covered', () => {
  assert.deepEqual(tocBlock(`${LONG}#### Deep\n`), [TOC_OPEN, '', '- [One](#one)', '  - [One a](#one-a)', '- [Two](#two)', '', TOC_CLOSE], 'H2 and H3 only, H3 indented');
  const current = withToc(LONG);
  assert.deepEqual(problems([{ path: 'docs/a.md', text: current }]), []);
  const noH2 = doc(['### Only h3']);
  assert.equal(withToc(noH2), noH2, 'a long doc with no H2 gets no table');
  assert.deepEqual(problems([{ path: 'docs/a.md', text: noH2 }]), [], 'and the check asks for none');
  assert.deepEqual(problems([{ path: 'docs/log/x.md', text: `# T\n${TOC_OPEN}\n` }]), [`docs/log/x.md: ${TOC_OPEN} with no ${TOC_CLOSE}`], 'an unclosed marker is reported, not thrown');
  const rows = [
    ['no table', LONG, 'docs/a.md: no table of contents'],
    ['a heading added', current.replace('## Two', '## Two\n\n## Three'), 'docs/a.md: table of contents is stale'],
    ['a heading renamed', current.replace('\n## Two\n', '\n## Deux\n'), 'docs/a.md: table of contents is stale'],
    ['an entry edited by hand', current.replace('](#two)', '](#deux)'), 'docs/a.md: table of contents is stale'],
  ];
  for (const [name, text, line] of rows) assert.deepEqual(problems([{ path: 'docs/a.md', text }]), [line], name);
  const short = withToc(doc(['## One'], 120)).replace(/line\n/g, '');
  assert.deepEqual(problems([{ path: 'docs/b.md', text: short }]), ['docs/b.md: holds a table of contents but is not covered']);
  assert.deepEqual(problems([{ path: 'docs/log/x.md', text: current }]), ['docs/log/x.md: holds a table of contents but is not covered']);
  const quoted = `# Log\n\n\`\`\`md\n${TOC_OPEN}\n\n- [x](#x)\n\n${TOC_CLOSE}\n\`\`\`\n`;
  assert.deepEqual(problems([{ path: 'docs/log/y.md', text: quoted }]), [], 'markers quoted in a fence are not a table');
  assert.equal(stripToc(quoted), quoted);
});

// PACT-78 C6
test('toc: the excluded paths and short docs are not covered, and the table never counts toward the line threshold', () => {
  for (const p of ['docs/log/2026-01-01-x.md', 'docs/adr/0001-x.md', 'gate/tests/fixtures/x.md', 'claude/CLAUDE.md', 'cloud-sessions/CLAUDE.cloud.md', 'claude/agents/x-lens.md', 'claude/commands/x.md', 'AGENTS.md', 'README.md']) assert.equal(covered(p, LONG), false, p);
  assert.equal(covered('docs/a.md', LONG), true);
  assert.equal(covered('docs/a.txt', LONG), false);
  const at100 = 'line\n'.repeat(98).replace(/^/, '# T\n## H\n');
  assert.equal(covered('docs/a.md', at100), false, '100 lines is not over 100');
  assert.equal(covered('docs/a.md', withToc(at100)), false, 'its own table does not push a doc over');
  assert.equal(covered('docs/a.md', `${at100}line\n`), true, '101 lines is');
});

// PACT-78 C2, C3
test('toc: anchors follow GitHub: markup dropped, punctuation removed, repeats suffixed, fenced headings ignored', () => {
  const text = [
    '# Title',
    '## Install with `--apply`',
    "## The door to other people's tools",
    '## A [linked](x.md) heading, **bold** and _it_',
    '## snake_case stays',
    '## Same',
    '### Same',
    '```sh',
    '## not a heading',
    '```',
    '~~~~',
    '```',
    '## also not',
    '~~~~',
    '## 1. Check — V1',
    '## The `__init__` hook',
    '## [`foo`](x) bar',
    '## Same 1',
  ].join('\n');
  assert.deepEqual(
    headings(text).map(h => h.anchor),
    ['title', 'install-with---apply', 'the-door-to-other-peoples-tools', 'a-linked-heading-bold-and-it', 'snake_case-stays', 'same', 'same-1', '1-check--v1', 'the-__init__-hook', 'foo-bar', 'same-1-1'],
  );
  assert.match(withToc(`${text}\n`), /- \[A linked heading, \*\*bold\*\* and _it_\]\(#a-linked-heading-bold-and-it\)/);
});

// PACT-78 C3
test('toc: every in-repo anchor link into a tracked doc names an anchor that doc has', () => {
  const files = trackedDocs(REPO);
  const by = new Map(files.map(f => [f.path, f]));
  const missing = [];
  let seen = 0;
  for (const f of files) {
    for (const [, target, anchor] of f.text.matchAll(/\]\(([^)\s#]*)#([^)\s]+)\)/g)) {
      const t = by.get(target ? posix.normalize(posix.join(posix.dirname(f.path), target)) : f.path);
      if (!t) continue;
      if (t !== f) seen++;
      if (!headings(t.text).some(h => h.anchor === anchor)) missing.push(`${f.path}: #${anchor} in ${t.path}`);
    }
  }
  assert.ok(seen > 0, 'no anchor link from one doc into another was found');
  assert.deepEqual(missing, []);
});

// PACT-78 C5
test('toc: writing twice changes nothing, the table sits before the first H2, and CRLF is kept', () => {
  const once = withToc(LONG);
  assert.equal(withToc(once), once);
  assert.ok(once.indexOf(TOC_OPEN) < once.indexOf('\n## One'));
  assert.ok(once.indexOf('Intro line.') < once.indexOf(TOC_OPEN), 'the intro stays first');
  assert.equal(stripToc(once), LONG);
  const crlf = LONG.replace(/\n/g, '\r\n');
  const w = withToc(crlf);
  assert.doesNotMatch(w, /(?<!\r)\n/, 'every line ending stays CRLF');
  assert.ok(w.includes(`${TOC_CLOSE}\r\n`));
  assert.equal(stripToc(w), crlf);
});
