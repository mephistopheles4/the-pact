// The cross script's fail-closed checks (#44). Every refusal exits 1, writes
// no section, still writes every report in its fence and fold with its count,
// and names the rule that fired. Nothing from a failing report is echoed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIMIT, PROMPT, block, cross, finding, qaPair, report } from './cross-helpers.mjs';

const CANARY = 'ZQXCANARY';

/** Assert the fail-closed shape: exit 1, exactly `rules`, no section, every report folded and counted. */
function refused(r, rules, reports) {
  assert.equal(r.code, 1, r.stdout);
  assert.deepEqual(r.rules, rules, r.stdout);
  assert.match(r.stdout, /^RESULT: fail$/m);
  assert.ok(!r.all.includes(PROMPT), 'no prompt');
  assert.ok(!r.all.includes('```mermaid'), 'no map');
  assert.ok(!r.all.includes('| Anchor |'), 'no matrix');
  assert.ok(!r.page, 'no page');
  for (const [lens, text] of Object.entries(reports)) {
    assert.ok(r.all.includes(`<summary>Verbatim report: <code>${lens}</code>. Hidden or control characters: `), `${lens} folded and counted`);
    assert.ok(r.all.includes(`text\n${text}`), `${lens} written byte for byte in its fence`);
  }
}

/** A QA pair whose integrity-lens block is `b`, raw JSON text or an object. */
function qaWith(b) {
  return { 'behaviour-lens': report(block('behaviour-lens', 'clear')), 'integrity-lens': report(b) };
}

const symbol = (file, sym = 'retry') => ({ kind: 'symbol', file, symbol: sym });
function securityPair(dataFinding, extraA = {}) {
  return {
    'adversarial-lens': report(block('adversarial-lens', 'findings', [finding('F1', symbol('src/a.js'), 'medium', 'An attack path reaches the token store', { likelihood: 'low', ...extraA })])),
    'data-lens': report(block('data-lens', 'findings', [dataFinding])),
  };
}
const SECURITY = { point: 'diff', anchors: null, tier: 'thorough' };

// ------------------------------------------------------------ the findings block

test('refused: two lens-findings blocks', t => {
  const reports = qaWith(block('integrity-lens', 'clear'));
  reports['integrity-lens'] = report(block('integrity-lens', 'clear'), { after: `\n\`\`\`lens-findings\n${JSON.stringify(block('integrity-lens', 'clear'))}\n\`\`\`\n` });
  refused(cross(t, { reports }), ['block-count'], reports);
});

test('refused: no lens-findings block at all', t => {
  const reports = { ...qaWith(block('integrity-lens', 'clear')), 'integrity-lens': 'A report with no block.\n' };
  refused(cross(t, { reports }), ['block-count'], reports);
});

test('refused: an anchor of the wrong kind for its area', t => {
  const reports = qaWith(block('integrity-lens', 'findings', [finding('F1', 'S1', 'low', 'A section anchor in a result review')]));
  refused(cross(t, { reports }), ['anchor-kind'], reports);
});

test('refused: an unlisted C99, and an unlisted S99 on the spec pair', t => {
  const reports = qaWith(block('integrity-lens', 'findings', [finding('F1', 'C99', 'low', 'A claim nobody listed')]));
  refused(cross(t, { reports }), ['anchor-unlisted'], reports);
  const spec = {
    'executability-lens': report(block('executability-lens', 'findings', [finding('F1', 'S99', 'low', 'A section nobody listed')])),
    'good-enough-lens': report(block('good-enough-lens', 'clear')),
  };
  refused(cross(t, { reports: spec, point: 'spec', anchors: 'S1,S2' }), ['anchor-unlisted'], spec);
});

test('refused: a bad severity', t => {
  const reports = qaWith(block('integrity-lens', 'findings', [finding('F1', 'C1', 'critical', 'A severity outside the three')]));
  refused(cross(t, { reports }), ['severity'], reports);
});

test('refused: likelihood on integrity-lens', t => {
  const reports = qaWith(block('integrity-lens', 'findings', [finding('F1', 'C1', 'low', 'A likelihood where none belongs', { likelihood: 'low' })]));
  refused(cross(t, { reports }), ['likelihood'], reports);
});

test('refused: likelihood missing on adversarial-lens', t => {
  const reports = securityPair(finding('F1', symbol('src/b.js'), 'low', 'The token is logged', { likelihood: 'low', data: 'session token' }));
  reports['adversarial-lens'] = report(block('adversarial-lens', 'findings', [finding('F1', symbol('src/a.js'), 'medium', 'No likelihood given')]));
  refused(cross(t, { reports, ...SECURITY }), ['likelihood'], reports);
});

test('refused: data-lens without data, and data on any other lens', t => {
  const reports = securityPair(finding('F1', symbol('src/b.js'), 'low', 'The token is logged', { likelihood: 'low' }));
  refused(cross(t, { reports, ...SECURITY }), ['data'], reports);
  const other = securityPair(finding('F1', symbol('src/b.js'), 'low', 'The token is logged', { likelihood: 'low', data: 'session token' }), { data: 'session token' });
  refused(cross(t, { reports: other, ...SECURITY }), ['data'], other);
});

test('refused: a path of 201 characters; 200 passes', t => {
  const path = n => `src/${'a'.repeat(n - 7)}.js`;
  assert.equal(path(201).length, 201);
  const reports = securityPair(finding('F1', symbol(path(201)), 'low', 'The token is logged', { likelihood: 'low', data: 'session token' }));
  refused(cross(t, { reports, ...SECURITY }), ['path'], reports);
  const ok = cross(t, { reports: securityPair(finding('F1', symbol(path(200)), 'low', 'The token is logged', { likelihood: 'low', data: 'session token' })), ...SECURITY });
  assert.equal(ok.code, 0, ok.stdout);
});

test('refused: a path that climbs out with ".." or starts at the root', t => {
  for (const p of ['src/../../etc/passwd', '/etc/passwd']) {
    const reports = securityPair(finding('F1', symbol(p), 'low', 'The token is logged', { likelihood: 'low', data: 'session token' }));
    refused(cross(t, { reports, ...SECURITY }), ['path'], reports);
  }
});

test("refused: a report whose lens differs from the dispatched lens", t => {
  const reports = qaWith(block('behaviour-lens', 'clear'));
  refused(cross(t, { reports }), ['lens'], reports);
});

test('refused: two files from different areas', t => {
  const reports = { 'behaviour-lens': report(block('behaviour-lens', 'clear')), 'data-lens': report(block('data-lens', 'clear')) };
  refused(cross(t, { reports }), ['area'], reports);
});

test('refused: half a pair, one lens without its partner', t => {
  const reports = { 'behaviour-lens': report(block('behaviour-lens', 'clear')) };
  refused(cross(t, { reports }), ['area'], reports);
});

test('refused: a security-pair report with any tier below thorough', t => {
  for (const tier of ['quick', 'standard']) {
    const reports = securityPair(finding('F1', symbol('src/b.js'), 'low', 'The token is logged', { likelihood: 'low', data: 'session token' }));
    refused(cross(t, { reports, ...SECURITY, tier }), ['tier'], reports);
  }
});

test('refused: a verdict that disagrees with its findings', t => {
  const cases = [
    block('integrity-lens', 'clear', [finding('F1', 'C1', 'low', 'A finding under a clear verdict')]),
    block('integrity-lens', 'blocking', [finding('F1', 'C1', 'medium', 'Blocking with no high finding')]),
    block('integrity-lens', 'findings', [finding('F1', 'C1', 'high', 'A high finding under findings')]),
    block('integrity-lens', 'findings', []),
  ];
  for (const b of cases) {
    const reports = qaWith(b);
    refused(cross(t, { reports }), ['agreement'], reports);
  }
});

test('refused: an unknown key, a duplicate key, and broken JSON', t => {
  const unknown = qaWith(block('integrity-lens', 'clear', [], { extra: 1 }));
  refused(cross(t, { reports: unknown }), ['schema'], unknown);
  const dup = qaWith(JSON.stringify(block('integrity-lens', 'clear')).replace('{', '{"Lens":"integrity-lens",'));
  refused(cross(t, { reports: dup }), ['duplicate'], dup);
  const broken = qaWith('{"lens": "integrity-lens",');
  refused(cross(t, { reports: broken }), ['json'], broken);
});

// ------------------------------------------------------------ the verdicts

test('inconclusive with no findings passes; inconclusive with a high finding is refused', t => {
  const ok = cross(t, { reports: qaWith(block('integrity-lens', 'inconclusive')) });
  assert.equal(ok.code, 0, ok.stdout);
  const reports = qaWith(block('integrity-lens', 'inconclusive', [finding('F1', 'C1', 'high', 'A high finding under inconclusive')]));
  refused(cross(t, { reports }), ['agreement'], reports);
});

// ------------------------------------------------------------ the character check

/** A QA pair whose integrity-lens headline is `escape`, written into the JSON text as is. */
function headlineWith(escape) {
  const text = JSON.stringify(block('integrity-lens', 'findings', [finding('F1', 'C1', 'low', 'HEADLINE')]), null, 2).replace('"HEADLINE"', `"before ${escape} after"`);
  return qaWith(text);
}

const CHARACTERS = [
  ['\\n', 'characters'],
  ['\\t', 'characters'],
  ['\\u202e', 'invisible'],
  ['\\u2028', 'characters'],
  ['\\u0000', 'characters'],
  ['\\u200b', 'invisible'],
  ['\\u2705', 'pictograph'],
  [String.fromCodePoint(0x2714), 'pictograph'],
  [String.fromCodePoint(0x274c), 'pictograph'],
  [String.fromCodePoint(0x271a), 'mark'],
];
for (const [escape, rule] of CHARACTERS) {
  const name = escape.startsWith('\\') ? escape : `U+${escape.codePointAt(0).toString(16).toUpperCase()}`;
  test(`the character check refuses ${name} in a headline, by the ${rule} rule`, t => {
    const reports = headlineWith(escape);
    refused(cross(t, { reports }), [rule], reports);
  });
}

test('the character check applies to every string: notChecked, and a key', t => {
  const nc = qaWith(block('integrity-lens', 'clear', [], { notChecked: ['UNSAFE'] }));
  nc['integrity-lens'] = nc['integrity-lens'].replace('"UNSAFE"', '"a \\u202e b"');
  refused(cross(t, { reports: nc }), ['invisible'], nc);
  // A refused character in a key fires its own rule, before the unknown-key rule.
  const key = qaWith(JSON.stringify(block('integrity-lens', 'clear')).replace('{', '{"a\\u202eb": 1,'));
  refused(cross(t, { reports: key }), ['invisible'], key);
});

// ------------------------------------------------------------ non-risks

const nonRisk = (anchor, note) => ({ anchor: typeof anchor === 'string' ? { kind: 'claim', id: anchor } : anchor, note });

test('non-risks: 21 items refused, 20 pass', t => {
  const n = k => Array.from({ length: k }, (_, i) => nonRisk('C1', `Sound check number ${i + 1}`));
  const reports = qaWith(block('integrity-lens', 'clear', [], { nonRisks: n(21) }));
  refused(cross(t, { reports }), ['nonRisks'], reports);
  assert.equal(cross(t, { reports: qaWith(block('integrity-lens', 'clear', [], { nonRisks: n(20) })) }).code, 0);
});

test('non-risks: a note of 201 characters refused, 200 passes', t => {
  const reports = qaWith(block('integrity-lens', 'clear', [], { nonRisks: [nonRisk('C1', 'n'.repeat(201))] }));
  refused(cross(t, { reports }), ['note'], reports);
  assert.equal(cross(t, { reports: qaWith(block('integrity-lens', 'clear', [], { nonRisks: [nonRisk('C1', 'n'.repeat(200))] })) }).code, 0);
});

test('non-risks: a wrong-kind anchor and an unlisted anchor are refused', t => {
  const wrong = qaWith(block('integrity-lens', 'clear', [], { nonRisks: [nonRisk({ kind: 'section', id: 'S1' }, 'Sound')] }));
  refused(cross(t, { reports: wrong }), ['anchor-kind'], wrong);
  const unlisted = qaWith(block('integrity-lens', 'clear', [], { nonRisks: [nonRisk('C99', 'Sound')] }));
  refused(cross(t, { reports: unlisted }), ['anchor-unlisted'], unlisted);
});

test('non-risks: the character check applies to a note', t => {
  const reports = qaWith(block('integrity-lens', 'clear', [], { nonRisks: [nonRisk('C1', 'NOTE')] }));
  reports['integrity-lens'] = reports['integrity-lens'].replace('"NOTE"', '"sound \\u200b here"');
  refused(cross(t, { reports }), ['invisible'], reports);
});

test('non-risks: a non-risk with a key besides anchor and note is refused', t => {
  const reports = qaWith(block('integrity-lens', 'clear', [], { nonRisks: [{ ...nonRisk('C1', 'Sound'), severity: 'low' }] }));
  refused(cross(t, { reports }), ['nonRisks'], reports);
});

test('non-risks: a clear report with non-risks passes', t => {
  const r = cross(t, { reports: qaWith(block('integrity-lens', 'clear', [], { nonRisks: [nonRisk('C2', 'The retry branch is covered by a real failure')] })) });
  assert.equal(r.code, 0, r.stdout);
});

// ------------------------------------------------------------ refusals echo nothing

/** Each failing field, holding the canary. The block stays valid JSON, so the field's own rule fires. */
const ECHO_CASES = [
  ['severity', b => (b.findings[0].severity = CANARY)],
  ['headline', b => (b.findings[0].headline = CANARY.repeat(20))],
  ['id', b => (b.findings[0].id = CANARY)],
  ['anchor', b => (b.findings[0].anchor.id = CANARY)],
  ['anchor-kind', b => (b.findings[0].anchor.kind = CANARY)],
  ['verdict', b => (b.verdict = CANARY)],
  ['lens', b => (b.lens = CANARY)],
  ['schema', b => (b[CANARY] = CANARY)],
  ['notChecked', b => (b.notChecked = [CANARY.repeat(30)])],
  ['likelihood', b => (b.findings[0].likelihood = CANARY)],
  ['data', b => (b.findings[0].data = CANARY)],
  ['nonRisks', b => (b.nonRisks = Array.from({ length: 21 }, () => nonRisk('C1', CANARY)))],
  ['nonRisks', b => (b.nonRisks = [{ ...nonRisk('C1', CANARY), [CANARY]: CANARY }])],
  ['note', b => (b.nonRisks = [nonRisk('C1', CANARY.repeat(30))])],
  ['anchor-kind', b => (b.nonRisks = [nonRisk({ kind: CANARY, id: 'C1' }, CANARY)])],
  ['anchor-unlisted', b => (b.nonRisks = [nonRisk('C99', CANARY)])],
  ['anchor', b => (b.nonRisks = [nonRisk({ kind: 'claim', id: CANARY }, CANARY)])],
];
for (const [rule, edit] of ECHO_CASES) {
  test(`refusals echo nothing: the ${rule} rule, with the canary in the failing field`, t => {
    const b = block('integrity-lens', 'findings', [finding('F1', 'C1', 'low', 'A plain headline')]);
    edit(b);
    const reports = qaWith(b);
    const r = cross(t, { reports });
    refused(r, [rule], reports);
    assert.ok(!r.stdout.includes(CANARY) && !r.stderr.includes(CANARY), 'nothing from the report on stdout or stderr');
    for (const c of r.comments) {
      const outside = c.replace(/\n(`{4,})text\n[\s\S]*?\n\1\n/g, '\n');
      assert.ok(!outside.includes(CANARY), 'the canary shows only inside the fenced verbatim report');
    }
  });
}

test('refusals echo nothing: the character rules, and a file name made of unsafe characters', t => {
  const b = JSON.stringify(block('integrity-lens', 'findings', [finding('F1', 'C1', 'low', 'HEADLINE')])).replace('"HEADLINE"', `"${CANARY} \\u202e ${CANARY}"`);
  const r = cross(t, { reports: [['behaviour-lens', report(block('behaviour-lens', 'clear'))], ['integrity-lens', report(b), `${CANARY} @here #1 [x](y).md`]] });
  assert.equal(r.code, 1);
  assert.deepEqual(r.rules, ['invisible']);
  assert.match(r.stdout, /^FAIL invisible: ZQXCANARY\?\?here\?\?1\?\?x\?\?y\?\.md: /m, 'the file name is filtered to safe characters');
  const shownFile = r.stdout.split('\n').find(l => l.startsWith('FAIL')).split(': ')[1];
  assert.match(shownFile, /^[A-Za-z0-9._?-]+$/, 'no unsafe character from the file name');
  assert.ok(r.all.includes('`ZQXCANARY??here??1??x??y?.md`'), 'the comment names the filtered file');
});

test('a failing report over the comment limit is kept as a local file, never cut', t => {
  const big = report(block('integrity-lens', 'clear', [finding('F1', 'C1', 'low', 'A finding under clear')]), { before: `${'x'.repeat(200)}\n`.repeat(400) });
  assert.ok(big.length > LIMIT);
  const reports = { 'behaviour-lens': report(block('behaviour-lens', 'clear')), 'integrity-lens': big };
  const r = cross(t, { reports });
  assert.equal(r.code, 1);
  assert.deepEqual(r.rules, ['agreement']);
  assert.match(r.stdout, /^KEPT-LOCAL integrity-lens\.md$/m);
  assert.ok(!r.all.includes('x'.repeat(200)), 'no part of the oversize report is posted');
  assert.ok(r.comments.every(c => c.length <= LIMIT));
  assert.ok(r.all.includes(`text\n${reports['behaviour-lens']}`), 'the other report is still written');
});

test('an unreadable report file is named, and the other reports are still written', t => {
  const integrity = qaPair()['integrity-lens'];
  const r = cross(t, { reports: [['behaviour-lens', null], ['integrity-lens', integrity]] });
  assert.equal(r.code, 1);
  assert.deepEqual(r.rules, ['read']);
  assert.match(r.stdout, /^FAIL read: behaviour-lens\.md: /m);
  assert.match(r.stdout, /^KEPT-LOCAL behaviour-lens\.md$/m);
  assert.ok(r.all.includes(`text\n${integrity}`), 'the readable report is still written');
  assert.ok(!r.all.includes(PROMPT));
});

test('the output folder must be new or empty', t => {
  const first = cross(t, { reports: qaPair() });
  const again = cross(t, { reports: qaPair(), args: ['--point', 'result', '--tier', 'thorough', '--anchors', 'C1,C2,C3,C4', '--out', `${first.dir}/out`] });
  assert.equal(again.code, 1);
  assert.deepEqual(again.rules, ['out']);
});
