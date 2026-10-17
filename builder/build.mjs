#!/usr/bin/env node
// Builds the config builder page (#53, slice 7) from the pact and a builder file.
//
//   node builder/build.mjs                                 rebuild builder/scriptorium.html from the example builder file
//   node builder/build.mjs --check                         check the example builder file, and that the page is up to date
//   node builder/build.mjs --builder <file> --check        check a builder file: refusals and findings
//   node builder/build.mjs --builder <file> --out <page>   check it, then write a page from it
//   node builder/build.mjs --builder <file> --texts        check it, then print each part it changes as the page saves it
//
// The page runs from disk with no network, so everything it shows is carried
// inside it, as one JSON object in its script between the pact-data marks.
// That object has two sources, and they never mix:
//
//   - The pact itself, always from this clone: its parts and locked clauses
//     (claude/CLAUDE.md), the renderer's lists (gate/render-core.mjs) and the
//     fixed blocks (gate/shared.mjs), both read as text, never run as
//     modules, and the pact's agents (claude/agents/). A builder file cannot
//     change any of it.
//   - A builder file (schema below): the person's own parts, models, skills,
//     commands and agents. The /scriptorium command writes one from
//     the person's own workflow and revises it over time;
//     examples/pact-config/builder.json is the shipped one.
//
// The builder file:
//   { "schema": 1, "title": <text, optional>,
//     "yours": { "skills" | "commands" | "agents": [ { "name", "description" } ] },
//     "moves", "tiers", "sensitive", "workflowGraph", "lenses", "qualities", "costLimits": the
//       parts Scriptorium builds, each optional, in the shapes builder/parts.mjs
//       describes (#262),
//     "models": [<model>]: the Models list every dropdown offers, optional (#262 S19),
//     "agentFiles": { <agent name>: <the whole agent file> }: the agent files
//       written or edited on the page, optional (#262 addendum 4) }
// A builder file is also a preset: a saved result, shipped in builder/presets/
// or shared, that the page loads after the person ticks what to take.
// Skills bind to the workflow's stages as skill nodes, never to a move: the
// moves are upheld at all times (#262).
//
// A check refuses what the page could not use (exit 1) and reports findings,
// which never refuse (exit 0): a finding is answered by fixing the file or by
// saying why it is meant. Each changed part is run through the installer's
// own renderer, so a part the install would refuse never reaches a page.
// The page's own checks are for usability only; the installer stays the
// authority on what the page saves.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readStrictJson, Refused, Report, scanText } from '../gate/shared.mjs';
import { DEFAULT_PARTS, PART_MARKS, compileParts, copyParts, modelsProblems, partsProblems, partsTexts, dropRetired, reconcileTiers, RETIRED_AGENTS, upgradeParts } from './parts.mjs';

export const PAGE_REL = 'builder/scriptorium.html';
export const EXAMPLE_BUILDER_REL = 'examples/pact-config/builder.json';
// The presets the pact ships (#262 addendum 4): builder files, each checked as any is.
export const PRESETS_REL = 'builder/presets';
// The rules source: claude/CLAUDE.md in a clone, claude/rules.source.md in the
// installed builder kit, which holds no file named CLAUDE.md (#203, S6).
export const RULES_REL = 'claude/CLAUDE.md';
export const KIT_RULES_REL = 'claude/rules.source.md';
// The oldest Node the kit runs on: the pact's floor.
export const NODE_FLOOR = 24;

/** Whether `root` is the installed builder kit rather than a clone. */
export function isKit(root) {
  return existsSync(join(root, KIT_RULES_REL));
}

/** The rules source under `root`; refused when it holds both or neither. */
export function rulesPath(root) {
  const clone = existsSync(join(root, RULES_REL));
  const kit = isKit(root);
  if (clone === kit) fail(clone ? `both ${RULES_REL} and ${KIT_RULES_REL} are here: a kit holds only the second` : `neither ${RULES_REL} nor ${KIT_RULES_REL} is here`);
  return join(root, kit ? KIT_RULES_REL : RULES_REL);
}

const MARK_RE = /^( *)<!-- pact:(begin|end) ([a-z][a-z0-9-]*) -->$/;
const DATA_RE = /\/\* pact-data:begin \*\/[\s\S]*?\/\* pact-data:end \*\//;
// The parts' compiler and checks, copied in from builder/parts.mjs (#262), so the page and the check share one compiler.
const PARTS_CODE_RE = /\/\* parts-code:begin \*\/[\s\S]*?\/\* parts-code:end \*\//;
const PARTS_FILE = join(dirname(fileURLToPath(import.meta.url)), 'parts.mjs');
// The Scriptorium mark (#275), copied into the page's head as plain markup.
const MARK_REL = 'docs/brand/scriptorium/scriptorium-mark.svg';
const MARK_SLOT_RE = /(<span class="brand-mark" aria-hidden="true">)[\s\S]*?(<\/span>)/;
const MARK_TAGS = new Set(['svg', 'g', 'rect', 'line', 'path']);
const MARK_ATTRS = new Set(['viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'd', 'fill', 'stroke', 'stroke-width']);
/**
 * The mark as markup the page may carry: its namespace attribute dropped (the
 * HTML parser puts an svg element in its namespace), and every element and
 * attribute on a short list, so it holds no script, link, style or address.
 */
function markMarkup(root) {
  const svg = readFileSync(join(root, MARK_REL), 'utf8').replace(/ xmlns="[^"]*"/, '').trim();
  for (const m of svg.matchAll(/<\/?([a-zA-Z][\w-]*)([^>]*)>/g)) {
    if (!MARK_TAGS.has(m[1])) fail(`${MARK_REL} holds a ${m[1]} element the page does not carry`);
    const attrs = m[2].replace(/\/$/, '').trim();
    if (!attrs) continue;
    for (const a of attrs.matchAll(/([^\s=]+)="([^"]*)"/g)) {
      if (!MARK_ATTRS.has(a[1])) fail(`${MARK_REL} holds a ${a[1]} attribute the page does not carry`);
      if (/[<>:()]/.test(a[2])) fail(`${MARK_REL} holds an attribute value the page does not carry`);
    }
    if (attrs.replace(/([^\s=]+)="([^"]*)"/g, '').trim()) fail(`${MARK_REL} holds an attribute the page cannot read`);
  }
  return svg.replace(/ width="24" height="24"/, ' width="34" height="34"');
}

/** builder/parts.mjs as page script: its header comment and every "export " taken off. */
const partsCode = () => readFileSync(PARTS_FILE, 'utf8').replace(/^(?:\/\/.*\n)+\n/, '').replace(/^export /gm, '');
const SCRIPT_RE = /<script>([\s\S]*?)<\/script>/;
const STYLE_RE = /<style>([\s\S]*?)<\/style>/;
const CSP_RE = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(">)/;

const fail = msg => {
  throw new Error(`builder: ${msg}`);
};

/** A quoted list declared in a gate file's text, such as OPEN_MARKS in gate/render-core.mjs. */
function listFrom(src, name, file = 'gate/render-core.mjs') {
  const m = new RegExp(`const ${name} = Object\\.freeze\\(\\[([^\\]]*)\\]\\)`).exec(src);
  if (!m) fail(`${file} no longer declares ${name} as a frozen list`);
  return [...m[1].matchAll(/'([^']*)'/g)].map(x => x[1]);
}

/** The usage-pause setting's range and default, read from gate/render-core.mjs's text. */
function settingFrom(renderSrc) {
  const m = /\['usage-pause', Object\.freeze\(\{ mark: 'usage-pause', min: (\d+), max: (\d+), def: (\d+),/.exec(renderSrc);
  if (!m) fail('gate/render-core.mjs no longer declares the usage-pause setting in the expected form');
  return { name: 'usage-pause', min: Number(m[1]), max: Number(m[2]), def: Number(m[3]) };
}

/** The session limit's range (#142): a setting with no default, read from gate/render-core.mjs's text. */
function sessionFrom(renderSrc) {
  const m = /\['usage-pause-session', Object\.freeze\(\{ mark: 'usage-pause-session', min: (\d+), max: (\d+), def: null,/.exec(renderSrc);
  if (!m) fail('gate/render-core.mjs no longer declares the usage-pause-session setting in the expected form');
  return { name: 'usage-pause-session', min: Number(m[1]), max: Number(m[2]) };
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
    seq.push({ text: true });
  }
  if (cur) fail(`${cur.name} never closes`);
  return { parts, seq };
}

const codeSpans = text => [...text.matchAll(/`([^`\n]+)`/g)].map(m => m[1]);

/** The pact's half of the page data, always from the clone at `root`: the parts, locked clauses, the usage setting and the pact's agents. */
export function pactData(root) {
  const src = readFileSync(rulesPath(root), 'utf8');
  const renderSrc = readFileSync(join(root, 'gate', 'render-core.mjs'), 'utf8');
  const open = listFrom(renderSrc, 'OPEN_MARKS');
  const editable = listFrom(renderSrc, 'EDITABLE');
  const gated = listFrom(readFileSync(join(root, 'gate', 'shared.mjs'), 'utf8'), 'PINNED', 'gate/shared.mjs');
  const agentFiles = readdirSync(join(root, 'claude', 'agents'))
    .filter(f => f.endsWith('.md'))
    .sort();
  const agents = agentFiles.map(f => f.slice(0, -3));
  const { parts, seq } = parseSource(src);

  // Every editable part is one Scriptorium builds (#262): the moves are one of them.
  for (const m of editable) if (!PART_MARKS.includes(m)) fail(`the editable part ${m} is not a part Scriptorium builds`);
  for (const m of open) if (parts.get(m) === undefined) fail(`claude/CLAUDE.md has no ${m} part`);
  const partText = {};
  for (const m of PART_MARKS) {
    if (!editable.includes(m) || parts.get(m) === undefined) fail(`claude/CLAUDE.md has no editable ${m} part`);
    partText[m] = parts.get(m);
  }
  const compiled = compileParts(DEFAULT_PARTS);
  for (const m of PART_MARKS) if (compiled[m] !== partText[m]) fail(`builder/parts.mjs's default ${m} no longer compiles to the ${m} part in claude/CLAUDE.md`);

  for (const s of seq) if (s.mark && !open.includes(s.mark) && !gated.includes(s.mark)) fail(`${s.mark} is neither an open nor a fixed mark`);
  const always = seq.filter(s => s.mark && gated.includes(s.mark)).map(s => ({ mark: s.mark, text: parts.get(s.mark) }));

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
  // The efforts are the renderer's; a model is any the person's Models list holds (#262 S16, S19).
  const agentChoices = { efforts: listFrom(renderSrc, 'AGENT_EFFORTS') };
  const info = (rel, name) => {
    const file = readFileSync(join(root, rel), 'utf8');
    const head = /^---\n([\s\S]*?)\n---\n/.exec(file);
    if (!head) fail(`${rel} has no frontmatter`);
    const field = k => (new RegExp(`^${k}:[ \\t]*([A-Za-z0-9._-]+)[ \\t]*$`, 'm').exec(head[1]) ?? [])[1] ?? null;
    const runs = [
      ...always.filter(a => named(a.text, name)).map(a => ({ mark: a.mark, kind: 'gated' })),
      // #262 S8: its offers in the workflow and its row in the roster. The page counts them from the person's own parts.
      ...['moves', 'workflow', 'lenses'].filter(m => named(partText[m], name)).map(m => ({ mark: m, kind: 'part' })),
    ];
    // #262 addendum 3: the whole file, the default the page's prompt editor starts from.
    return { name, model: field('model'), effort: field('effort'), runs, configurable: configurable.includes(name), file };
  };
  const classes = agentClassesThroughRenderer(root, agentFiles.map(f => info(join('claude', 'agents', f), f.slice(0, -3))).filter(a => a.configurable));
  const agentInfo = agentFiles.map(f => ({ ...info(join('claude', 'agents', f), f.slice(0, -3)), ...(classes[f.slice(0, -3)] ?? { security: null, egress: null }) }));

  const session = sessionFrom(renderSrc);
  return { always, editable, setting, session, parts: { marks: [...PART_MARKS], text: partText, defaults: DEFAULT_PARTS }, agents: agentInfo, agentChoices };
}

// ------------------------------------------------------------ the builder file

const BUILDER_MAX = 1024 * 1024;
const SKILL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,79}$/;
const AGENT_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LINE_RE = /^[^\n\r]{0,300}$/;
const YOURS_RE = { skills: SKILL_NAME_RE, commands: SKILL_NAME_RE, agents: AGENT_NAME_RE };
const YOURS_MAX = 2000;
// The builder file's keys for the parts (#262), in PART_MARKS order: workflowGraph holds the workflow part's graph.
const AGENT_FILES_MAX = 32;
const AGENT_FILE_MAX = 65536;
const PART_KEYS = Object.freeze(['moves', 'tiers', 'sensitive', 'workflowGraph', 'lenses', 'qualities', 'costLimits']);

/** Whether `v` holds a __proto__ key as its own, at any depth. */
function holdsProtoKey(v) {
  if (Array.isArray(v)) return v.some(holdsProtoKey);
  if (!isObject(v)) return false;
  return Object.keys(v).some(k => k === '__proto__' || holdsProtoKey(v[k]));
}

const isObject = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const keysOnly = (o, allowed) => Object.keys(o).every(k => allowed.includes(k));

/**
 * Read and check a builder file against the pact data `pact`. Returns
 * { builder, refusals, findings, givenParts }: `givenParts` is the part keys
 * the file holds, beside `builder`, never inside it; `builder` is the page's half of the data
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
    if (st.size > BUILDER_MAX) return { builder: null, refusals: ['the builder file is larger than 1 MiB'], findings };
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
  // The page binds its data as an object literal, where a __proto__ key would set an object's prototype.
  if (holdsProtoKey(doc)) return { builder: null, refusals: ['the builder file holds a __proto__ key, which the page cannot carry'], findings };
  const givenParts = PART_KEYS.filter(k => Object.hasOwn(doc, k));
  if (Object.hasOwn(doc, 'presets') || Object.hasOwn(doc, 'workflows')) refuse('presets and workflows left the builder (#262): bind a skill to a stage as a skill node in workflowGraph instead');
  else if (!keysOnly(doc, ['schema', 'title', 'yours', ...PART_KEYS, 'models', 'agentFiles'])) refuse(`a top-level key that is not schema, title, yours, ${PART_KEYS.join(', ')}, models or agentFiles; the pact's own text is never part of a builder file`);
  if (doc.schema !== 1) refuse('schema must be 1');
  if (Object.hasOwn(doc, 'title') && (typeof doc.title !== 'string' || !LINE_RE.test(doc.title) || doc.title.length > 80)) refuse('title must be one line of at most 80 characters');

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

  // The four parts (#262): a key the file leaves out keeps the pact's default.
  let parts = null;
  let droppedRetired = false;
  if (PART_KEYS.some(k => Object.hasOwn(doc, k))) {
    parts = copyParts(DEFAULT_PARTS);
    for (const k of PART_KEYS) if (Object.hasOwn(doc, k)) parts[k] = doc[k];
    upgradeParts(parts);
    // A retired agent's name goes, with a finding and a note on the page (#302).
    if (dropRetired(parts)) droppedRetired = true;
    // Tiers from the file meet the pact's workflow when it gives none, as on the page.
    reconcileTiers(parts);
    for (const f of partsProblems(parts)) (f.level === 'error' ? refusals : findings).push(`${f.part}: ${f.text}`);
  }
  // The Models list (#262 S19): each entry one model of the gate's shape.
  const models = Object.hasOwn(doc, 'models') ? doc.models : null;
  if (models !== null) for (const p of modelsProblems(models)) refusals.push(`models: ${p}`);

  // The agent files (#262 addendum 4): by name, each the whole file as text.
  const agentFiles = Object.hasOwn(doc, 'agentFiles') ? doc.agentFiles : null;
  if (agentFiles !== null) {
    if (!isObject(agentFiles) || Object.keys(agentFiles).length > AGENT_FILES_MAX) refuse(`agentFiles must map at most ${AGENT_FILES_MAX} agent names to their files`);
    else
      for (const [i, [name, text]] of Object.entries(agentFiles).entries()) {
        if (!AGENT_NAME_RE.test(name)) refuse(`agentFiles entry ${i + 1} is not an agent name of lowercase letters, digits and hyphens`);
        else if (typeof text !== 'string' || !text.trim() || text.length > AGENT_FILE_MAX) refuse(`agentFiles ${name}: the file must be text of 1 to ${AGENT_FILE_MAX} characters`);
      }
  }

  // Text the page's content-policy test refuses never reaches a page.
  const POLICY_RE = /[a-z][a-z0-9+.-]*:\/\/|\bfetch\s*\(|\bimport\s*\(|\binnerHTML\b|\bouterHTML\b|\binsertAdjacentHTML\b|\bdocument\s*\.\s*write/i;
  const texts = [
    ...(parts ? partsTexts(parts).map(([where, text]) => [where, '', text]) : []),
    ...(Array.isArray(models) ? models.filter(m => typeof m === 'string').map(m => ['models', '', m]) : []),
    ...['skills', 'commands', 'agents'].flatMap(k => yours[k].map(x => [`yours.${k}`, x.name, x.description])),
    ['title', '', typeof doc.title === 'string' ? doc.title : ''],
    ...(isObject(agentFiles) ? Object.entries(agentFiles).filter(([, t]) => typeof t === 'string').map(([n, t]) => ['agentFiles', n, t]) : []),
  ];
  for (const [kind, id, text] of texts) if (POLICY_RE.test(text)) refuse(`${kind}${id ? ` ${id}` : ''}: holds text the page's content policy refuses (a URL, fetch(, import(, innerHTML or a document write)`);
  // In a part or an agent file, an @ followed by a path is a file import to Claude Code, which pulls that file into every session. The gate no longer refuses one (ADR 0069), so it is a finding here, never a refusal.
  const IMPORT_RE = /(^|\s)@[^\s@]/;
  for (const [kind, id, text] of texts) if (!kind.startsWith('yours') && kind !== 'models' && kind !== 'title' && IMPORT_RE.test(text)) findings.push(`${kind}${id ? ` ${id}` : ''}: holds an @ followed by a path, which Claude Code reads as a file import and loads into every session; make sure that is meant`);
  if (isObject(agentFiles) && Object.keys(agentFiles).some(n => RETIRED_AGENTS.includes(n))) {
    for (const n of RETIRED_AGENTS) delete agentFiles[n];
    droppedRetired = true;
  }
  if (droppedRetired) findings.push('names an agent the pact retired; the page takes the name out of the lens offers, lens rows, qualities and agent files, and says so');
  const listed = yours.skills.length + yours.commands.length + yours.agents.length;
  if (!listed) findings.push('yours lists no skills, commands or agents; the page\'s "Yours" section will say so');

  if (refusals.length) return { builder: null, refusals, findings, givenParts };
  return { givenParts, builder: { title: typeof doc.title === 'string' ? doc.title : '', yours, ...(parts ? { ownParts: parts } : {}), ...(models ? { ownModels: [...models] } : {}), ...(agentFiles ? { ownAgentFiles: { ...agentFiles } } : {}), ...(droppedRetired ? { droppedRetired: true } : {}) }, refusals, findings };
}

/**
 * Run each part a builder file changes through the installer's renderer, as
 * a replace edit, in a throwaway Claude home. Returns one refusal per part the
 * renderer refuses, carrying its FAIL lines.
 */
export function partsThroughRenderer(root, parts) {
  return renderEdits(root, changedParts(root, parts).map(([m, text]) => ({ id: m, mark: m, op: 'replace', text }))).map(p => `${p.id}: the installer's renderer refuses the compiled part${p.fails}`);
}

/** Each part `parts` changes from the pact's text, as [mark, its compiled text]: the replace edits a save writes. */
export function changedParts(root, parts) {
  if (!parts) return [];
  const pact = readFileSync(rulesPath(root), 'utf8');
  const compiled = compileParts(parts);
  return PART_MARKS.filter(m => !pact.includes(`<!-- pact:begin ${m} -->\n${compiled[m]}\n<!-- pact:end ${m} -->`)).map(m => [m, compiled[m]]);
}

/** Each { id, mark, op, text } rendered alone through the installer's renderer: [{ id, fails }] for each it refuses. */
function renderEdits(root, edits) {
  const out = [];
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  for (const e of edits) {
    const home = mkdtempSync(join(tmpdir(), 'scriptorium-check-'));
    const dest = mkdtempSync(join(tmpdir(), 'scriptorium-out-'));
    try {
      mkdirSync(join(home, 'pact', 'blocks'), { recursive: true });
      writeFileSync(join(home, 'pact', 'config.json'), `${JSON.stringify({ schema: 1, edits: [{ mark: e.mark, op: e.op, file: 'b.md' }] })}\n`);
      writeFileSync(join(home, 'pact', 'blocks', 'b.md'), `${e.text}\n`);
      const r = spawnSync(process.execPath, [join(root, 'gate', 'render.mjs'), rulesPath(root), dest, home], { encoding: 'utf8', env });
      if (r.status !== 0) {
        const fails = (r.stdout || '').split('\n').filter(l => l.startsWith('FAIL '));
        out.push({ id: e.id, fails: fails.length ? ` (${fails.join('; ')})` : '' });
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
  const home = mkdtempSync(join(tmpdir(), 'scriptorium-agents-'));
  const dest = mkdtempSync(join(tmpdir(), 'scriptorium-out-'));
  try {
    mkdirSync(join(home, 'pact'), { recursive: true });
    const set = Object.fromEntries(agents.map(a => [a.name, { model: a.model === 'opus' ? 'sonnet' : 'opus' }]));
    writeFileSync(join(home, 'pact', 'config.json'), `${JSON.stringify({ schema: 1, agents: set })}\n`);
    const r = spawnSync(process.execPath, [join(root, 'gate', 'render.mjs'), rulesPath(root), dest, home], { encoding: 'utf8', env });
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

/** Check a builder file fully: its own rules, then every changed part through the renderer. */
export function checkBuilder(root, file) {
  const pact = pactData(root);
  const r = loadBuilder(file, pact);
  if (r.builder) r.refusals.push(...partsThroughRenderer(root, r.builder.ownParts));
  if (r.refusals.length) r.builder = null;
  return { ...r, pact };
}

const sha256b64 = s => createHash('sha256').update(s, 'utf8').digest('base64');
const ESC_LT = `${String.fromCharCode(92)}u003c`;

/**
 * The shipped presets, by file name: each checked as a builder file, and
 * carried with only what it holds: the parts it gives, its models and its
 * agent files. The page lists what each carries before anything is taken.
 */
export function shippedPresets(root, pact, dir = join(root, PRESETS_REL)) {
  let names;
  try {
    names = readdirSync(dir).filter(n => n.endsWith('.json')).sort();
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  return names.map(name => {
    const file = join(dir, name);
    const { builder, refusals, givenParts } = loadBuilder(file, pact);
    if (!builder) fail(`the preset ${name} is refused: ${refusals.join('; ')}`);
    const parts = Object.fromEntries(givenParts.map(k => [k, builder.ownParts[k]]));
    return { id: name.slice(0, -'.json'.length), title: builder.title || name, parts, ...(builder.ownModels ? { models: builder.ownModels } : {}), ...(builder.ownAgentFiles ? { agentFiles: builder.ownAgentFiles } : {}) };
  });
}

// A person's own presets (#283): one fixed folder beside the kit, read only by the installed kit.
export const OWN_PRESETS_MAX = 16;
const OWN_PRESET_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.json$/;
const YOURS_NONE = 'yours lists no skills, commands or agents; the page\'s "Yours" section will say so';

/** `<Claude home>/pact/presets` when `root` is the installed kit, else null: a clone reads no personal folder. */
export function personalPresetsDir(root) {
  return isKit(root) ? join(root, '..', 'presets') : null;
}

/**
 * A person's own presets: { presets, findings }. Each *.json in the folder is
 * checked as a builder file is, and carried with only its parts, models and
 * agent files; one that fails is left out with a finding. Never throws, and no
 * finding quotes text from inside a file; a checked file name is the one piece
 * of file-chosen text a finding carries.
 */
export function personalPresets(root, pact, dir = personalPresetsDir(root)) {
  const presets = [];
  const findings = [];
  if (dir === null) return { presets, findings };
  let names;
  try {
    names = readdirSync(dir).filter(n => n.endsWith('.json')).sort();
  } catch (e) {
    if (e.code !== 'ENOENT') findings.push('presets: your presets folder could not be read; no presets were listed');
    return { presets, findings };
  }
  const fit = names.filter(n => OWN_PRESET_NAME_RE.test(n));
  if (fit.length !== names.length) findings.push("presets: a file in your presets folder has a name the page can't carry; it is left out");
  for (const name of fit.slice(0, OWN_PRESETS_MAX)) {
    const at = `presets/${name}`;
    const r = loadBuilder(join(dir, name), pact);
    if (r.builder) r.refusals.push(...partsThroughRenderer(root, r.builder.ownParts));
    if (r.refusals.length) {
      findings.push(`${at}: left out: ${r.refusals.join('; ')}`);
      continue;
    }
    const b = r.builder;
    if (!r.givenParts.length && !b.ownModels && !b.ownAgentFiles) {
      findings.push(`${at}: left out: it gives no part, models or agent files`);
      continue;
    }
    for (const f of r.findings) if (f !== YOURS_NONE) findings.push(`${at}: ${f}`);
    const id = name.slice(0, -'.json'.length);
    presets.push({ id, title: b.title || id, parts: Object.fromEntries(r.givenParts.map(k => [k, b.ownParts[k]])), ...(b.ownModels ? { models: b.ownModels } : {}), ...(b.ownAgentFiles ? { agentFiles: b.ownAgentFiles } : {}), ...(b.droppedRetired ? { droppedRetired: true } : {}) });
  }
  const past = fit.length - OWN_PRESETS_MAX;
  if (past > 0) findings.push(`presets: ${past} more file${past === 1 ? '' : 's'} in your presets folder ${past === 1 ? 'is' : 'are'} past the limit of ${OWN_PRESETS_MAX} and ${past === 1 ? 'is' : 'are'} left out`);
  return { presets, findings };
}

/** The page `html` with its data object rebuilt from the pact and the builder file, and its policy hashes recomputed. */
export function buildPage(root, html, builderFile = join(root, EXAMPLE_BUILDER_REL), ownPresets = []) {
  if (!DATA_RE.test(html)) fail('the page has no pact-data marks');
  const pact = pactData(root);
  const { builder, refusals } = loadBuilder(builderFile, pact);
  if (!builder) fail(`the builder file is refused: ${refusals.join('; ')}`);
  const presets = shippedPresets(root, pact);
  // JSON inside a script: "<" is escaped, so no text can close the script or open a comment.
  const json = JSON.stringify({ ...pact, presets, ownPresets, ...builder }, null, 1).replaceAll('<', ESC_LT);
  let out = html.replace(DATA_RE, () => `/* pact-data:begin */ ${json} /* pact-data:end */`);
  if (!PARTS_CODE_RE.test(out)) fail('the page has no parts-code marks');
  out = out.replace(PARTS_CODE_RE, () => `/* parts-code:begin */\n${partsCode()}/* parts-code:end */`);
  if (!MARK_SLOT_RE.test(out)) fail('the page has no brand-mark slot');
  out = out.replace(MARK_SLOT_RE, (_, a, b) => `${a}${markMarkup(root)}${b}`);
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
 * own parts and lists, so it is never written inside this clone, where a
 * commit would publish it, and never over the builder file. Paths compare in
 * canonical form, so a different spelling of the same file is caught.
 */
export function outProblem(root, out, builder) {
  const o = canonical(out);
  if (o === canonical(builder)) return 'must not be the builder file';
  const r = canonical(join(root, 'x')).slice(0, -1);
  if (o.startsWith(r)) return isKit(root) ? 'must be outside the builder kit' : 'must be outside this clone: a page carries your own parts and lists, so keep it out of any repo';
  // The Claude home folder, as each of its spellings, and any .claude folder (#203, S6).
  const homes = [process.env.CLAUDE_CONFIG_DIR, join(homedir(), '.claude'), ...(isKit(root) ? [join(root, '..', '..')] : [])].filter(Boolean).map(h => canonical(join(h, 'x')).slice(0, -1));
  const sep = r.slice(-1);
  if (homes.some(h => o.startsWith(h)) || o.split(sep).slice(0, -1).some(seg => seg === '.claude')) return 'must be outside the Claude home folder and any .claude folder';
  // A git work tree: the page's folder, or one above it, holds a .git entry. Walked from the real path, so a link into a repo is caught.
  for (let d = dirname(o); ; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) return 'must be outside any git work tree: a page carries your own parts and lists, so keep it out of any repo';
    if (dirname(d) === d) break;
  }
  if (existsSync(out)) return 'must be a new file: the page is never written over an existing one';
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
    process.stdout.write('usage: node builder/build.mjs [--check] | --builder <file> [--check | --out <page> | --texts]\n');
    process.exitCode = 2;
  };
  const major = Number(process.versions.node.split('.')[0]);
  if (major < NODE_FLOOR) {
    process.stdout.write(`REFUSE this is Node ${process.versions.node}; the builder needs Node ${NODE_FLOOR} or later\n`);
    process.exitCode = 1;
    return;
  }
  const opts = { check: false, builder: null, out: null, texts: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--check') opts.check = true;
    else if (argv[i] === '--texts') opts.texts = true;
    else if (argv[i] === '--builder' && argv[i + 1]) opts.builder = argv[(i += 1)];
    else if (argv[i] === '--out' && argv[i + 1]) opts.out = argv[(i += 1)];
    else return usage();
  }

  if (!opts.builder) {
    if (opts.out || opts.texts) return usage();
    if (isKit(root)) {
      process.stdout.write('REFUSE the builder kit never rebuilds its own page: give --builder <file>, with --check or --out <page>\n');
      process.exitCode = 1;
      return;
    }
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

  if ([opts.check, opts.out, opts.texts].filter(Boolean).length > 1) return usage();
  // With no --out, the page goes in a new folder under the system's temporary folder (#203, S6).
  if (!opts.check && !opts.out && !opts.texts) opts.out = join(mkdtempSync(join(tmpdir(), 'scriptorium-')), 'scriptorium.html');
  const r = checkBuilder(root, opts.builder);
  // A person's own presets are read once per run, and never by --texts (#283).
  const own = r.builder && !opts.texts ? personalPresets(root, r.pact) : { presets: [], findings: [] };
  r.findings.push(...own.findings);
  printCheck('builder file', r);
  if (!r.builder) {
    process.exitCode = 1;
    return;
  }
  if (opts.check) return;
  // Each part the file changes, as the page saves it: the block a save writes is this text and a line break (#203, S6).
  if (opts.texts) {
    const changed = changedParts(root, r.builder.ownParts);
    if (!changed.length) process.stdout.write('TEXTS none: the file changes no part\n');
    for (const [m, text] of changed) process.stdout.write(`TEXT ${m}\n${text}\nEND ${m}\n`);
    return;
  }
  const why = outProblem(root, opts.out, opts.builder);
  if (why) {
    process.stdout.write(`REFUSE --out ${why}\n`);
    process.exitCode = 1;
    return;
  }
  writeFileSync(resolve(opts.out), buildPage(root, readFileSync(page, 'utf8'), opts.builder, own.presets), { flag: 'wx' });
  process.stdout.write(`WROTE ${resolve(opts.out)}\n`);
  process.stdout.write('NOTE the page holds your lists, every preset from your presets folder and any agent files in plain text: delete its folder once you are done with it\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
