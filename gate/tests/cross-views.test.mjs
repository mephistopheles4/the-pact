// What the owner sees (#44): nothing leaks above the prompt, the tier views,
// non-risks only in a fold, safe rendering, and splitting without dropping.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIMIT, PROMPT, abovePrompt, block, cross, finding, qaPair, report } from './cross-helpers.mjs';

const PICTOGRAPH = /\p{Extended_Pictographic}/gu;
const CROSSING_MARK = '✚';
const symbol = (file, sym) => ({ kind: 'symbol', file, symbol: sym });
const nonRisk = (id, note) => ({ anchor: { kind: 'claim', id }, note });
const claims = n => Array.from({ length: n }, (_, i) => `C${i + 1}`);

/** Outside every fenced verbatim report: the script-written part of a comment. */
const scriptWritten = c => c.replace(/\n(`{4,})text\n[\s\S]*?\n\1\n/g, '\n');

/**
 * A QA pair on `n` claims: each lens has one finding per claim, headlines
 * padded to `pad` characters. `sev(lens, i)` picks each severity; verdicts follow
 * from them. `inconclusive` names lenses whose verdict stays inconclusive.
 */
function bigQa({ n, pad = 100, sev = () => 'low', nonRisks = 0, inconclusive = [] }) {
  const lens = name => {
    const fs = claims(n).map((c, i) => finding(`F${i + 1}`, c, sev(name, i), `${name} on ${c} `.padEnd(pad, 'x')));
    const high = fs.some(f => f.severity === 'high');
    const verdict = high ? 'blocking' : inconclusive.includes(name) ? 'inconclusive' : 'findings';
    const nr = Array.from({ length: nonRisks }, (_, i) => nonRisk(`C${i + 1}`, `${name} non-risk ${i + 1} `.padEnd(200, 'n')));
    return report(block(name, verdict, fs, nonRisks ? { nonRisks: nr } : {}));
  };
  return { reports: { 'behaviour-lens': lens('behaviour-lens'), 'integrity-lens': lens('integrity-lens') }, anchors: claims(n).join(',') };
}

// ------------------------------------------------------------ nothing leaks above the prompt

test('invariance: severities, verdicts and non-risks change nothing above the prompt, in every part, even when they change the part count', t => {
  const base = { n: 95, pad: 110 };
  const variants = [
    bigQa({ ...base }),
    bigQa({ ...base, sev: () => 'medium' }),
    bigQa({ ...base, sev: (l, i) => (l === 'integrity-lens' && i % 7 === 0 ? 'high' : 'low') }),
    bigQa({ ...base, sev: (l, i) => (i % 3 === 0 ? 'medium' : 'low'), nonRisks: 20 }),
  ];
  const runs = variants.map(v => cross(t, v));
  for (const r of runs) assert.equal(r.code, 0, r.stdout);
  // The test can only fail if a variant changes the parts: one must split the fold where another does not.
  const continued = runs.map(r => r.all.includes('Verdict, severities and non-risks, continued'));
  assert.ok(continued.includes(true) && continued.includes(false), `near-limit precondition: ${continued}`);
  const above = runs.map(r => abovePrompt(r.comments).filter(Boolean));
  for (const a of above.slice(1)) assert.deepEqual(a, above[0]);
});

test('invariance holds with an inconclusive lens, on its mark and its column', t => {
  const runs = [
    bigQa({ n: 4, inconclusive: ['integrity-lens'] }),
    bigQa({ n: 4, inconclusive: ['integrity-lens'], sev: () => 'medium', nonRisks: 3 }),
  ].map(v => cross(t, v));
  const above = runs.map(r => abovePrompt(r.comments).join(''));
  assert.equal(above[0], above[1]);
  assert.match(above[0], /⚠️ \*\*`integrity-lens` not verified\.\*\*/);
  assert.match(above[0], /\| `integrity-lens` ⚠️ not verified \|/);
});

test('invariance on the tension pair: its heading, map label and settle nodes, whatever the calls', t => {
  const spec = (aSev, bSev, notes) => ({
    reports: {
      'executability-lens': report(block('executability-lens', aSev === 'high' ? 'blocking' : 'findings', [finding('F1', 'S2', aSev, 'The first ticket stalls here'), finding('F2', 'S3', 'medium', 'No done-criteria')], notes ? { nonRisks: [{ anchor: { kind: 'section', id: 'S1' }, note: 'The intent is clear' }] } : {})),
      'good-enough-lens': report(block('good-enough-lens', 'findings', [finding('F1', 'S2', bSev, 'This step could come later')])),
    },
    point: 'spec',
    anchors: 'S1,S2,S3',
  });
  const runs = [spec('high', 'low'), spec('medium', 'medium', true), spec('low', 'low')].map(v => cross(t, v));
  const above = runs.map(r => abovePrompt(r.comments).join(''));
  assert.equal(above[1], above[0]);
  assert.equal(above[2], above[0]);
  assert.match(above[0], /Disagreements: both lenses called this; you settle it/);
  assert.match(above[0], /X1\["settle S2"\]/);
  assert.match(above[0], /^\| `S2` \| F1 \| F1 \| settle \|$/m);
});

test('no mark but the crossing mark and the not-verified mark above the prompt, and no verdict word the script wrote', t => {
  for (const v of [qaPair(), qaPair({ bVerdict: 'inconclusive', bSev: 'medium' }), qaPair({ aVerdict: 'clear', bVerdict: 'clear' })]) {
    const r = cross(t, { reports: v });
    assert.equal(r.code, 0, r.stdout);
    assert.ok(r.all.includes(PROMPT), 'a comment with its prompt was written');
    const above = abovePrompt(r.comments).join('');
    const marks = [...above.matchAll(PICTOGRAPH)].map(m => m[0]);
    assert.ok(marks.every(c => c === '⚠'), `pictographs above the prompt: ${marks.map(c => c.codePointAt(0).toString(16))}`);
    for (const w of ['`high`', '`medium`', '`low`', '`blocking`', '`clear`', '`findings`', '`inconclusive`', 'verdict', 'Severity']) assert.ok(!above.includes(w), w);
  }
});

test('no Mermaid styling line, directive or click line in the map', t => {
  const r = cross(t, { reports: qaPair({ bVerdict: 'inconclusive', bSev: 'medium' }) });
  const map = r.all.match(/```mermaid\n([\s\S]*?)\n```/)[1].split('\n');
  assert.equal(map[0], 'flowchart LR');
  for (const l of map.slice(1)) {
    assert.ok(!/^\s*(style|classDef|class|linkStyle|click|%%)/.test(l), l);
    assert.match(l, /^ {2}([A-Z][0-9]*\["[^"]*"\]|[A-Z][0-9]* -(->|\.->) [A-Z][0-9]*)$/, l);
  }
});

test('fixed anchor order: cards and matrix rows keep the list order, whatever order the findings arrive in', t => {
  const fs = [finding('F2', 'C3', 'low', 'Third claim'), finding('F1', 'C1', 'low', 'First claim'), finding('F3', 'C2', 'low', 'Second claim')];
  const r1 = cross(t, { reports: { 'behaviour-lens': report(block('behaviour-lens', 'findings', fs)), 'integrity-lens': report(block('integrity-lens', 'clear')) }, anchors: 'C1,C2,C3' });
  const r2 = cross(t, { reports: { 'behaviour-lens': report(block('behaviour-lens', 'findings', [...fs].reverse())), 'integrity-lens': report(block('integrity-lens', 'clear')) }, anchors: 'C1,C2,C3' });
  const a1 = abovePrompt(r1.comments).join('');
  assert.equal(a1, abovePrompt(r2.comments).join(''));
  assert.ok(a1.indexOf('First claim') < a1.indexOf('Second claim') && a1.indexOf('Second claim') < a1.indexOf('Third claim'));
});

test('fixed anchor order for code anchors: by file, then symbol; K ids in card order', t => {
  const adv = [
    finding('F1', symbol('src/b.js', 'zeta'), 'low', 'Path into zeta', { likelihood: 'low' }),
    finding('F2', symbol('src/a.js', 'beta'), 'low', 'Path into beta', { likelihood: 'low' }),
    finding('F3', symbol('src/a.js', 'alpha'), 'low', 'Path into alpha', { likelihood: 'low' }),
  ];
  const data = [finding('F1', symbol('src/b.js', 'zeta'), 'low', 'Token reaches zeta', { likelihood: 'low', data: 'session token' })];
  const r = cross(t, { reports: { 'adversarial-lens': report(block('adversarial-lens', 'findings', adv)), 'data-lens': report(block('data-lens', 'findings', data)) }, point: 'diff', anchors: null });
  assert.equal(r.code, 0, r.stdout);
  const above = abovePrompt(r.comments).join('');
  // The crossing (zeta) is K1 and its card comes first; the singles follow by file, then symbol.
  assert.match(above, /- ✚ K1 ` src\/b\.js#zeta `/);
  const k2 = above.indexOf('- K2 ` src/a.js#alpha `');
  assert.ok(k2 > 0 && k2 < above.indexOf('- K3 ` src/a.js#beta `'));
  // Matrix rows: fixed anchor order, not card order.
  const rows = above.split('\n').filter(l => /^\| K[0-9]/.test(l)).map(l => l.split(' ')[1]);
  assert.deepEqual(rows, ['K2', 'K3', 'K1']);
});

test('line anchors join on file and overlap', t => {
  const lines = (file, start, end) => ({ kind: 'lines', file, start, end });
  const r = cross(t, {
    reports: {
      'conventions-lens': report(block('conventions-lens', 'findings', [finding('F1', lines('a.md', 10, 20), 'low', 'Breaks the heading rule'), finding('F2', lines('a.md', 40, 41), 'low', 'Breaks the list rule')])),
      'reader-lens': report(block('reader-lens', 'findings', [finding('F1', lines('a.md', 15, 30), 'low', 'The owner cannot act on this step')])),
    },
    point: 'diff',
    anchors: null,
    tier: 'standard',
  });
  assert.equal(r.code, 0, r.stdout);
  assert.match(r.all, /- ✚ K1 ` a\.md:10-30 `/);
  assert.match(r.all, /- K2 ` a\.md:40-41 `/);
});

// ------------------------------------------------------------ the tier views

test('at standard, the verdict and the severities show, with no prompt', t => {
  const r = cross(t, { reports: qaPair(), tier: 'standard' });
  assert.equal(r.code, 0, r.stdout);
  const s = scriptWritten(r.all);
  assert.ok(!s.includes(PROMPT));
  assert.match(s, /\*\*Pair verdict: ⛔ `blocking`\*\*/);
  assert.match(s, /`integrity-lens` F1 `high`: ` The mutation run left the retry branch alive `/);
  assert.match(s, /^### \u{1f9ea} QA pair/mu);
});

test('at standard, the spec pair\'s calls show side by side in the open, not in the non-risks fold', t => {
  const r = cross(t, {
    reports: {
      'executability-lens': report(block('executability-lens', 'blocking', [finding('F1', 'S2', 'high', 'The first ticket stalls here')])),
      'good-enough-lens': report(block('good-enough-lens', 'findings', [finding('F1', 'S2', 'low', 'This step could come later')], { nonRisks: [{ anchor: { kind: 'section', id: 'S1' }, note: 'The intent is clear' }] })),
    },
    point: 'spec',
    anchors: 'S1,S2',
    tier: 'standard',
  });
  assert.equal(r.code, 0, r.stdout);
  const s = scriptWritten(r.all);
  const folds = s.replace(/<details>\n<summary>[^\n]*<\/summary>\n\n[\s\S]*?\n<\/details>\n/g, '');
  assert.match(folds, /\*\*The calls, side by side\*\*/, 'the calls table is outside every fold');
  assert.match(s, /<summary>Non-risks<\/summary>\n\n\*\*Non-risks from `good-enough-lens`:\*\*/);
});

test('at quick, one line and the not-checked lists show, and nothing else above the folded reports', t => {
  const r = cross(t, { reports: qaPair({ bVerdict: 'inconclusive', bSev: 'medium' }), tier: 'quick' });
  assert.equal(r.code, 0, r.stdout);
  const before = r.comments[0].slice(0, r.comments[0].indexOf('<details>'));
  assert.equal(
    before,
    '\u{1f9ea} **QA pair: ⚠️ `inconclusive`** · ⚠️ `integrity-lens` not verified. Not checked: `behaviour-lens` 1, `integrity-lens` 1.\n\n' +
      '**Not checked**\n\n- `behaviour-lens`: ` behaviour-lens did not check the synthetic claim list `\n- `integrity-lens`: ` integrity-lens did not check the synthetic claim list `\n\n',
  );
  assert.ok(!r.page.includes('<h2>Cards</h2>'), 'the page has no cards at quick either');
});

test('unstated-lens alone at thorough: no prompt, and no severity or verdict before its fold, so it cannot hint at the pair\'s answer', t => {
  const run = (sev, verdict) => cross(t, { reports: { 'unstated-lens': report(block('unstated-lens', verdict, [finding('F1', 'S2', sev, 'The issue asks for a phone view that no section covers')])) }, point: 'spec', anchors: 'S1,S2' });
  const a = run('medium', 'findings');
  const b = run('high', 'blocking');
  assert.equal(a.code, 0, a.stdout);
  assert.ok(!a.all.includes(PROMPT));
  const beforeFold = r => r.comments[0].slice(0, r.comments[0].indexOf('<details>'));
  assert.equal(beforeFold(a), beforeFold(b));
  assert.match(beforeFold(a), /^- `S2`\n {2}- `unstated-lens` F1: /m);
  assert.ok(!/`(high|medium|low|blocking|findings)`|verdict/i.test(beforeFold(a)), 'no severity or verdict before the fold');
  assert.match(b.all, /<summary>Verdict, severities and non-risks<\/summary>\n\n\u{1f50d} \*\*Verdict: ⛔ `blocking`\.\*\* It advises/u);
});

test('unstated-lens alone at standard: its own verdict, which advises, its cards placed by anchor, and no pick prompt', t => {
  const reports = { 'unstated-lens': report(block('unstated-lens', 'findings', [finding('F1', 'S2', 'medium', 'The issue asks for a phone view that no section covers')])) };
  const r = cross(t, { reports, point: 'spec', anchors: 'S1,S2', tier: 'standard' });
  assert.equal(r.code, 0, r.stdout);
  const s = scriptWritten(r.all);
  assert.ok(!s.includes(PROMPT));
  assert.match(s, /\*\*Verdict: \u{1f50e} `findings`\.\*\* It advises: it does not change a pair's verdict\./u);
  assert.match(s, /^\| Anchor \| `unstated-lens` \|$/m);
  assert.match(s, /^- `S2`\n {2}- `unstated-lens` F1 `medium`: /m);
  assert.ok(!s.includes(CROSSING_MARK));
});

test('an inconclusive lens shows its not-verified mark at every tier', t => {
  for (const tier of ['quick', 'standard', 'thorough']) {
    const r = cross(t, { reports: qaPair({ bVerdict: 'inconclusive', bSev: 'medium' }), tier });
    assert.match(scriptWritten(r.all), /⚠️ (\*\*)?`integrity-lens` not verified/, tier);
    assert.match(r.page, /⚠️ <b><code>integrity-lens<\/code> not verified\.<\/b>|⚠️ <code>integrity-lens<\/code> not verified/, tier);
  }
});

test('a pair of inconclusive and findings gives inconclusive', t => {
  const r = cross(t, { reports: qaPair({ aVerdict: 'findings', bVerdict: 'inconclusive', bSev: 'low' }) });
  assert.match(r.all, /\*\*Pair verdict: ⚠️ `inconclusive`\*\*/);
  assert.match(r.all, /Inconclusive is not a pass/);
});

// ------------------------------------------------------------ non-risks

test('a distinctive non-risk note shows only inside a script-written fold, at every tier', t => {
  const NOTE = 'DISTINCTIVE-NOTE retry branch sound while the clock is injected';
  for (const tier of ['quick', 'standard', 'thorough']) {
    const reports = qaPair();
    reports['behaviour-lens'] = report(block('behaviour-lens', 'findings', [finding('F1', 'C2', 'medium', 'The retry test mocks the helper it is meant to test')], { nonRisks: [nonRisk('C4', NOTE)] }));
    const r = cross(t, { reports, tier });
    assert.equal(r.code, 0, r.stdout);
    for (const c of r.comments) {
      // Strip every script-written fold; the note must not survive outside them.
      const outside = c.replace(/<details>\n<summary>[^\n]*<\/summary>\n\n[\s\S]*?\n<\/details>\n/g, '');
      assert.ok(!outside.includes('DISTINCTIVE-NOTE'), `${tier}: the note shows outside a fold`);
    }
    assert.ok(r.all.includes('DISTINCTIVE-NOTE'), `${tier}: the note shows somewhere`);
    if (tier !== 'quick') assert.match(scriptWritten(r.all), /\*\*Non-risks from `behaviour-lens`:\*\*/, tier);
  }
});

test('a non-risk on an anchor where the other lens has a finding gives no crossing and no matrix row', t => {
  const plain = qaPair();
  const withRisk = qaPair();
  // integrity-lens has a finding at C3; behaviour-lens says C3 is sound.
  withRisk['behaviour-lens'] = report(block('behaviour-lens', 'findings', [finding('F1', 'C2', 'medium', 'The retry test mocks the helper it is meant to test')], { nonRisks: [nonRisk('C3', 'Empty input is rejected early')] }));
  const a = cross(t, { reports: plain });
  const b = cross(t, { reports: withRisk });
  assert.equal(abovePrompt(b.comments).join(''), abovePrompt(a.comments).join(''));
  assert.match(abovePrompt(b.comments)[0], /^\| `C3` \| — \| F2 \| {2}\|$/m);
});

// ------------------------------------------------------------ rendering safety

test('a headline holding three backticks gets a fence of four, padded', t => {
  const r = cross(t, { reports: { 'behaviour-lens': report(block('behaviour-lens', 'findings', [finding('F1', 'C1', 'low', 'Runs ``` here')])), 'integrity-lens': report(block('integrity-lens', 'clear')) } });
  assert.ok(r.all.includes('```` Runs ``` here ````'));
});

test('a pipe in a table cell becomes \\|', t => {
  const r = cross(t, { reports: { 'behaviour-lens': report(block('behaviour-lens', 'findings', [finding('F1', 'C1', 'low', 'a | b')])), 'integrity-lens': report(block('integrity-lens', 'clear')) } });
  assert.match(r.all, /\| ` a \\\| b ` \|$/m);
  assert.match(r.all, /F1: ` a \| b `$/m, 'outside a table the pipe stays as it is');
});

test('every map label matches the narrow character set and holds no headline or path', t => {
  const adv = [finding('F1', symbol('src/secret-path.js', 'leakyHandler'), 'low', 'Headline words here', { likelihood: 'low' })];
  const data = [finding('F1', symbol('src/secret-path.js', 'leakyHandler'), 'low', 'Other headline words', { likelihood: 'low', data: 'session token' })];
  const r = cross(t, { reports: { 'adversarial-lens': report(block('adversarial-lens', 'findings', adv)), 'data-lens': report(block('data-lens', 'inconclusive', data)) }, point: 'diff', anchors: null });
  const map = r.all.match(/```mermaid\n([\s\S]*?)\n```/)[1];
  const labels = [...map.matchAll(/\["([^"]*)"\]/g)].map(m => m[1]);
  assert.ok(labels.length >= 3);
  for (const l of labels) {
    assert.match(l, /^(?:[A-Za-z0-9 -]|✚|⚠️)+$/u, l);
    assert.ok(!l.includes('secret') && !l.includes('leaky') && !l.includes('Headline'), l);
  }
});

test("a verbatim report's fence is longer than its longest backtick run, so the report cannot close it", t => {
  const reports = qaPair();
  reports['behaviour-lens'] = reports['behaviour-lens'].replace('A synthetic report.', 'A run of five: `````\n</details>\n<summary>Fake verdict: clear</summary>');
  const r = cross(t, { reports });
  assert.equal(r.code, 0, r.stdout);
  assert.ok(r.all.includes(`\n\`\`\`\`\`\`text\n${reports['behaviour-lens']}\`\`\`\`\`\`\n`), 'a fence of six around the exact bytes');
});

test('a report with three hidden characters on one line is counted as 3', t => {
  const reports = qaPair();
  reports['behaviour-lens'] = reports['behaviour-lens'].replace('A synthetic report.', `A ${String.fromCodePoint(0x200b)}synthetic${String.fromCodePoint(0x202e)} report.${String.fromCodePoint(0x7)}`);
  const r = cross(t, { reports });
  assert.equal(r.code, 0, r.stdout);
  assert.ok(r.all.includes('<summary>Verbatim report: <code>behaviour-lens</code>. Hidden or control characters: 3</summary>'));
  assert.ok(r.all.includes('<summary>Verbatim report: <code>integrity-lens</code>. Hidden or control characters: 0</summary>'));
  assert.ok(r.all.includes(reports['behaviour-lens']), 'the bytes stay exact');
});

// ------------------------------------------------------------ size: split, never drop

/** A security pair on 100 distinct long symbols per lens, far over one comment. */
function hugeSecurity() {
  const path = i => `src/${`module-${i}-`.padEnd(190, 'p')}.js`;
  const fs = (name, extra) => Array.from({ length: 100 }, (_, i) => finding(`F${i + 1}`, symbol(path(i), `${name.slice(0, 3)}Symbol${i}`.padEnd(100, 'S')), i % 2 ? 'low' : 'medium', `${name} headline ${i} `.padEnd(120, 'h'), { likelihood: 'low', ...extra }));
  return {
    reports: {
      'adversarial-lens': report(block('adversarial-lens', 'findings', fs('adversarial-lens', {}))),
      'data-lens': report(block('data-lens', 'findings', fs('data-lens', { data: 'session token' }))),
    },
    point: 'diff',
    anchors: null,
  };
}

test('a section over the limit splits at card boundaries, every finding exactly once, the prompt and fold after the last card part', t => {
  const r = cross(t, hugeSecurity());
  assert.equal(r.code, 0, r.stdout);
  assert.ok(r.comments.length >= 4, `${r.comments.length} comments`);
  for (const c of r.comments) assert.ok(c.length <= LIMIT, `a comment of ${c.length}`);
  const promptAt = r.comments.findIndex(c => c.includes(PROMPT));
  assert.ok(promptAt >= 1, 'the cards span more than one part');
  assert.equal(r.comments.filter(c => c.includes(PROMPT)).length, 1);
  const above = abovePrompt(r.comments).join('');
  const below = r.comments.map((c, i) => (i < promptAt ? '' : i === promptAt ? c.slice(c.indexOf(PROMPT)) : c)).join('');
  for (const name of ['adversarial-lens', 'data-lens']) {
    for (let i = 0; i < 100; i += 1) {
      const h = ` ${`${name} headline ${i} `.padEnd(120, 'h')} `;
      assert.equal(above.split(h).length - 1, 1, `card for ${name} ${i}`);
      assert.equal(scriptWritten(below).split(h).length - 1, 1, `fold row for ${name} ${i}`);
    }
  }
  // Each part starts at a card boundary or a repeated matrix header, never mid-card.
  for (const c of r.comments.slice(1, promptAt + 1)) {
    const body = c.replace(/^_Continued, part [0-9]+\._\n\n/, '');
    assert.match(body, /^(- |\| Anchor \|)/, body.slice(0, 80));
  }
  // The folded table split into further folds, each closed in its own part.
  assert.ok(r.all.includes('<summary>Verdict, severities and non-risks, continued</summary>'));
  for (const c of r.comments) {
    const s = scriptWritten(c);
    assert.equal(s.split('<details>').length, s.split('</details>').length, 'every fold closes in its part');
  }
});

/** Both lenses put 100 findings on one claim, each headline 120 backticks: one card past the limit. */
function oneHugeCard(sev = 'medium') {
  const fs = Array.from({ length: 100 }, (_, i) => finding(`F${i + 1}`, 'C1', sev, '`'.repeat(120)));
  const verdict = sev === 'high' ? 'blocking' : 'findings';
  return { reports: { 'behaviour-lens': report(block('behaviour-lens', verdict, fs)), 'integrity-lens': report(block('integrity-lens', verdict, fs)) }, anchors: 'C1' };
}

for (const tier of ['thorough', 'standard']) {
  test(`one card over the limit splits between its finding lines, repeating its anchor line, and drops none (${tier})`, t => {
    const r = cross(t, { ...oneHugeCard(), tier });
    assert.equal(r.code, 0, r.stdout);
    for (const c of r.comments) assert.ok(c.length <= LIMIT, `a comment of ${c.length}`);
    const s = r.comments.map(scriptWritten);
    const cardParts = s.filter(c => /^- ✚ `C1`$/m.test(c));
    assert.ok(cardParts.length >= 2, 'the card spans two parts, its anchor line repeated');
    for (const lens of ['behaviour-lens', 'integrity-lens']) {
      for (let i = 1; i <= 100; i += 1) {
        const line = new RegExp(`^ {2}- \`${lens}\` F${i}( \`medium\`)?: `, 'm');
        assert.equal(s.filter(c => line.test(c)).length, 1, `${lens} F${i} once`);
      }
    }
    if (tier === 'thorough') assert.equal(r.comments.filter(c => c.includes(PROMPT)).length, 1);
  });
}

test('invariance holds when the cards themselves split across parts', t => {
  const runs = [oneHugeCard('medium'), oneHugeCard('low'), oneHugeCard('high')].map(v => cross(t, v));
  for (const r of runs) assert.equal(r.code, 0, r.stdout);
  const above = runs.map(r => abovePrompt(r.comments).filter(Boolean));
  assert.ok(above[0].length >= 2, 'the part above the prompt splits');
  assert.deepEqual(above[1], above[0]);
  assert.deepEqual(above[2], above[0]);
});

test('later parts carry a header with no total', t => {
  const r = cross(t, hugeSecurity());
  assert.ok(!r.comments[0].startsWith('_Continued'));
  r.comments.slice(1).forEach((c, i) => {
    if (c.includes('<summary>Verbatim report')) return;
    assert.ok(c.startsWith(`_Continued, part ${i + 2}._\n\n`), c.slice(0, 40));
  });
  assert.ok(!/ of [0-9]+/.test(r.all.match(/_Continued[^\n]*/g).join('')));
});

test("two lenses' 20 non-risks force a split and drop none", t => {
  const without = cross(t, bigQa({ n: 92, pad: 110 }));
  const withNr = cross(t, bigQa({ n: 92, pad: 110, nonRisks: 20 }));
  assert.equal(without.code, 0);
  assert.equal(withNr.code, 0);
  const sections = r => r.comments.filter(c => !c.startsWith('<details>\n<summary>Verbatim')).length;
  assert.ok(sections(withNr) > sections(without), `${sections(without)} then ${sections(withNr)} parts`);
  const s = scriptWritten(withNr.all);
  for (const name of ['behaviour-lens', 'integrity-lens']) {
    for (let i = 1; i <= 20; i += 1) assert.equal(s.split(`${name} non-risk ${i} n`).length - 1, 1, `${name} non-risk ${i}`);
  }
});

test('a single report over the limit gives exit code 2, a written section and a list of the report left out', t => {
  const reports = qaPair();
  reports['integrity-lens'] = report(block('integrity-lens', 'blocking', [finding('F1', 'C2', 'high', 'The mutation run left the retry branch alive')]), { before: `${'y'.repeat(200)}\n`.repeat(400) });
  const r = cross(t, { reports });
  assert.equal(r.code, 2, r.stdout);
  assert.match(r.stdout, /^LEFT-OUT integrity-lens integrity-lens\.md$/m);
  assert.match(r.stdout, /^RESULT: oversize$/m);
  assert.ok(r.all.includes(PROMPT), 'the section is written');
  assert.ok(r.all.includes('**Left out, over the comment limit:** `integrity-lens`.'));
  assert.ok(!r.all.includes('y'.repeat(200)), 'the oversize report is not posted, not even in part');
  assert.ok(r.all.includes(`text\n${reports['behaviour-lens']}`), 'the report that fits is posted');
});
