// A poster refusal names a NEXT step, not only a rule id and a field (PACT-48,
// P7 T5). Each case triggers one refusal through the poster, in-process behind
// an injected gh, and holds that the NEXT: line sits straight above the RESULT
// line and says what to do. Each case fails when its NEXT line is removed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NEXT_FOR } from '../../claude/tools/poster.mjs';
import { postDoc } from './poster-post.mjs';
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
