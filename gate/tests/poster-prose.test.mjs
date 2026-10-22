// The poster's two prose checks (#317): text/hard-wrap and link/relative. The
// poster refuses a body whose prose was wrapped at a column limit, or whose
// link has no scheme, because GitHub shows each line break and leaves a
// relative target as written. Every case runs the poster's post() in-process
// with a gh that fails any call, so a refusal is seen to send nothing. The
// passing shapes (C3) are all in the table's base body; the table takes only
// must-refuse rows.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { post } from '../../claude/tools/poster.mjs';
import { assertFails, assertPasses } from './text.mjs';
import { tempDir, writeTree } from './tree.mjs';

const TARGET = 'tester/sandbox';
// Synthetic machine values: never this machine's.
const MACHINE = { home: '/srv/home/tester', tmp: '/tmp', user: 'tester', host: 'buildhost' };
const FENCE3 = '`'.repeat(3);
const FENCE4 = '`'.repeat(4);

// #317 C3: every shape below must pass. The pact's own report, spec and PR shapes come first.
const BASE = [
  '- [ ] This PR finishes its work: the docs/log entry and its ADRs are included. Otherwise: this isn\'t the last PR for the work.',
  'Tests: +2 −0',
  '',
  '- **Before:** the failing test run',
  '  **After:** all tests pass',
  '',
  'Posted by session `build-317`. Question q1 sent to the head chef.',
  '',
  '— build-317',
  '',
  'Lens dispositions:',
  '',
  '| Finding | Lens | Disposition | Rerun |',
  '| --- | --- | --- | --- |',
  '| new F1 a finding | executability-lens | fixed (auto) | none |',
  '',
  'Auto-takes:',
  '',
  '- chose X because Y',
  '- chose Z',
  '',
  // A table, a list with one item per line, a nested list, a heading over a paragraph.
  '| a | b |',
  '| --- | --- |',
  '| c | d |',
  '',
  '- one item',
  '- another item',
  '  - a nested item',
  '  - another nested item',
  '',
  '## A heading',
  'A paragraph under a heading, with no stop',
  '',
  // A paragraph line, a fence and a paragraph line, none ending in punctuation.
  'A paragraph line before a fence',
  `${FENCE3}text`,
  'a fenced line',
  FENCE3,
  'A paragraph line after a fence',
  '',
  // A fence holding wrapped prose and relative links, at no indent and inside a list item.
  `${FENCE3}text`,
  'wrapped prose that stops here',
  'and carries on, with [a link](docs/x.md)',
  FENCE3,
  '',
  '- a list item with a fence',
  `    ${FENCE3}text`,
  '    wrapped prose that stops here',
  '    and carries on, with [a link](docs/x.md)',
  `    ${FENCE3}`,
  '',
  // A fold with a fenced lens report that itself holds a shorter fence.
  '<details><summary>a lens: findings</summary>',
  '',
  `${FENCE4}text`,
  'A report that stops here',
  'and carries on:',
  `${FENCE3}text`,
  'wrapped code that stops here',
  'and carries on',
  FENCE3,
  FENCE4,
  '',
  '</details>',
  '',
  '> [!NOTE]',
  '> An alert.',
  '',
  // Lines that end a sentence, or in a link.
  'A line that ends a sentence.',
  'A line ending in a question?',
  'A line that ends a clause;',
  'A line ending in a quote."',
  'A line ending in a bracket (see below.)',
  'A line ending in a link https://github.com/mephistopheles4/the-pact/issues/1',
  'The next line',
  '',
  // A deliberate break: two spaces, a backslash, a bold label on the next line.
  'A line broken with two spaces  ',
  'and its next line',
  '',
  'A line broken with a backslash\\',
  'and its next line',
  '',
  'Before the change',
  '**After:** the change',
  '',
  // Marks other than a full stop, closing marks after one, and other fences and list markers.
  'A line ending in a bang!',
  'A line ending in a colon:',
  'A line ending in bold text.**',
  'A line ending in a curly quote.’',
  'A line ending in `code.`',
  'The next line',
  '',
  '~~~text',
  'wrapped prose that stops here',
  'and carries on, with [a link](docs/x.md)',
  FENCE3,
  '~~~',
  '',
  '* a star item',
  '* another star item',
  '',
  '+ a plus item',
  '+ another plus item',
  '',
  '1. a numbered item',
  '2) another numbered item',
  '',
  'Before the change',
  '**After**: the change',
  '',
  // Links that are not relative.
  'See [a full URL](https://github.com/mephistopheles4/the-pact/issues/1), [a mail link](mailto:noreply@anthropic.com), [an anchor](#a-heading) and a note.[^1]',
  '',
  '[^1]: a footnote',
  '[ref]: https://github.com/mephistopheles4/the-pact',
  '',
  'A link inside a code span: `[x](docs/x.md)`.',
  '',
  '<!-- [x](docs/x.md)',
  'a hidden line that stops here',
  'and carries on -->',
  '',
].join('\n');

const BASE_LINES = BASE.split('\n').length - 1;

/** The base with `lines` added as a new block at its end; the plant's lines start at `at(0)`. */
const add = (...lines) => tree => ({ 'body.md': `${tree['body.md']}\n${lines.join('\n')}\n` });
/** The line number of the `i`th (from 0) line a plant adds. */
const at = i => BASE_LINES + 2 + i;
const asBody = text => () => ({ 'body.md': text });

/**
 * A run of an issue comment carrying the tree's body (a dry run by default),
 * with a gh that records any call. Its code and last line are mapped to what
 * `assertFails` and `assertPasses` assert: a refusal (exit 2) to exit 1 and
 * `RESULT: fail`, a dry run to exit 0 and `RESULT: pass`. `refusedQuietly`
 * asserts the real exit 2.
 */
function runBody(tree, t, extra = ['--dry-run']) {
  const dir = tempDir(t, 'pact-poster-prose-');
  writeTree(dir, tree);
  const calls = [];
  const r = post(['issue-comment', '--repo', TARGET, '--body', join(dir, 'body.md'), '--issue', '5', ...extra], { gh: (...a) => (calls.push(a), { ok: false, stdout: '', stderr: '' }), env: {}, ...MACHINE });
  const lastLine = r.lines.at(-1) ?? '';
  return {
    code: r.code === 2 ? 1 : r.code,
    fails: r.lines.filter(l => l.startsWith('REFUSED ')).map(l => l.split(' ')[1]),
    last: /^RESULT: refused [1-9][0-9]*$/.test(lastLine) ? 'RESULT: fail' : /^RESULT: dry-run [a-z-]+$/.test(lastLine) ? 'RESULT: pass' : lastLine,
    out: r.lines.join('\n'),
    real: r,
    calls,
  };
}

/** Every refusal row: exit 2, nothing sent, one refusal naming its rule, the body, a line and a column. */
function refusedQuietly(r) {
  assert.equal(r.real.code, 2, r.out);
  assert.equal(r.calls.length, 0, 'a refusal calls no gh');
  assert.equal(r.real.lines.length, 2, r.out);
  assert.match(r.real.lines[0], /^REFUSED (?:text\/hard-wrap|link\/relative) body [1-9][0-9]*:[1-9][0-9]*$/, r.out);
}

const wrap = (n) => new RegExp(`^REFUSED text/hard-wrap body ${n}:1$`, 'm');
const link = (n, line, target) => new RegExp(`^REFUSED link/relative body ${n}:${[...line.slice(0, line.indexOf(target))].length + 1}$`, 'm');
const linkRow = (id, line, target, why) => ({ id, plant: add(line), fails: ['link/relative'], says: link(at(0), line, target), why });

// #317 C1, #317 C2: each rule refuses a planted line, at its place. #317 C3: the base, with every passing shape, passes.
{
  const base = () => ({ 'body.md': BASE });
  const run = runBody;
  const everyRow = refusedQuietly;
  const rows = [
    { id: 'wrap-paragraph', plant: add('A paragraph that stops here', 'and carries on.'), fails: ['text/hard-wrap'], says: wrap(at(1)), why: 'a line that stops mid-sentence, continued' },
    { id: 'wrap-list-continuation', plant: add('- a list item that stops here', '  and carries on.'), fails: ['text/hard-wrap'], says: wrap(at(1)), why: 'a list item wrapped onto an indented line' },
    { id: 'wrap-quote', plant: add('> a quoted line that stops here', '> and carries on.'), fails: ['text/hard-wrap'], says: wrap(at(1)), why: 'a quote read with its markers off' },
    { id: 'wrap-whole-body', plant: asBody('A paragraph that stops here\nand goes on over\nthree lines.\n\nAnother that stops here\nand goes on.\n'), fails: ['text/hard-wrap'], says: wrap(2), why: 'a wholly wrapped body gives one refusal, at its first hit' },
    linkRow('link-path', 'See [ok](https://x.test) and [it](docs/x.md).', 'docs/x.md', 'a path with no scheme, after a link that passes'),
    linkRow('link-dot-slash', '> See [it](./x).', './x', 'a dot-slash target inside a quote'),
    linkRow('link-dot-dot', '😀 See [it](../blob/main/x).', '../blob/main/x', 'a dot-dot target after a wide character: columns count characters'),
    linkRow('link-root', 'See [it](/owner/repo/x).', '/owner/repo/x', 'a root link, refused with the rest (q2 A)'),
    linkRow('link-drive-letter', 'See [it](D:/work/x.md).', 'D:/work/x.md', 'a drive letter is no scheme (#364)'),
    linkRow('link-reference', '[ref2]: docs/x.md', 'docs/x.md', 'a reference definition'),
    linkRow('link-image', 'See ![it](docs/x.png).', 'docs/x.png', 'an image'),
    linkRow('link-html-src', '<img src="docs/x.png">', 'docs/x.png', 'an HTML src'),
    linkRow('link-angle', 'See [it](<docs/x.md>).', 'docs/x.md', 'a target in angle brackets'),
    linkRow('link-html-href', '<a href="docs/x.md">it</a>', 'docs/x.md', 'an HTML href'),
  ];
  test('poster prose: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) {
    test(`poster prose: ${r.id}`, async t => {
      const res = await run(r.plant(base()), t);
      assertFails(res, r.fails, r.says);
      await everyRow(res, t);
    });
  }
  test('poster prose: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

// #317 C4: on a refusal, nothing is sent, both new rules are counted, and a dry run refuses the same body.
test('a refusal sends nothing, counts both rules, and a dry run refuses the same body', t => {
  const text = 'A paragraph that stops here\nand carries on, with [a link](docs/x.md)\n';
  for (const extra of [[], ['--dry-run']]) {
    const r = runBody({ 'body.md': text }, t, extra);
    assert.equal(r.calls.length, 0, 'a refusal calls no gh');
    assert.deepEqual(r.real.lines, ['REFUSED text/hard-wrap body 2:1', 'REFUSED link/relative body 2:31', 'RESULT: refused 2']);
    assert.equal(r.real.code, 2);
  }
});

// #317 C4, S4 point 6: the prose refusals follow the content scan's and the table check's, any note on unlisted table refusals follows them, and one count covers all.
test('the prose refusals come after the scan and the table check, before any note, in one count', t => {
  const token = 'n' + 'pm_' + 'E5'.repeat(18);
  const head = ['### Lens dispositions', '', '| Finding | Lens | Disposition | Rerun |', '| --- | --- | --- | --- |'];
  const wrapped = ['', 'A paragraph that stops here', 'and carries on.', ''];
  const few = runBody({ 'body.md': [...head, '| new a | b | changed | c |', ...wrapped, token].join('\n') }, t);
  assert.deepEqual(few.real.lines, ['REFUSED secret/token body 10:1', 'REFUSED table/disposition body 5:15', 'REFUSED text/hard-wrap body 8:1', 'RESULT: refused 3']);
  const many = runBody({ 'body.md': [...head, ...Array(60).fill('|'), ...wrapped].join('\n') }, t);
  assert.equal(many.real.lines.length, 53, many.out);
  assert.equal(many.real.lines[50], 'REFUSED text/hard-wrap body 67:1');
  assert.equal(many.real.lines[51], 'NOTE: 10 more table refusals not listed');
  assert.equal(many.real.lines.at(-1), 'RESULT: refused 61');
});

// #317 C7: one pass over the lines. Each body below is at the size limit; a reader that searches ahead again from every run, or
// retries a pattern from every `[` or `](`, would take minutes on one of them.
test('a worst-case body at the 65,536-character limit finishes within two seconds', t => {
  const fill = s => s.repeat(Math.ceil(65536 / s.length)).slice(0, 65536);
  const rising = Array.from({ length: 300 }, (_, i) => `${'`'.repeat(i + 1)}x`).join(' ');
  const bodies = {
    'backtick runs of rising length': fill(`${rising}\n`),
    'a link opener repeated': fill('](') ,
    'an open bracket repeated': fill('['),
    'brackets and openers, each with a target': fill('[a](b'),
    'an unclosed comment': `${'<!--'}${fill('x\n').slice(0, 65532)}`,
    'one wrapped line at the limit': `${'a '.repeat(32767)}\nb`,
    'many short units': fill(`[a](https://x.test)\n${'`'.repeat(3)}x\n[b](c\n<!-- d\n`),
  };
  for (const [name, text] of Object.entries(bodies)) {
    assert.equal([...text].length, 65536, name);
    const start = performance.now();
    const r = runBody({ 'body.md': text }, t);
    const ms = performance.now() - start;
    assert.ok(ms < 2000, `${name}: ${Math.round(ms)} ms`);
    assert.ok(r.fails.every(f => /^(?:text|link)\//.test(f)) || r.fails.length === 0, `${name}: ${r.out.slice(0, 300)}`);
  }
});
