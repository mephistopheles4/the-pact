// The poster's edit surfaces (#413). Every case runs in-process against a
// fake GitHub behind an injected gh, as the poster's other tests do, so no
// case needs gh or the network. Each test backs one acceptance claim of
// #413's spec, named in the comment above it.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { EXAMPLES, SURFACES, parseArgs, post } from '../../claude/tools/poster.mjs';
import { tempDir, writeTree } from './tree.mjs';

const ME = 'tester';
const TARGET = `${ME}/sandbox`;
const API = `https://api.github.com/repos/${TARGET}`;
const WEB = `https://github.com/${TARGET}`;
const MACHINE = { home: '/srv/home/tester', tmp: '/tmp', user: ME, host: 'buildhost' };
const LABEL = 'pact-413';
const SIGNED = `A plain body.\n\nSigned: ${LABEL}\n`;
const REASON = 'fixed a wrong link\n';

const EDITS = ['issue-edit', 'pull-request-edit', 'issue-comment-edit', 'review-thread-reply-edit'];
const PATHS = {
  'issue-edit': `repos/${TARGET}/issues/5`,
  'pull-request-edit': `repos/${TARGET}/pulls/7`,
  'issue-comment-edit': `repos/${TARGET}/issues/comments/9001`,
  'review-thread-reply-edit': `repos/${TARGET}/pulls/comments/8080`,
};
const ARGS = {
  'issue-edit': ['--issue', '5'],
  'pull-request-edit': ['--pr', '7'],
  'issue-comment-edit': ['--issue', '5', '--comment', '9001'],
  'review-thread-reply-edit': ['--pr', '7', '--comment', '8080'],
};
const URLS = {
  'issue-edit': `${WEB}/issues/5`,
  'pull-request-edit': `${WEB}/pull/7`,
  'issue-comment-edit': `${WEB}/issues/5#issuecomment-9001`,
  'review-thread-reply-edit': `${WEB}/pull/7#discussion_r8080`,
};

/** The items a fake GitHub holds, each with `body` as its current text. */
function items(body = SIGNED, user = ME) {
  const u = { login: user };
  return {
    [`repos/${TARGET}/issues/5`]: { number: 5, body, user: u },
    [`repos/${TARGET}/issues/7`]: { number: 7, body, user: u, pull_request: { url: `${API}/pulls/7` } },
    [`repos/${TARGET}/pulls/7`]: { number: 7, body, user: u },
    [`repos/${TARGET}/issues/comments/9001`]: { id: 9001, body, user: u, issue_url: `${API}/issues/5` },
    [`repos/${TARGET}/issues/comments/9002`]: { id: 9002, body, user: u, issue_url: `${API}/issues/6` },
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

/** Edit on `surface` through `w`; '@name' arguments become file paths. */
function edit(t, surface, w, { body = SIGNED, reason = REASON, signed = LABEL, extra = [], args = ARGS[surface] } = {}) {
  const dir = tempDir(t, 'pact-poster-edit-');
  writeTree(dir, { 'body.md': body, 'reason.txt': reason });
  const argv = [surface, '--repo', TARGET, '--body', join(dir, 'body.md'), '--reason', join(dir, 'reason.txt'), '--signed', signed, ...args, ...extra];
  return post(argv, { gh: w.gh, env: {}, ...MACHINE });
}

const last = r => r.lines.at(-1);
const patches = w => w.calls.filter(c => c.args.includes('PATCH'));
const refusedBy = (r, rule, where) => r.code === 2 && r.lines.some(l => l.startsWith(`REFUSED ${rule} ${where}`));

// #413 C1
test('C1: each edit surface parses with its options, needs --reason and --signed, and has a documented command line', t => {
  for (const surface of EDITS) {
    assert.ok(Object.hasOwn(SURFACES, surface), surface);
    assert.ok(SURFACES[surface].needs.includes('reason') && SURFACES[surface].needs.includes('signed'), surface);
    assert.match(EXAMPLES[surface], new RegExp(`^${surface} --repo you/your-repo --body \\S+ --reason \\S+ --signed \\S+`), surface);
    assert.deepEqual(parseArgs(EXAMPLES[surface].split(' ')).refusals, [], `${surface}'s example parses`);
    const w = world();
    const r = edit(t, surface, w);
    assert.equal(last(r), `RESULT: verified ${surface} ${URLS[surface]} as ${ME}`, `${surface}: ${r.lines.join(' | ')}`);
    for (const missing of ['reason', 'signed']) {
      const dir = tempDir(t, 'pact-poster-edit-');
      writeTree(dir, { 'body.md': SIGNED, 'reason.txt': REASON });
      const argv = [surface, '--repo', TARGET, '--body', join(dir, 'body.md'), ...ARGS[surface]];
      if (missing !== 'reason') argv.push('--reason', join(dir, 'reason.txt'));
      if (missing !== 'signed') argv.push('--signed', LABEL);
      const m = post(argv, { gh: world().gh, env: {}, ...MACHINE });
      assert.ok(refusedBy(m, 'usage/missing-option', `option --${missing}`), `${surface} without --${missing}: ${m.lines.join(' | ')}`);
    }
  }
});

// #413 C2
test('C2: a reason of two lines, over 200 characters or empty, a --signed out of shape, and a composed body over the limit are refused', t => {
  const s = 'issue-comment-edit';
  const cases = [
    [{ reason: 'one\ntwo\n' }, 'text/reason-lines', 'option --reason'],
    [{ reason: `${'r'.repeat(201)}\n` }, 'text/reason-length', 'option --reason'],
    [{ reason: '\n' }, 'file/empty', 'option --reason'],
    [{ reason: '   \n' }, 'file/empty', 'option --reason'],
    [{ reason: `${String.fromCharCode(0xad)}\n` }, 'file/empty', 'option --reason'],
    [{ signed: 'Pact-413' }, 'input/signed', 'option --signed'],
    [{ signed: '-pact' }, 'input/signed', 'option --signed'],
    [{ signed: 'p'.repeat(51) }, 'input/signed', 'option --signed'],
    [{ body: `${'x'.repeat(65536 - 30)}\n\nSigned: ${LABEL}\n` }, 'text/body-length', 'option --body'],
  ];
  for (const [opts, rule, where] of cases) {
    const w = world();
    const r = edit(t, s, w, opts);
    assert.ok(refusedBy(r, rule, where), `${rule}: ${r.lines.join(' | ')}`);
    assert.equal(w.calls.length, 0, rule);
  }
  assert.equal(last(edit(t, s, world(), { reason: `${'r'.repeat(200)}\n` })).split(' ')[1], 'verified');
});

// #413 C3
test('C3: the request is one PATCH of { body }, the body followed by the reason line, with line breaks that follow the body', t => {
  const cases = [
    [SIGNED, `${SIGNED}\nEdited: fixed a wrong link (${LABEL})`],
    [`A plain body.\n\nSigned: ${LABEL}`, `A plain body.\n\nSigned: ${LABEL}\n\nEdited: fixed a wrong link (${LABEL})`],
    [`A plain body.\r\n\r\nSigned: ${LABEL}\r\n`, `A plain body.\r\n\r\nSigned: ${LABEL}\r\n\r\nEdited: fixed a wrong link (${LABEL})`],
  ];
  for (const surface of EDITS) {
    for (const [body, composed] of cases) {
      const w = world();
      const r = edit(t, surface, w, { body });
      assert.equal(r.code, 0, `${surface}: ${r.lines.join(' | ')}`);
      const p = patches(w);
      assert.equal(p.length, 1);
      assert.deepEqual(p[0].args, ['api', '--hostname', 'github.com', '--method', 'PATCH', PATHS[surface], '--input', '-']);
      assert.deepEqual(JSON.parse(p[0].input), { body: composed });
    }
  }
});

// #413 C4
test('C4: a secret or an email in the reason or the body is refused before gh is called, and an item holding one is never edited', t => {
  const email = 'alice' + '@' + 'example.org';
  for (const opts of [{ reason: `wrote to ${email}\n` }, { body: `Mail ${email}.\n\nSigned: ${LABEL}\n` }]) {
    const w = world();
    const r = edit(t, 'issue-comment-edit', w, opts);
    assert.ok(r.lines.some(l => l.startsWith('REFUSED personal/email ')), r.lines.join(' | '));
    assert.equal(w.calls.length, 0);
    assert.ok(!r.lines.join('\n').includes('alice'));
  }
  // An edit would leave the leak in GitHub's history, so the item is refused and the owner told instead.
  const w = world({ store: items(`Mail ${email}.\n\nSigned: ${LABEL}\n`) });
  const r = edit(t, 'issue-comment-edit', w);
  assert.ok(refusedBy(r, 'edit/leak', 'item'), r.lines.join(' | '));
  assert.equal(patches(w).length, 0);
  assert.ok(!r.lines.join('\n').includes('alice'));
});

// #413 C5
test('C5: an item by another author is refused as edit/author, with no PATCH', t => {
  for (const surface of EDITS) {
    const w = world({ store: items(SIGNED, 'stranger') });
    const r = edit(t, surface, w);
    assert.ok(refusedBy(r, 'edit/author', 'item'), `${surface}: ${r.lines.join(' | ')}`);
    assert.equal(patches(w).length, 0);
    assert.ok(!r.lines.join('\n').includes('stranger'));
  }
});

// #394 C27: an item another account wrote is read no further, so its text never reaches the slow readers; an own item in the wrong place is still read.
test('C27: an item another login wrote is refused as edit/author alone, before its text is read', t => {
  const email = 'alice' + '@' + 'example.org';
  const refused = r => r.lines.filter(l => l.startsWith('REFUSED '));
  // Unsigned and holding an address, so the body rules and the scan would each add a refusal if they read it.
  const w = world({ store: items(`Mail ${email}.\n`, 'stranger') });
  const r = edit(t, 'issue-comment-edit', w);
  assert.deepEqual(refused(r), ['REFUSED edit/author item'], r.lines.join(' | '));
  assert.equal(patches(w).length, 0);
  // The session's own comment, named under another issue: in the wrong place, but its leak is still told.
  const own = world({ store: items(`Mail ${email}.\n\nSigned: ${LABEL}\n`) });
  const o = edit(t, 'issue-comment-edit', own, { args: ['--issue', '5', '--comment', '9002'] });
  assert.deepEqual(refused(o).sort(), ['REFUSED edit/leak item', 'REFUSED edit/target item'], o.lines.join(' | '));
});

// #413 C6
test('C6: edit/unsigned takes only the two signature forms, on the item and on the new body', t => {
  const s = 'issue-comment-edit';
  for (const line of [`Signed: ${LABEL}`, `Posted by ${LABEL}.`]) {
    const body = `Text.\n\n${line}\n`;
    const r = edit(t, s, world({ store: items(body) }), { body });
    assert.equal(r.code, 0, `${line}: ${r.lines.join(' | ')}`);
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
  assert.equal(edit(t, s, world({ store: items(named) }), { body: named }).code, 0);
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
    const r1 = edit(t, s, onItem);
    assert.ok(refusedBy(r1, 'edit/unsigned', 'item'), `item ${JSON.stringify(body)}: ${r1.lines.join(' | ')}`);
    assert.equal(patches(onItem).length, 0);
    assert.ok(!r1.lines.join('\n').includes('Text.'));
    const onBody = world();
    const r2 = edit(t, s, onBody, { body });
    assert.ok(refusedBy(r2, 'edit/unsigned', 'option --body'), `body ${JSON.stringify(body)}: ${r2.lines.join(' | ')}`);
    assert.equal(onBody.calls.length, 0);
  }
  // An owner's comment that ends in a one-letter pick: the letter is no signature.
  const owner = world({ store: items('Pick:\n\na\n') });
  assert.ok(refusedBy(edit(t, s, owner, { body: 'Pick:\n\nSigned: a\n', signed: 'a' }), 'edit/unsigned', 'item'));
  assert.equal(patches(owner).length, 0);
});

// #413 C7
test('C7: edit/record refuses each review record form, on the item and on the new body; a spec naming lenses in prose passes', t => {
  const s = 'issue-comment-edit';
  const sig = `\n\nSigned: ${LABEL}\n`;
  const records = [
    `### executability-lens and unstated-lens\n\nBase \`abc1234\`.\n\n| Finding | Lens | Disposition | Rerun |\n| --- | --- | --- | --- |\n| new x | unstated-lens | fixed | |${sig}`,
    `<details><summary>adversarial-lens: blocking</summary>\n\n\`\`\`text\nreport\n\`\`\`\n\n</details>${sig}`,
    `Verdict: clear, nothing for you.\n\n<details><summary>reader-lens: clear</summary>\n\nok\n\n</details>${sig}`,
    `Lens dispositions\n\n|Finding|  Lens |Disposition|Rerun|\n|-|-|-|-|\n| new x | a-lens | fixed | |${sig}`,
    `## Round 2: data-\`lens\` and **adversarial**-lens\n\nBase line.${sig}`,
    `executability-lens and unstated-lens:\n===\n\nBase line.${sig}`,
    `Intro.\r### data-lens\rBase line.${sig}`,
    `### behaviour-lens and integrity-lens\n\nBase line.\n\n## Test round 1: nothing for you\n\n<details><summary>Lens dispositions (2 findings)</summary>\n\n| Finding | Lens | Disposition | Rerun |\n| --- | --- | --- | --- |\n| new x | behaviour-lens | fixed | |\n\n</details>${sig}`,
  ];
  // A continued part whose heading names no lens, holding the crossed-findings fold (#401).
  records.push(`### Part 3\n\n<details><summary>Crossed findings, continued (4 crossings)</summary>\n\nrows\n\n</details>${sig}`);
  for (const body of records) {
    const onItem = world({ store: items(body) });
    const r1 = edit(t, s, onItem);
    assert.ok(refusedBy(r1, 'edit/record', 'item'), `item ${JSON.stringify(body.slice(0, 40))}: ${r1.lines.join(' | ')}`);
    assert.equal(patches(onItem).length, 0);
    assert.ok(!r1.lines.join('\n').includes('-lens'));
    const onBody = world();
    const r2 = edit(t, s, onBody, { body });
    assert.ok(refusedBy(r2, 'edit/record', 'option --body'), `body ${JSON.stringify(body.slice(0, 40))}: ${r2.lines.join(' | ')}`);
    assert.equal(onBody.calls.length, 0);
  }
  const spec = `## Spec for #9, revision 2\n\n### S1 Goal\n\nThe adversarial-lens and data-lens read it; the table keeps Finding, Lens, Disposition and Rerun.${sig}`;
  assert.equal(edit(t, s, world({ store: items(spec) }), { body: spec }).code, 0);
  // The check is a best-effort backstop that skips fences on each folded view (q12 on #413):
  // fence markers hidden in comments don't blind it, and a shape quoted inside a fence is refused too.
  const hiddenFences = `Intro.\n\n<!--\n\`\`\`\n-->\n\n### data-lens and adversarial-lens\n\n<!--\n\`\`\`\n-->${sig}`;
  const fenced = `## Spec for #9\n\n\`\`\`text\n### behaviour-lens and integrity-lens\n\`\`\`${sig}`;
  for (const body of [hiddenFences, fenced]) {
    assert.ok(refusedBy(edit(t, s, world({ store: items(body) })), 'edit/record', 'item'), JSON.stringify(body));
  }
});

// #413 C8
test('C8: edit/decision refuses the words in any case, spacing, markup, link or look-alike letter, in the reason and in the item', t => {
  const s = 'issue-comment-edit';
  const sig = `\n\nSigned: ${LABEL}\n`;
  const forms = [
    'OWNER   Decision, from chat.',
    'Owner\tdecision, from chat.',
    'Owner **decision**, from chat.',
    'Ow`ner` decision.',
    '[Owner](https://example.com/x) decision, from chat.',
    'Own\u0435r d\u0435cision, from chat.',
    'Owner de&#99;ision, from chat.',
    // #394 C12: a named reference outside the old list, a script letter NFKC folds to c.
    'Owner de&cscr;ision, from chat.',
  ];
  for (const text of forms) {
    const body = `${text}${sig}`;
    const onBody = world();
    const r = edit(t, s, onBody, { body });
    assert.ok(refusedBy(r, 'edit/decision', 'option --body'), `${JSON.stringify(text)}: ${r.lines.join(' | ')}`);
    assert.equal(onBody.calls.length, 0);
    assert.ok(!r.lines.join('\n').includes('from chat'));
    const onItem = world({ store: items(body) });
    assert.ok(refusedBy(edit(t, s, onItem), 'edit/decision', 'item'), `item ${JSON.stringify(text)}`);
    assert.equal(patches(onItem).length, 0);
  }
  assert.ok(refusedBy(edit(t, s, world(), { reason: 'added the owner decision\n' }), 'edit/decision', 'option --body'));
});

// #413 C9
test('C9: a comment on another item, an issue that is a pull request and a thread\'s first comment are edit/target; a 404 is unavailable', t => {
  const cases = [
    ['issue-comment-edit', ['--issue', '5', '--comment', '9002']],
    ['issue-edit', ['--issue', '7']],
    ['review-thread-reply-edit', ['--pr', '7', '--comment', '55']],
    ['review-thread-reply-edit', ['--pr', '8', '--comment', '8080']],
  ];
  for (const [surface, args] of cases) {
    const w = world();
    const r = edit(t, surface, w, { args });
    assert.ok(refusedBy(r, 'edit/target', 'item'), `${surface} ${args.join(' ')}: ${r.lines.join(' | ')}`);
    assert.equal(patches(w).length, 0);
    assert.ok(!r.lines.join('\n').includes('api.github.com'));
  }
  // A 404, and a target field of the wrong type, are unavailable, with nothing sent.
  const odd = items();
  odd[PATHS['review-thread-reply-edit']] = { ...odd[PATHS['review-thread-reply-edit']], in_reply_to_id: '55' };
  odd[PATHS['issue-edit']] = { ...odd[PATHS['issue-edit']], pull_request: 'yes' };
  for (const [surface, args, store] of [['pull-request-edit', ['--pr', '5'], items()], ['review-thread-reply-edit', ARGS['review-thread-reply-edit'], odd], ['issue-edit', ARGS['issue-edit'], odd]]) {
    const w = world({ store });
    const r = edit(t, surface, w, { args });
    assert.equal(r.code, 4, `${surface}: ${r.lines.join(' | ')}`);
    assert.equal(last(r), 'RESULT: unavailable');
    assert.equal(patches(w).length, 0);
    assert.ok(!r.lines.join('\n').includes('Signed:'));
  }
});

// #413 C10
test('C10: reason lines are append-only', t => {
  const s = 'issue-comment-edit';
  const old = `Edited: fixed a typo (other-session)`;
  const item = `Text.\n\nSigned: ${LABEL}\n\n${old}`;
  const refused = [
    `Text, fixed.\n\nSigned: ${LABEL}\n`,
    `Text, fixed.\n\nSigned: ${LABEL}\n\nEdited: fixed two typos (other-session)\n`,
    `Text, fixed.\n\nSigned: ${LABEL}\n\n${old}\n\nEdited: a forged line (${LABEL})\n`,
  ];
  for (const body of refused) {
    const w = world({ store: items(item) });
    const r = edit(t, s, w, { body });
    assert.ok(refusedBy(r, 'edit/reasons', 'option --body'), `${JSON.stringify(body)}: ${r.lines.join(' | ')}`);
    assert.equal(patches(w).length, 0);
  }
  for (const body of refused) {
    const r = edit(t, s, world({ store: items(item) }), { body });
    assert.ok(!r.lines.join('\n').includes('typo'));
  }
  // Forged or hidden reason lines, caught before gh is called: a reason-shaped line outside the run (a trailing space, a joiner, above the signature), and a comment or fold left open above the run.
  const hidden = [
    `Text.\n\nEdited: a forged line (${LABEL}) \n\nSigned: ${LABEL}\n`,
    `Text.\n\nEdited: a forged line (${LABEL})${String.fromCharCode(0x200d)}\n\nSigned: ${LABEL}\n`,
    `Text.\n\nEdited: a forged line (${LABEL})\n\nSigned: ${LABEL}\n\n${old}\n`,
    `Text.\n\nSigned: ${LABEL}\n\n<!--\n\n${old}\n`,
    `Text.\n\nSigned: ${LABEL}\n\n<details>\n\n${old}\n`,
  ];
  for (const body of hidden) {
    const w = world({ store: items(item) });
    const r = edit(t, s, w, { body });
    assert.ok(refusedBy(r, 'edit/reasons', 'option --body'), `${JSON.stringify(body)}: ${r.lines.join(' | ')}`);
    assert.equal(w.calls.length, 0);
    assert.ok(!r.lines.join('\n').includes('forged') && !r.lines.join('\n').includes('typo'));
  }
  const w = world({ store: items(item) });
  const r = edit(t, s, w, { body: `Text, fixed.\n\nSigned: ${LABEL}\n\n${old}\n` });
  assert.equal(r.code, 0, r.lines.join(' | '));
  assert.equal(JSON.parse(patches(w)[0].input).body, `Text, fixed.\n\nSigned: ${LABEL}\n\n${old}\n\nEdited: fixed a wrong link (${LABEL})`);
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
  assert.ok(moved.lines.includes('MISMATCH target: it sits on another item'), moved.lines.join(' | '));
  const r = 'review-thread-reply-edit';
  const movedReply = edit(t, r, world({ tamper: x => ({ ...x, pull_request_url: `${API}/pulls/8` }) }));
  assert.ok(movedReply.lines.includes('MISMATCH target: it sits on another item'), movedReply.lines.join(' | '));
  const unverified = edit(t, s, world({ fail: { 'GET after': 'HTTP 502: Bad Gateway' } }));
  assert.equal(unverified.code, 1);
  assert.deepEqual(unverified.lines.slice(-2), ['NEXT: the edit landed. Never send it again. Tell the owner, with the link below.', `RESULT: unverified ${url}`]);
  const failed = edit(t, s, world({ fail: { 'PATCH before': 'HTTP 502: Bad Gateway' } }));
  assert.equal(failed.code, 3);
  assert.deepEqual(failed.lines.slice(-2), [`NEXT: the edit may have landed. Look at ${url} for its reason line before anything else. If it is there, never send it again: tell the owner its link. If it isn't, tell the owner, and send it again only on their word. If you can't tell, tell the owner, and don't send it.`, 'RESULT: failed']);
  for (const w of [world({ fail: { [`GET ${PATHS[s]} before`]: 'HTTP 502: Bad Gateway' } }), world({ store: { ...items(), [PATHS[s]]: { id: 9001, body: SIGNED, user: 'not an object', issue_url: `${API}/issues/5` } } })]) {
    const r = edit(t, s, w);
    assert.equal(r.code, 4, r.lines.join(' | '));
    assert.equal(last(r), 'RESULT: unavailable');
    assert.equal(patches(w).length, 0);
  }
});

// #413 C12
test('C12: a dry run prints the PATCH and sizes, runs the body checks, and calls no gh', t => {
  const w = world();
  const r = edit(t, 'issue-edit', w, { extra: ['--dry-run'] });
  assert.equal(w.calls.length, 0);
  assert.deepEqual(r.lines, [
    `gh api --hostname github.com --method PATCH ${PATHS['issue-edit']} --input -`,
    `request: {"body":"<${[...`${SIGNED}\nEdited: fixed a wrong link (${LABEL})`].length} characters>"}`,
    'RESULT: dry-run issue-edit',
  ]);
  const unsigned = edit(t, 'issue-edit', world(), { body: 'No signature.\n', extra: ['--dry-run'] });
  assert.ok(refusedBy(unsigned, 'edit/unsigned', 'option --body'));
});
