// A quoted post carries its Understood intent, or a skip reason in its own
// field (PACT-48, P7 T5; the pact's rule for it follows in P2). Every case runs
// in-process behind an injected gh, as the poster's other tests do.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { askItem, post, renderBody } from '../../claude/tools/poster.mjs';
import { tempDir, writeTree } from './tree.mjs';

const ME = 'tester';
const TARGET = `${ME}/sandbox`;
const API = `https://api.github.com/repos/${TARGET}`;
const MACHINE = { home: '/srv/home/tester', tmp: '/tmp', user: ME, host: 'buildhost' };
const NOW = new Date('2026-11-11T12:00:00Z');
const SECRET = 'zebra-quokka-42';
const SKIP = 'the quote needs no reading';
const QUOTE = { text: 'The owner said this plainly.', source: 'chat', when: '2026-11-11' };
const INTENT = { text: 'I read it so.', status: 'pending' };
const ISSUE = { repo: TARGET, kind: 'issue', title: 'A title', signer: 'plan-48', quote: [QUOTE], intent_skip: SKIP, body_file: 'body.md' };
const without = (doc, ...names) => Object.fromEntries(Object.entries(doc).filter(([k]) => !names.includes(k)));
const noGh = () => assert.fail('a dry run calls no gh');
const out = r => r.lines.join('\n');
const rules = r => r.lines.filter(l => l.startsWith('REFUSED ')).map(l => l.slice('REFUSED '.length));

function run(t, surface, doc, { body = 'A plain body.\n', gh = noGh, env = {}, dry = true } = {}) {
  const dir = tempDir(t, 'pact-poster-skip-');
  writeTree(dir, { 'body.md': body, 'post.json': JSON.stringify(doc) });
  return post([surface, '--post', join(dir, 'post.json'), ...(dry ? ['--dry-run'] : [])], { gh, env, now: NOW, ...MACHINE });
}

test('PACT-48: a quoted post with a skip reason and no intent is accepted; with neither it is refused, and the NEXT line names both fields', t => {
  const ok = run(t, 'issue', ISSUE);
  assert.equal(ok.code, 0, out(ok));
  const none = run(t, 'issue', without(ISSUE, 'intent_skip'));
  assert.equal(none.code, 2, out(none));
  assert.deepEqual(rules(none), ['post/missing intent']);
  const next = none.lines.at(-2);
  assert.match(next, /^NEXT: /);
  assert.match(next, /`intent`/);
  assert.match(next, /`intent_skip`/);
});

test('PACT-48: intent and intent_skip together, a skip reason on a decision, and one on a post with no quote are each refused post/field', t => {
  const both = run(t, 'issue', { ...ISSUE, intent: INTENT });
  assert.deepEqual(rules(both), ['post/field intent_skip']);
  assert.match(both.lines.at(-2), /^NEXT: give `intent` or `intent_skip`, never both/);
  const decision = { repo: TARGET, kind: 'decision', issue: 5, signer: 'pact-48', quote: [QUOTE], intent_skip: SKIP, body_file: 'body.md' };
  assert.ok(rules(run(t, 'issue-comment', decision)).includes('post/field intent_skip'));
  const note = { repo: TARGET, kind: 'note', issue: 5, signer: 'build-48', intent_skip: SKIP, body_file: 'body.md' };
  assert.ok(rules(run(t, 'issue-comment', note)).includes('post/field intent_skip'));
});

test('PACT-48: a skip reason of two lines, with a live secret, or with a hidden character is refused, and its text never reaches the output', t => {
  assert.ok(rules(run(t, 'issue', { ...ISSUE, intent_skip: 'one\ntwo' })).includes('post/pattern intent_skip'));
  const leak = run(t, 'issue', { ...ISSUE, intent_skip: `see ${SECRET}` }, { env: { MY_API_KEY: SECRET } });
  assert.ok(rules(leak).some(l => l.startsWith('secret/env intent_skip ')), out(leak));
  assert.ok(!out(leak).includes(SECRET));
  assert.ok(rules(run(t, 'issue', { ...ISSUE, intent_skip: 'a​b' })).some(l => l.startsWith('text/hidden intent_skip ')));
  assert.ok(rules(run(t, 'issue', { ...ISSUE, intent_skip: '<!-- hidden' })).includes('text/hidden-line intent_skip'));
});

test('PACT-48: the body shows the skip reason under the Understood intent heading with no read-back line, and reads back as a skipped ask item', () => {
  const body = renderBody({ kind: 'issue', quote: [QUOTE], intentSkip: SKIP, sessionPart: 'A plain body.\n', signer: 'plan-48' });
  assert.match(body, new RegExp(`## Understood intent\\n\\nSkipped: ${SKIP}\\n\\nA plain body\\.`));
  assert.doesNotMatch(body, /Read-back/);
  const item = askItem(body);
  assert.equal(item.status, 'skipped');
  assert.equal(item.intent, SKIP);
});

// ---------------------------------------------------------------- an edit of a skipped item

const LABEL = 'plan-48';
const ITEM = `## The ask\n\n> ${QUOTE.text}\n\nSaid in this session's chat, ${QUOTE.when}.\n\n## Understood intent\n\nSkipped: ${SKIP}\n\nA plain body.\n\nSigned: ${LABEL}\n`;

function world(body) {
  const store = { [`repos/${TARGET}/issues/comments/9001`]: { id: 9001, body, user: { login: ME }, issue_url: `${API}/issues/5` } };
  const calls = [];
  const gh = (args, input) => {
    calls.push({ args: [...args], input });
    const method = args[args.indexOf('--method') + 1];
    const path = args[args.indexOf('--method') + 2];
    if (method === 'GET' && path === 'user') return { ok: true, stdout: JSON.stringify({ login: ME }), stderr: '' };
    if (method === 'GET' && path === `repos/${TARGET}`) return { ok: true, stdout: JSON.stringify({ owner: { login: ME } }), stderr: '' };
    if (!Object.hasOwn(store, path)) return { ok: false, stdout: '', stderr: 'HTTP 404: Not Found' };
    if (method === 'PATCH') store[path] = { ...store[path], body: JSON.parse(input).body };
    return { ok: true, stdout: JSON.stringify(store[path]), stderr: '' };
  };
  return { gh, calls };
}

function edit(t, w, change) {
  const doc = { repo: TARGET, signer: LABEL, reason: 'fixed a wrong link', body_file: 'body.md', issue: 5, comment: 9001, quote: [QUOTE], ...change };
  return run(t, 'issue-comment-edit', doc, { gh: w.gh, dry: false });
}

test('PACT-48: an edit of a skipped item carrying its own skip reason keeps the ask block, and one carrying another reason, or an intent, is refused edit/ask', t => {
  const w = world(ITEM);
  const ok = edit(t, w, { intent_skip: SKIP });
  assert.equal(ok.code, 0, out(ok));
  const patched = JSON.parse(w.calls.find(c => c.args.includes('PATCH')).input).body;
  assert.ok(patched.startsWith(`## The ask\n\n> ${QUOTE.text}\n\nSaid in this session's chat, ${QUOTE.when}.\n\n## Understood intent\n\nSkipped: ${SKIP}\n\n`), patched);
  for (const change of [{ intent_skip: 'another reason' }, { intent: INTENT }]) {
    const bad = edit(t, world(ITEM), change);
    assert.equal(bad.code, 2, out(bad));
    assert.deepEqual(rules(bad), ['edit/ask intent']);
  }
});
