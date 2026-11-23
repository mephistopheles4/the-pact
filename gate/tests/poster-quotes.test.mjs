// A quoted post carries two of the owner's quotes: the words that started the
// intent and the words that started the task, each as a passage with a `role`,
// or as a plain "no owner words" reason in `intent_none` / `start_none`
// (PACT-77). Every case runs in-process behind an injected gh.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { askItem, post, renderBody, SCHEMA } from '../../claude/tools/poster.mjs';
import { tempDir, writeTree } from './tree.mjs';

const ME = 'tester';
const TARGET = `${ME}/sandbox`;
const API = `https://api.github.com/repos/${TARGET}`;
const MACHINE = { home: '/srv/home/tester', tmp: '/tmp', user: ME, host: 'buildhost' };
const NOW = new Date('2026-11-11T12:00:00Z');
const SECRET = 'zebra-quokka-42';
const WHEN = '2026-11-11';
const WANT = { text: 'I want the quoting rules to capture both.', source: 'chat', when: WHEN, role: 'intent' };
const START = { text: 'Yes, let us start issue 77.', source: 'chat', when: WHEN, role: 'start' };
const BOTH = { text: 'Build this, it is what I asked for.', source: 'chat', when: WHEN, role: 'both' };
const INTENT = { text: 'I read it so.', status: 'pending' };
const NONE = "no owner words: started from a session's note";
const ISSUE = { repo: TARGET, kind: 'issue', title: 'A title', signer: 'plan-77', quote: [WANT, START], intent: INTENT, body_file: 'body.md' };
const without = (doc, ...names) => Object.fromEntries(Object.entries(doc).filter(([k]) => !names.includes(k)));
const noGh = () => assert.fail('a dry run calls no gh');
const out = r => r.lines.join('\n');
const rules = r => r.lines.filter(l => l.startsWith('REFUSED ')).map(l => l.slice('REFUSED '.length));

function run(t, surface, doc, { body = 'A plain body.\n', gh = noGh, env = {}, dry = true } = {}) {
  const dir = tempDir(t, 'pact-poster-quotes-');
  writeTree(dir, { 'body.md': body, 'post.json': JSON.stringify(doc) });
  return post([surface, '--post', join(dir, 'post.json'), ...(dry ? ['--dry-run'] : [])], { gh, env, now: NOW, ...MACHINE });
}

test('PACT-77: a quoted post with an intent quote and a start quote, or one passage for both, is accepted', t => {
  const two = run(t, 'issue', ISSUE);
  assert.equal(two.code, 0, out(two));
  const one = run(t, 'issue', { ...ISSUE, quote: [BOTH] });
  assert.equal(one.code, 0, out(one));
  const spec = run(t, 'issue-comment', { repo: TARGET, kind: 'spec', issue: 5, signer: 'spec-77', quote: [WANT, START], intent: INTENT, body_file: 'body.md' });
  assert.equal(spec.code, 0, out(spec));
});

test('PACT-77: a post that fills neither quote is refused, and one that fills only one is refused for the other', t => {
  const neither = run(t, 'issue', without(ISSUE, 'quote'));
  assert.deepEqual(rules(neither), ['post/missing quote.intent', 'post/missing quote.start']);
  const next = neither.lines.filter(l => l.startsWith('NEXT: '));
  assert.equal(next.length, 2);
  assert.match(next[0], /`intent_none`/);
  assert.match(next[1], /`start_none`/);
  assert.deepEqual(rules(run(t, 'issue', { ...ISSUE, quote: [WANT] })), ['post/missing quote.start']);
  assert.deepEqual(rules(run(t, 'issue', { ...ISSUE, quote: [START] })), ['post/missing quote.intent']);
  assert.deepEqual(rules(run(t, 'issue', { ...ISSUE, quote: [WANT], intent_none: NONE })), ['post/field intent_none', 'post/missing quote.start']);
});

test('PACT-77: a passage with no role, or a role outside the three, is refused', t => {
  const bare = run(t, 'issue', { ...ISSUE, quote: [WANT, without(START, 'role')] });
  assert.deepEqual(rules(bare), ['post/missing quote[1].role']);
  const odd = run(t, 'issue', { ...ISSUE, quote: [WANT, { ...START, role: 'other' }] });
  assert.ok(rules(odd).includes('post/pattern quote[1].role'), out(odd));
});

test('PACT-77: with no owner words behind either one, a reason in each field stands in for the quotes, and the post needs no quote', t => {
  const doc = { ...without(ISSUE, 'quote'), intent_none: NONE, start_none: 'no owner words: this follows from the lead\'s brief' };
  const ok = run(t, 'issue', doc);
  assert.equal(ok.code, 0, out(ok));
  // One quote and one reason.
  const mixed = run(t, 'issue', { ...ISSUE, quote: [WANT], start_none: NONE });
  assert.equal(mixed.code, 0, out(mixed));
  // A reason and a passage for the same one: refused.
  const twice = run(t, 'issue', { ...ISSUE, quote: [WANT, START], start_none: NONE });
  assert.deepEqual(rules(twice), ['post/field start_none']);
  const both = run(t, 'issue', { ...ISSUE, quote: [BOTH], intent_none: NONE });
  assert.deepEqual(rules(both), ['post/field intent_none']);
});

test('PACT-77: a role, or a no-owner-words reason, on a decision or on a post with no quote is refused post/field', t => {
  const decision = { repo: TARGET, kind: 'decision', issue: 5, signer: 'pact-77', quote: [{ ...START }], intent: { text: 'x', status: 'confirmed' }, body_file: 'body.md' };
  assert.ok(rules(run(t, 'issue-comment', decision)).includes('post/field quote[0].role'));
  const ok = run(t, 'issue-comment', { ...decision, quote: [without(START, 'role')] });
  assert.equal(ok.code, 0, out(ok));
  assert.ok(rules(run(t, 'issue-comment', { ...decision, quote: [without(START, 'role')], intent_none: NONE })).includes('post/field intent_none'));
  const note = { repo: TARGET, kind: 'note', issue: 5, signer: 'build-77', start_none: NONE, body_file: 'body.md' };
  assert.ok(rules(run(t, 'issue-comment', note)).includes('post/field start_none'));
});

test('PACT-77: a no-owner-words reason of two lines, with a live secret, a hidden character, a heading or an open comment is refused, and its text never reaches the output', t => {
  for (const field of ['intent_none', 'start_none']) {
    const base = field === 'intent_none' ? { ...ISSUE, quote: [START] } : { ...ISSUE, quote: [WANT] };
    assert.ok(rules(run(t, 'issue', { ...base, [field]: 'one\ntwo' })).includes(`post/pattern ${field}`), field);
    const leak = run(t, 'issue', { ...base, [field]: `see ${SECRET}` }, { env: { MY_API_KEY: SECRET } });
    assert.ok(rules(leak).some(l => l.startsWith(`secret/env ${field} `)), out(leak));
    assert.ok(!out(leak).includes(SECRET));
    assert.ok(rules(run(t, 'issue', { ...base, [field]: `a${String.fromCharCode(0x200b)}b` })).some(l => l.startsWith(`text/hidden ${field} `)));
    assert.ok(rules(run(t, 'issue', { ...base, [field]: '<!-- hidden' })).includes(`text/hidden-line ${field}`));
    assert.ok(rules(run(t, 'issue', { ...base, [field]: '# heading' })).includes(`post/owned-line ${field}`));
    assert.ok(rules(run(t, 'issue', { ...base, [field]: '' })).includes(`post/length ${field}`));
    assert.ok(rules(run(t, 'issue', { ...base, [field]: ' spaced' })).includes(`post/pattern ${field}`));
  }
});

test('PACT-77: the body marks each passage with its role and shows each no-owner-words reason, and the item reads back as an ask item', () => {
  const body = renderBody({ kind: 'issue', quote: [WANT, START], intent: INTENT, sessionPart: 'A plain body.\n', signer: 'plan-77' });
  assert.match(body, /> I want the quoting rules to capture both\.\n\nSaid in this session's chat, 2026-11-11\. Quote for the intent\.\n\n/);
  assert.match(body, /> Yes, let us start issue 77\.\n\nSaid in this session's chat, 2026-11-11\. Quote for the start\.\n\n/);
  assert.match(renderBody({ kind: 'issue', quote: [BOTH], intent: INTENT, sessionPart: 'b\n', signer: 'plan-77' }), /Quote for the intent and the start\./);
  const none = renderBody({ kind: 'issue', quote: [START], intentNone: NONE, intent: INTENT, sessionPart: 'b\n', signer: 'plan-77' });
  assert.match(none, new RegExp(`Quote for the start\\.\\n\\nNo owner words for the intent: ${NONE}\\n\\n## Understood intent`));
  const bare = renderBody({ kind: 'issue', intentNone: NONE, startNone: 'none either', intent: INTENT, sessionPart: 'b\n', signer: 'plan-77' });
  assert.match(bare, /^## The ask\n\nNo owner words for the intent: .*\n\nNo owner words for the start: none either\n\n## Understood intent/);
  assert.equal(askItem(bare).status, 'pending');
  assert.equal(askItem(body).status, 'pending');
});

test('PACT-77: a body file that writes the no-owner-words line itself is refused post/owned-line, as is one in a reason', t => {
  for (const side of ['intent', 'start']) {
    const forged = run(t, 'issue', ISSUE, { body: `No owner words for the ${side}: nothing was said.\n` });
    assert.deepEqual(rules(forged), ['post/owned-line body_file'], side);
  }
  const reason = run(t, 'issue', { ...ISSUE, quote: [WANT], start_none: 'No owner words for the start: x' });
  assert.deepEqual(rules(reason), ['post/owned-line start_none']);
});

test('PACT-77: the schema names role, intent_none and start_none', () => {
  assert.deepEqual(SCHEMA.properties.quote.items.properties.role.enum, ['intent', 'start', 'both']);
  assert.equal(SCHEMA.properties.intent_none.type, 'string');
  assert.equal(SCHEMA.properties.start_none.type, 'string');
});

// ---------------------------------------------------------------- an edit

const LABEL = 'plan-77';
const ASKED = `## The ask\n\n> ${WANT.text}\n\nSaid in this session's chat, ${WHEN}. Quote for the intent.\n\n> ${START.text}\n\nSaid in this session's chat, ${WHEN}. Quote for the start.\n\n## Understood intent\n\n${INTENT.text}\n\nRead-back: not yet confirmed.\n\nA plain body.\n\nSigned: ${LABEL}\n`;
const LEGACY = `## The ask\n\n> ${START.text}\n\nSaid in this session's chat, ${WHEN}.\n\n## Understood intent\n\n${INTENT.text}\n\nRead-back: not yet confirmed.\n\nA plain body.\n\nSigned: ${LABEL}\n`;

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
  const doc = { repo: TARGET, signer: LABEL, reason: 'fixed a wrong link', body_file: 'body.md', issue: 5, comment: 9001, intent: INTENT, ...change };
  return run(t, 'issue-comment-edit', doc, { gh: w.gh, dry: false });
}

test('PACT-77: an edit carrying the item\'s own roles keeps its ask block; a dropped or changed role is refused edit/ask', t => {
  const w = world(ASKED);
  const ok = edit(t, w, { quote: [WANT, START] });
  assert.equal(ok.code, 0, out(ok));
  assert.ok(JSON.parse(w.calls.find(c => c.args.includes('PATCH')).input).body.startsWith(ASKED.slice(0, ASKED.indexOf('A plain body.'))));
  const dropped = edit(t, world(ASKED), { quote: [WANT, without(START, 'role')] });
  assert.deepEqual(rules(dropped), ['edit/ask quote[1]']);
  const swapped = edit(t, world(ASKED), { quote: [{ ...WANT, role: 'start' }, { ...START, role: 'intent' }] });
  assert.deepEqual(rules(swapped), ['edit/ask quote[0]']);
});

test('PACT-77: an item posted before the roles, with no role line, is still edited with its role-less quote', t => {
  const w = world(LEGACY);
  const ok = edit(t, w, { quote: [without(START, 'role')] });
  assert.equal(ok.code, 0, out(ok));
});

test('PACT-77: an item with no passage and two reasons is edited with its own reasons, and another reason is refused edit/ask', t => {
  const item = `## The ask\n\nNo owner words for the intent: ${NONE}\n\nNo owner words for the start: ${NONE}\n\n## Understood intent\n\n${INTENT.text}\n\nRead-back: not yet confirmed.\n\nA plain body.\n\nSigned: ${LABEL}\n`;
  const ok = edit(t, world(item), { intent_none: NONE, start_none: NONE });
  assert.equal(ok.code, 0, out(ok));
  const bad = edit(t, world(item), { intent_none: 'another reason', start_none: NONE });
  assert.deepEqual(rules(bad), ['edit/ask intent_none']);
});
