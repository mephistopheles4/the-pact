// A poster refusal names a NEXT step, not only a rule id and a field (PACT-48,
// P7 T5). Each case triggers one refusal through the poster, in-process behind
// an injected gh, and holds that the NEXT: line sits straight above the RESULT
// line and says what to do. Each case fails when its NEXT line is removed.
import assert from 'node:assert/strict';
import { readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { NEXT_FOR, post } from '../../claude/tools/poster.mjs';
import { postDoc } from './poster-post.mjs';
import { REPO } from './text.mjs';
import { tempDir, writeTree } from './tree.mjs';

const ME = 'tester';
const TARGET = `${ME}/sandbox`;
const API = `https://api.github.com/repos/${TARGET}`;
const LABEL = 'pact-48';
const MACHINE = { home: '/srv/home/tester', tmp: '/tmp', user: ME, host: 'buildhost' };
const SECRET = 'zebra-quokka-42';

/** A fake GitHub holding one issue comment with `body`, written by `user`. */
function world(body, user = ME, extra = {}) {
  const store = { [`repos/${TARGET}/issues/comments/9001`]: { id: 9001, body, user: { login: user }, issue_url: `${API}/issues/5` }, ...extra };
  const gh = args => {
    const method = args[args.indexOf('--method') + 1];
    const path = args[args.indexOf('--method') + 2];
    if (method === 'GET' && path === 'user') return { ok: true, stdout: JSON.stringify({ login: ME }), stderr: '' };
    if (method === 'GET' && path === `repos/${TARGET}`) return { ok: true, stdout: JSON.stringify({ owner: { login: ME } }), stderr: '' };
    if (method === 'GET' && Object.hasOwn(store, path)) return { ok: true, stdout: JSON.stringify(store[path]), stderr: '' };
    return { ok: false, stdout: '', stderr: 'HTTP 404: Not Found' };
  };
  return { gh };
}

function edit(t, w, { body = 'A plain body.\n', env = {}, change = {} } = {}) {
  const dir = tempDir(t, 'pact-poster-next-');
  writeTree(dir, { 'body.md': body });
  const doc = { repo: TARGET, signer: LABEL, reason: 'fixed a wrong link', body_file: 'body.md', issue: 5, comment: 9001, ...change };
  return postDoc('issue-comment-edit', doc, dir, { gh: w.gh, env, ...MACHINE });
}

/** The NEXT lines of a refused run, and a check that the last two lines are NEXT then RESULT. */
function nextOf(r, rule) {
  assert.equal(r.code, 2, r.lines.join(' | '));
  assert.ok(r.lines.some(l => l.startsWith(`REFUSED ${rule} `)), r.lines.join(' | '));
  const lines = r.lines.filter(l => l.startsWith('NEXT: '));
  assert.ok(lines.length >= 1, `no NEXT line: ${r.lines.join(' | ')}`);
  assert.match(r.lines.at(-1), /^RESULT: refused [1-9]/);
  assert.ok(r.lines.at(-2).startsWith('NEXT: '), 'the NEXT line sits straight above RESULT');
  return lines;
}

test('PACT-48: an edit of another login\'s item is refused edit/author with a NEXT line that says to post a new comment', t => {
  const [line] = nextOf(edit(t, world('Their text.\n', 'stranger')), 'edit/author');
  assert.match(line, /Post a new comment/);
  assert.match(line, /owner/);
});

test('PACT-48: an unsigned item is refused edit/unsigned with a NEXT line that names the Signed: line and the owner', t => {
  const [line] = nextOf(edit(t, world('A plain body.\n')), 'edit/unsigned');
  assert.match(line, /Signed: <signer>/);
  assert.match(line, /owner/);
});

test('PACT-48: an item holding a live secret value is refused edit/leak, and its NEXT line says to tell the owner and never the value', t => {
  const w = world(`Key ${SECRET}.\n\nSigned: ${LABEL}\n`);
  const r = edit(t, w, { env: { MY_API_KEY: SECRET } });
  const [line] = nextOf(r, 'edit/leak');
  assert.match(line, /tell the owner/);
  assert.match(line, /never the value/);
  assert.ok(!r.lines.join('\n').includes(SECRET));
});

test('PACT-48: a review record is refused edit/record, and its NEXT line says a correction is a new comment', t => {
  const record = `### behaviour-lens and integrity-lens\n\nBase line.\n\nSigned: ${LABEL}\n`;
  const [line] = nextOf(edit(t, world(record)), 'edit/record');
  assert.match(line, /new comment/);
});

test('PACT-48: a body holding "owner decision" is refused edit/decision, and its NEXT line says to post a new comment', t => {
  const [line] = nextOf(edit(t, world(`Owner decision.\n\nSigned: ${LABEL}\n`)), 'edit/decision');
  assert.match(line, /new comment/);
});

test('PACT-48: a live environment secret in the text is refused secret/env, and its NEXT line says to remove the value from the named field', t => {
  const dir = tempDir(t, 'pact-poster-next-');
  writeTree(dir, { 'body.md': `Key ${SECRET}.\n` });
  const doc = { repo: TARGET, kind: 'note', issue: 5, signer: LABEL, body_file: 'body.md' };
  const r = postDoc('issue-comment', doc, dir, { gh: world('').gh, env: { MY_API_KEY: SECRET }, ...MACHINE });
  const [line] = nextOf(r, 'secret/env');
  assert.match(line, /remove the value from the named field and post again/);
  assert.match(line, /tell the owner where it is/);
  assert.ok(!r.lines.join('\n').includes(SECRET));
});

test('PACT-48: a hidden character is refused text/hidden, and its NEXT line says to remove it from the named field', t => {
  const dir = tempDir(t, 'pact-poster-next-');
  writeTree(dir, { 'body.md': `A plain${String.fromCharCode(0x200b)} body.\n` });
  const doc = { repo: TARGET, kind: 'note', issue: 5, signer: LABEL, body_file: 'body.md' };
  const r = postDoc('issue-comment', doc, dir, { gh: world('').gh, env: {}, ...MACHINE });
  const [line] = nextOf(r, 'text/hidden');
  assert.match(line, /remove the hidden character from the named field and post again/);
});

test('PACT-48: two refusals of one rule print its NEXT line once, straight above RESULT', t => {
  const dir = tempDir(t, 'pact-poster-next-');
  const hidden = String.fromCharCode(0x200b);
  writeTree(dir, { 'body.md': `One${hidden} two.\n\nThree${hidden} four.\n` });
  const doc = { repo: TARGET, kind: 'note', issue: 5, signer: LABEL, body_file: 'body.md', as: ME };
  const r = postDoc('issue-comment', doc, dir, { gh: world('').gh, env: {}, ...MACHINE });
  assert.equal(r.lines.filter(l => l.startsWith('NEXT: ')).length, 1, r.lines.join(' | '));
  assert.deepEqual(r.lines.slice(-2), [NEXT_FOR['text/hidden'], r.lines.at(-1)]);
});

/** An ask item (a quote and a pending read-back) the fake GitHub holds as comment 9001. */
const ASK = `## The ask\n\n> The owner asked for a plain thing.\n\nSaid in this session's chat, 2026-11-11.\n\n## Understood intent\n\nA plain thing is wanted.\n\nRead-back: not yet confirmed.\n\nA plain body.\n\nSigned: ${LABEL}\n`;
const QUOTE = [{ text: 'The owner asked for a plain thing.', source: 'chat', when: '2026-11-11' }];

test('PACT-48: the target, ask, status and confirm refusals each print their own NEXT line', t => {
  const cases = [
    ['edit/target', {}, { issue: 6 }, 'edit/target', /isn't where the post says/],
    ['edit/ask', { change: { quote: [{ ...QUOTE[0], text: 'Other words.' }], intent: { text: 'A plain thing is wanted.', status: 'pending' } } }, {}, 'edit/ask', /ask item's quote and intent must be the item's own/],
    ['edit/status', { change: { quote: QUOTE, intent: { text: 'A plain thing is wanted.', status: 'confirmed' } } }, {}, 'edit/status', /a read-back moves only from pending to confirmed or corrected/],
    ['edit/confirm', { change: { quote: QUOTE, intent: { text: 'A plain thing is wanted.', status: 'confirmed', comment: 9002 } } }, {}, 'edit/confirm', /intent\.comment must be this login's own decision comment/],
  ];
  for (const [rule, opts, change, expected, says] of cases) {
    const w = world(ASK, ME, { [`repos/${TARGET}/issues/comments/9002`]: { id: 9002, body: 'Just a note.\n\nSigned: pact-48\n', user: { login: ME }, issue_url: `${API}/issues/5` } });
    const [line] = nextOf(edit(t, w, { ...opts, change: { ...(opts.change ?? {}), ...change } }), expected);
    assert.equal(line, NEXT_FOR[rule], rule);
    assert.match(line, says, rule);
  }
});

test('PACT-48: every edit rule and both scan rules have a NEXT line', () => {
  for (const rule of ['edit/author', 'edit/target', 'edit/unsigned', 'edit/record', 'edit/decision', 'edit/leak', 'edit/reasons', 'edit/ask', 'edit/status', 'edit/confirm', 'secret/env', 'text/hidden']) {
    assert.match(NEXT_FOR[rule] ?? '', /^NEXT: .{20,}$/, rule);
  }
});

// ---------------------------------------------------------------- PACT-52: usage, field, file, prose and table refusals

const NEVER = () => assert.fail('a refusal calls no gh');
const NO_GH = { gh: NEVER, env: {}, ...MACHINE };
const NOTE = { repo: TARGET, kind: 'note', issue: 5, signer: LABEL, body_file: 'body.md' };
const ISSUE = { repo: TARGET, kind: 'issue', title: 'A plain title', signer: LABEL, body_file: 'body.md', quote: QUOTE, intent: { text: 'A plain thing is wanted.', status: 'pending' } };
const TABLE_ROW = '| new a finding | behaviour-lens | fixed | none |';
const TABLE_HEADER = '| Finding | Lens | Disposition | Rerun |';
/** A body holding a Lens dispositions table with one row. */
const table = (row, header = TABLE_HEADER) => `### Lens dispositions\n\n${header}\n| --- | --- | --- | --- |\n${row}\n`;

/** A dry run of `doc` on `surface`, with `files` beside it. */
const dry = (t, surface, doc, files = { 'body.md': 'A plain body.\n' }) => {
  const dir = tempDir(t, 'pact-poster-next-');
  writeTree(dir, files);
  return postDoc(surface, doc, dir, NO_GH, true);
};
/** A dry run of an issue comment with `text` as its body. */
const inBody = (t, text) => dry(t, 'issue-comment', NOTE, { 'body.md': text });

/** A body file that is a link, where this account may make one; else a junction. Null when neither can be made. */
function linked(t) {
  const dir = tempDir(t, 'pact-poster-next-');
  writeTree(dir, { 'real.md': 'A plain body.\n', 'real/x.md': 'x\n' });
  try {
    symlinkSync(join(dir, 'real.md'), join(dir, 'body.md'), 'file');
  } catch {
    try {
      symlinkSync(join(dir, 'real'), join(dir, 'body.md'), 'junction');
    } catch {
      return null;
    }
  }
  return postDoc('issue-comment', NOTE, dir, NO_GH, true);
}

// Each case: the rule, a run that trips it, and what its NEXT line must say.
const CASES = [
  ['usage/surface', () => post(['--post', 'post.json'], NO_GH), /give a surface first: .*issue-comment.*review-thread-reply-edit.*`schema`/],
  ['usage/argument', () => post(['issue', '--post', 'post.json', 'stray'], NO_GH), /only arguments are .*--post <file>.*--dry-run.*Remove the stray word/],
  ['usage/repeated', () => post(['issue', '--post', 'a.json', '--post', 'b.json'], NO_GH), /once each.*Remove the repeat/],
  ['usage/missing-value', () => post(['issue', '--post'], NO_GH), /file's name straight after it/],
  ['usage/missing-option', () => post(['issue', '--dry-run'], NO_GH), /needs `--post <file>`.*`schema`/],
  ['post/json', t => dry(t, 'issue-comment', []), /one JSON object.*`schema`/],
  ['post/unknown', t => dry(t, 'issue-comment', { ...NOTE, extra: 1 }), /remove the named field.*only the fields `schema` prints/],
  ['post/field', t => dry(t, 'issue-comment', { ...NOTE, reason: 'x' }), /isn't allowed on this surface or kind.*`schema`/],
  ['post/missing', t => dry(t, 'issue-comment', { repo: TARGET, kind: 'note', issue: 5, signer: LABEL }), /add the named field.*`schema`/],
  ['post/type', t => dry(t, 'issue-comment', { ...NOTE, body_file: 5 }), /type `schema` prints/],
  ['post/pattern', t => dry(t, 'issue-comment', { ...NOTE, repo: 'tester' }), /misses the form `schema` prints.*`owner\/name`/],
  ['post/length', t => dry(t, 'issue-comment-edit', { repo: TARGET, signer: LABEL, reason: '  ', body_file: 'body.md', issue: 5, comment: 9001 }), /empty or over its length limit.*`schema`/],
  ['post/kind', t => dry(t, 'issue-comment', { ...NOTE, kind: 'review' }), /takes only some kinds.*`schema`/],
  ['post/signer', t => dry(t, 'issue-comment', { ...NOTE, kind: 'status', signer: 'other-label' }), /`status-<issue>`.*never one starting `status-`/],
  ['post/status', t => dry(t, 'issue', { ...ISSUE, intent: { text: 'A plain thing is wanted.', status: 'corrected', corrected: 'Other.' } }), /can't be `corrected`.*`confirmed` only when every quote is from chat/],
  ['post/when', t => dry(t, 'issue', { ...ISSUE, quote: [{ ...QUOTE[0], when: '2099-01-01' }] }), /`YYYY-MM-DD`.*no later than tomorrow in UTC/],
  ['post/tracker', t => dry(t, 'issue', { ...ISSUE, quote: [{ text: 'Short.', source: 'tracker', comment: 9001, when: '2026-11-11' }] }), /own comment in this repo.*20 characters.*chat or relayed/],
  ['post/owned-line', t => dry(t, 'issue', { ...ISSUE, intent: undefined, intent_skip: '## A heading' }), /the poster's own line.*no heading or fence/],
  ['file/unreadable', t => dry(t, 'issue-comment', NOTE, {}), /can't be read.*Check the name/],
  ['file/link', t => linked(t), /may not be a link.*regular file/],
  ['file/not-regular', t => dry(t, 'issue-comment', NOTE, { 'body.md/x': 'x' }), /regular file, not a folder or device/],
  ['file/size', t => inBody(t, 'a'.repeat(256 * 1024 + 1)), /over 256 KiB.*several posts/],
  ['file/utf8', t => inBody(t, Buffer.from([0x41, 0xff, 0x42])), /isn't valid UTF-8.*Save it as UTF-8/],
  ['file/bom', t => inBody(t, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('A plain body.\n')])), /byte-order mark.*without one/],
  ['file/empty', t => inBody(t, ''), /file is empty/],
  ['text/body-length', t => inBody(t, `${'a'.repeat(70000)}\n`), /over 65,536 characters.*several posts/],
  ['text/hidden-line', t => inBody(t, '<!-- never closed\n\nA plain body.\n'), /opens an HTML comment or a fold it doesn't close.*Close it/],
  ['fence/unclosed', t => inBody(t, '```\ncode\n'), /close the fence.*backticks at least as long/],
  ['text/hard-wrap', t => inBody(t, 'A paragraph that stops here\nand carries on.\n'), /one line per paragraph.*every line break/],
  ['link/relative', t => inBody(t, 'See [the doc](docs/a.md).\n'), /full address with a scheme.*anchor on the same page/],
  ['table/header', t => inBody(t, table(TABLE_ROW, '| Finding | Lens | Disposition |')), /header row is exactly `\| Finding \| Lens \| Disposition \| Rerun \|`/],
  ['table/cells', t => inBody(t, table('| new a finding | behaviour-lens | fixed |')), /four cells.*Lens cell/],
  ['table/disposition', t => inBody(t, table('| new a finding | behaviour-lens | mended | none |')), /`fixed`, `taken`, `dismissed`, `skipped`, `open` or `noted`/],
  ['table/skipped', t => inBody(t, table('| | data-lens | skipped | none |')), /`skipped, because`/],
  ['table/auto', t => inBody(t, table('| new a finding | behaviour-lens | fixed (auto, as asked) | none |')), /`fixed \(auto: chose X because Y\)`.*`fixed \(auto, reversed\)`/],
  ['table/state', t => inBody(t, table('| a finding | behaviour-lens | fixed | none |')), /`new`, `updated`, `unchanged` or `absent`/],
];

for (const [rule, run, says] of CASES) {
  test(`PACT-52: ${rule} is refused with a NEXT line that says what to do, straight above RESULT`, t => {
    const r = run(t);
    if (r === null) return t.skip('no link can be made here');
    const lines = nextOf(r, rule);
    assert.ok(lines.includes(NEXT_FOR[rule]), `${rule}: ${lines.join(' | ')}`);
    assert.match(NEXT_FOR[rule], says, rule);
  });
}

test('PACT-52: every usage, post, file, table, fence, link and body-text rule in the poster\'s rule table has a case above', () => {
  const doc = readFileSync(join(REPO, 'docs', 'poster.md'), 'utf8');
  const listed = [...doc.slice(doc.indexOf('## Rule ids')).matchAll(/^\| `([a-z0-9-]+\/[a-z0-9-]+)` \|/gm)].map(m => m[1]);
  const wanted = listed.filter(rule => /^(usage|post|file|table|fence|link)\//.test(rule) || ['text/body-length', 'text/hidden-line', 'text/hard-wrap'].includes(rule));
  // usage/unknown-option has its own fixed line, held by poster.test.mjs.
  const cased = [...CASES.map(c => c[0]), 'usage/unknown-option'];
  assert.deepEqual([...cased].sort(), [...wanted].sort());
});

test('PACT-52: a missing --post beside an old option prints the one old-command NEXT line, not two', () => {
  const r = post(['issue', '--repo', 'x/y'], NO_GH);
  assert.equal(r.lines.filter(l => l.startsWith('NEXT: ')).length, 1, r.lines.join(' | '));
});
