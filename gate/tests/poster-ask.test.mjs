// The poster's ask-item edits (#524, T2): an edit of an item that opens with
// the owner's ask and the read-back keeps the ask, and may move the read-back
// from pending to confirmed or corrected, citing the decision that heard the
// owner (S6.1, S6.2, S6.2a, S6.2b), and re-reads the tracker comments it
// quotes (S6.1a, P29). Every case runs in-process against a fake GitHub behind
// an injected gh. Each test backs the claim named above it. The items and
// the decisions are written out as literal text, so no case leans on the
// poster's own renderer to say what it expects.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postDoc } from './poster-post.mjs';
import { tempDir, writeTree } from './tree.mjs';

const ME = 'tester';
const TARGET = `${ME}/sandbox`;
const API = `https://api.github.com/repos/${TARGET}`;
const MACHINE = { home: '/srv/home/tester', tmp: '/tmp', user: ME, host: 'buildhost' };
const SIGNER = 'plan-524';
const REASON = 'fixed a link';
const OWNER_WORDS = 'The owner said this plainly.';
const SAID = "Said in this session's chat, 2026-11-11.";
const MARK = 'Owner decision, from chat.';
const RELAYED_MARK = 'Relayed owner words, not a decision mark.';

const QUOTE = { text: OWNER_WORDS, source: 'chat', when: '2026-11-11' };
const READ = 'I read it so.';
const BETTER = 'The better read.';
const PENDING = { text: READ, status: 'pending' };

/** An ask item's body, written out: `lead` holds the mark and Answers lines, `readback` the read-back line, `intent` the lines between the intent heading and it. */
const ask = ({ lead = '', passage = `> ${OWNER_WORDS}\n\n${SAID}`, intent = READ, readback = 'Read-back: not yet confirmed.', session = 'A session part.', signer = SIGNER, reasons = '' } = {}) =>
  `${lead}## The ask\n\n${passage}\n\n## Understood intent\n\n${intent}\n\n${readback}\n\n${session}\n\nSigned: ${signer}\n${reasons}`;
const PENDING_ITEM = ask();
const CORRECTED_ITEM = ask({ intent: `~~${READ}~~\n\nCorrected read-back:\n\n${BETTER}`, readback: 'Read-back: corrected in comment 7001.' });

/** A decision comment the lead's session could cite: the chat mark, its Answers line, the owner's yes, and the read-back confirmed in chat. */
const decisionBody = ({ answers = 'issue 5', intent = READ, readback = "Read-back: confirmed in this session's chat.", mark = MARK, signer = 'pact-524', planted = 'Yes, planted-words-xyz.' } = {}) =>
  `${mark}\n\n${answers === null ? '' : `Answers: ${answers}.\n\n`}## The ask\n\n> ${planted}\n\n${SAID}\n\n## Understood intent\n\n${intent}\n\n${readback}\n\nThe decision's part.\n\n${signer === null ? '' : `Signed: ${signer}\n`}`;

const SURFACES = {
  'issue-edit': { args: { issue: 5 }, path: `repos/${TARGET}/issues/5`, answers: 'issue 5', decision: 7001 },
  'pull-request-edit': { args: { pr: 7 }, path: `repos/${TARGET}/pulls/7`, answers: 'pull request 7', decision: 7002 },
  'issue-comment-edit': { args: { issue: 5, comment: 9001 }, path: `repos/${TARGET}/issues/comments/9001`, answers: 'comment 9001', decision: 7003 },
};
const EDITS = Object.keys(SURFACES);

/** What a fake GitHub holds: the three edit targets, each holding `body`, and one decision per surface. `decisions` replaces a decision's fields by id. */
function items(body, decisions = {}, extra = {}) {
  const user = { login: ME };
  const decision = (id, number, answers) => ({ id, user, issue_url: `${API}/issues/${number}`, body: decisionBody({ answers }), ...decisions[id] });
  return {
    [`repos/${TARGET}/issues/5`]: { number: 5, body, user },
    [`repos/${TARGET}/pulls/7`]: { number: 7, body, user },
    [`repos/${TARGET}/issues/comments/9001`]: { id: 9001, body, user, issue_url: `${API}/issues/5` },
    [`repos/${TARGET}/issues/comments/7001`]: decision(7001, 5, 'issue 5'),
    [`repos/${TARGET}/issues/comments/7002`]: decision(7002, 7, 'pull request 7'),
    [`repos/${TARGET}/issues/comments/7003`]: decision(7003, 5, 'comment 9001'),
    ...extra,
  };
}

/** A gh that answers the login and repo reads, the item and comment reads and the PATCH, recording each call. */
function world(store, { fail = [] } = {}) {
  const calls = [];
  const gh = (args, input) => {
    calls.push({ args: [...args], input });
    const method = args[args.indexOf('--method') + 1];
    const path = args[args.indexOf('--method') + 2];
    if (fail.includes(path)) return { ok: false, stdout: '', stderr: 'HTTP 500: boom' };
    if (method === 'GET' && path === 'user') return { ok: true, stdout: JSON.stringify({ login: ME }), stderr: '' };
    if (method === 'GET' && path === `repos/${TARGET}`) return { ok: true, stdout: JSON.stringify({ owner: { login: ME } }), stderr: '' };
    if (!Object.hasOwn(store, path)) return { ok: false, stdout: '', stderr: 'HTTP 404: Not Found' };
    if (method === 'PATCH') {
      store[path] = { ...store[path], body: JSON.parse(input).body };
      return { ok: true, stdout: JSON.stringify(store[path]), stderr: '' };
    }
    return { ok: true, stdout: JSON.stringify(store[path]), stderr: '' };
  };
  return { gh, calls, store };
}

/** One edit through `w`. `doc` reshapes the post document after its ask-item defaults; `omit` drops fields. */
function edit(t, surface, w, { quote = [QUOTE], intent = PENDING, doc = {}, omit = [], body = 'A new session part.\n', dry = false } = {}) {
  const dir = tempDir(t, 'pact-poster-ask-');
  writeTree(dir, { 'body.md': body });
  const base = { repo: TARGET, signer: SIGNER, reason: REASON, body_file: 'body.md', ...SURFACES[surface].args, quote, intent, ...doc };
  for (const name of omit) delete base[name];
  return postDoc(surface, base, dir, { gh: w.gh, env: {}, ...MACHINE }, dry);
}

const last = r => r.lines.at(-1);
const text = r => r.lines.join(' | ');
const patches = w => w.calls.filter(c => c.args.includes('PATCH'));
const sentBody = w => JSON.parse(patches(w)[0].input).body;
const refusedBy = (r, rule, where) => r.code === 2 && r.lines.some(l => l === `REFUSED ${rule} ${where}`);
const reads = (w, id) => w.calls.filter(c => c.args.includes(`repos/${TARGET}/issues/comments/${id}`)).length;
/** The body an edit of PENDING_ITEM sends: the ask block as it was, the read-back line as given, the new part, the signature, the reasons. */
const edited = ({ intent = READ, readback = 'Read-back: not yet confirmed.', reasons = `Edited: ${REASON} (${SIGNER})`, lead = '' } = {}) =>
  `${lead}## The ask\n\n> ${OWNER_WORDS}\n\n${SAID}\n\n## Understood intent\n\n${intent}\n\n${readback}\n\nA new session part.\n\nSigned: ${SIGNER}\n\n${reasons}`;

// ---------------------------------------------------------------- C8: an edit keeps the ask

// #524 C8
test('C8: an edit of an ask item that keeps its quote and intent passes on each surface, and sends the ask as it was with the new part, the signature and the carried reason lines', t => {
  for (const surface of EDITS) {
    const w = world(items(ask({ reasons: `\nEdited: an older fix (${SIGNER})\n` })));
    const r = edit(t, surface, w);
    assert.equal(r.code, 0, `${surface}: ${text(r)}`);
    assert.equal(sentBody(w), edited({ reasons: `Edited: an older fix (${SIGNER})\n\nEdited: ${REASON} (${SIGNER})` }), surface);
  }
});

// #524 C8: each difference in the ask is edit/ask, naming the part
test('C8: an edit whose quote text, source, comment or when, or whose intent text, differs from the item is refused edit/ask, and nothing is sent', t => {
  const relayed = { ...QUOTE, source: 'relayed', via: 'lead-1' };
  const cases = [
    [{ quote: [{ ...QUOTE, text: 'The owner said it differently.' }] }, 'quote[0]'],
    [{ quote: [relayed] }, 'quote[0]'],
    [{ quote: [{ ...QUOTE, when: '2026-11-10' }] }, 'quote[0]'],
    [{ quote: [QUOTE, QUOTE] }, 'quote[1]'],
    [{ intent: { ...PENDING, text: 'I read it another way.' } }, 'intent'],
    // A text that is only the start of the item's is a different ask.
    [{ quote: [{ ...QUOTE, text: 'The owner said this' }] }, 'quote[0]'],
    [{ intent: { ...PENDING, text: 'I read' } }, 'intent'],
  ];
  for (const [opts, where] of cases) {
    const w = world(items(PENDING_ITEM));
    const r = edit(t, 'issue-edit', w, opts);
    assert.ok(refusedBy(r, 'edit/ask', where), `${where}: ${text(r)}`);
    assert.equal(patches(w).length, 0);
  }
  // The ask ends at a blank line: text run straight on from the read-back line is not the ask's end.
  const run = world(items(PENDING_ITEM.replace('not yet confirmed.\n\n', 'not yet confirmed.\n')));
  assert.ok(refusedBy(edit(t, 'issue-edit', run), 'edit/ask', 'intent'));
  assert.equal(patches(run).length, 0);
  // A passage that cites a tracker comment: its comment id is part of the ask.
  const cited = ask({ passage: `> ${OWNER_WORDS}\n\nFrom the owner's comment 4001, 2026-11-11.` });
  const w = world(items(cited));
  const r = edit(t, 'issue-edit', w, { quote: [{ ...QUOTE, source: 'tracker', comment: 4002 }] });
  assert.ok(refusedBy(r, 'edit/ask', 'quote[0]'), text(r));
  assert.equal(patches(w).length, 0);
});

// #524 C8: what is and is not an ask item
test('C8: an ask item must be edited with its quote and intent; quote or intent on any other item is refused post/field; a legacy item edits as today', t => {
  const w = world(items(PENDING_ITEM));
  const missing = edit(t, 'issue-edit', w, { omit: ['quote', 'intent'] });
  assert.ok(refusedBy(missing, 'post/missing', 'quote') && refusedBy(missing, 'post/missing', 'intent'), text(missing));
  assert.equal(patches(w).length, 0);
  const plain = `A plain body.\n\nSigned: ${SIGNER}\n`;
  // #524's own body opens `## The ask` and has no read-back line, so it is not an ask item.
  const legacy = `## The ask\n\n> Quoted from the owner.\n\n## Understood intent\n\nA read.\n\nA body.\n\nSigned: ${SIGNER}\n`;
  const crowded = ask().replace('Read-back: not yet confirmed.', 'Read-back: maybe.');
  // Shapes that only look like an ask item: a read-back line inside a fence, with no blank line before it, and a mark with no blank line after it.
  const fenced = ask({ intent: `\`\`\`\nRead-back: not yet confirmed.\n\`\`\`` }).replace('\n\nRead-back: not yet confirmed.\n\nA session', '\n\nA session');
  const unspaced = ask({ intent: `${READ}\nRead-back: not yet confirmed.` }).replace('\n\nRead-back: not yet confirmed.\n\nA session', '\n\nA session');
  const unmarked = ask({ lead: `${RELAYED_MARK}\n` });
  for (const body of [plain, legacy, crowded, fenced, unspaced, unmarked]) {
    const v = world(items(body));
    const r = edit(t, 'issue-edit', v);
    assert.ok(refusedBy(r, 'post/field', 'quote') && refusedBy(r, 'post/field', 'intent'), text(r));
    assert.equal(patches(v).length, 0);
    const old = edit(t, 'issue-edit', world(items(body)), { omit: ['quote', 'intent'] });
    assert.equal(old.code, 0, text(old));
  }
  // Only one of the two is a post that cannot be an ask item's edit.
  for (const omit of ['quote', 'intent']) {
    const r = edit(t, 'issue-edit', world(items(PENDING_ITEM)), { omit: [omit], dry: true });
    assert.ok(refusedBy(r, 'post/missing', omit), text(r));
  }
});

// #524 C8: a relayed decision carries Answers: and is an ask item
test('C8: a relayed decision carrying Answers: is an ask item: its quote differing is refused edit/ask, and keeping its ask passes with its Answers: line unchanged', t => {
  const relayed = { text: OWNER_WORDS, source: 'relayed', via: 'lead-1', when: '2026-11-10' };
  const item = ask({ lead: `${RELAYED_MARK}\n\nAnswers: issue 5.\n\n`, passage: `> ${OWNER_WORDS}\n\nRelayed by lead-1 from its chat, 2026-11-10.` });
  const w = world(items(item));
  const r = edit(t, 'issue-edit', w, { quote: [relayed] });
  assert.equal(r.code, 0, text(r));
  assert.equal(sentBody(w), `${RELAYED_MARK}\n\nAnswers: issue 5.\n\n## The ask\n\n> ${OWNER_WORDS}\n\nRelayed by lead-1 from its chat, 2026-11-10.\n\n## Understood intent\n\n${READ}\n\nRead-back: not yet confirmed.\n\nA new session part.\n\nSigned: ${SIGNER}\n\nEdited: ${REASON} (${SIGNER})`);
  const v = world(items(item));
  const bad = edit(t, 'issue-edit', v, { quote: [{ ...relayed, text: 'The owner said something else.' }] });
  assert.ok(refusedBy(bad, 'edit/ask', 'quote[0]'), text(bad));
  assert.equal(patches(v).length, 0);
});

// #524 C8: an item's CRLF line ends are not a different ask
test('C8: an item whose line ends were made CRLF is still an ask item, and its edit keeps the ask', t => {
  const w = world(items(PENDING_ITEM.replace(/\n/g, '\r\n')));
  const r = edit(t, 'issue-edit', w);
  assert.equal(r.code, 0, text(r));
  assert.equal(sentBody(w), edited());
});

// ---------------------------------------------------------------- C9: the read-back's status

const CONFIRM = { text: READ, status: 'confirmed', comment: 7001 };
const CORRECT = { text: READ, status: 'corrected', comment: 7001, corrected: BETTER };
const CONFIRMED_IN_CHAT = ask({ readback: "Read-back: confirmed in this session's chat." });
const CONFIRMED_IN_COMMENT = ask({ readback: 'Read-back: confirmed in comment 7001.' });

// #524 C9: forbidden moves, and a kept status that differs
test('C9: each forbidden status move, a move with no comment and a kept status whose comment or corrected text differs is refused edit/status, and nothing is sent or read', t => {
  const cases = [
    [PENDING_ITEM, { text: READ, status: 'confirmed' }, 'intent.comment'],
    [PENDING_ITEM, { text: READ, status: 'corrected', corrected: BETTER }, 'intent.comment'],
    [PENDING_ITEM, { ...PENDING, comment: 7001 }, 'intent.comment'],
    [CONFIRMED_IN_CHAT, CORRECT, 'intent.status'],
    [CONFIRMED_IN_CHAT, { ...CONFIRM }, 'intent.comment'],
    [CONFIRMED_IN_COMMENT, CORRECT, 'intent.status'],
    [CONFIRMED_IN_COMMENT, PENDING, 'intent.status'],
    [CONFIRMED_IN_COMMENT, { ...CONFIRM, comment: 7002 }, 'intent.comment'],
    [CORRECTED_ITEM, CONFIRM, 'intent.status'],
    [CORRECTED_ITEM, PENDING, 'intent.status'],
    [CORRECTED_ITEM, { ...CORRECT, comment: 7002 }, 'intent.comment'],
    [CORRECTED_ITEM, { ...CORRECT, corrected: 'Another read.' }, 'intent.corrected'],
  ];
  for (const [item, intent, where] of cases) {
    const w = world(items(item));
    const r = edit(t, 'issue-edit', w, { intent });
    assert.ok(refusedBy(r, 'edit/status', where), `${where} ${JSON.stringify(intent)}: ${text(r)}`);
    assert.equal(patches(w).length, 0);
    assert.equal(reads(w, 7001) + reads(w, 7002), 0, 'a refused status move reads no comment');
  }
  // On an edit the corrected text belongs to the corrected status alone, and that status needs it.
  const w = world(items(PENDING_ITEM));
  assert.ok(refusedBy(edit(t, 'issue-edit', w, { intent: { text: READ, status: 'corrected', comment: 7001 }, dry: true }), 'post/missing', 'intent.corrected'));
  assert.ok(refusedBy(edit(t, 'issue-edit', w, { intent: { ...CONFIRM, corrected: BETTER }, dry: true }), 'post/field', 'intent.corrected'));
  assert.equal(w.calls.length, 0);
});

// #524 C9: the allowed moves, each rendering S5.1's line, on each surface
test('C9: a move citing a valid decision passes on each surface and renders the read-back line, with the reason saying who heard the owner', t => {
  for (const surface of EDITS) {
    const id = SURFACES[surface].decision;
    const heard = `Edited: ${REASON}, heard by pact-524 (${SIGNER})`;
    const w = world(items(PENDING_ITEM));
    const r = edit(t, surface, w, { intent: { ...CONFIRM, comment: id } });
    assert.equal(r.code, 0, `${surface}: ${text(r)}`);
    assert.equal(sentBody(w), edited({ readback: `Read-back: confirmed in comment ${id}.`, reasons: heard }), surface);
    assert.equal(reads(w, id), 1);
    const v = world(items(PENDING_ITEM, { [id]: { body: decisionBody({ answers: SURFACES[surface].answers, intent: BETTER }) } }));
    const c = edit(t, surface, v, { intent: { ...CORRECT, comment: id } });
    assert.equal(c.code, 0, `${surface}: ${text(c)}`);
    assert.equal(sentBody(v), edited({ intent: `~~${READ}~~\n\nCorrected read-back:\n\n${BETTER}`, readback: `Read-back: corrected in comment ${id}.`, reasons: heard }), surface);
  }
  // A corrected text with CRLF line ends against a decision with LF ones is the same text.
  const w = world(items(PENDING_ITEM, { 7001: { body: decisionBody({ intent: 'One.\n\nTwo.' }) } }));
  const r = edit(t, 'issue-edit', w, { intent: { ...CORRECT, corrected: 'One.\r\n\r\nTwo.' } });
  assert.equal(r.code, 0, text(r));
  // The original read-back's paragraphs are struck one by one whichever line ends it was written with, and a later edit with the other line ends keeps the ask.
  const two = ask({ intent: 'One.\n\nTwo.' });
  const struck = ask({ intent: `~~One.~~\n\n~~Two.~~\n\nCorrected read-back:\n\n${BETTER}`, readback: 'Read-back: corrected in comment 7001.' });
  for (const ends of ['\r\n', '\n']) {
    const original = `One.${ends}${ends}Two.`;
    const m = world(items(two, { 7001: { body: decisionBody({ intent: BETTER }) } }));
    const mr = edit(t, 'issue-edit', m, { intent: { ...CORRECT, text: original } });
    assert.equal(mr.code, 0, text(mr));
    assert.ok(sentBody(m).includes('## Understood intent\n\n~~One.~~\n\n~~Two.~~\n\nCorrected read-back:\n\nThe better read.\n\nRead-back: corrected in comment 7001.'), JSON.stringify(sentBody(m)));
    const k = world(items(struck));
    const kr = edit(t, 'issue-edit', k, { intent: { ...CORRECT, text: original } });
    assert.equal(kr.code, 0, text(kr));
    const s = world(items(two));
    assert.equal(edit(t, 'issue-edit', s, { intent: { text: original, status: 'pending' } }).code, 0);
    assert.ok(!sentBody(s).includes('\r'), 'the ask is sent with LF line ends');
  }
  // A confirmed or corrected item keeps its status on a later edit, and its reason lines.
  for (const [item, intent, expected] of [
    [CONFIRMED_IN_CHAT, { text: READ, status: 'confirmed' }, "Read-back: confirmed in this session's chat."],
    [CONFIRMED_IN_COMMENT, CONFIRM, 'Read-back: confirmed in comment 7001.'],
  ]) {
    const v = world(items(item));
    const k = edit(t, 'issue-edit', v, { intent });
    assert.equal(k.code, 0, text(k));
    assert.equal(sentBody(v), edited({ readback: expected }));
    assert.equal(reads(v, 7001), 0, 'a kept status reads no comment');
  }
  const k = world(items(CORRECTED_ITEM));
  assert.equal(edit(t, 'issue-edit', k, { intent: CORRECT }).code, 0);
  assert.equal(sentBody(k), edited({ intent: `~~${READ}~~\n\nCorrected read-back:\n\n${BETTER}`, readback: 'Read-back: corrected in comment 7001.' }));
});

// #524 C9: P6, P15, P16, P23, P26: the cited decision must be the right one
test('C9: a move citing a decision that is not the right one is refused edit/confirm at intent.comment, with none of the comment\'s text in the output', t => {
  const wrong = [
    ['a relayed decision', { body: decisionBody({ mark: RELAYED_MARK }) }],
    ["another author's comment", { user: { login: 'stranger' } }],
    ['a comment in another repo', { issue_url: 'https://api.github.com/repos/other/sandbox/issues/5' }],
    ['a comment on another issue', { issue_url: `${API}/issues/6` }],
    ['a comment that only ends in this repo\'s path', { issue_url: `https://example.org${new URL(API).pathname}/issues/5` }],
    ['a chat mark on a comment that is no ask item', { body: `${MARK}\n\nA plain comment.\n\nSigned: pact-524\n` }],
    ['a chat-marked ask item still pending', { body: decisionBody({ readback: 'Read-back: not yet confirmed.' }) }],
    ['a chat-marked ask item confirmed in a comment', { body: decisionBody({ readback: 'Read-back: confirmed in comment 12.' }) }],
    ['a decision answering another item', { body: decisionBody({ answers: 'issue 6' }) }],
    ['a decision with no Answers line', { body: decisionBody({ answers: null }) }],
    ['a decision with no signature', { body: decisionBody({ signer: null }) }],
    ['a decision with two signatures', { body: `${decisionBody()}\nSigned: other-524\n` }],
    ['a decision whose intent text is not the item\'s', { body: decisionBody({ intent: 'Something else.' }) }],
  ];
  for (const [what, over] of wrong) {
    const w = world(items(PENDING_ITEM, { 7001: over }));
    const r = edit(t, 'issue-edit', w, { intent: CONFIRM });
    assert.ok(refusedBy(r, 'edit/confirm', 'intent.comment'), `${what}: ${text(r)}`);
    assert.equal(patches(w).length, 0, what);
    assert.ok(!text(r).includes('planted-words-xyz'), what);
  }
  // A decision on another issue or pull request, cited for a pull request's edit; and the answers of another surface.
  const v = world(items(PENDING_ITEM));
  for (const surface of ['pull-request-edit', 'issue-comment-edit']) {
    const r = edit(t, surface, v, { intent: { ...CONFIRM, comment: 7001 } });
    assert.ok(refusedBy(r, 'edit/confirm', 'intent.comment'), surface);
    assert.ok(!text(r).includes('planted-words-xyz'), surface);
  }
  assert.equal(patches(v).length, 0);
  // The direction of the move: a correction must equal the decision's text and differ from the item's.
  for (const [what, intent, decision] of [
    ['a correction that differs from the decision', { ...CORRECT, corrected: 'Another read.' }, decisionBody({ intent: BETTER })],
    ['a correction equal to the item\'s own text', { ...CORRECT, corrected: READ }, decisionBody({ intent: READ })],
  ]) {
    const w = world(items(PENDING_ITEM, { 7001: { body: decision } }));
    const r = edit(t, 'issue-edit', w, { intent });
    assert.ok(refusedBy(r, 'edit/confirm', 'intent.comment'), `${what}: ${text(r)}`);
    assert.equal(patches(w).length, 0);
    assert.ok(!text(r).includes('planted-words-xyz'), what);
  }
});

// #524 C9: a missing id and a failed read end unavailable
test('C9: a cited comment that is missing, or whose read fails or is unusable, ends unavailable with nothing sent', t => {
  const cases = [
    [world(items(PENDING_ITEM)), { ...CONFIRM, comment: 7999 }],
    [world(items(PENDING_ITEM), { fail: [`repos/${TARGET}/issues/comments/7001`] }), CONFIRM],
    [world(items(PENDING_ITEM, { 7001: { user: null } })), CONFIRM, 'the cited comment read could not be read'],
  ];
  for (const [w, intent, line] of cases) {
    const r = edit(t, 'issue-edit', w, { intent });
    assert.equal(r.code, 4, text(r));
    assert.equal(last(r), 'RESULT: unavailable');
    if (line) assert.ok(r.lines.includes(line), `the guard names itself, not a crash: ${text(r)}`);
    assert.equal(patches(w).length, 0);
  }
  // A review thread reply is no ask item a decision can answer: a move there is refused before any comment is read.
  const reply = ask();
  const thread = world(items(PENDING_ITEM, {}, { [`repos/${TARGET}/pulls/comments/8080`]: { id: 8080, body: reply, user: { login: ME }, in_reply_to_id: 55, pull_request_url: `${API}/pulls/7` }, [`repos/${TARGET}/pulls/comments/55`]: { id: 55, body: reply, user: { login: ME }, in_reply_to_id: null, pull_request_url: `${API}/pulls/7` } }), { fail: [`repos/${TARGET}/issues/comments/7001`] });
  const moved = postDoc('review-thread-reply-edit', { repo: TARGET, signer: SIGNER, reason: REASON, body_file: 'body.md', pr: 7, comment: 8080, quote: [QUOTE], intent: CONFIRM }, (() => { const d = tempDir(t, 'pact-poster-ask-'); writeTree(d, { 'body.md': 'A new session part.\n' }); return d; })(), { gh: thread.gh, env: {}, ...MACHINE });
  assert.ok(refusedBy(moved, 'edit/confirm', 'intent.comment'), text(moved));
  assert.equal(reads(thread, 7001), 0);
});

// ---------------------------------------------------------------- C9a: the tracker comments an edit quotes

// #524 C9a, P29
test('C9a: a live ask-item edit re-reads each tracker comment it quotes: one that no longer holds the passage is post/tracker, and an unreadable one is unavailable', t => {
  const cited = ask({ passage: `> ${OWNER_WORDS}\n\nFrom the owner's comment 4001, 2026-11-11.` });
  const quote = [{ ...QUOTE, source: 'tracker', comment: 4001 }];
  const comment = body => ({ [`repos/${TARGET}/issues/comments/4001`]: { id: 4001, user: { login: ME }, issue_url: `${API}/issues/5`, body } });
  const ok = world(items(cited, {}, comment(`Before. ${OWNER_WORDS} After.`)));
  const r = edit(t, 'issue-edit', ok, { quote });
  assert.equal(r.code, 0, text(r));
  assert.equal(reads(ok, 4001), 1);
  const gone = world(items(cited, {}, comment('The owner edited this comment.')));
  const g = edit(t, 'issue-edit', gone, { quote });
  assert.ok(refusedBy(g, 'post/tracker', 'quote[0].text'), text(g));
  assert.equal(patches(gone).length, 0);
  assert.ok(!text(g).includes('The owner edited'));
  const missing = world(items(cited));
  const m = edit(t, 'issue-edit', missing, { quote });
  assert.equal(m.code, 4, text(m));
  assert.equal(patches(missing).length, 0);
  // A dry run reads nothing, and says so.
  const dry = world(items(cited));
  const d = edit(t, 'issue-edit', dry, { quote, dry: true });
  assert.equal(d.code, 0, text(d));
  assert.equal(dry.calls.length, 0);
  assert.ok(d.lines.some(l => l.startsWith('dry-run: the item was not read;') && l.includes('post/tracker')), text(d));
});
