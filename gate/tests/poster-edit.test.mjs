// The poster's edit surfaces (#413), on JSON posts (#524). Every case runs
// in-process against a fake GitHub behind an injected gh, as the poster's
// other tests do, so no case needs gh or the network. Each test backs one
// acceptance claim, named in the comment above it. An edit's body file holds
// the session's part only: the poster adds the `Signed:` line, carries the
// item's reason lines forward and adds its own (S6.3).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXAMPLES, SURFACES } from '../../claude/tools/poster.mjs';
import { postDoc } from './poster-post.mjs';
import { tempDir, writeTree } from './tree.mjs';

const ME = 'tester';
const TARGET = `${ME}/sandbox`;
const API = `https://api.github.com/repos/${TARGET}`;
const WEB = `https://github.com/${TARGET}`;
const MACHINE = { home: '/srv/home/tester', tmp: '/tmp', user: ME, host: 'buildhost' };
const LABEL = 'pact-413';
/** What an item the poster posted holds before an edit. */
const SIGNED = `A plain body.\n\nSigned: ${LABEL}\n`;
const REASON = 'fixed a wrong link';
/** The body the poster sends for a plain edit of a plain item. */
const EDITED = `A plain body.\n\nSigned: ${LABEL}\n\nEdited: ${REASON} (${LABEL})`;

const EDITS = ['issue-edit', 'pull-request-edit', 'issue-comment-edit', 'review-thread-reply-edit'];
const PATHS = {
  'issue-edit': `repos/${TARGET}/issues/5`,
  'pull-request-edit': `repos/${TARGET}/pulls/7`,
  'issue-comment-edit': `repos/${TARGET}/issues/comments/9001`,
  'review-thread-reply-edit': `repos/${TARGET}/pulls/comments/8080`,
};
const ARGS = {
  'issue-edit': { issue: 5 },
  'pull-request-edit': { pr: 7 },
  'issue-comment-edit': { issue: 5, comment: 9001 },
  'review-thread-reply-edit': { pr: 7, comment: 8080 },
};
const URLS = {
  'issue-edit': `${WEB}/issues/5`,
  'pull-request-edit': `${WEB}/pull/7`,
  'issue-comment-edit': `${WEB}/issues/5#issuecomment-9001`,
  'review-thread-reply-edit': `${WEB}/pull/7#discussion_r8080`,
};
const DRY_EDIT = 'dry-run: the item was not read; edit/ask, edit/status, edit/confirm, post/tracker, the reason carry and the content scan of the full body did not run';

/** The items a fake GitHub holds, each with `body` as its current text. */
function items(body = SIGNED, user = ME) {
  const u = { login: user };
  return {
    [`repos/${TARGET}/issues/5`]: { number: 5, body, user: u },
    [`repos/${TARGET}/issues/7`]: { number: 7, body, user: u, pull_request: { url: `${API}/pulls/7` } },
    [`repos/${TARGET}/pulls/7`]: { number: 7, body, user: u },
    [`repos/${TARGET}/issues/comments/9001`]: { id: 9001, body, user: u, issue_url: `${API}/issues/5` },
    [`repos/${TARGET}/issues/comments/9002`]: { id: 9002, body, user: u, issue_url: `${API}/issues/6` },
    [`repos/${TARGET}/issues/comments/9003`]: { id: 9003, body, user: u, issue_url: `${API}/issues/7` },
    [`repos/${TARGET}/pulls/comments/8080`]: { id: 8080, body, user: u, in_reply_to_id: 55, pull_request_url: `${API}/pulls/7` },
    [`repos/${TARGET}/pulls/comments/55`]: { id: 55, body, user: u, in_reply_to_id: null, pull_request_url: `${API}/pulls/7` },
  };
}

/** A gh that answers the login and repo reads, item reads and PATCHes, recording each call. `tamper` changes a read made after a PATCH. */
function world({ store = items(), tamper = x => x, fail = {} } = {}) {
  const calls = [];
  let patched = false;
  const gh = (args, input) => {
    calls.push({ args: [...args], input });
    const method = args[args.indexOf('--method') + 1];
    const path = args[args.indexOf('--method') + 2];
    const after = patched ? 'after' : 'before';
    const failed = fail[`${method} ${after}`] ?? fail[`${method} ${path} ${after}`];
    if (failed) return { ok: false, stdout: '', stderr: failed };
    if (method === 'GET' && path === 'user') return { ok: true, stdout: JSON.stringify({ login: ME }), stderr: '' };
    if (method === 'GET' && path === `repos/${TARGET}`) return { ok: true, stdout: JSON.stringify({ owner: { login: ME } }), stderr: '' };
    if (!Object.hasOwn(store, path)) return { ok: false, stdout: '', stderr: 'HTTP 404: Not Found' };
    if (method === 'PATCH') {
      patched = true;
      store[path] = { ...store[path], body: JSON.parse(input).body };
      return { ok: true, stdout: JSON.stringify(store[path]), stderr: '' };
    }
    const item = structuredClone(store[path]);
    const back = patched ? tamper(item) : item;
    return { ok: true, stdout: typeof back === 'string' ? back : JSON.stringify(back), stderr: '' };
  };
  return { gh, calls, store };
}

/** Edit on `surface` through `w`: the post document, its body file, and the run. `change` reshapes the document; `omit` drops fields. */
function edit(t, surface, w, { body = 'A plain body.\n', reason = REASON, signer = LABEL, args = ARGS[surface], env = {}, dry = false, change = d => d } = {}) {
  const dir = tempDir(t, 'pact-poster-edit-');
  writeTree(dir, { 'body.md': body });
  const doc = change({ repo: TARGET, signer, reason, body_file: 'body.md', ...args });
  return postDoc(surface, doc, dir, { gh: w.gh, env, ...MACHINE }, dry);
}

const last = r => r.lines.at(-1);
const patches = w => w.calls.filter(c => c.args.includes('PATCH'));
const refusedBy = (r, rule, where) => r.code === 2 && r.lines.some(l => l.startsWith(`REFUSED ${rule} ${where}`));
const sentBody = w => JSON.parse(patches(w)[0].input).body;
const text = r => r.lines.join(' | ');

// #413 C1, #524 C1
test('C1: each edit surface takes its fields with a reason and a signer, edits with its documented post, and refuses a missing reason or signer', t => {
  for (const surface of EDITS) {
    assert.ok(Object.hasOwn(SURFACES, surface), surface);
    assert.equal(SURFACES[surface].reason, 'req', surface);
    assert.ok(Object.hasOwn(EXAMPLES, surface), surface);
    const r = edit(t, surface, world());
    assert.equal(last(r), `RESULT: verified ${surface} ${URLS[surface]} as ${ME}`, `${surface}: ${text(r)}`);
    for (const missing of ['reason', 'signer']) {
      const w = world();
      const m = edit(t, surface, w, { change: d => Object.fromEntries(Object.entries(d).filter(([k]) => k !== missing)) });
      assert.ok(refusedBy(m, 'post/missing', missing), `${surface} without ${missing}: ${text(m)}`);
      assert.equal(w.calls.length, 0);
    }
  }
});

// #524 C2: fields an edit does not take
test('C2: kind, quote and intent on an edit are refused post/field, and nothing is sent', t => {
  for (const extra of [{ kind: 'note' }, { quote: [{ text: 'The owner said it.', source: 'chat', when: '2026-11-11' }] }, { intent: { text: 'A read-back.', status: 'pending' } }, { title: 'A title' }, { labels: ['x'] }, { answers: 'issue 5' }]) {
    const w = world();
    const r = edit(t, 'issue-comment-edit', w, { change: d => ({ ...d, ...extra }) });
    assert.ok(refusedBy(r, 'post/field', Object.keys(extra)[0]), text(r));
    assert.equal(w.calls.length, 0);
  }
});

// #413 C2, #524 C2
test('C2: a reason of two lines, over 200 characters or empty, a signer out of shape, and a body over the limit are refused', t => {
  const s = 'issue-comment-edit';
  const cases = [
    [{ reason: 'one\ntwo' }, 'post/pattern', 'reason'],
    [{ reason: 'r'.repeat(201) }, 'post/length', 'reason'],
    [{ reason: '' }, 'post/length', 'reason'],
    [{ reason: '   ' }, 'post/length', 'reason'],
    [{ reason: String.fromCharCode(0xad) }, 'post/length', 'reason'],
    [{ signer: 'Pact-413' }, 'post/pattern', 'signer'],
    [{ signer: '-pact' }, 'post/pattern', 'signer'],
    [{ signer: 'p'.repeat(51) }, 'post/pattern', 'signer'],
    [{ body: `${'x'.repeat(65536 - 30)}\n` }, 'text/body-length', 'body'],
  ];
  for (const [opts, rule, where] of cases) {
    const w = world();
    const r = edit(t, s, w, opts);
    assert.ok(refusedBy(r, rule, where), `${rule}: ${text(r)}`);
    assert.equal(w.calls.length, 0, rule);
  }
  assert.equal(last(edit(t, s, world(), { reason: 'r'.repeat(200) })).split(' ')[1], 'verified');
});

// #413 C3, #524 C13: the poster renders the body, so its parts and line breaks are its own
test('C3: the request is one PATCH of { body }: the body file, the signature, the item\'s reason lines, the new reason line', t => {
  for (const surface of EDITS) {
    for (const body of ['A plain body.\n', 'A plain body.', 'A plain body.\n\n\n', 'A plain body.\r\n']) {
      const w = world();
      const r = edit(t, surface, w, { body });
      assert.equal(r.code, 0, `${surface}: ${text(r)}`);
      const p = patches(w);
      assert.equal(p.length, 1);
      assert.deepEqual(p[0].args, ['api', '--hostname', 'github.com', '--method', 'PATCH', PATHS[surface], '--input', '-']);
      assert.deepEqual(JSON.parse(p[0].input), { body: EDITED });
    }
  }
});

// #413 C4
test("C4: a live environment secret's value in the reason or the body is refused before gh is called, and an item holding one is never edited", t => {
  const secret = 'zebra-quokka-42';
  const env = { MY_API_KEY: secret };
  for (const opts of [{ reason: `wrote ${secret}` }, { body: `Key ${secret}.\n` }]) {
    const w = world();
    const r = edit(t, 'issue-comment-edit', w, { ...opts, env });
    assert.ok(r.lines.some(l => l.startsWith('REFUSED secret/env ')), text(r));
    assert.equal(w.calls.length, 0);
    assert.ok(!r.lines.join('\n').includes(secret));
  }
  // An edit would leave the value in GitHub's history, so the item is refused and the owner told instead.
  const w = world({ store: items(`Key ${secret}.\n\nSigned: ${LABEL}\n`) });
  const r = edit(t, 'issue-comment-edit', w, { env });
  assert.ok(refusedBy(r, 'edit/leak', 'item'), text(r));
  assert.equal(patches(w).length, 0);
  assert.ok(!r.lines.join('\n').includes(secret));
});

// #441 C5: a token shape or an email address in the reason, the body or the item no longer stops an edit
test('C5: an edit whose reason, body and item hold a token shape and an email address goes through', t => {
  const email = 'alice' + '@' + 'example.org';
  const token = 'gh' + 'p_' + 'A1'.repeat(18);
  const w = world({ store: items(`Mail ${email}, key ${token}.\n\nSigned: ${LABEL}\n`) });
  const r = edit(t, 'issue-comment-edit', w, { reason: `noted ${email}`, body: `Mail ${email}, key ${token}, and more.\n` });
  assert.equal(r.code, 0, text(r));
  assert.equal(patches(w).length, 1);
});

// #413 C5
test('C5: an item by another author is refused as edit/author, with no PATCH', t => {
  for (const surface of EDITS) {
    const w = world({ store: items(SIGNED, 'stranger') });
    const r = edit(t, surface, w);
    assert.ok(refusedBy(r, 'edit/author', 'item'), `${surface}: ${text(r)}`);
    assert.equal(patches(w).length, 0);
    assert.ok(!r.lines.join('\n').includes('stranger'));
  }
});

// #394 C27: an item another account wrote is read no further, so its text never reaches the slow readers; an own item in the wrong place is still read.
test('C27: an item another login wrote is refused as edit/author alone, before its text is read', t => {
  const secret = 'zebra-quokka-42';
  const env = { MY_API_KEY: secret };
  const refused = r => r.lines.filter(l => l.startsWith('REFUSED '));
  // Unsigned and holding a live environment secret's value, so the body rules and the scan would each add a refusal if they read it.
  const w = world({ store: items(`Key ${secret}.\n`, 'stranger') });
  const r = edit(t, 'issue-comment-edit', w, { env });
  assert.deepEqual(refused(r), ['REFUSED edit/author item'], text(r));
  assert.equal(patches(w).length, 0);
  // The session's own comment, named under another issue and unsigned: in the wrong place, but still read in full, so its leak is still told.
  const own = world({ store: items(`Key ${secret}.\n`) });
  const o = edit(t, 'issue-comment-edit', own, { args: { issue: 5, comment: 9002 }, env });
  assert.deepEqual(refused(o).sort(), ['REFUSED edit/leak item', 'REFUSED edit/target item', 'REFUSED edit/unsigned item'], text(o));
});

// #413 C6: the item must carry the session's signature; the new body is signed by the poster
test('C6: edit/unsigned takes only the two signature forms on the item, and the poster signs the new body itself', t => {
  const s = 'issue-comment-edit';
  for (const line of [`Signed: ${LABEL}`, `Posted by ${LABEL}.`]) {
    const body = `Text.\n\n${line}\n`;
    const w = world({ store: items(body) });
    const r = edit(t, s, w);
    assert.equal(r.code, 0, `${line}: ${text(r)}`);
    assert.equal(sentBody(w), EDITED);
  }
  // A comment opened after an escaped backtick still hides the signature: it must show in both readings.
  const escaped = world({ store: items(`Text \\\`<!--\` more:\nSigned: ${LABEL}\n-->\n`) });
  assert.ok(refusedBy(edit(t, s, escaped), 'edit/unsigned', 'item'));
  assert.equal(patches(escaped).length, 0);
  // A nested opener leaves no comment behind: comments are dropped until none is left.
  const nested = world({ store: items(`Text <!<!-- x -->-- more:\nSigned: ${LABEL}\n-->\n`) });
  assert.ok(refusedBy(edit(t, s, nested), 'edit/unsigned', 'item'));
  assert.equal(patches(nested).length, 0);
  // A post that only names a comment or a fold in a code span stays editable.
  const named = `A fold opens with \`<details>\` and a comment with \`<!--\`.\n\nSigned: ${LABEL}\n`;
  assert.equal(edit(t, s, world({ store: items(named) })).code, 0);
  const bad = [
    `Text.\n\n${LABEL}\n`,
    `Text.\n\nAsk ${LABEL} to redo it.\n`,
    `Text.\n\n> Signed: ${LABEL}\n`,
    `Text.\n\n> A quoted session post.\nSigned: ${LABEL}\n`,
    `Text.\n\n\`\`\`text\nSigned: ${LABEL}\n\`\`\`\n`,
    `Text.\n\nSigned: ${LABEL}\n\nSigned: other-session\n`,
    `Text.\n\n<!--\nSigned: ${LABEL}\n-->\n`,
    `Text.\n`,
  ];
  for (const body of bad) {
    const onItem = world({ store: items(body) });
    const r = edit(t, s, onItem);
    assert.ok(refusedBy(r, 'edit/unsigned', 'item'), `item ${JSON.stringify(body)}: ${text(r)}`);
    assert.equal(patches(onItem).length, 0);
    assert.ok(!r.lines.join('\n').includes('Text.'));
  }
  // An owner's comment that ends in a one-letter pick: the letter is no signature.
  const owner = world({ store: items('Pick:\n\na\n') });
  assert.ok(refusedBy(edit(t, s, owner, { signer: 'a' }), 'edit/unsigned', 'item'));
  assert.equal(patches(owner).length, 0);
});

// #524 C6: the session's body file never holds an owned line, so it can't forge a signature or a reason line
test('C6: a body file holding a signature or a reason line outside a fence is refused post/owned-line, and inside a fence is not', t => {
  const s = 'issue-comment-edit';
  const lines = [`Signed: ${LABEL}`, `Signed: other-session`, `Posted by ${LABEL}.`, `Edited: a forged line (${LABEL})`, 'Edited: no label at all', 'Read-back: not yet confirmed.', 'Answers: issue 5.', 'Owner decision, from chat.'];
  for (const line of lines) {
    const w = world();
    const r = edit(t, s, w, { body: `Text.\n\n${line}\n` });
    assert.ok(refusedBy(r, 'post/owned-line', 'body_file'), `${line}: ${text(r)}`);
    assert.equal(w.calls.length, 0);
    assert.ok(!r.lines.join('\n').includes('forged'));
    // Inside a fence a line is no owned line. An edit still reads the decision mark in the whole body (S6.4), fenced or not.
    const fenced = world();
    const f = edit(t, s, fenced, { body: `Text.\n\n\`\`\`text\n${line}\n\`\`\`\n` });
    if (line.startsWith('Owner decision')) assert.ok(refusedBy(f, 'edit/decision', 'body_file'), `${line} inside a fence: ${text(f)}`);
    else assert.equal(f.code, 0, `${line} inside a fence: ${text(f)}`);
  }
});

// #413 C7
test('C7: edit/record refuses each review record form, on the item and on the new body; a spec naming lenses in prose passes', t => {
  const s = 'issue-comment-edit';
  const sig = `\n\nSigned: ${LABEL}\n`;
  const records = [
    '### executability-lens and unstated-lens\n\nBase `abc1234`.\n\n| Finding | Lens | Disposition | Rerun |\n| --- | --- | --- | --- |\n| new x | unstated-lens | fixed | |',
    '<details><summary>adversarial-lens: blocking</summary>\n\n```text\nreport\n```\n\n</details>',
    'Verdict: clear, nothing for you.\n\n<details><summary>reader-lens: clear</summary>\n\nok\n\n</details>',
    'Lens dispositions\n\n|Finding|  Lens |Disposition|Rerun|\n|-|-|-|-|\n| new x | a-lens | fixed | |',
    '## Round 2: data-`lens` and **adversarial**-lens\n\nBase line.',
    'executability-lens and unstated-lens:\n===\n\nBase line.',
    'Intro.\r### data-lens\rBase line.',
    '### behaviour-lens and integrity-lens\n\nBase line.\n\n## Test round 1: nothing for you\n\n<details><summary>Lens dispositions (2 findings)</summary>\n\n| Finding | Lens | Disposition | Rerun |\n| --- | --- | --- | --- |\n| new x | behaviour-lens | fixed | |\n\n</details>',
    // A continued part whose heading names no lens, holding the crossed-findings fold (#401).
    '### Part 3\n\n<details><summary>Crossed findings, continued (4 crossings)</summary>\n\nrows\n\n</details>',
  ];
  for (const body of records) {
    const onItem = world({ store: items(`${body}${sig}`) });
    const r1 = edit(t, s, onItem);
    assert.ok(refusedBy(r1, 'edit/record', 'item'), `item ${JSON.stringify(body.slice(0, 40))}: ${text(r1)}`);
    assert.equal(patches(onItem).length, 0);
    assert.ok(!r1.lines.join('\n').includes('-lens'));
    const onBody = world();
    const r2 = edit(t, s, onBody, { body: `${body}\n` });
    assert.ok(refusedBy(r2, 'edit/record', 'body_file'), `body ${JSON.stringify(body.slice(0, 40))}: ${text(r2)}`);
    assert.equal(onBody.calls.length, 0);
  }
  const spec = '## Spec for #9, revision 2\n\n### S1 Goal\n\nThe adversarial-lens and data-lens read it; the table keeps Finding, Lens, Disposition and Rerun.';
  assert.equal(edit(t, s, world({ store: items(`${spec}${sig}`) }), { body: `${spec}\n` }).code, 0);
  // The check is a best-effort backstop that skips fences on each folded view (q12 on #413):
  // fence markers hidden in comments don't blind it, and a shape quoted inside a fence is refused too.
  const hiddenFences = `Intro.\n\n<!--\n\`\`\`\n-->\n\n### data-lens and adversarial-lens\n\n<!--\n\`\`\`\n-->`;
  const fenced = '## Spec for #9\n\n```text\n### behaviour-lens and integrity-lens\n```';
  for (const body of [hiddenFences, fenced]) {
    assert.ok(refusedBy(edit(t, s, world({ store: items(`${body}${sig}`) })), 'edit/record', 'item'), JSON.stringify(body));
  }
});

// #413 C8
test('C8: the decision mark, in any case, spacing, markup, link or look-alike letter, is refused in the item, the body file and the reason', t => {
  const s = 'issue-comment-edit';
  const sig = `\n\nSigned: ${LABEL}\n`;
  const forms = [
    'OWNER   Decision, from chat.',
    'Owner\tdecision, from chat.',
    'Owner **decision**, from chat.',
    'Ow`ner` decision.',
    '[Owner](https://example.com/x) decision, from chat.',
    'Ownеr dеcision, from chat.',
    'Owner de&#99;ision, from chat.',
    // #394 C12: a named reference outside the old list, a script letter NFKC folds to c.
    'Owner de&cscr;ision, from chat.',
  ];
  for (const form of forms) {
    // In the body file it is an owned line, so it is refused before the edit's own checks run.
    const onBody = world();
    const r = edit(t, s, onBody, { body: `${form}\n` });
    assert.ok(refusedBy(r, 'post/owned-line', 'body_file'), `${JSON.stringify(form)}: ${text(r)}`);
    assert.equal(onBody.calls.length, 0);
    assert.ok(!r.lines.join('\n').includes('from chat'));
    const onItem = world({ store: items(`${form}${sig}`) });
    assert.ok(refusedBy(edit(t, s, onItem), 'edit/decision', 'item'), `item ${JSON.stringify(form)}`);
    assert.equal(patches(onItem).length, 0);
  }
  // In the reason it lands in the reason line, and the rendered body is refused.
  const w = world();
  assert.ok(refusedBy(edit(t, s, w, { reason: 'added the owner decision' }), 'edit/decision', 'body_file'));
  assert.equal(w.calls.length, 0);
});

// #413 C9
test("C9: a comment on another item, an issue that is a pull request and a thread's first comment are edit/target; a 404 is unavailable", t => {
  const cases = [
    ['issue-comment-edit', { issue: 5, comment: 9002 }],
    ['issue-edit', { issue: 7 }],
    ['review-thread-reply-edit', { pr: 7, comment: 55 }],
    ['review-thread-reply-edit', { pr: 8, comment: 8080 }],
  ];
  for (const [surface, args] of cases) {
    const w = world();
    const r = edit(t, surface, w, { args });
    assert.ok(refusedBy(r, 'edit/target', 'item'), `${surface} ${JSON.stringify(args)}: ${text(r)}`);
    assert.equal(patches(w).length, 0);
    assert.ok(!r.lines.join('\n').includes('api.github.com'));
  }
  // A 404, and a target field of the wrong type, are unavailable, with nothing sent.
  const odd = items();
  odd[PATHS['review-thread-reply-edit']] = { ...odd[PATHS['review-thread-reply-edit']], in_reply_to_id: '55' };
  odd[PATHS['issue-edit']] = { ...odd[PATHS['issue-edit']], pull_request: 'yes' };
  for (const [surface, args, store] of [['pull-request-edit', { pr: 5 }, items()], ['review-thread-reply-edit', ARGS['review-thread-reply-edit'], odd], ['issue-edit', ARGS['issue-edit'], odd]]) {
    const w = world({ store });
    const r = edit(t, surface, w, { args });
    assert.equal(r.code, 4, `${surface}: ${text(r)}`);
    assert.equal(last(r), 'RESULT: unavailable');
    assert.equal(patches(w).length, 0);
    assert.ok(!r.lines.join('\n').includes('Signed:'));
  }
});

// #413 C10, #524 C13: the poster carries the item's reason lines forward, so they are append-only by construction
test('C13: an item holding two reason lines keeps both and gains a third; a status edit of it keeps only the new one', t => {
  const s = 'issue-comment-edit';
  const old = ['Edited: fixed a typo (other-session)', `Edited: fixed a second typo (${LABEL})`];
  const w = world({ store: items(`Text.\n\nSigned: ${LABEL}\n\n${old.join('\n\n')}`) });
  const r = edit(t, s, w, { body: 'Text, fixed.\n' });
  assert.equal(r.code, 0, text(r));
  assert.equal(sentBody(w), `Text, fixed.\n\nSigned: ${LABEL}\n\n${old.join('\n\n')}\n\nEdited: ${REASON} (${LABEL})`);
  // A status edit of the same item keeps only the new line.
  const st = world({ store: { ...items(), [PATHS[s]]: { ...items()[PATHS[s]], body: `Text.\n\nSigned: status-5\n\n${old.join('\n\n')}` } } });
  const sr = edit(t, s, st, { body: 'Text, fixed.\n', signer: 'status-5' });
  assert.equal(sr.code, 0, text(sr));
  assert.equal(sentBody(st), `Text, fixed.\n\nSigned: status-5\n\nEdited: ${REASON} (status-5)`);
});

// #413 C10, #524 C13: a body file can't forge, hide or drop a reason line
test('C13: a body file that tries to carry a reason line, or to hide the run, is refused before gh is called', t => {
  const s = 'issue-comment-edit';
  const old = 'Edited: fixed a typo (other-session)';
  const item = `Text.\n\nSigned: ${LABEL}\n\n${old}`;
  const forged = [
    `Text, fixed.\n\n${old}\n`,
    `Text, fixed.\n\nEdited: fixed two typos (other-session)\n`,
    `Text.\n\nEdited: a forged line (${LABEL}) \n`,
    `Text.\n\nEdited: a forged line (${LABEL})${String.fromCharCode(0x200d)}\n`,
  ];
  for (const body of forged) {
    const w = world({ store: items(item) });
    const r = edit(t, s, w, { body });
    assert.ok(refusedBy(r, 'post/owned-line', 'body_file'), `${JSON.stringify(body)}: ${text(r)}`);
    assert.equal(w.calls.length, 0);
    assert.ok(!r.lines.join('\n').includes('forged') && !r.lines.join('\n').includes('typo'));
  }
  // A comment or fold left open would hide the run on the page.
  for (const body of ['Text.\n\n<!--\n', 'Text.\n\n<details>\n']) {
    const w = world({ store: items(item) });
    const r = edit(t, s, w, { body });
    assert.ok(refusedBy(r, 'text/hidden-line', 'body_file'), `${JSON.stringify(body)}: ${text(r)}`);
    assert.equal(w.calls.length, 0);
  }
});

// #524 S6.1a: the second stage runs once the item is read, on the whole body
test('C9a: the whole body, with the item\'s reason lines carried, is held to the size limit after the item read and before the PATCH', t => {
  const s = 'issue-comment-edit';
  const reasons = Array.from({ length: 3 }, (_, i) => `Edited: ${'r'.repeat(150)} (${LABEL}-${i})`).join('\n\n');
  const w = world({ store: items(`Text.\n\nSigned: ${LABEL}\n\n${reasons}`) });
  // Under the limit with only the new reason line, over it once the item's three are carried.
  const fixed = `\n\nSigned: ${LABEL}\n\nEdited: ${REASON} (${LABEL})`.length;
  const r = edit(t, s, w, { body: 'x'.repeat(65536 - fixed - 10) });
  assert.ok(refusedBy(r, 'text/body-length', 'body'), text(r));
  assert.equal(patches(w).length, 0);
  assert.deepEqual(w.calls.map(c => c.args.at(-1)).filter(a => a !== '-'), ['user', `repos/${TARGET}`, PATHS[s]]);
  // The same body, with no reason lines to carry, goes through.
  const ok = world();
  assert.equal(edit(t, s, ok, { body: 'x'.repeat(65536 - fixed - 10) }).code, 0);
});

// #524 S6.1a stage 2: the content scan runs once on the whole body, which only the item read can build
test('C9a: a live edit whose full render trips the content scan is refused after the item read, and no PATCH is sent', t => {
  const s = 'issue-comment-edit';
  // The secret starts in the body file and ends in the item's carried reason line, so neither alone holds it.
  const secret = `zzzq\n\nSigned: ${LABEL}\n\nEdited: first (other-session)`;
  const env = { MY_API_TOKEN: secret };
  const w = world({ store: items(`Text.\n\nSigned: ${LABEL}\n\nEdited: first (other-session)`) });
  const r = edit(t, s, w, { body: 'New zzzq\n', env });
  assert.ok(refusedBy(r, 'secret/env', 'body'), text(r));
  assert.equal(patches(w).length, 0);
  assert.ok(w.calls.some(c => c.args.includes(PATHS[s])), 'the item was read first');
  assert.ok(!r.lines.join('\n').includes('zzzq'));
  // Stage one, alone, passes it: the body file by itself holds no secret.
  const dry = edit(t, s, world(), { body: 'New zzzq\n', env, dry: true });
  assert.equal(dry.code, 0, text(dry));
});

// #413 C11
test('C11: mismatch, unverified, failed and unavailable, each with its NEXT line', t => {
  const s = 'issue-comment-edit';
  const url = URLS[s];
  const mismatch = edit(t, s, world({ tamper: x => ({ ...x, body: 'changed' }) }));
  assert.equal(mismatch.code, 1);
  assert.ok(mismatch.lines.some(l => l.startsWith('MISMATCH body: ')));
  assert.deepEqual(mismatch.lines.slice(-2), ['NEXT: the edit landed. Never send it again. Tell the owner, with the link below and the fields named above.', `RESULT: mismatch ${url}`]);
  // The read-back sits on another issue or pull request.
  const moved = edit(t, s, world({ tamper: x => ({ ...x, issue_url: `${API}/issues/6` }) }));
  assert.equal(moved.code, 1);
  assert.ok(moved.lines.includes('MISMATCH target: it sits on another item'), text(moved));
  const r = 'review-thread-reply-edit';
  const movedReply = edit(t, r, world({ tamper: x => ({ ...x, pull_request_url: `${API}/pulls/8` }) }));
  assert.ok(movedReply.lines.includes('MISMATCH target: it sits on another item'), text(movedReply));
  const unverified = edit(t, s, world({ fail: { 'GET after': 'HTTP 502: Bad Gateway' } }));
  assert.equal(unverified.code, 1);
  assert.deepEqual(unverified.lines.slice(-2), ['NEXT: the edit landed. Never send it again. Tell the owner, with the link below.', `RESULT: unverified ${url}`]);
  const failed = edit(t, s, world({ fail: { 'PATCH before': 'HTTP 502: Bad Gateway' } }));
  assert.equal(failed.code, 3);
  assert.deepEqual(failed.lines.slice(-2), [`NEXT: the edit may have landed. Look at ${url} for its reason line before anything else. If it is there, never send it again: tell the owner its link. If it isn't, tell the owner, and send it again only on their word. If you can't tell, tell the owner, and don't send it.`, 'RESULT: failed']);
  for (const w of [world({ fail: { [`GET ${PATHS[s]} before`]: 'HTTP 502: Bad Gateway' } }), world({ store: { ...items(), [PATHS[s]]: { id: 9001, body: SIGNED, user: 'not an object', issue_url: `${API}/issues/5` } } })]) {
    const r2 = edit(t, s, w);
    assert.equal(r2.code, 4, text(r2));
    assert.equal(last(r2), 'RESULT: unavailable');
    assert.equal(patches(w).length, 0);
  }
});

// #413 C12, #524 C9a
test('C12: a dry run prints the PATCH and sizes, runs the body checks, says what it did not run, and calls no gh', t => {
  const w = world();
  const r = edit(t, 'issue-edit', w, { dry: true });
  assert.equal(w.calls.length, 0);
  assert.deepEqual(r.lines, [
    `gh api --hostname github.com --method PATCH ${PATHS['issue-edit']} --input -`,
    `request: {"body":"<${[...EDITED].length} characters>"}`,
    DRY_EDIT,
    'RESULT: dry-run issue-edit',
  ]);
  const record = edit(t, 'issue-edit', world(), { body: '### executability-lens\n\nText.\n', dry: true });
  assert.ok(refusedBy(record, 'edit/record', 'body_file'), text(record));
  const owned = edit(t, 'issue-edit', world(), { body: 'Signed: other\n', dry: true });
  assert.ok(refusedBy(owned, 'post/owned-line', 'body_file'), text(owned));
});

// #503: the status comment, signed status-<n>, keeps only its newest reason line.
const STATUS = 'status-5';
const OLD_REASONS = 'Edited: after Design round 1 (pact-a)\n\nEdited: after Design round 2 (pact-b)';
const STATUS_ITEM = `## Status: 0 for you, after Design round 2\n\nSigned: ${STATUS}\n\n${OLD_REASONS}`;
const STATUS_BODY = '## Status: 1 for you, after Test round 1\n';

// #503 C1, C1a
test('#503 C1: a status edit lands with exactly one Edited line, on an issue and on a pull request', t => {
  const w = world({ store: items(STATUS_ITEM) });
  const r = edit(t, 'issue-comment-edit', w, { body: STATUS_BODY, signer: STATUS, reason: 'after Test round 1' });
  assert.equal(last(r), `RESULT: verified issue-comment-edit ${URLS['issue-comment-edit']} as ${ME}`, text(r));
  assert.equal(sentBody(w), `${STATUS_BODY}\nSigned: ${STATUS}\n\nEdited: after Test round 1 (${STATUS})`);
  // C1a: a status comment in a pull request's conversation, the issue the pull request's number.
  const onPr = '## Status\n\nSigned: status-7\n\nEdited: after Test round 1 (pact-a)';
  const store = { ...items(), [`repos/${TARGET}/issues/comments/9003`]: { id: 9003, body: onPr, user: { login: ME }, issue_url: `${API}/issues/7` } };
  const p = world({ store });
  const pr = edit(t, 'issue-comment-edit', p, { body: '## Status\n', signer: 'status-7', args: { issue: 7, comment: 9003 } });
  assert.equal(pr.code, 0, text(pr));
  assert.equal(sentBody(p), '## Status\n\nSigned: status-7\n\nEdited: fixed a wrong link (status-7)');
});

// #503 C2, #524 C13
test('#503 C2: a status edit whose body file keeps the old reason lines, or holds any reason-shaped line, is refused with nothing sent', t => {
  const bodies = [`${STATUS_BODY}\n${OLD_REASONS}\n`, `${STATUS_BODY}\nEdited: after Design round 2 (pact-b)\n`, `Edited: a forged line (${STATUS})\n\n${STATUS_BODY}`];
  for (const body of bodies) {
    const w = world({ store: items(STATUS_ITEM) });
    const r = edit(t, 'issue-comment-edit', w, { body, signer: STATUS });
    assert.ok(refusedBy(r, 'post/owned-line', 'body_file'), `${JSON.stringify(body)}: ${text(r)}`);
    assert.equal(patches(w).length, 0);
  }
});

// #503 C3: only the status comment of the edited issue drops its reason lines
test('#503 C3: a status label for another number, with a leading zero, or on another surface carries the item\'s reason lines like any edit', t => {
  const cases = [
    ['issue-comment-edit', 'status-6'],
    ['issue-comment-edit', 'status-05'],
    ['review-thread-reply-edit', 'status-7'],
    ['issue-edit', 'status-5'],
  ];
  for (const [surface, label] of cases) {
    const item = `Text.\n\nSigned: ${label}\n\nEdited: fixed a typo (pact-a)`;
    const w = world({ store: items(item) });
    const r = edit(t, surface, w, { body: 'Text, fixed.\n', signer: label });
    assert.equal(r.code, 0, `${surface} ${label}: ${text(r)}`);
    assert.equal(sentBody(w), `Text, fixed.\n\nSigned: ${label}\n\nEdited: fixed a typo (pact-a)\n\nEdited: ${REASON} (${label})`, `${surface} ${label}`);
  }
});

// #503 C4
test('#503 C4: on a status edit, the author, target, signature, record, decision, leak and plain-sight checks still refuse', t => {
  const s = 'issue-comment-edit';
  for (const [store, args, rule] of [
    [items(STATUS_ITEM, 'someone-else'), ARGS[s], 'edit/author'],
    [items(STATUS_ITEM), { issue: 5, comment: 9002 }, 'edit/target'],
    // The item must already be signed status-<n> and nothing else: another session's comment can't become the status comment.
    [items(`Text.\n\nSigned: pact-x\n\n${OLD_REASONS}`), ARGS[s], 'edit/unsigned'],
    [items(`Text.\n\n${OLD_REASONS}`), ARGS[s], 'edit/unsigned'],
  ]) {
    const w = world({ store });
    const r = edit(t, s, w, { body: STATUS_BODY, signer: STATUS, args });
    assert.ok(refusedBy(r, rule, 'item'), `${rule}: ${text(r)}`);
    assert.equal(patches(w).length, 0);
  }
  const cases = [
    [`${STATUS_BODY}\nSigned: pact-other\n`, 'post/owned-line'],
    [`## behaviour-lens\n\n${STATUS_BODY}`, 'edit/record'],
    [`An owner decision.\n\n${STATUS_BODY}`, 'post/owned-line'],
    [`<details>\n\n${STATUS_BODY}`, 'text/hidden-line'],
    [`<!--\n\n${STATUS_BODY}`, 'text/hidden-line'],
  ];
  for (const [body, rule] of cases) {
    const w = world({ store: items(STATUS_ITEM) });
    const r = edit(t, s, w, { body, signer: STATUS });
    assert.ok(refusedBy(r, rule, 'body_file'), `${rule}: ${text(r)}`);
    assert.equal(patches(w).length, 0);
  }
  const secret = 'zebra-quokka-503';
  const w = world({ store: items(`Key ${secret}.\n\n${STATUS_ITEM}`) });
  const r = edit(t, s, w, { body: STATUS_BODY, signer: STATUS, env: { MY_API_KEY: secret } });
  assert.ok(refusedBy(r, 'edit/leak', 'item'), text(r));
  assert.equal(patches(w).length, 0);
});
