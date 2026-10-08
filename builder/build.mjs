#!/usr/bin/env node
// Builds the config builder page (#53, slice 7) from the pact and a builder file.
//
//   node builder/build.mjs                                 rebuild builder/scriptorium.html from the example builder file
//   node builder/build.mjs --check                         check the example builder file, and that the page is up to date
//   node builder/build.mjs --builder <file> --check        check a builder file: refusals and findings
//   node builder/build.mjs --builder <file> --out <page>   check it, then write a page from it
//
// The page runs from disk with no network, so everything it shows is carried
// inside it, as one JSON object in its script between the pact-data marks.
// That object has two sources, and they never mix:
//
//   - The pact itself, always from this clone: the moves and their open and
//     locked parts (claude/CLAUDE.md), the renderer's lists (gate/render.mjs,
//     read as text, never run as a module) and the pact's agents
//     (claude/agents/). A builder file cannot change any of it.
//   - A builder file (schema below): the person's presets, workflows and their
//     own skills, commands and agents. The scriptorium skill writes one from
//     the person's own workflow and revises it over time;
//     examples/pact-config/builder.json is the shipped one.
//
// The builder file:
//   { "schema": 1, "title": <text, optional>,
//     "presets": [ { "id", "title", "slot": <open part>,
//                    "text": <lines> | "file": <path beside the builder file>,
//                    "standsIn": <true when written to replace the slot's text, optional>,
//                    "why": <one line, optional> } ],
//     "workflows": [ { "id", "title", "about", "presets": [<preset id>] } ],
//     "yours": { "skills" | "commands" | "agents": [ { "name", "description" } ] } }
//
// A check refuses what the page could not use (exit 1) and reports findings,
// which never refuse (exit 0): a finding is answered by fixing the file or by
// saying why it is meant. Each preset's text is run through the installer's
// own renderer, so a preset the install would refuse never reaches a page.
// The page's own checks are for usability only; the installer stays the
// authority on what the page saves.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readStrictJson, Refused, Report, scanText, SEGMENT_RE } from '../gate/shared.mjs';

export const PAGE_REL = 'builder/scriptorium.html';
export const EXAMPLE_BUILDER_REL = 'examples/pact-config/builder.json';

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

/** The pact's half of the page data, always from the clone at `root`: moves, locked clauses, the usage setting and the pact's agents. */
export function pactData(root) {
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

  // Each installed agent, its model and effort as its file sets them, and
  // every part of the pact that names it: shown, never changed, by the page.
  const named = (text, a) => codeSpans(text).includes(a);
  // The agents a configuration may set, and to what: the renderer's own lists.
  const configurable = listFrom(renderSrc, 'CONFIGURABLE_AGENTS');
  const agentChoices = { models: listFrom(renderSrc, 'AGENT_MODELS'), efforts: listFrom(renderSrc, 'AGENT_EFFORTS') };
  // The locked agents the pact installs from familiars/ (scout: sealed).
  const locked = listFrom(renderSrc, 'LOCKED_AGENTS').filter(n => SEGMENT_RE.test(n) && readdirSync(join(root, 'familiars')).includes(`${n}.md`));
  const info = (rel, name) => {
    const head = /^---\n([\s\S]*?)\n---\n/.exec(readFileSync(join(root, rel), 'utf8'));
    if (!head) fail(`${rel} has no frontmatter`);
    const field = k => (new RegExp(`^${k}:[ \\t]*([A-Za-z0-9._-]+)[ \\t]*$`, 'm').exec(head[1]) ?? [])[1] ?? null;
    const runs = [
      ...moves.flatMap(m => m.parts.filter(p => named(p.text, name)).map(p => ({ move: m.n, mark: p.mark, kind: p.kind }))),
      ...always.filter(a => named(a.text, name)).map(a => ({ move: null, mark: a.mark, kind: 'gated' })),
    ];
    return { name, model: field('model'), effort: field('effort'), runs, configurable: configurable.includes(name) };
  };
  const classes = agentClassesThroughRenderer(root, agentFiles.map(f => info(join('claude', 'agents', f), f.slice(0, -3))).filter(a => a.configurable));
  const agentInfo = [
    ...agentFiles.map(f => ({ ...info(join('claude', 'agents', f), f.slice(0, -3)), ...(classes[f.slice(0, -3)] ?? { security: null, egress: null }) })),
    ...locked.map(n => ({ ...info(join('familiars', `${n}.md`), n), security: null, egress: null, locked: 'sealed: its digest covers its own file' })),
  ];

  // Skills the pact's own text names, so a preset naming one is not a finding.
  const pactNames = [...new Set([...parts.values()].flatMap(codeSpans))];
  return { moves, always, editable, setting, agents: agentInfo, agentChoices, pactNames };
}

// ------------------------------------------------------------ the builder file

const BUILDER_MAX = 1024 * 1024;
const PRESET_TEXT_MAX = 16 * 1024;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SKILL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,79}$/;
const AGENT_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LINE_RE = /^[^\n\r]{0,300}$/;
const YOURS_RE = { skills: SKILL_NAME_RE, commands: SKILL_NAME_RE, agents: AGENT_NAME_RE };
const YOURS_MAX = 2000;

const isObject = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const keysOnly = (o, allowed) => Object.keys(o).every(k => allowed.includes(k));

/** Why a preset's file path is refused, or null. Checked on its text before any file is opened. */
function presetPathProblem(p) {
  if (typeof p !== 'string' || p === '' || p.length > 200) return 'the file path is empty, not text or longer than 200 characters';
  if (isAbsolute(p) || p.startsWith('/') || p.includes('\\') || p.includes(':')) return 'the file path must be relative, with / separators and no colon';
  const segs = p.split('/');
  if (segs.length > 8 || segs.some(s => s === '' || s === '.' || s === '..' || s.endsWith('.') || !SEGMENT_RE.test(s))) return "the file path's segments must be letters, digits, '.', '_' and '-', with no . or .. segment";
  return null;
}

/** A preset file beside the builder file: a regular file, not a link, inside the builder's folder, read once. */
function readPresetFile(base, rel) {
  const file = resolve(base, ...rel.split('/'));
  const st = lstatSync(file);
  if (!st.isFile()) throw new Refused('preset', 'is not a regular file');
  const inside = relative(realpathSync.native(base), realpathSync.native(file));
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Refused('preset', "resolves outside the builder file's folder");
  const buf = readFileSync(file);
  if (buf.length > PRESET_TEXT_MAX) throw new Refused('preset', 'is larger than 16 KiB');
  return buf.toString('utf8');
}

/**
 * Read and check a builder file against the pact data `pact`. Returns
 * { builder, refusals, findings }: `builder` is the page's half of the data
 * when there are no refusals, else null. Messages name ids and fields, never
 * text taken from the file beyond an id that passed its pattern.
 */
export function loadBuilder(file, pact) {
  const refusals = [];
  const findings = [];
  const refuse = m => refusals.push(m);
  let buf;
  try {
    const st = lstatSync(file);
    if (!st.isFile()) return { builder: null, refusals: ['the builder file is not a regular file'], findings };
    buf = readFileSync(file);
  } catch {
    return { builder: null, refusals: ['the builder file could not be read'], findings };
  }
  if (buf.length > BUILDER_MAX) return { builder: null, refusals: ['the builder file is larger than 1 MiB'], findings };
  const report = new Report();
  if (scanText(buf, 'builder', report) === null) return { builder: null, refusals: ['the builder file is not clean UTF-8 text: no byte-order mark, carriage return, control or invisible character'], findings };
  let doc;
  try {
    doc = readStrictJson(buf);
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    return { builder: null, refusals: [`the builder file is not strict JSON: ${e.reason}`], findings };
  }
  if (!isObject(doc)) return { builder: null, refusals: ['the builder file is not a JSON object'], findings };
  if (!keysOnly(doc, ['schema', 'title', 'presets', 'workflows', 'yours'])) refuse('a top-level key that is not schema, title, presets, workflows or yours; the pact\'s own text is never part of a builder file');
  if (doc.schema !== 1) refuse('schema must be 1');
  if (Object.hasOwn(doc, 'title') && (typeof doc.title !== 'string' || !LINE_RE.test(doc.title) || doc.title.length > 80)) refuse('title must be one line of at most 80 characters');

  const base = dirname(resolve(file));
  const presets = [];
  const ids = new Set();
  const list = Object.hasOwn(doc, 'presets') ? doc.presets : [];
  if (!Array.isArray(list)) refuse('presets must be a list');
  else
    list.forEach((p, i) => {
      const at = `preset ${i + 1}`;
      if (!isObject(p) || !keysOnly(p, ['id', 'title', 'slot', 'text', 'file', 'standsIn', 'why'])) return refuse(`${at}: not an object with only id, title, slot, text, file, standsIn and why`);
      if (typeof p.id !== 'string' || !ID_RE.test(p.id)) return refuse(`${at}: id must be lowercase letters, digits and hyphens`);
      const name = `preset ${p.id}`;
      if (ids.has(p.id)) return refuse(`${name}: the id is used twice`);
      ids.add(p.id);
      if (typeof p.title !== 'string' || !LINE_RE.test(p.title) || p.title.length > 80 || p.title.trim() === '') return refuse(`${name}: title must be one line of 1 to 80 characters`);
      const slot = pact.editable.find(m => m === p.slot);
      if (!slot) return refuse(`${name}: slot must be one of ${pact.editable.join(', ')}`);
      if (Object.hasOwn(p, 'standsIn') && typeof p.standsIn !== 'boolean') return refuse(`${name}: standsIn must be true or false`);
      if (Object.hasOwn(p, 'why') && (typeof p.why !== 'string' || !LINE_RE.test(p.why))) return refuse(`${name}: why must be one line of at most 300 characters`);
      const hasText = Object.hasOwn(p, 'text');
      if (hasText === Object.hasOwn(p, 'file')) return refuse(`${name}: give exactly one of text and file`);
      let text;
      if (hasText) {
        if (typeof p.text !== 'string' || p.text.length > PRESET_TEXT_MAX) return refuse(`${name}: text must be at most 16 KiB of text`);
        text = p.text.replace(/\n$/, '');
      } else {
        const why = presetPathProblem(p.file);
        if (why) return refuse(`${name}: ${why}`);
        try {
          const raw = readPresetFile(base, p.file);
          if (!raw.endsWith('\n')) return refuse(`${name}: its file must end with a line feed`);
          text = raw.slice(0, -1);
        } catch (e) {
          return refuse(`${name}: its file ${e instanceof Refused ? e.reason : 'could not be read'}`);
        }
      }
      presets.push({ id: p.id, title: p.title, mark: slot, text, standsIn: p.standsIn === true, why: p.why ?? '' });
      if (!p.why) findings.push(`${name}: no "why"; the page shows a preset's why on its card`);
    });

  const workflows = [];
  const wids = new Set();
  const wl = Object.hasOwn(doc, 'workflows') ? doc.workflows : [];
  if (!Array.isArray(wl)) refuse('workflows must be a list');
  else
    wl.forEach((w, i) => {
      const at = `workflow ${i + 1}`;
      if (!isObject(w) || !keysOnly(w, ['id', 'title', 'about', 'presets'])) return refuse(`${at}: not an object with only id, title, about and presets`);
      if (typeof w.id !== 'string' || !ID_RE.test(w.id)) return refuse(`${at}: id must be lowercase letters, digits and hyphens`);
      if (wids.has(w.id)) return refuse(`workflow ${w.id}: the id is used twice`);
      wids.add(w.id);
      if (typeof w.title !== 'string' || !LINE_RE.test(w.title) || w.title.length > 80 || w.title.trim() === '') return refuse(`workflow ${w.id}: title must be one line of 1 to 80 characters`);
      if (typeof w.about !== 'string' || !LINE_RE.test(w.about)) return refuse(`workflow ${w.id}: about must be one line of at most 300 characters`);
      if (!Array.isArray(w.presets) || w.presets.some(x => typeof x !== 'string')) return refuse(`workflow ${w.id}: presets must be a list of preset ids`);
      const missing = w.presets.filter(x => !ids.has(x));
      if (missing.length) return refuse(`workflow ${w.id}: names ${missing.length} preset id${missing.length === 1 ? '' : 's'} the file does not define`);
      workflows.push({ id: w.id, title: w.title, about: w.about, presets: [...w.presets] });
    });

  const yours = { skills: [], commands: [], agents: [] };
  if (Object.hasOwn(doc, 'yours')) {
    if (!isObject(doc.yours) || !keysOnly(doc.yours, ['skills', 'commands', 'agents'])) refuse('yours must be an object with only skills, commands and agents');
    else
      for (const kind of ['skills', 'commands', 'agents']) {
        if (!Object.hasOwn(doc.yours, kind)) continue;
        const items = doc.yours[kind];
        if (!Array.isArray(items) || items.length > YOURS_MAX) {
          refuse(`yours.${kind} must be a list of at most ${YOURS_MAX}`);
          continue;
        }
        const seen = new Set();
        items.forEach((x, i) => {
          const at = `yours.${kind} ${i + 1}`;
          if (!isObject(x) || !keysOnly(x, ['name', 'description']) || typeof x.name !== 'string' || !YOURS_RE[kind].test(x.name)) return refuse(`${at}: needs a name of ${kind === 'agents' ? 'lowercase letters, digits and hyphens' : "letters, digits, '.', '_', '-' or ':'"}, and nothing but a description beside it`);
          if (Object.hasOwn(x, 'description') && (typeof x.description !== 'string' || !LINE_RE.test(x.description))) return refuse(`${at}: description must be one line of at most 300 characters`);
          if (kind === 'agents' && pact.agents.some(a => a.name === x.name)) return refuse(`${at}: ${x.name} is one of the pact's own agents`);
          if (seen.has(x.name)) return;
          seen.add(x.name);
          yours[kind].push({ name: x.name, description: x.description ?? '' });
        });
      }
  }

  // Text the page's content-policy test refuses never reaches a page.
  const POLICY_RE = /[a-z][a-z0-9+.-]*:\/\/|\bfetch\s*\(|\bimport\s*\(|\binnerHTML\b|\bouterHTML\b|\binsertAdjacentHTML\b|\bdocument\s*\.\s*write/i;
  const texts = [
    ...presets.flatMap(p => [['preset', p.id, p.title], ['preset', p.id, p.text], ['preset', p.id, p.why]]),
    ...workflows.flatMap(w => [['workflow', w.id, w.title], ['workflow', w.id, w.about]]),
    ...['skills', 'commands', 'agents'].flatMap(k => yours[k].map(x => [`yours.${k}`, x.name, x.description])),
    ['title', '', typeof doc.title === 'string' ? doc.title : ''],
  ];
  for (const [kind, id, text] of texts) if (POLICY_RE.test(text)) refuse(`${kind}${id ? ` ${id}` : ''}: holds text the page's content policy refuses (a URL, fetch(, import(, innerHTML or a document write)`);
  // A workflow may not stand two presets for one slot in for its text.
  for (const w of workflows) {
    const standing = w.presets.map(id => presets.find(p => p.id === id)).filter(p => p && p.standsIn);
    const slots = standing.map(p => p.mark);
    if (new Set(slots).size !== slots.length) refuse(`workflow ${w.id}: two presets stand in for one slot's text`);
  }

  // Findings: what is legal but probably not meant.
  const known = new Set([...pact.pactNames, ...pact.agents.map(a => a.name), ...yours.skills.map(x => x.name), ...yours.commands.map(x => x.name), ...yours.commands.map(x => `/${x.name}`), ...yours.agents.map(x => x.name)]);
  const listed = yours.skills.length + yours.commands.length + yours.agents.length;
  for (const p of presets) {
    const unknown = codeSpans(p.text).filter(n => /^\/?[A-Za-z0-9][A-Za-z0-9:._-]*$/.test(n) && n.includes('-') && !known.has(n));
    if (listed && unknown.length) findings.push(`preset ${p.id}: names ${unknown.length} skill or agent${unknown.length === 1 ? '' : 's'} not in yours; check ${unknown.length === 1 ? 'it is' : 'they are'} installed`);
    if (p.standsIn) {
      const routed = pact.moves.flatMap(m => m.parts).find(q => q.mark === p.mark).agents;
      const lost = routed.filter(a => !codeSpans(p.text).includes(a));
      if (lost.length) findings.push(`preset ${p.id}: it stands in for ${p.mark}'s text but drops ${lost.length} agent${lost.length === 1 ? '' : 's'} that text routes to; the install would refuse it on its own`);
    }
  }
  if (!listed) findings.push('yours lists no skills, commands or agents; the page\'s "Yours" section will say so');

  if (refusals.length) return { builder: null, refusals, findings };
  return { builder: { title: typeof doc.title === 'string' ? doc.title : '', presets, workflows, yours }, refusals, findings };
}

/**
 * Run every preset's text through the installer's renderer, as an add-after
 * edit to its slot in a throwaway Claude home. Returns one refusal per preset
 * the renderer refuses, carrying the renderer's own FAIL lines (fixed text).
 */
export function presetsThroughRenderer(root, presets) {
  const out = [];
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  for (const p of presets) {
    const home = mkdtempSync(join(tmpdir(), 'pact-builder-check-'));
    const dest = mkdtempSync(join(tmpdir(), 'pact-builder-out-'));
    try {
      mkdirSync(join(home, 'pact', 'blocks'), { recursive: true });
      writeFileSync(join(home, 'pact', 'config.json'), `${JSON.stringify({ schema: 1, edits: [{ mark: p.mark, op: 'add-after', file: 'b.md' }] })}\n`);
      writeFileSync(join(home, 'pact', 'blocks', 'b.md'), `${p.text}\n`);
      const r = spawnSync(process.execPath, [join(root, 'gate', 'render.mjs'), join(root, 'claude', 'CLAUDE.md'), dest, home], { encoding: 'utf8', env });
      if (r.status !== 0) {
        const fails = (r.stdout || '').split('\n').filter(l => l.startsWith('FAIL '));
        out.push(`preset ${p.id}: the installer's renderer refuses its text${fails.length ? ` (${fails.join('; ')})` : ''}`);
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }
  }
  return out;
}

/**
 * Each configurable agent's class, as the installer's renderer reports it:
 * { <name>: { security, egress } }. One render sets every one of them off its
 * file's model, and reads the AGENT lines' words.
 */
function agentClassesThroughRenderer(root, agents) {
  if (!agents.length) return {};
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const home = mkdtempSync(join(tmpdir(), 'pact-builder-agents-'));
  const dest = mkdtempSync(join(tmpdir(), 'pact-builder-out-'));
  try {
    mkdirSync(join(home, 'pact'), { recursive: true });
    const set = Object.fromEntries(agents.map(a => [a.name, { model: a.model === 'opus' ? 'sonnet' : 'opus' }]));
    writeFileSync(join(home, 'pact', 'config.json'), `${JSON.stringify({ schema: 1, agents: set })}\n`);
    const r = spawnSync(process.execPath, [join(root, 'gate', 'render.mjs'), join(root, 'claude', 'CLAUDE.md'), dest, home], { encoding: 'utf8', env });
    if (r.status !== 0) fail(`the installer's renderer refuses to set the configurable agents (${(r.stdout || '').split('\n').filter(l => l.startsWith('FAIL ')).join('; ')})`);
    const out = {};
    for (const m of (r.stdout || '').matchAll(/^AGENT ([a-z-]+) \S+ \S+ [0-9a-f]{64} (plain|security-set) override (local|egress)$/gm)) out[m[1]] = { security: m[2] === 'security-set', egress: m[3] === 'egress' };
    for (const a of agents) if (!out[a.name]) fail(`the installer's renderer did not report ${a.name}'s class`);
    return out;
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(dest, { recursive: true, force: true });
  }
}

/** Check a builder file fully: its own rules, then every preset through the renderer. */
export function checkBuilder(root, file) {
  const pact = pactData(root);
  const r = loadBuilder(file, pact);
  if (r.builder) r.refusals.push(...presetsThroughRenderer(root, r.builder.presets));
  if (r.refusals.length) r.builder = null;
  return { ...r, pact };
}

const sha256b64 = s => createHash('sha256').update(s, 'utf8').digest('base64');
const ESC_LT = `${String.fromCharCode(92)}u003c`;

/** The page `html` with its data object rebuilt from the pact and the builder file, and its policy hashes recomputed. */
export function buildPage(root, html, builderFile = join(root, EXAMPLE_BUILDER_REL)) {
  if (!DATA_RE.test(html)) fail('the page has no pact-data marks');
  const pact = pactData(root);
  const { builder, refusals } = loadBuilder(builderFile, pact);
  if (!builder) fail(`the builder file is refused: ${refusals.join('; ')}`);
  const { pactNames, ...shown } = pact;
  // JSON inside a script: "<" is escaped, so no text can close the script or open a comment.
  const json = JSON.stringify({ ...shown, ...builder }, null, 1).replaceAll('<', ESC_LT);
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

const FOLD = process.platform === 'win32' || process.platform === 'darwin';
/** A path's canonical form: its folder's real path joined with its name, case-folded where the file system folds case. */
function canonical(p) {
  const abs = resolve(p);
  let real;
  try {
    real = join(realpathSync.native(dirname(abs)), abs.slice(dirname(abs).length + 1));
  } catch {
    real = abs;
  }
  return FOLD ? real.toLowerCase() : real;
}

/**
 * Why a page may not be written at `out`, or null. A page carries the person's
 * own presets and lists, so it is never written inside this clone, where a
 * commit would publish it, and never over the builder file. Paths compare in
 * canonical form, so a different spelling of the same file is caught.
 */
export function outProblem(root, out, builder) {
  const o = canonical(out);
  if (o === canonical(builder)) return 'must not be the builder file';
  const r = canonical(join(root, 'x')).slice(0, -1);
  if (o.startsWith(r)) return 'must be outside this clone: a page carries your own presets and lists, so keep it out of any repo';
  return null;
}

function printCheck(name, r) {
  for (const m of r.refusals) process.stdout.write(`REFUSE ${m}\n`);
  for (const m of r.findings) process.stdout.write(`FINDING ${m}\n`);
  process.stdout.write(`RESULT: ${r.refusals.length ? 'refused' : 'pass'} (${name}: ${r.refusals.length} refusal${r.refusals.length === 1 ? '' : 's'}, ${r.findings.length} finding${r.findings.length === 1 ? '' : 's'})\n`);
}

function main(argv) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const page = join(root, PAGE_REL);
  const usage = () => {
    process.stdout.write('usage: node builder/build.mjs [--check] | --builder <file> (--check | --out <page>)\n');
    process.exitCode = 2;
  };
  const opts = { check: false, builder: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--check') opts.check = true;
    else if (argv[i] === '--builder' && argv[i + 1]) opts.builder = argv[(i += 1)];
    else if (argv[i] === '--out' && argv[i + 1]) opts.out = argv[(i += 1)];
    else return usage();
  }

  if (!opts.builder) {
    if (opts.out) return usage();
    const r = checkBuilder(root, join(root, EXAMPLE_BUILDER_REL));
    if (opts.check) printCheck(EXAMPLE_BUILDER_REL, r);
    if (!r.builder) {
      if (!opts.check) printCheck(EXAMPLE_BUILDER_REL, r);
      process.exitCode = 1;
      return;
    }
    const now = readFileSync(page, 'utf8');
    const next = buildPage(root, now);
    if (opts.check) {
      if (next !== now) {
        process.stdout.write(`${PAGE_REL} is out of date: run node builder/build.mjs\n`);
        process.exitCode = 1;
      } else process.stdout.write(`${PAGE_REL} is up to date\n`);
      return;
    }
    if (next !== now) writeFileSync(page, next);
    process.stdout.write(next !== now ? `${PAGE_REL} rebuilt\n` : `${PAGE_REL} already up to date\n`);
    return;
  }

  if (opts.check === Boolean(opts.out)) return usage();
  const r = checkBuilder(root, opts.builder);
  printCheck('builder file', r);
  if (!r.builder) {
    process.exitCode = 1;
    return;
  }
  if (opts.check) return;
  const why = outProblem(root, opts.out, opts.builder);
  if (why) {
    process.stdout.write(`REFUSE --out ${why}\n`);
    process.exitCode = 1;
    return;
  }
  writeFileSync(resolve(opts.out), buildPage(root, readFileSync(page, 'utf8'), opts.builder));
  process.stdout.write(`WROTE ${resolve(opts.out)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
