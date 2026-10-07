#!/usr/bin/env node
// Refreshes the builder page (#53, slice 7) from the repo.
//
//   node builder/build.mjs           rewrite builder/pact-config.html in place
//   node builder/build.mjs --check   exit 1 if the page is out of date
//
// The page runs from disk with no network, so the pact text it shows is
// carried inside it, as one JSON object in its script between the
// pact-data marks. This script rebuilds that object from the pact's source
// (claude/CLAUDE.md), the renderer's lists (gate/render.mjs, read as text,
// never run), the installed agents (claude/agents/) and the shipped example
// blocks (examples/pact-config/), then recomputes the hashes in the page's
// content security policy. Everything else in the page is kept as written.
// gate/tests/builder-page.test.mjs fails when the committed page differs from
// what this script would write.
//
// The page is never installed, and the installer is the authority on what it
// saves: the page's checks are for usability only.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PAGE_REL = 'builder/pact-config.html';

const MARK_RE = /^( *)<!-- pact:(begin|end) ([a-z][a-z0-9-]*) -->$/;
const LEAD_RE = /^([1-4])\. \*\*(.+)\*\*$/;
const DATA_RE = /\/\* pact-data:begin \*\/[\s\S]*?\/\* pact-data:end \*\//;
const SCRIPT_RE = /<script>([\s\S]*?)<\/script>/;
const STYLE_RE = /<style>([\s\S]*?)<\/style>/;
const CSP_RE = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(">)/;

const fail = msg => {
  throw new Error(`builder: ${msg}`);
};

/** A quoted list declared in gate/render.mjs, such as OPEN_MARKS, read from its text. */
function listFrom(renderSrc, name) {
  const m = new RegExp(`const ${name} = Object\\.freeze\\(\\[([^\\]]*)\\]\\)`).exec(renderSrc);
  if (!m) fail(`gate/render.mjs no longer declares ${name} as a frozen list`);
  return [...m[1].matchAll(/'([^']*)'/g)].map(x => x[1]);
}

/** The usage-pause setting's range and default, read from gate/render.mjs's text. */
function settingFrom(renderSrc) {
  const m = /\['usage-pause', Object\.freeze\(\{ mark: 'usage-pause', min: (\d+), max: (\d+), def: (\d+),/.exec(renderSrc);
  if (!m) fail('gate/render.mjs no longer declares the usage-pause setting in the expected form');
  return { name: 'usage-pause', min: Number(m[1]), max: Number(m[2]), def: Number(m[3]) };
}

/** The source's marked parts (name -> dedented text) and its sequence of lead-ins and marks. */
function parseSource(src) {
  const parts = new Map();
  const seq = [];
  let cur = null;
  for (const line of src.split('\n')) {
    const m = MARK_RE.exec(line);
    if (m) {
      if (m[2] === 'begin') {
        if (cur) fail(`${m[3]} opens inside ${cur.name}`);
        cur = { name: m[3], indent: m[1].length, lines: [] };
      } else {
        if (!cur || cur.name !== m[3]) fail(`an end of ${m[3]} with no begin`);
        parts.set(cur.name, cur.lines.map(l => l.slice(Math.min(cur.indent, /^ */.exec(l)[0].length))).join('\n'));
        seq.push({ mark: cur.name });
        cur = null;
      }
      continue;
    }
    if (cur) {
      cur.lines.push(line);
      continue;
    }
    const l = LEAD_RE.exec(line);
    seq.push(l ? { move: Number(l[1]), lead: l[2] } : { text: true });
  }
  if (cur) fail(`${cur.name} never closes`);
  return { parts, seq };
}

const codeSpans = text => [...text.matchAll(/`([^`\n]+)`/g)].map(m => m[1]);

/** "move-1-no-wayfinder" in the move-1 slot -> "No wayfinder". */
function titleOf(id, mark) {
  const prefix = mark === 'move-4-extra' ? 'move-4-' : `${mark}-`;
  const rest = (id.startsWith(prefix) ? id.slice(prefix.length) : id).replaceAll('-', ' ');
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** The slot an example block belongs in when the example configuration doesn't place it. */
function slotByName(id, editable) {
  const mark = editable.find(m => id.startsWith(`${m}-`)) ?? editable.find(m => m.endsWith('-extra') && id.startsWith(`${m.slice(0, -'-extra'.length)}-`));
  if (!mark) fail(`example block ${id}.md matches no open slot by name`);
  return { mark, op: 'add-after' };
}

/** The page's data object, built from the repo at `root`. */
export function pageData(root) {
  const src = readFileSync(join(root, 'claude', 'CLAUDE.md'), 'utf8');
  const renderSrc = readFileSync(join(root, 'gate', 'render.mjs'), 'utf8');
  const open = listFrom(renderSrc, 'OPEN_MARKS');
  const editable = listFrom(renderSrc, 'EDITABLE');
  const gated = listFrom(renderSrc, 'GATED');
  const agentFiles = readdirSync(join(root, 'claude', 'agents'))
    .filter(f => f.endsWith('.md'))
    .sort();
  const agents = agentFiles.map(f => f.slice(0, -3));
  const { parts, seq } = parseSource(src);

  const part = name => {
    const text = parts.get(name);
    if (text === undefined) fail(`claude/CLAUDE.md has no ${name} part`);
    if (open.includes(name)) {
      if (!editable.includes(name)) fail(`${name} sits inside a move but is not editable`);
      return { kind: 'open', mark: name, text, agents: [...new Set(codeSpans(text))].filter(a => agents.includes(a)) };
    }
    if (!gated.includes(name)) fail(`${name} is neither an open nor a gated mark`);
    return { kind: 'gated', mark: name, text };
  };

  const moves = [];
  seq.forEach((s, i) => {
    if (!s.move) return;
    const ps = [];
    for (let j = i + 1; j < seq.length && seq[j].mark; j += 1) ps.push(part(seq[j].mark));
    if (ps.length) moves.push({ n: s.move, lead: s.lead, parts: ps });
  });
  if (moves.map(m => m.n).join() !== '1,2,3,4') fail('claude/CLAUDE.md no longer has moves 1 to 4, each followed by its marked parts');
  const inMoves = moves.flatMap(m => m.parts.map(p => p.mark));
  for (const m of editable) if (!inMoves.includes(m)) fail(`the editable part ${m} is not in moves 1 to 4`);

  const always = seq.filter(s => s.mark && gated.includes(s.mark) && !inMoves.includes(s.mark)).map(s => ({ mark: s.mark, text: parts.get(s.mark) }));

  const setting = settingFrom(renderSrc);
  const usage = parts.get(setting.name);
  if (usage === undefined) fail(`claude/CLAUDE.md has no ${setting.name} part`);
  if (usage.split(`above ${setting.def}%`).length !== 2) fail(`the ${setting.name} part does not say "above ${setting.def}%" exactly once`);
  setting.text = usage;

  const ex = join(root, 'examples', 'pact-config');
  const placed = new Map(JSON.parse(readFileSync(join(ex, 'config-with-edits.json'), 'utf8')).edits.map(e => [e.file, { mark: e.mark, op: e.op }]));
  const presets = readdirSync(join(ex, 'blocks'))
    .filter(f => f.endsWith('.md'))
    .sort()
    .map(f => {
      const id = f.slice(0, -3);
      const { mark, op } = placed.get(f) ?? slotByName(id, editable);
      if (!editable.includes(mark)) fail(`example block ${f} is placed in ${mark}, which is not editable`);
      const text = readFileSync(join(ex, 'blocks', f), 'utf8');
      if (!text.endsWith('\n')) fail(`example block ${f} does not end with a line feed`);
      return { id, title: titleOf(id, mark), mark, op, text: text.slice(0, -1) };
    });

  // Each installed agent, its model and effort as its file sets them, and
  // every part of the pact that names it: shown, never changed, by the page.
  const named = (text, a) => codeSpans(text).includes(a);
  const agentInfo = agentFiles.map(f => {
    const name = f.slice(0, -3);
    const head = /^---\n([\s\S]*?)\n---\n/.exec(readFileSync(join(root, 'claude', 'agents', f), 'utf8'));
    if (!head) fail(`claude/agents/${f} has no frontmatter`);
    const field = k => (new RegExp(`^${k}:[ \\t]*([A-Za-z0-9._-]+)[ \\t]*$`, 'm').exec(head[1]) ?? [])[1] ?? null;
    const runs = [
      ...moves.flatMap(m => m.parts.filter(p => named(p.text, name)).map(p => ({ move: m.n, mark: p.mark, kind: p.kind }))),
      ...always.filter(a => named(a.text, name)).map(a => ({ move: null, mark: a.mark, kind: 'gated' })),
    ];
    return { name, model: field('model'), effort: field('effort'), runs };
  });

  const ids = new Set(presets.map(p => p.id));
  const workflows = JSON.parse(readFileSync(join(ex, 'workflows.json'), 'utf8')).workflows.map(w => {
    if (!/^[a-z0-9-]+$/.test(w.id) || typeof w.title !== 'string' || typeof w.about !== 'string' || !Array.isArray(w.presets)) fail('examples/pact-config/workflows.json has a workflow without an id, title, about and presets');
    for (const id of w.presets) if (!ids.has(id)) fail(`workflow ${w.id} names ${id}, which is not an example block`);
    return { id: w.id, title: w.title, about: w.about, presets: [...w.presets] };
  });

  return { moves, always, editable, setting, agents: agentInfo, presets, workflows };
}

const sha256b64 = s => createHash('sha256').update(s, 'utf8').digest('base64');
const ESC_LT = `${String.fromCharCode(92)}u003c`;

/** The page `html` with its data object and its policy hashes rebuilt from the repo at `root`. */
export function buildPage(root, html) {
  if (!DATA_RE.test(html)) fail('the page has no pact-data marks');
  // JSON inside a script: "<" is escaped, so no text can close the script or open a comment.
  const json = JSON.stringify(pageData(root), null, 1).replaceAll('<', ESC_LT);
  let out = html.replace(DATA_RE, () => `/* pact-data:begin */ ${json} /* pact-data:end */`);
  const script = SCRIPT_RE.exec(out);
  const style = STYLE_RE.exec(out);
  if (!script || !style || !CSP_RE.test(out)) fail('the page has no inline script, style or policy meta tag');
  const csp = [
    "default-src 'none'",
    `script-src 'sha256-${sha256b64(script[1])}'`,
    `style-src 'sha256-${sha256b64(style[1])}'`,
    "connect-src 'none'",
    "img-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  out = out.replace(CSP_RE, (_, a, __, c) => `${a}${csp}${c}`);
  return out;
}

function main(argv) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const file = join(root, PAGE_REL);
  const now = readFileSync(file, 'utf8');
  const next = buildPage(root, now);
  if (argv[0] === '--check') {
    if (next !== now) {
      process.stdout.write(`${PAGE_REL} is out of date: run node builder/build.mjs\n`);
      process.exitCode = 1;
    } else process.stdout.write(`${PAGE_REL} is up to date\n`);
    return;
  }
  if (argv.length) {
    process.stdout.write('usage: node builder/build.mjs [--check]\n');
    process.exitCode = 2;
    return;
  }
  if (next !== now) writeFileSync(file, next);
  process.stdout.write(next !== now ? `${PAGE_REL} rebuilt\n` : `${PAGE_REL} already up to date\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
