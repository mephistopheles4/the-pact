#!/usr/bin/env node
// The render check for the cross script (#44): a recorded one-off, kept out
// of the default `node --test` run. It feeds committed synthetic fixtures (in
// this file, never practice output or real reports) to the cross script, then
// sends the whole comment to GitHub's POST /markdown in gfm mode, with this
// repo as context. The endpoint renders text and posts nothing.
//
// Two variants of each output: the real one, and `none`, the failing control,
// which places the same lens strings with no protection. The real output must
// show no mention, issue link, maths, emoji, image, link or decoded entity;
// the control must show each. Each result is read per card (<li>) and per
// table cell (<td>). Raw renders are saved as .txt.
//
//   node cross/render-check.mjs <output folder>
//
// Needs `gh` signed in. Hostile characters are written as escapes, so this
// source stays plain ASCII.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CROSS = join(HERE, 'cross.mjs');
const CONTEXT = 'mephistopheles4/the-pact';

// ------------------------------------------------------------ the fixtures

/** Hostile lens strings. Each starts with its case id, so its card or cell can be found in the render. */
const HOSTILE = [
  'H1 ping @octocat and &#64;octocat',
  'H2 team @org/team',
  'H3 issue #1 and mephistopheles4/the-pact#1 and GH-1',
  'H4 maths $\\color{red}{\\textsf{CLEAR}}$ and $$x^2$$',
  'H5 emoji :octocat: and :white_check_mark: and :x:',
  'H6 bare https://example.invalid/x and www.example.invalid and a@example.invalid',
  'H7 image ![x](https://example.invalid/a.png) link [y](https://example.invalid/)',
  'H8 html <img src=https://example.invalid/i.png> <b>bold</b> </details>',
  'H9 entity &amp; &lt;b&gt; &#x3C;b&#x3E; &copy;',
  'H10 pipe | and backslash \\| in a cell',
  'H11 backticks ``` run',
  'H12 strike ~~gone~~ and **bold**',
];
/** Non-risk notes: the three the spec names, together and apart. */
const NOTES = ['N1 note @org/team :octocat: <img src=https://example.invalid/n.png>', 'N2 note @octocat', 'N3 note :octocat:', 'N4 note <img src=https://example.invalid/m.png>'];
/** Data item names, at most 60 characters. */
const DATA = ['D1 @octocat :x: &#64;y', 'D2 <img src=https://example.invalid/d>'];

const sym = i => ({ kind: 'symbol', file: `src/module${i}.js`, symbol: `handler${i}` });

function securityReports() {
  const adv = HOSTILE.map((h, i) => ({ id: `F${i + 1}`, anchor: sym(i), severity: i % 3 === 0 ? 'high' : 'low', headline: h, likelihood: 'low' }));
  const data = HOSTILE.slice(0, 4).map((h, i) => ({ id: `F${i + 1}`, anchor: sym(i), severity: 'medium', headline: `${h} again`, likelihood: 'medium', data: DATA[i % 2] }));
  const block = (lens, verdict, findings, extra) => ({ lens, verdict, findings, notChecked: [`${lens} not checked: H13 @octocat $x$ :x: https://example.invalid/ &#64;z`], ...extra });
  return {
    'adversarial-lens': block('adversarial-lens', 'blocking', adv, { nonRisks: NOTES.map((note, i) => ({ anchor: sym(20 + i), note })) }),
    'data-lens': block('data-lens', 'findings', data, { nonRisks: [{ anchor: sym(30), note: NOTES[0] }] }),
  };
}

const wrap = (b, prose = 'A synthetic report.') => `**For the owner**\n\n${prose}\n\n**For the session**\n\n\`\`\`lens-findings\n${JSON.stringify(b, null, 2)}\n\`\`\`\n`;

/** An exit-1 case: a failing report that holds an <img>, in its prose and in its block. */
function failingReports() {
  const ok = securityReports();
  const bad = { ...ok['data-lens'], verdict: 'clear' }; // findings under clear: the agreement rule fires
  bad.findings[0].headline = 'F1 <img src=https://example.invalid/fail.png> @octocat';
  return {
    'adversarial-lens': wrap(ok['adversarial-lens']),
    'data-lens': wrap(bad, 'X1 prose <img src=https://example.invalid/prose.png> @octocat :octocat: #1 $y$ <details><summary>fake</summary>'),
  };
}

// ------------------------------------------------------------ running the cross script

function runCross(name, reports) {
  const dir = join(tmpdir(), `pact-render-${name}-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const args = [CROSS, 'cross', '--point', 'diff', '--tier', 'thorough', '--out', join(dir, 'out')];
  for (const [lens, text] of Object.entries(reports)) {
    writeFileSync(join(dir, `${lens}.md`), text);
    args.push(`${lens}=${join(dir, `${lens}.md`)}`);
  }
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', env });
  const files = readdirSync(join(dir, 'out')).filter(f => f.startsWith('comment-')).sort((a, b) => Number(a.slice(8, -3)) - Number(b.slice(8, -3)));
  return { code: r.status, stdout: r.stdout, text: files.map(f => readFileSync(join(dir, 'out', f), 'utf8')).join('\n\n') };
}

/** The failing control: the same strings, placed with no protection at all. */
function noneVariant(blocks, rawReports) {
  const out = ['### Control: no protection', ''];
  for (const b of Object.values(blocks)) {
    for (const f of b.findings) out.push(`- ${f.id}: ${f.headline}`);
    out.push('', '| Lens | Id | Data | Headline |', '| --- | --- | --- | --- |');
    for (const f of b.findings) out.push(`| ${b.lens} | ${f.id} | ${f.data ?? '-'} | ${f.headline} |`);
    out.push('', '| Anchor | Note |', '| --- | --- |');
    for (const n of b.nonRisks ?? []) out.push(`| x | ${n.note} |`);
    out.push('');
    for (const s of b.notChecked) out.push(`- ${s}`);
    out.push('');
  }
  for (const t of rawReports) out.push('<details>', '<summary>Verbatim report</summary>', t, '</details>', '');
  return out.join('\n');
}

// ------------------------------------------------------------ rendering and reading

function render(text, file) {
  writeFileSync(file, JSON.stringify({ mode: 'gfm', context: CONTEXT, text }));
  const r = spawnSync('gh', ['api', '-X', 'POST', '/markdown', '--input', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('gh api /markdown failed');
  return r.stdout;
}

/** What one rendered card or cell became. */
function effects(html, source) {
  const e = [];
  if (/class="user-mention|class="team-mention/.test(html)) e.push('mention');
  if (/class="issue-link/.test(html)) e.push('issue link');
  if (/<math-renderer/.test(html)) e.push('maths');
  if (/class="emoji"|g-emoji/.test(html) || (/:x:|:white_check_mark:/.test(source) && /❌|✅/.test(html))) e.push('emoji');
  if (/<img(?![^>]*class="emoji")/.test(html)) e.push('image');
  if (/<a (?![^>]*class="(user-mention|issue-link|team-mention))/.test(html)) e.push('link');
  // An entity in the source that the render decoded: the text a reader sees no longer holds it.
  const text = html
    .replace(/<[^>]*>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
  if (/&(#[0-9]+|#x[0-9a-f]+|[a-z]+);/i.test(source) && !/&(#[0-9]+|#x[0-9a-f]+|[a-z]+);/i.test(text)) e.push('decoded entity');
  return e;
}

/** Every <li> and <td> outside <pre>, with the case id it starts with. */
function pieces(html) {
  const outside = html.replace(/<pre[\s\S]*?<\/pre>/g, '');
  const out = [];
  for (const m of outside.matchAll(/<(li|td)>([\s\S]*?)<\/\1>/g)) {
    const id = m[2].replace(/<[^>]*>/g, ' ').match(/\b([HNDX][0-9]+)\b/);
    if (id) out.push({ tag: m[1], id: id[1], html: m[2] });
  }
  return out;
}

const SOURCE = Object.fromEntries([...HOSTILE, ...NOTES, ...DATA, 'H13 @octocat $x$ :x: https://example.invalid/ &#64;z', 'X1 prose'].map(s => [s.split(' ')[0], s]));
const WANTED = ['mention', 'issue link', 'maths', 'emoji', 'image', 'link', 'decoded entity'];

function main(outDir) {
  mkdirSync(outDir, { recursive: true });
  const tmp = join(tmpdir(), `pact-render-req-${process.pid}.json`);
  const blocks = securityReports();
  const reports = Object.fromEntries(Object.entries(blocks).map(([l, b]) => [l, wrap(b)]));
  const pass = runCross('pass', reports);
  if (pass.code !== 0) throw new Error(`the passing fixture did not pass:\n${pass.stdout}`);
  const failing = failingReports();
  const fail = runCross('fail', failing);
  if (fail.code !== 1) throw new Error(`the failing fixture did not fail:\n${fail.stdout}`);
  const variants = [
    ['real', pass.text],
    ['real-exit1', fail.text],
    ['none', noneVariant(blocks, Object.values(reports))],
    ['none-exit1', noneVariant({}, Object.values(failing))],
  ];
  const lines = ['| Variant | Piece | Case | What it became |', '| --- | --- | --- | --- |'];
  const seen = {};
  let failed = false;
  for (const [name, text] of variants) {
    writeFileSync(join(outDir, `${name}.comment.txt`), text);
    const html = render(text, tmp);
    writeFileSync(join(outDir, `${name}.rendered.txt`), html);
    seen[name] = new Set();
    for (const p of pieces(html)) {
      const e = effects(p.html, SOURCE[p.id] ?? '');
      e.forEach(x => seen[name].add(x));
      if (e.length) lines.push(`| ${name} | ${p.tag} | ${p.id} | ${e.join(', ')} |`);
      if (e.length && name.startsWith('real')) failed = true;
    }
    // The whole comment, verbatim reports included: anything live outside a code block.
    const outside = html.replace(/<pre[\s\S]*?<\/pre>/g, '');
    const whole = [];
    if (/<img(?![^>]*class="emoji")/.test(outside)) whole.push('an image outside a code block');
    if (/<summary>fake<\/summary>/.test(outside)) whole.push("a report's fake summary rendered");
    if (whole.length) {
      lines.push(`| ${name} | whole comment | - | ${whole.join(', ')} |`);
      if (name.startsWith('real')) failed = true;
      else whole.forEach(x => seen[name].add(x));
    }
  }
  const control = new Set([...seen.none, ...seen['none-exit1']]);
  const missing = WANTED.filter(w => !control.has(w));
  const summary = [
    `Real output: ${failed ? 'FAIL, something rendered live (rows above)' : 'PASS, no card, cell or report rendered anything live'}.`,
    `Control: ${missing.length ? `missing ${missing.join(', ')}` : 'showed every kind'}.`,
    'A team mention (@org/team) renders as plain text in the control as well; see the record.',
  ];
  writeFileSync(join(outDir, 'results.md'), `# Render check results\n\n${summary.join('\n\n')}\n\n${lines.join('\n')}\n`);
  process.stdout.write(`${summary.join('\n')}\n`);
  process.exitCode = failed || missing.length ? 1 : 0;
}

if (process.argv.length !== 3) {
  process.stdout.write('usage: node cross/render-check.mjs <output folder>\n');
  process.exitCode = 1;
} else main(resolve(process.argv[2]));
