// The locked page, the pick mode and determinism (#44).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CROSS, block, cross, finding, qaPair, report } from './cross-helpers.mjs';
import { tempDir } from './tree.mjs';

const symbol = (file, sym) => ({ kind: 'symbol', file, symbol: sym });
/** Lens text that tries every way to reach outside. */
const HOSTILE = '<img src=https://example.invalid/a.png> <a href="https://example.invalid/">x</a> <style>@import url(https://example.invalid/s.css)</style> <meta http-equiv="refresh" content="0;url=https://example.invalid/">';

function securityPair(headline = 'An attack path reaches the token store') {
  return {
    'adversarial-lens': report(block('adversarial-lens', 'blocking', [finding('F1', symbol('src/a.js', 'login'), 'high', headline, { likelihood: 'medium' })])),
    'data-lens': report(block('data-lens', 'findings', [finding('F1', symbol('src/a.js', 'login'), 'medium', 'The session token is logged', { likelihood: 'low', data: 'session token' })], { nonRisks: [{ anchor: symbol('src/b.js', 'store'), note: 'Tokens are hashed at rest' }] })),
  };
}

// ------------------------------------------------------------ the page

test('the page: the policy is the first element in <head>, with form-action and base-uri locked', t => {
  const r = cross(t, { reports: qaPair() });
  const m = r.page.match(/<head>(<[^>]*>)/);
  assert.ok(m, 'a head with a first element');
  assert.match(m[1], /^<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'sha256-[A-Za-z0-9+/=]+'; form-action 'none'; base-uri 'none'">$/);
});

test('the page: the style hash in the policy matches its one inline style', async t => {
  const { createHash } = await import('node:crypto');
  const r = cross(t, { reports: qaPair() });
  const styles = [...r.page.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  assert.equal(styles.length, 1);
  const hash = createHash('sha256').update(styles[0][1]).digest('base64');
  assert.ok(r.page.includes(`style-src 'sha256-${hash}'`));
});

for (const [name, opts] of [
  ['QA, thorough', { reports: qaPair({ aVerdict: 'findings' }) }],
  ['security, thorough', { reports: securityPair(), point: 'diff', anchors: null }],
  ['QA, standard', { reports: qaPair(), tier: 'standard' }],
  ['QA, quick', { reports: qaPair(), tier: 'quick' }],
]) {
  test(`the page points nowhere remote, with hostile lens text (${name})`, t => {
    const reports = { ...opts.reports };
    // Hostile text in the prose of a report, which the page shows verbatim.
    for (const k of Object.keys(reports)) reports[k] = reports[k].replace('A synthetic report.', HOSTILE);
    const r = cross(t, { ...opts, reports });
    assert.equal(r.code, 0, r.stdout);
    const p = r.page;
    for (const attr of ['src', 'href', 'data', 'poster', 'formaction', 'action', 'srcset', 'xlink:href', 'style', 'background']) {
      assert.ok(!new RegExp(`<[^>]*\\s${attr}\\s*=`, 'i').test(p), `an element with ${attr}=`);
    }
    assert.ok(!/<style>[^<]*(url\(|@import)/i.test(p), 'the one style holds no url( or @import');
    assert.equal((p.match(/<[^>]*http-equiv/gi) ?? []).length, 1, 'the policy is the only http-equiv element');
    for (const tag of ['<script', '<link', '<iframe', '<object', '<embed', '<form', '<base', '<img', '<a ']) assert.ok(!p.toLowerCase().includes(tag), tag);
    assert.ok(p.includes('&lt;img src=https://example.invalid/a.png&gt;'), 'the hostile text is escaped, not dropped');
  });
}

test('the page: the reveal is a <details> block, holding the verdict and severities at the thorough tier', t => {
  const r = cross(t, { reports: securityPair(), point: 'diff', anchors: null });
  const reveal = r.page.match(/<details><summary>Verdict, severities and non-risks<\/summary>([\s\S]*?)<\/details>/);
  assert.ok(reveal, 'the reveal');
  assert.match(reveal[1], /Pair verdict: \u26d4 blocking/);
  assert.match(reveal[1], /Likelihood by severity/);
  assert.match(reveal[1], /Data flow and leak points/);
  assert.match(reveal[1], /Tokens are hashed at rest/, 'non-risks inside the reveal');
  const before = r.page.slice(0, r.page.indexOf('<details><summary>Verdict'));
  assert.ok(!/\b(blocking|high|medium|low)\b/.test(before.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<meta[^>]*>/, '')), 'no severity or verdict before the reveal');
  assert.ok(!before.includes('Tokens are hashed'), 'no non-risk before the reveal');
});

test('the page escapes every lens string and gives no attribute lens text', t => {
  const r = cross(t, { reports: securityPair('quote " apostrophe \' amp & lt <') , point: 'diff', anchors: null });
  assert.ok(r.page.includes('quote &quot; apostrophe &#39; amp &amp; lt &lt;'));
  for (const m of r.page.matchAll(/<[a-z]+\s([^>]*)>/g)) assert.ok(!m[1].includes('apostrophe'), m[1]);
});

// ------------------------------------------------------------ the pick

const pick = (t, p, reports = qaPair(), opts = {}) => cross(t, { reports, mode: 'pick', pick: p, ...opts });
const lines = r => r.stdout.split('\n').filter(l => /^(PICK|RULE|MISSED|EMPTY) /.test(l));

test('pick: a match, when a picked anchor holds a high finding', t => {
  const r = pick(t, 'C2,C4');
  assert.equal(r.code, 0, r.stdout);
  assert.deepEqual(lines(r), ['PICK match', 'MISSED none', 'EMPTY C4']);
  assert.deepEqual(readdirSync(r.dir).sort(), ['behaviour-lens.md', 'integrity-lens.md'], 'the pick mode writes nothing beside its inputs');
});

test('pick: mismatch rule 1, "none" when the pair verdict is not clear', t => {
  assert.deepEqual(lines(pick(t, 'none')), ['PICK mismatch', 'RULE 1', 'MISSED C2', 'EMPTY none']);
  // inconclusive with no findings is not clear either.
  const inc = { 'behaviour-lens': report(block('behaviour-lens', 'clear')), 'integrity-lens': report(block('integrity-lens', 'inconclusive')) };
  assert.deepEqual(lines(pick(t, 'none', inc)), ['PICK mismatch', 'RULE 1', 'MISSED none', 'EMPTY none']);
});

test('pick: mismatch rule 2, anchors named when the pair verdict is clear', t => {
  const clear = qaPair({ aVerdict: 'clear', bVerdict: 'clear' });
  assert.deepEqual(lines(pick(t, 'C1', clear)), ['PICK mismatch', 'RULE 2', 'MISSED none', 'EMPTY C1']);
  assert.deepEqual(lines(pick(t, 'none', clear)), ['PICK match', 'MISSED none', 'EMPTY none']);
});

test('pick: mismatch rule 3, anchors named and none of them holds a high finding', t => {
  assert.deepEqual(lines(pick(t, 'C3')), ['PICK mismatch', 'RULE 3', 'MISSED C2', 'EMPTY none']);
});

test('pick: a crossing picked with no high finding is a match, which the rule cannot see', t => {
  const r = pick(t, 'C2', qaPair({ aVerdict: 'findings', bVerdict: 'findings', bSev: 'medium' }));
  assert.deepEqual(lines(r), ['PICK match', 'MISSED none', 'EMPTY none']);
});

test('pick: code anchors are picked by their K id', t => {
  const r = pick(t, 'K1', securityPair(), { point: 'diff', anchors: null });
  assert.deepEqual(lines(r), ['PICK match', 'MISSED none', 'EMPTY none']);
});

test('pick: an anchor not shown, a repeat, or unstated-lens alone is refused', t => {
  for (const p of ['C9', 'C2,C2', 'K1', 'C2,none', '']) {
    const r = pick(t, p);
    assert.equal(r.code, 1, `${p}: ${r.stdout}`);
    assert.deepEqual(r.rules, ['pick'], p);
  }
  const unstated = { 'unstated-lens': report(block('unstated-lens', 'clear')) };
  const r = pick(t, 'none', unstated);
  assert.equal(r.code, 1);
  assert.deepEqual(r.rules, ['pick']);
});

test('pick: a report that fails a check fails the pick mode too, and nothing is written', t => {
  const reports = qaPair();
  reports['integrity-lens'] = report(block('integrity-lens', 'clear', [finding('F1', 'C1', 'low', 'A finding under clear')]));
  const r = pick(t, 'C1', reports);
  assert.equal(r.code, 1);
  assert.deepEqual(r.rules, ['agreement']);
  assert.deepEqual(readdirSync(r.dir).sort(), ['behaviour-lens.md', 'integrity-lens.md'], 'nothing written beside the inputs');
});

// ------------------------------------------------------------ determinism

test('determinism: the same inputs give the same bytes, page included', t => {
  const a = cross(t, { reports: securityPair(), point: 'diff', anchors: null });
  const b = cross(t, { reports: securityPair(), point: 'diff', anchors: null });
  assert.equal(a.code, 0, a.stdout);
  assert.equal(b.code, 0, b.stdout);
  assert.deepEqual(Object.keys(a.files), Object.keys(b.files));
  for (const f of Object.keys(a.files)) assert.equal(a.files[f], b.files[f], f);
  assert.equal(a.stdout, b.stdout);
});

test('determinism: the order of the report arguments does not change the output', t => {
  const dir = tempDir(t, 'pact-cross-order-');
  const reports = qaPair();
  for (const [l, text] of Object.entries(reports)) writeFileSync(join(dir, `${l}.md`), text);
  const run = (out, order) => {
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    const r = spawnSync(process.execPath, [CROSS, 'cross', '--point', 'result', '--tier', 'thorough', '--anchors', 'C1,C2,C3,C4', '--out', join(dir, out), ...order.map(l => `${l}=${join(dir, `${l}.md`)}`)], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout);
    return Object.fromEntries(readdirSync(join(dir, out)).map(f => [f, readFileSync(join(dir, out, f), 'utf8')]));
  };
  assert.deepEqual(run('a', ['behaviour-lens', 'integrity-lens']), run('b', ['integrity-lens', 'behaviour-lens']));
});

test('determinism: the TZ and LANG settings change nothing (on Windows, Node may take its locale from the system, not LANG)', t => {
  const r = cross(t, { reports: qaPair(), env: { LANG: 'tr_TR.UTF-8', TZ: 'Pacific/Kiritimati' } });
  const base = cross(t, { reports: qaPair() });
  assert.equal(r.code, 0, r.stdout);
  assert.equal(base.code, 0, base.stdout);
  assert.deepEqual(r.files, base.files, 'locale and time zone change nothing');
});
