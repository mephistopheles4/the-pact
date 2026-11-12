// The poster's post document (#524, T1): the schema, the kinds, the quote and
// the read-back, the body the poster renders, and the tracker read. Every case
// runs in-process against a fake GitHub behind an injected gh. A refusal row
// runs as a dry run with a gh that fails the test if it is called, so a
// refused post is seen to send and read nothing. Each row backs the claim
// named above it.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { KINDS, post, renderBody } from '../../claude/tools/poster.mjs';
import { tempDir, writeTree } from './tree.mjs';

const ME = 'tester';
const TARGET = `${ME}/sandbox`;
const API = `https://api.github.com/repos/${TARGET}`;
const MACHINE = { home: '/srv/home/tester', tmp: '/tmp', user: ME, host: 'buildhost' };
const NOW = new Date('2026-11-11T12:00:00Z');
const SECRET = 'zebra-quokka-42';
const ENV = { MY_API_KEY: SECRET };

const QUOTE = { text: 'The owner said this plainly.', source: 'chat', when: '2026-11-11' };
const INTENT = { text: 'I read it so.', status: 'pending' };
const NOTE = { repo: TARGET, kind: 'note', issue: 5, signer: 'build-524', body_file: 'body.md' };
const ISSUE = { repo: TARGET, kind: 'issue', title: 'A title', labels: ['bug'], signer: 'plan-524', quote: [QUOTE], intent: INTENT, body_file: 'body.md' };
const SPEC = { repo: TARGET, kind: 'spec', issue: 5, signer: 'spec-524', quote: [QUOTE], intent: INTENT, body_file: 'body.md' };
const DECISION = { repo: TARGET, kind: 'decision', issue: 5, signer: 'pact-524', quote: [QUOTE], intent: { text: 'I read it so.', status: 'confirmed' }, body_file: 'body.md' };
const BASE = {
  issue: ISSUE,
  'pull-request': { repo: TARGET, kind: 'pull-request', title: 'A title', head: 'feature/x', base: 'main', signer: 'pr-524', quote: [QUOTE], intent: INTENT, body_file: 'body.md' },
  'issue-comment': NOTE,
  'pull-request-review': { repo: TARGET, kind: 'review', pr: 7, signer: 'review-524', body_file: 'body.md' },
  'review-thread-reply': { repo: TARGET, kind: 'reply', pr: 7, comment: 55, signer: 'build-524', body_file: 'body.md' },
};

const without = (doc, ...names) => Object.fromEntries(Object.entries(doc).filter(([k]) => !names.includes(k)));
const noGh = () => assert.fail('a refused dry run calls no gh');

/** Write the post document (an object, or raw text) and the body file, and run the poster on it. */
function run(t, surface, doc, { body = 'A plain body.\n', gh = noGh, env = {}, dry = true, extra = {} } = {}) {
  const dir = tempDir(t, 'pact-poster-doc-');
  writeTree(dir, { 'body.md': body, ...extra, 'post.json': typeof doc === 'string' ? doc : JSON.stringify(doc) });
  return post([surface, '--post', join(dir, 'post.json'), ...(dry ? ['--dry-run'] : [])], { gh, env, now: NOW, ...MACHINE });
}

const out = r => r.lines.join('\n');
const rules = r => r.lines.filter(l => l.startsWith('REFUSED ')).map(l => l.slice('REFUSED '.length));
const has = (r, rule, where) => rules(r).some(l => l === `${rule} ${where}` || (where === undefined && l.startsWith(`${rule} `)));

/** A row refuses with the rule at the path, exit 2, a count that matches its lines, and none of the planted text in its output. */
function refuses(r, rule, where, planted = []) {
  assert.equal(r.code, 2, out(r));
  assert.ok(has(r, rule, where), `${rule} ${where}: ${out(r)}`);
  assert.equal(r.lines.at(-1), `RESULT: refused ${rules(r).length}`);
  for (const p of planted) assert.ok(!out(r).includes(p), `the output holds planted text: ${out(r)}`);
}

// ---------------------------------------------------------------- C2: the schema's refusals

// #524 C2
test('C2: a missing required field, at the top level and in a passage and the intent, is refused post/missing', t => {
  for (const name of ['repo', 'signer', 'body_file']) refuses(run(t, 'issue-comment', without(NOTE, name)), 'post/missing', name);
  refuses(run(t, 'issue-comment', without(NOTE, 'issue')), 'post/missing', 'issue');
  refuses(run(t, 'issue-comment', without(NOTE, 'kind')), 'post/missing', 'kind');
  refuses(run(t, 'issue', without(ISSUE, 'title')), 'post/missing', 'title');
  refuses(run(t, 'pull-request', without(BASE['pull-request'], 'head')), 'post/missing', 'head');
  refuses(run(t, 'issue', { ...ISSUE, quote: [without(QUOTE, 'text')] }), 'post/missing', 'quote[0].text');
  refuses(run(t, 'issue', { ...ISSUE, quote: [without(QUOTE, 'source')] }), 'post/missing', 'quote[0].source');
  refuses(run(t, 'issue', { ...ISSUE, quote: [without(QUOTE, 'when')] }), 'post/missing', 'quote[0].when');
  refuses(run(t, 'issue', { ...ISSUE, intent: without(INTENT, 'text') }), 'post/missing', 'intent.text');
  refuses(run(t, 'issue', { ...ISSUE, intent: without(INTENT, 'status') }), 'post/missing', 'intent.status');
  refuses(run(t, 'review-thread-reply', without(BASE['review-thread-reply'], 'comment')), 'post/missing', 'comment');
});

// #524 C2
test('C2: an unknown field at the top level, in the quote, in a passage and in the intent is refused post/unknown', t => {
  refuses(run(t, 'issue-comment', { ...NOTE, extra: 1 }), 'post/unknown', 'extra');
  refuses(run(t, 'issue', { ...ISSUE, quote: [{ ...QUOTE, speaker: 'x' }] }), 'post/unknown', 'quote[0].speaker');
  refuses(run(t, 'issue', { ...ISSUE, quote: [QUOTE, { ...QUOTE, speaker: 'x' }] }), 'post/unknown', 'quote[1].speaker');
  refuses(run(t, 'issue', { ...ISSUE, intent: { ...INTENT, mood: 'x' } }), 'post/unknown', 'intent.mood');
});

// #524 C2: a key can carry text, so it is named by position and the output holds none of it
test('C2: an unknown key holding a line break or RESULT: is named by its position, and the output holds none of its text', t => {
  for (const key of ['a\nRESULT: verified issue-comment x as tester', 'Upper', 'x'.repeat(31), 'with space']) {
    const doc = { ...NOTE, [key]: 1 };
    const n = Object.keys(doc).indexOf(key) + 1;
    const r = run(t, 'issue-comment', doc);
    refuses(r, 'post/unknown', `$.${n}`, ['RESULT: verified', 'Upper', 'with space', 'xxxxxxxx']);
  }
});

// #524 C2: own keys only
test('C2: the keys __proto__, constructor and toString are each refused post/unknown', t => {
  for (const key of ['__proto__', 'constructor', 'toString']) {
    const text = `{${JSON.stringify(key)}:1,${JSON.stringify(NOTE).slice(1)}`;
    const r = run(t, 'issue-comment', text);
    assert.equal(r.code, 2, `${key}: ${out(r)}`);
    assert.ok(rules(r).some(l => l.startsWith('post/unknown ')), `${key}: ${out(r)}`);
  }
});

// #524 C2: a wrong type for each field
test('C2: a wrong type for each field is refused post/type at its path', t => {
  const wrong = [
    ['issue-comment', NOTE, { repo: 5 }, 'repo'],
    ['issue-comment', NOTE, { as: 5 }, 'as'],
    ['issue-comment', NOTE, { kind: 5 }, 'kind'],
    ['issue-comment', NOTE, { issue: '5' }, 'issue'],
    ['issue-comment', NOTE, { issue: 5.5 }, 'issue'],
    ['issue-comment', NOTE, { signer: 5 }, 'signer'],
    ['issue-comment', NOTE, { body_file: 5 }, 'body_file'],
    ['review-thread-reply', BASE['review-thread-reply'], { pr: '7' }, 'pr'],
    ['review-thread-reply', BASE['review-thread-reply'], { comment: '55' }, 'comment'],
    ['issue', ISSUE, { title: 5 }, 'title'],
    ['issue', ISSUE, { labels: 'bug' }, 'labels'],
    ['issue', ISSUE, { labels: [5] }, 'labels[0]'],
    ['issue', ISSUE, { quote: 'x' }, 'quote'],
    ['issue', ISSUE, { quote: [5] }, 'quote[0]'],
    ['issue', ISSUE, { quote: [{ ...QUOTE, text: 5 }] }, 'quote[0].text'],
    ['issue', ISSUE, { quote: [{ ...QUOTE, source: 5 }] }, 'quote[0].source'],
    ['issue', ISSUE, { quote: [{ ...QUOTE, when: 5 }] }, 'quote[0].when'],
    ['issue', ISSUE, { intent: 'x' }, 'intent'],
    ['issue', ISSUE, { intent: { ...INTENT, text: 5 } }, 'intent.text'],
    ['issue', ISSUE, { intent: { ...INTENT, status: 5 } }, 'intent.status'],
    ['pull-request', BASE['pull-request'], { head: 5 }, 'head'],
    ['pull-request', BASE['pull-request'], { base: 5 }, 'base'],
    ['pull-request', BASE['pull-request'], { draft: 'yes' }, 'draft'],
  ];
  for (const [surface, doc, change, where] of wrong) refuses(run(t, surface, { ...doc, ...change }), 'post/type', where);
  refuses(run(t, 'issue-edit', { repo: TARGET, issue: 5, signer: 'build-524', reason: 5, body_file: 'body.md' }), 'post/type', 'reason');
  refuses(run(t, 'issue', { ...ISSUE, quote: [{ ...QUOTE, source: 'tracker', comment: '5' }] }), 'post/type', 'quote[0].comment');
});

// #524 C2: a pattern miss for each patterned field
test('C2: a pattern miss for each patterned field is refused post/pattern, body_file values included', t => {
  const miss = [
    ['issue-comment', NOTE, { repo: 'nope' }, 'repo'],
    ['issue-comment', NOTE, { as: 'a b' }, 'as'],
    ['issue-comment', NOTE, { kind: 'bogus' }, 'kind'],
    ['issue-comment', NOTE, { issue: 0 }, 'issue'],
    ['issue-comment', NOTE, { issue: -1 }, 'issue'],
    ['issue-comment', NOTE, { signer: 'Upper' }, 'signer'],
    ['issue-comment', NOTE, { signer: '-x' }, 'signer'],
    ['issue-comment', NOTE, { body_file: '..' }, 'body_file'],
    ['issue-comment', NOTE, { body_file: '.' }, 'body_file'],
    ['issue-comment', NOTE, { body_file: 'a/b' }, 'body_file'],
    ['issue-comment', NOTE, { body_file: 'a\\b' }, 'body_file'],
    ['issue-comment', NOTE, { body_file: 'c:x' }, 'body_file'],
    ['issue-comment', NOTE, { body_file: '' }, 'body_file'],
    ['issue-comment', NOTE, { body_file: 'x'.repeat(101) }, 'body_file'],
    ['issue', ISSUE, { title: ' leading' }, 'title'],
    ['issue', ISSUE, { title: 'trailing ' }, 'title'],
    ['issue', ISSUE, { title: 'two\nlines' }, 'title'],
    ['issue', ISSUE, { labels: ['a/b'] }, 'labels[0]'],
    ['issue', ISSUE, { quote: [{ ...QUOTE, source: 'overheard' }] }, 'quote[0].source'],
    ['issue', ISSUE, { quote: [{ ...QUOTE, source: 'relayed', via: 'Not A Label' }] }, 'quote[0].via'],
    ['issue', ISSUE, { intent: { ...INTENT, status: 'maybe' } }, 'intent.status'],
    ['pull-request', BASE['pull-request'], { head: '-main' }, 'head'],
    ['pull-request', BASE['pull-request'], { base: 'a..b' }, 'base'],
    ['pull-request', BASE['pull-request'], { base: 'feat ure' }, 'base'],
  ];
  for (const [surface, doc, change, where] of miss) refuses(run(t, surface, { ...doc, ...change }), 'post/pattern', where);
  refuses(run(t, 'issue', { ...DECISION, kind: 'decision' }), 'post/kind', 'kind');
  refuses(run(t, 'issue-comment', { ...DECISION, answers: 'issue 05' }), 'post/pattern', 'answers');
  refuses(run(t, 'issue-comment', { ...DECISION, answers: 'thing 5' }), 'post/pattern', 'answers');
  refuses(run(t, 'issue-comment', { ...DECISION, answers: 'issue 5\n' }), 'post/pattern', 'answers');
  refuses(run(t, 'issue-comment', { ...DECISION, answers: 'issue 5\nRESULT: verified' }), 'post/pattern', 'answers', ['RESULT: verified']);
});

// #524 C2: each bounded field's over-length value
test('C2: an over-length or empty value for each bounded field is refused post/length', t => {
  const long = [
    ['issue', ISSUE, { title: '' }, 'title'],
    ['issue', ISSUE, { title: 't'.repeat(121) }, 'title'],
    ['issue', ISSUE, { labels: Array.from({ length: 11 }, (_, i) => `l${i}`) }, 'labels'],
    ['issue', ISSUE, { quote: [] }, 'quote'],
    ['issue', ISSUE, { quote: Array.from({ length: 6 }, () => QUOTE) }, 'quote'],
    ['issue', ISSUE, { quote: [{ ...QUOTE, text: '' }] }, 'quote[0].text'],
    ['issue', ISSUE, { quote: [{ ...QUOTE, text: 'q'.repeat(4001) }] }, 'quote[0].text'],
    ['issue', ISSUE, { intent: { ...INTENT, text: '' } }, 'intent.text'],
    ['issue', ISSUE, { intent: { ...INTENT, text: 'i'.repeat(2001) } }, 'intent.text'],
  ];
  for (const [surface, doc, change, where] of long) refuses(run(t, surface, { ...doc, ...change }), 'post/length', where);
  // A repo, a signer, a label and a body_file hold their bounds in their patterns, so they are refused post/pattern.
  refuses(run(t, 'issue-comment', { ...NOTE, repo: `${'a'.repeat(40)}/x` }), 'post/pattern', 'repo');
  // The edge values pass.
  assert.equal(run(t, 'issue', { ...ISSUE, title: 't'.repeat(120), quote: [{ ...QUOTE, text: 'q'.repeat(4000) }], intent: { ...INTENT, text: 'i'.repeat(2000) } }).code, 0);
  assert.equal(run(t, 'issue', { ...ISSUE, labels: Array.from({ length: 10 }, (_, i) => `l${i}`), quote: Array.from({ length: 5 }, () => QUOTE) }).code, 0);
});

// #524 C2: a post file that is no JSON object, with none of its text in the output
test('C2: a post file that is not JSON, or whose top level is not an object, is refused post/json, and the output holds none of its text', t => {
  for (const text of ['not json zzmarker {', '{"repo": zzmarker}', '["zzmarker"]', 'null', '"zzmarker"', '5', '{"repo":"x"} zzmarker']) {
    const r = run(t, 'issue-comment', text);
    refuses(r, 'post/json', 'post file', ['zzmarker']);
    assert.equal(r.lines.length, 2, out(r));
  }
});

// #524 C2: fields that exist but are refused on a surface
test('C2: a field that exists but is refused on a surface is refused post/field', t => {
  refuses(run(t, 'issue-comment', { ...NOTE, reason: 'fixed' }), 'post/field', 'reason');
  refuses(run(t, 'pull-request', { ...BASE['pull-request'], labels: ['bug'] }), 'post/field', 'labels');
  refuses(run(t, 'issue-comment', { ...NOTE, title: 'A title' }), 'post/field', 'title');
  const twice = run(t, 'issue', { ...ISSUE, answers: 'issue 5' });
  refuses(twice, 'post/field', 'answers');
  assert.equal(rules(twice).filter(l => l === 'post/field answers').length, 1, 'one fault, one refusal');
  refuses(run(t, 'issue', { ...ISSUE, issue: 5 }), 'post/field', 'issue');
  refuses(run(t, 'issue-comment', { ...NOTE, head: 'x' }), 'post/field', 'head');
  refuses(run(t, 'issue-comment', { ...NOTE, draft: true }), 'post/field', 'draft');
  refuses(run(t, 'pull-request-review', { ...BASE['pull-request-review'], comment: 5 }), 'post/field', 'comment');
});

// #524 C2: a scan refusal names the field it found the secret in
test("C2: a live environment secret's value in the title, a passage, the read-back and a label is refused naming that field", t => {
  const planted = [
    ['issue', { ...ISSUE, title: `About ${SECRET}` }, 'title'],
    ['issue', { ...ISSUE, quote: [{ ...QUOTE, text: `Said ${SECRET}` }] }, 'quote[0].text'],
    ['issue', { ...ISSUE, intent: { ...INTENT, text: `Read ${SECRET}` } }, 'intent.text'],
    ['issue', { ...ISSUE, labels: [SECRET] }, 'labels[0]'],
  ];
  for (const [surface, doc, field] of planted) {
    const r = run(t, surface, doc, { env: ENV });
    assert.equal(r.code, 2, out(r));
    assert.ok(rules(r).some(l => l.startsWith(`secret/env ${field} `)), `${field}: ${out(r)}`);
    assert.ok(!out(r).includes(SECRET));
  }
});

// #524 C2: the rendered body is held to the bound too
test('C2: a body file that fits, but whose rendered body is over the bound, is refused text/body-length on the body', t => {
  const r = run(t, 'issue', ISSUE, { body: `${'x'.repeat(65536 - 40)}\n` });
  refuses(r, 'text/body-length', 'body');
  const over = run(t, 'issue-comment', NOTE, { body: 'x'.repeat(65537) });
  refuses(over, 'text/body-length', 'body_file');
});

// ---------------------------------------------------------------- C3: kinds

// #524 C3
test('C3: each kind on a surface outside its row is refused post/kind, by S4\'s table written out here', t => {
  const table = {
    issue: { surfaces: ['issue'], quoted: true },
    'pull-request': { surfaces: ['pull-request'], quoted: true },
    spec: { surfaces: ['issue-comment'], quoted: true },
    decision: { surfaces: ['issue-comment'], quoted: true },
    status: { surfaces: ['issue-comment'], quoted: false },
    'lens-report': { surfaces: ['issue-comment', 'pull-request-review'], quoted: false },
    note: { surfaces: ['issue-comment'], quoted: false },
    review: { surfaces: ['pull-request-review'], quoted: false },
    reply: { surfaces: ['review-thread-reply'], quoted: false },
  };
  assert.deepEqual(Object.keys(KINDS).sort(), Object.keys(table).sort());
  for (const [kind, row] of Object.entries(table)) {
    for (const surface of ['issue', 'pull-request', 'issue-comment', 'pull-request-review', 'review-thread-reply']) {
      if (row.surfaces.includes(surface)) continue;
      refuses(run(t, surface, { ...BASE[surface], kind }), 'post/kind', 'kind');
    }
  }
  // Each kind on its own surfaces passes a dry run, given what the kind needs.
  for (const [kind, row] of Object.entries(table)) {
    for (const surface of row.surfaces) {
      const base = BASE[surface];
      let doc = { ...without(base, 'quote', 'intent'), kind, ...(row.quoted ? { quote: [QUOTE], intent: INTENT } : {}) };
      if (kind === 'status') doc = { ...doc, signer: 'status-5' };
      if (kind === 'decision') doc = { ...doc, intent: { ...INTENT, status: 'confirmed' } };
      const r = run(t, surface, doc);
      assert.equal(r.code, 0, `${kind} on ${surface}: ${out(r)}`);
    }
  }
});

// #524 C3
test('C3: quote or intent on a kind that refuses them is refused, and so is their absence on a kind that needs them', t => {
  for (const kind of ['status', 'note', 'lens-report']) {
    const signer = kind === 'status' ? 'status-5' : 'build-524';
    refuses(run(t, 'issue-comment', { ...NOTE, kind, signer, quote: [QUOTE] }), 'post/field', 'quote');
    refuses(run(t, 'issue-comment', { ...NOTE, kind, signer, intent: INTENT }), 'post/field', 'intent');
  }
  refuses(run(t, 'pull-request-review', { ...BASE['pull-request-review'], quote: [QUOTE] }), 'post/field', 'quote');
  refuses(run(t, 'review-thread-reply', { ...BASE['review-thread-reply'], intent: INTENT }), 'post/field', 'intent');
  for (const [surface, doc] of [['issue', ISSUE], ['pull-request', BASE['pull-request']], ['issue-comment', SPEC], ['issue-comment', DECISION]]) {
    const r = run(t, surface, without(doc, 'quote', 'intent'));
    assert.ok(has(r, 'post/missing', 'quote') && has(r, 'post/missing', 'intent'), `${doc.kind}: ${out(r)}`);
  }
});

// #524 C3
test('C3: a status post signed other than status-<issue>, and any other kind signed status-<n>, are refused post/signer', t => {
  const status = { ...NOTE, kind: 'status', signer: 'status-5' };
  assert.equal(run(t, 'issue-comment', status).code, 0);
  refuses(run(t, 'issue-comment', { ...status, signer: 'build-524' }), 'post/signer', 'signer');
  refuses(run(t, 'issue-comment', { ...status, signer: 'status-6' }), 'post/signer', 'signer');
  refuses(run(t, 'issue-comment', { ...status, signer: 'status-05' }), 'post/signer', 'signer');
  refuses(run(t, 'issue-comment', { ...NOTE, signer: 'status-5' }), 'post/signer', 'signer');
  refuses(run(t, 'issue', { ...ISSUE, signer: 'status-5' }), 'post/signer', 'signer');
  refuses(run(t, 'pull-request-review', { ...BASE['pull-request-review'], signer: 'status-7' }), 'post/signer', 'signer');
});

// #524 C3, S4.1
test('C3: a chat-marked decision posted pending is refused, and so is a confirmed read-back with a relayed or tracker passage', t => {
  refuses(run(t, 'issue-comment', { ...DECISION, intent: { ...INTENT, status: 'pending' } }), 'post/status', 'intent.status');
  const relayed = { text: 'The owner said this plainly.', source: 'relayed', via: 'backlog-lead', when: '2026-11-10' };
  const tracker = { text: 'The owner said this plainly, on the tracker.', source: 'tracker', comment: 7777, when: '2026-11-10' };
  // A relayed decision carries no mark, so it may be pending; it may never be confirmed.
  assert.equal(run(t, 'issue-comment', { ...DECISION, quote: [relayed], intent: INTENT }).code, 0);
  for (const [surface, doc] of [['issue', ISSUE], ['pull-request', BASE['pull-request']], ['issue-comment', SPEC], ['issue-comment', DECISION]]) {
    for (const passage of [relayed, tracker, QUOTE]) {
      for (const quote of [[passage], [QUOTE, passage]]) {
        const r = run(t, surface, { ...doc, quote, intent: { ...INTENT, status: 'confirmed' } });
        const allChat = quote.every(q => q.source === 'chat');
        if (allChat) assert.equal(r.code, 0, out(r));
        else refuses(r, 'post/status', 'intent.status');
      }
    }
  }
});

// #524 C3: answers belong to a decision
test('C3: answers on a kind other than decision is refused post/field', t => {
  refuses(run(t, 'issue-comment', { ...SPEC, answers: 'issue 5' }), 'post/field', 'answers');
  refuses(run(t, 'issue-comment', { ...NOTE, answers: 'issue 5' }), 'post/field', 'answers');
  assert.equal(run(t, 'issue-comment', { ...DECISION, answers: 'issue 5' }).code, 0);
  assert.equal(run(t, 'issue-comment', { ...DECISION, answers: 'pull request 7' }).code, 0);
  assert.equal(run(t, 'issue-comment', { ...DECISION, answers: 'comment 9001' }).code, 0);
});

// ---------------------------------------------------------------- C4: the quote and the read-back

// #524 C4
test('C4: a tracker passage without its comment, a comment on another source, and a via without a relay are refused', t => {
  refuses(run(t, 'issue', { ...ISSUE, quote: [{ ...QUOTE, source: 'tracker' }] }), 'post/missing', 'quote[0].comment');
  refuses(run(t, 'issue', { ...ISSUE, quote: [{ ...QUOTE, comment: 5 }] }), 'post/field', 'quote[0].comment');
  refuses(run(t, 'issue', { ...ISSUE, quote: [{ ...QUOTE, source: 'relayed' }] }), 'post/missing', 'quote[0].via');
  refuses(run(t, 'issue', { ...ISSUE, quote: [{ ...QUOTE, via: 'backlog-lead' }] }), 'post/field', 'quote[0].via');
  refuses(run(t, 'issue', { ...ISSUE, quote: [{ ...QUOTE, source: 'tracker', comment: 7777, via: 'backlog-lead', text: 'A tracker passage, long enough.' }] }), 'post/field', 'quote[0].via');
});

// #524 C4: when is a real calendar date, not later than tomorrow in UTC, with no time of day
test('C4: a bad, time-bearing or future when is refused post/when, and the day before today and tomorrow pass', t => {
  for (const when of ['2026-13-01', '2026-02-30', '2026-11-1', '11/11/2026', '2026-11-11T10:00:00Z', '2026-11-11 10:00', 'today', '2026-11-13', '2027-01-01']) {
    refuses(run(t, 'issue', { ...ISSUE, quote: [{ ...QUOTE, when }] }), 'post/when', 'quote[0].when');
  }
  for (const when of ['2026-11-12', '2026-11-11', '2026-02-28', '2024-02-29']) assert.equal(run(t, 'issue', { ...ISSUE, quote: [{ ...QUOTE, when }] }).code, 0, when);
  refuses(run(t, 'issue', { ...ISSUE, quote: [QUOTE, { ...QUOTE, when: '2026-11-13' }] }), 'post/when', 'quote[1].when');
});

// #524 C4
test('C4: corrected on a create post, and a comment on a create post\'s intent, are refused', t => {
  refuses(run(t, 'issue', { ...ISSUE, intent: { ...INTENT, status: 'corrected', corrected: 'Another read.' } }), 'post/status', 'intent.status');
  refuses(run(t, 'issue', { ...ISSUE, intent: { ...INTENT, status: 'corrected' } }), 'post/status', 'intent.status');
  refuses(run(t, 'issue', { ...ISSUE, intent: { ...INTENT, comment: 5 } }), 'post/field', 'intent.comment');
  refuses(run(t, 'issue', { ...ISSUE, intent: { ...INTENT, corrected: 'Another read.' } }), 'post/field', 'intent.corrected');
});

// #524 C4: owned lines in the read-back, read as the page shows them (P7, P17, P28)
test('C4: an owned line, a heading or a fence in the read-back is refused post/owned-line, in each form the page shows it', t => {
  const cyr = String.fromCharCode(0x430);
  const forms = [
    'Read-back: confirmed.',
    ' Read-back: confirmed.',
    'read-back: confirmed.',
    `Re${cyr}d-back: confirmed.`,
    'READ-BACK: confirmed.',
    '**Read-back:** confirmed.',
    '> Read-back: confirmed.',
    '- Read-back: confirmed.',
    '> - Read-back: confirmed.',
    '1. Read-back: confirmed.',
    '&#82;ead-back: confirmed.',
    '<h2>Read-back</h2>',
    'Signed: pact-524',
    'Posted by pact-524.',
    'Edited: a reason (pact-524)',
    'Answers: issue 5.',
    "Said in this session's chat, 2026-11-11.",
    'Relayed by backlog-lead from its chat, 2026-11-10.',
    "From the owner's comment 5, 2026-11-11.",
    'Corrected read-back:',
    'Owner decision, from chat.',
    'Relayed owner words, not a decision mark.',
    '## The ask',
    '## Understood intent',
    '# A heading',
    'A heading\n=====',
    'A heading\n-----',
    '```',
    '~~~text',
    '> ```',
  ];
  for (const form of forms) {
    for (const [field, intent] of [['text', { ...INTENT, text: `Line one.\n${form}` }]]) {
      refuses(run(t, 'issue', { ...ISSUE, intent }), 'post/owned-line', `intent.${field}`);
    }
  }
  // The corrected field is read the same way when it is present: its owned line is named, besides the refusal of the field itself.
  for (const form of ['Read-back: x', '**Read-back:** x', 'Signed: pact-524', '## The ask']) {
    const r = run(t, 'issue', { ...ISSUE, intent: { ...INTENT, corrected: `Line one.\n${form}` } });
    assert.equal(r.code, 2);
    assert.ok(has(r, 'post/owned-line', 'intent.corrected'), out(r));
  }
  // Plain lines pass, however many.
  assert.equal(run(t, 'issue', { ...ISSUE, intent: { ...INTENT, text: 'Line one.\n\nLine two, which mentions a read-back in passing.' } }).code, 0);
});

// #524 C4: nothing before the signature may hide it (P7, P19)
test('C4: an unclosed comment or fold in the read-back or the body file is refused text/hidden-line', t => {
  for (const hide of ['<!-- note', '<details>', 'text <!-- note']) {
    refuses(run(t, 'issue', { ...ISSUE, intent: { ...INTENT, text: hide } }), 'text/hidden-line', 'intent.text');
    refuses(run(t, 'issue-comment', NOTE, { body: `${hide}\n` }), 'text/hidden-line', 'body_file');
  }
  // A quote that opens a comment would hide what follows it on the page.
  const r = run(t, 'issue', { ...ISSUE, quote: [{ ...QUOTE, text: 'Said <!-- aloud' }] });
  assert.ok(has(r, 'text/hidden-line', 'body'), out(r));
  // Closed ones pass.
  assert.equal(run(t, 'issue-comment', NOTE, { body: 'A <!-- note --> and <details><summary>x</summary>y</details>.\n' }).code, 0);
});

// ---------------------------------------------------------------- C4: the tracker read

/** A fake GitHub for a tracker read: the login, the repo, comments by id, and one post with its read-back. */
function world({ comments = {}, login = ME, fail = {} } = {}) {
  const calls = [];
  const stored = new Map();
  const gh = (args, input) => {
    calls.push({ args: [...args], input });
    const method = args[args.indexOf('--method') + 1];
    const path = args[args.indexOf('--method') + 2];
    if (fail[path]) return { ok: false, stdout: '', stderr: fail[path] };
    if (method === 'GET' && path === 'user') return { ok: true, stdout: JSON.stringify({ login }), stderr: '' };
    if (method === 'GET' && path === `repos/${TARGET}`) return { ok: true, stdout: JSON.stringify({ owner: { login } }), stderr: '' };
    let m;
    if (method === 'GET' && (m = path.match(/^repos\/[^/]+\/[^/]+\/issues\/comments\/(\d+)$/)) && Object.hasOwn(comments, m[1])) return { ok: true, stdout: JSON.stringify(comments[m[1]]), stderr: '' };
    if (method === 'POST' && /\/issues\/\d+\/comments$/.test(path)) {
      const item = { id: 9001, body: JSON.parse(input).body, issue_url: `${API}/issues/5`, user: { login } };
      stored.set(`repos/${TARGET}/issues/comments/9001`, item);
      return { ok: true, stdout: JSON.stringify(item), stderr: '' };
    }
    if (method === 'POST' && path === `repos/${TARGET}/issues`) {
      const req = JSON.parse(input);
      const item = { number: 42, title: req.title, body: req.body, labels: (req.labels ?? []).map(name => ({ name })), user: { login } };
      stored.set(`repos/${TARGET}/issues/42`, item);
      return { ok: true, stdout: JSON.stringify(item), stderr: '' };
    }
    if (method === 'GET' && stored.has(path)) return { ok: true, stdout: JSON.stringify(stored.get(path)), stderr: '' };
    return { ok: false, stdout: '', stderr: 'HTTP 404: Not Found' };
  };
  return { gh, calls, stored };
}

const TRACKED = 'I want the poster to take a strict JSON post, with a quote.';
const tracker = (text = TRACKED, comment = 7777) => ({ text, source: 'tracker', comment, when: '2026-11-10' });
const comment = (body = `Earlier text. ${TRACKED} Later text.`, login = ME, issue = 3) => ({ id: 7777, body, user: { login }, issue_url: `${API}/issues/${issue}` });
const trackerRun = (t, w, quote, opts = {}) => run(t, 'issue', { ...ISSUE, quote }, { gh: w.gh, dry: false, ...opts });

// #524 C4: a read that finds the passage in the owner's own comment posts
test('C4: a tracker passage found in the login\'s own comment in this repo posts, after the owner checks, with one read of the comment', t => {
  const w = world({ comments: { 7777: comment() } });
  const r = trackerRun(t, w, [tracker()]);
  assert.equal(r.code, 0, out(r));
  assert.deepEqual(w.calls.map(c => c.args[c.args.indexOf('--method') + 2]), ['user', `repos/${TARGET}`, `repos/${TARGET}/issues/comments/7777`, `repos/${TARGET}/issues`, `repos/${TARGET}/issues/42`]);
  // CRLF in the comment, and a passage that leaves a span out, are found too.
  const crlf = world({ comments: { 7777: comment('Earlier.\r\nI want the poster to take a strict JSON post,\r\nwith a quote.\r\nLater.') } });
  assert.equal(trackerRun(t, crlf, [tracker('I want the poster to take a strict JSON post,\nwith a quote.')]).code, 0);
  const left = world({ comments: { 7777: comment('I want the poster to take a strict JSON post, with MY SECRET in it, and a quote after.') } });
  assert.equal(trackerRun(t, left, [tracker('I want the poster to take a strict JSON post, with [left out] in it, and a quote after.')]).code, 0);
});

// #524 C4: P20, P25
test('C4: a tracker passage whose comment is another author\'s, in another repo, or lacks its text is refused post/tracker, with none of the comment in the output', t => {
  const secretBody = 'A private line of the comment, zzcommenttext, that must never be echoed.';
  const rows = [
    ['another author', comment(`${secretBody} ${TRACKED}`, 'someone'), 'quote[0].comment'],
    ['another repo', { ...comment(`${secretBody} ${TRACKED}`), issue_url: 'https://api.github.com/repos/tester/other/issues/3' }, 'quote[0].comment'],
    ['another owner', { ...comment(`${secretBody} ${TRACKED}`), issue_url: 'https://api.github.com/repos/someone/sandbox/issues/3' }, 'quote[0].comment'],
    ['a text that is not in it', comment(secretBody), 'quote[0].text'],
    // Every part is there, but in the wrong order.
    ['a span left out where the parts are out of order', comment('Then with a quote. and then more. Before it, I want the poster to take a strict JSON post'), 'quote[0].text'],
    // The comment's URL ends in this repo's path, but the comment sits in another repo.
    ['a URL that only ends in this repo\'s path', { ...comment(`${secretBody} ${TRACKED}`), issue_url: `https://api.github.com/repos/someone/x${API.slice('https://api.github.com'.length)}/issues/3` }, 'quote[0].comment'],
  ];
  for (const [what, item, where] of rows) {
    const w = world({ comments: { 7777: item } });
    const quote = what.startsWith('a span') ? [tracker('I want the poster to take [left out] with a quote. and then more')] : [tracker()];
    const r = trackerRun(t, w, quote);
    refuses(r, 'post/tracker', where, ['zzcommenttext', secretBody]);
    assert.equal(w.calls.filter(c => c.args.includes('POST')).length, 0, what);
  }
});

// #524 C4: P27
test('C4: a tracker passage with under 20 characters outside its left-out spans, touching spans, or four spans is refused post/tracker', t => {
  const body = 'I want the poster to take a strict JSON post, with a quote, and more words after it here.';
  for (const text of [
    'short',
    '[left out] short [left out]',
    'I want the poster [left out][left out] after it here.',
    'I [left out] want [left out] the [left out] poster [left out] to take a strict JSON post.',
  ]) {
    const w = world({ comments: { 7777: comment(body) } });
    const r = trackerRun(t, w, [tracker(text)]);
    refuses(r, 'post/tracker', 'quote[0].text');
    assert.equal(w.calls.length, 0, 'a shape refusal reads nothing');
  }
  const ok = world({ comments: { 7777: comment(body) } });
  assert.equal(trackerRun(t, ok, [tracker('I want the poster to take [left out], and more words[left out] after it here.')]).code, 0);
});

// #524 C4: a read that fails, or gives nothing usable, ends unavailable
test('C4: a tracker comment read that fails, or whose id is missing, ends unavailable, and nothing is sent', t => {
  const bad = [
    world({ comments: {}, fail: {} }),
    world({ comments: { 7777: comment() }, fail: { [`repos/${TARGET}/issues/comments/7777`]: 'HTTP 502 zzmarker' } }),
    world({ comments: { 7777: { id: 7777, body: 5, user: { login: ME }, issue_url: `${API}/issues/3` } } }),
    world({ comments: { 7777: { id: 7777, body: 'x', user: 'nobody', issue_url: `${API}/issues/3` } } }),
  ];
  for (const w of bad) {
    const r = trackerRun(t, w, [tracker()]);
    assert.equal(r.code, 4, out(r));
    assert.equal(r.lines.at(-1), 'RESULT: unavailable');
    assert.equal(w.calls.filter(c => c.args.includes('POST')).length, 0);
  }
});

// #524 C4, S3.2: a create dry run reads nothing and says so
test('C4: a create post\'s dry run with a tracker passage reads nothing and prints its fixed line; without one it prints none', t => {
  const r = run(t, 'issue', { ...ISSUE, quote: [tracker()] });
  assert.equal(r.code, 0, out(r));
  assert.deepEqual(r.lines.slice(-2), ['dry-run: no tracker comment was read; post/tracker did not run', 'RESULT: dry-run issue']);
  assert.ok(!out(run(t, 'issue', ISSUE)).includes('tracker'));
});

// ---------------------------------------------------------------- C5: the rendered body

/** The body a live post sends, by surface and document. */
function sent(t, surface, doc, body) {
  const w = world();
  const r = run(t, surface, doc, { gh: w.gh, dry: false, body });
  assert.equal(r.code, 0, out(r));
  return JSON.parse(w.calls.find(c => c.args.includes('POST')).input).body;
}

// #524 C5: the spec's literal
test('C5: the rendered body of a two-passage issue, pending, is the spec\'s literal text', t => {
  const doc = {
    ...ISSUE,
    signer: 'issue-524',
    quote: [
      { text: 'First line of the first passage.\nIts second line.', source: 'chat', when: '2026-11-11' },
      { text: 'The second passage.', source: 'relayed', via: 'backlog-lead', when: '2026-11-10' },
    ],
    intent: { text: 'The read-back.', status: 'pending' },
  };
  const expected = [
    '## The ask',
    '',
    '> First line of the first passage.',
    '> Its second line.',
    '',
    "Said in this session's chat, 2026-11-11.",
    '',
    '> The second passage.',
    '',
    'Relayed by backlog-lead from its chat, 2026-11-10.',
    '',
    '## Understood intent',
    '',
    'The read-back.',
    '',
    'Read-back: not yet confirmed.',
    '',
    "The body file's text.",
    '',
    'Signed: issue-524',
  ].join('\n');
  assert.equal(sent(t, 'issue', doc, "The body file's text.\n"), expected);
});

// #524 C5
test('C5: a CRLF passage, an empty quote line, a tracker source line and a confirmed read-back render as written', t => {
  const quote = [
    { text: 'one\r\ntwo\rthree\n\nfour', source: 'chat', when: '2026-11-11' },
    { text: 'A tracker passage, long enough to pass.', source: 'tracker', comment: 7777, when: '2026-11-10' },
  ];
  const w = world({ comments: { 7777: comment('A tracker passage, long enough to pass.') } });
  const r = run(t, 'issue', { ...ISSUE, quote, intent: { ...INTENT, status: 'pending' } }, { gh: w.gh, dry: false });
  assert.equal(r.code, 0, out(r));
  const body = JSON.parse(w.calls.find(c => c.args.includes('POST')).input).body;
  assert.ok(body.startsWith('## The ask\n\n> one\n> two\n> three\n>\n> four\n\nSaid in this session\'s chat, 2026-11-11.\n\n> A tracker passage, long enough to pass.\n\nFrom the owner\'s comment 7777, 2026-11-10.\n\n## Understood intent'), body);
  const confirmed = sent(t, 'issue', { ...ISSUE, intent: { ...INTENT, status: 'confirmed' } }, 'Body.\n');
  assert.ok(confirmed.includes("\n\nI read it so.\n\nRead-back: confirmed in this session's chat.\n\nBody.\n\nSigned: plan-524"), confirmed);
});

// #524 C5, R4: the mark follows the sources
test('C5: a decision carries the chat mark when every passage was said in chat, the relayed line otherwise, and an Answers line when it answers', t => {
  const chat = sent(t, 'issue-comment', { ...DECISION, answers: 'issue 5' }, 'Body.\n');
  assert.ok(chat.startsWith("Owner decision, from chat.\n\nAnswers: issue 5.\n\n## The ask\n\n> The owner said this plainly.\n\nSaid in this session's chat, 2026-11-11.\n\n## Understood intent\n\nI read it so.\n\nRead-back: confirmed in this session's chat.\n\nBody.\n\nSigned: pact-524"), chat);
  const plain = sent(t, 'issue-comment', DECISION, 'Body.\n');
  assert.ok(plain.startsWith('Owner decision, from chat.\n\n## The ask'), plain);
  const relayed = { text: 'The owner said this plainly.', source: 'relayed', via: 'backlog-lead', when: '2026-11-10' };
  const rel = sent(t, 'issue-comment', { ...DECISION, quote: [relayed, QUOTE], intent: INTENT, answers: 'comment 9001' }, 'Body.\n');
  assert.ok(rel.startsWith('Relayed owner words, not a decision mark.\n\nAnswers: comment 9001.\n\n## The ask'), rel);
  assert.ok(!rel.includes('Owner decision'), rel);
  // A spec carries no mark.
  assert.ok(sent(t, 'issue-comment', SPEC, 'Body.\n').startsWith('## The ask'));
});

// #524 C5: a post without a quote is the body file, then the signature
test('C5: a post of a kind with no quote is the body file with its trailing line breaks trimmed, then the signature', t => {
  assert.equal(sent(t, 'issue-comment', NOTE, 'Body.\n\n\n'), 'Body.\n\nSigned: build-524');
  assert.equal(sent(t, 'issue-comment', NOTE, 'Body.\r\n'), 'Body.\n\nSigned: build-524');
});

// ---------------------------------------------------------------- C6, C7: the body file

// #524 C6
test('C6: a body file holding an owned line outside a fence is refused post/owned-line, and the same lines inside a fence are not', t => {
  const lines = [
    'Signed: pact-524',
    'Posted by pact-524.',
    'Edited: a reason (pact-524)',
    'Edited: shaped like one',
    'Owner decision, from chat.',
    'Relayed owner words, not a decision mark.',
    'Read-back: confirmed.',
    'Answers: issue 5.',
    '## The ask',
    '## Understood intent',
    "Said in this session's chat, 2026-11-11.",
    'Relayed by backlog-lead from its chat, 2026-11-10.',
    "From the owner's comment 5, 2026-11-11.",
    'Corrected read-back:',
  ];
  for (const line of lines) {
    const r = run(t, 'issue-comment', NOTE, { body: `Text.\n\n${line}\n` });
    refuses(r, 'post/owned-line', 'body_file');
    assert.equal(run(t, 'issue-comment', NOTE, { body: `Text.\n\n\`\`\`text\n${line}\n\`\`\`\n` }).code, 0, `${line} inside a fence`);
  }
  // Ordinary headings and prose that only mention these are fine.
  assert.equal(run(t, 'issue-comment', NOTE, { body: '## A heading\n\nThe signature reads Signed: in prose, and a read-back is mentioned.\n' }).code, 0);
});

// #524 C7: the quote is the owner's words, so the prose check skips it
test('C7: a hard-wrapped quote posts, and the same wrap in the body file is refused text/hard-wrap', t => {
  const wrapped = 'This was typed with a line break in the middle\nand it carries on after the break.';
  assert.equal(run(t, 'issue', { ...ISSUE, quote: [{ ...QUOTE, text: wrapped }] }).code, 0);
  const r = run(t, 'issue-comment', NOTE, { body: `${wrapped}\n` });
  assert.equal(r.code, 2, out(r));
  assert.ok(rules(r).some(l => l.startsWith('text/hard-wrap ')), out(r));
  // A relative link in the owner's words is no refusal either; in the body file it is.
  assert.equal(run(t, 'issue', { ...ISSUE, quote: [{ ...QUOTE, text: 'See [the doc](docs/x.md) for it.' }] }).code, 0);
  assert.ok(rules(run(t, 'issue-comment', NOTE, { body: 'See [the doc](docs/x.md) for it.\n' })).some(l => l.startsWith('link/relative ')));
});

// ---------------------------------------------------------------- the forms T1 can't reach from a command line

// #524 C5: S5.1's confirmed-in-comment and corrected forms, rendered by the poster's own function, for T2's ask-item edits to use
test('C5: the confirmed-in-comment and corrected read-back forms render as S5.1 writes them', () => {
  const plan = intent => ({ kind: 'spec', signer: 'spec-524', quote: [QUOTE], intent, sessionPart: 'Body.\n' });
  const head = "## The ask\n\n> The owner said this plainly.\n\nSaid in this session's chat, 2026-11-11.\n\n## Understood intent\n\n";
  assert.equal(renderBody(plan({ text: 'I read it so.', status: 'confirmed', comment: 12 })), `${head}I read it so.\n\nRead-back: confirmed in comment 12.\n\nBody.\n\nSigned: spec-524`);
  const corrected = renderBody(plan({ text: 'First para.\n\nSecond para.', status: 'corrected', comment: 12, corrected: 'The better read.' }));
  assert.equal(corrected, `${head}~~First para.~~\n\n~~Second para.~~\n\nCorrected read-back:\n\nThe better read.\n\nRead-back: corrected in comment 12.\n\nBody.\n\nSigned: spec-524`);
});

// #524 C4, S5.3 (P19): a comment opened on a quoted line ends where the quote ends, so its closer must sit inside the quote too
test('C4: a comment opened in a quote, with its closer after the quote, is refused text/hidden-line', t => {
  // In the owner's words, with the closer in the body file.
  const inPassage = run(t, 'issue', { ...ISSUE, quote: [{ ...QUOTE, text: 'Said <!-- aloud' }] }, { body: 'Then --> this.\n' });
  assert.ok(has(inPassage, 'text/hidden-line', 'body'), out(inPassage));
  // Entirely in the body file: a quoted opener, then the closer in a later paragraph.
  const inBody = run(t, 'issue-comment', NOTE, { body: '> <!-- a note\n\nThen --> this.\n' });
  refuses(inBody, 'text/hidden-line', 'body_file');
  // Opened and closed inside one quote, it is fine.
  assert.equal(run(t, 'issue-comment', NOTE, { body: '> a <!-- note --> b\n\nPlain.\n' }).code, 0);
});
