// PROTOTYPE for #53. Throwaway: never merged to main, never installed.
//
// The pure part of "the installer renders a configuration file into the
// installed rules". No fs, no process, no network. The runner injects the
// gate's own helpers (readStrictJson, scanText, Refused, Report) taken from
// the staged gate/seam-a.mjs. It still copies the gate's structure patterns and
// has its own mark reader; the real build would put both in one shared module.
//
// Output never echoes configuration or block content. Messages name only this
// module's own constant mark and setting names, and file names via shown().

// ------------------------------------------------------------------ the marks

// The gate's seven clauses (gate/pact-text.mjs CLAUSES). Protected: the gate
// holds each to gate/clauses/<name>.md word for word.
export const GATED = Object.freeze(['risk-floor', 'no-skill-overrides', 'security-route', 'never-substitute', 'move-4', 'stop-and-escalate', 'install-go-ahead']);
// Held in AGENTS.md, which is staged for the gate and never installed.
const NOT_INSTALLED = new Set(['install-go-ahead']);
// Open marks: a second kind the design needs ("marks for the open parts").
// Today's gate refuses both names. The renderer strips them from its output.
export const OPEN = Object.freeze(['usage-pause', 'move-2']);
const MARKS = new Map([...GATED.map(n => [n, 'gated']), ...OPEN.map(n => [n, 'open'])]);

// ------------------------------------------------------------------ settings

// A value is a fixed template filled with a checked integer. User text is never
// spliced. The template at its default must equal the source block exactly.
const USAGE_TEMPLATE = n => [
  'Before starting anything expensive — several subagents, a workflow, an eval —',
  'check my plan usage if a usage tool is available (the desktop app has one).',
  "Tell me the weekly figure and a rough cost for what you're about to start. If",
  `the weekly limit is above ${n}%, wait for my go-ahead. Never cut or stop work`,
  'because of usage on your own; that call is mine.',
];
export const SETTINGS = new Map([['usagePause', Object.freeze({ mark: 'usage-pause', min: 50, max: 100, def: 75, template: USAGE_TEMPLATE })]]);

export const LIMITS = Object.freeze({ configBytes: 64 * 1024, blockBytes: 16 * 1024, edits: 16, renderedBytes: 1024 * 1024 });
const OPS = new Set(['replace', 'remove', 'add-after']);
const TOP_KEYS = new Set(['schema', 'settings', 'edits']);
const EDIT_KEYS = new Set(['mark', 'op', 'file']);

const MARKER_RE = /^( *)<!-- pact:(begin|end) ([a-z][a-z0-9-]*) -->$/;
// The forms gate/pact-text.mjs checkStructure refuses, plus list numbers and
// leading space (the renderer adds the anchor's indent itself).
const FENCE_RE = /^\s*(?:`{3,}|~{3,})/;
const SETEXT_RE = /^ {0,3}(?:=+|-+)\s*$/;
const HEADING_LIKE_RE = /^\s*#{1,6}(?:\s|$)/;
const NUMBERED_RE = /^\s*[0-9]+[.)](?:\s|$)/;
// Claude Code reads "@path" in CLAUDE.md as an import. Its exact grammar is not
// checked here, so any @ followed by a non-space character refuses, anywhere,
// code spans included.
const IMPORT_RE = /@\S/;

const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const refusal = (component, rule, reason) => ({ component, rule, reason });

// ------------------------------------------------------------------ reading

/**
 * One configuration file's bytes -> { edits, settings } or { refusals }.
 * `origin` is 'user' or 'project'. Every refusal here is the renderer's.
 */
export function readConfig(buf, origin, gate) {
  const R = [];
  const out = { origin, edits: [], settings: new Map() };
  if (buf.length > LIMITS.configBytes) return { refusals: [refusal('renderer', 'size', `${origin} file is larger than ${LIMITS.configBytes} bytes`)] };
  let cfg;
  try {
    cfg = gate.readStrictJson(buf);
  } catch (e) {
    return { refusals: [refusal('renderer', e instanceof gate.Refused ? e.rule : 'read', `${origin} file: ${e instanceof gate.Refused ? e.reason : 'unreadable'}`)] };
  }
  if (!isPlain(cfg)) return { refusals: [refusal('renderer', 'shape', `${origin} file is not a JSON object`)] };
  for (const k of Object.keys(cfg)) if (!TOP_KEYS.has(k)) R.push(refusal('renderer', 'key', `${origin} file: an unknown top-level key`));
  if (cfg.schema !== 1) R.push(refusal('renderer', 'schema', `${origin} file: schema must be the number 1`));

  if (Object.hasOwn(cfg, 'settings')) {
    if (!isPlain(cfg.settings)) R.push(refusal('renderer', 'shape', `${origin} file: settings is not an object`));
    else
      for (const [k, v] of Object.entries(cfg.settings)) {
        const spec = SETTINGS.get(k);
        if (!spec) {
          R.push(refusal('renderer', 'setting', `${origin} file: an unknown setting`));
          continue;
        }
        if (typeof v !== 'number' || !Number.isInteger(v) || Object.is(v, -0)) R.push(refusal('renderer', 'type', `${origin} file: ${k} must be a whole number`));
        else if (v < spec.min || v > spec.max) R.push(refusal('renderer', 'range', `${origin} file: ${k} must be ${spec.min} to ${spec.max}`));
        else out.settings.set(k, v);
      }
  }

  if (Object.hasOwn(cfg, 'edits')) {
    if (!Array.isArray(cfg.edits)) R.push(refusal('renderer', 'shape', `${origin} file: edits is not a list`));
    else if (cfg.edits.length > LIMITS.edits) R.push(refusal('renderer', 'count', `${origin} file: more than ${LIMITS.edits} edits`));
    else {
      const seen = new Set();
      cfg.edits.forEach((e, i) => {
        const at = `${origin} file, edit ${i + 1}`;
        if (!isPlain(e)) return R.push(refusal('renderer', 'shape', `${at}: not an object`));
        for (const k of Object.keys(e)) if (!EDIT_KEYS.has(k)) return R.push(refusal('renderer', 'key', `${at}: an unknown key`));
        const kind = typeof e.mark === 'string' ? MARKS.get(e.mark) : undefined;
        if (!kind) return R.push(refusal('renderer', 'mark', `${at}: an unknown mark name`));
        if (NOT_INSTALLED.has(e.mark)) return R.push(refusal('renderer', 'mark', `${at}: ${e.mark} is in AGENTS.md, which is never installed`));
        if (!OPS.has(e.op)) return R.push(refusal('renderer', 'op', `${at}: op must be replace, remove or add-after`));
        if (e.op === 'remove' && Object.hasOwn(e, 'file')) return R.push(refusal('renderer', 'shape', `${at}: remove takes no file`));
        if (e.op !== 'remove' && typeof e.file !== 'string') return R.push(refusal('renderer', 'shape', `${at}: file must be text`));
        if (seen.has(e.mark)) return R.push(refusal('renderer', 'twice', `${at}: ${e.mark} is edited twice in one file`));
        seen.add(e.mark);
        out.edits.push({ mark: e.mark, kind, op: e.op, file: e.file, origin });
      });
    }
  }
  for (const [k, spec] of SETTINGS) {
    if (out.settings.has(k) && out.edits.some(e => e.mark === spec.mark && e.op !== 'add-after')) {
      R.push(refusal('renderer', 'conflict', `${origin} file: ${k} and an edit to ${spec.mark} both set that block`));
    }
  }
  return R.length ? { refusals: R } : out;
}

/**
 * A block file's bytes -> its lines (no indent, no final newline) or refusals.
 * `skip` turns the renderer's own text checks off, for planted controls only.
 */
export function checkBlockText(buf, file, gate, skip = false) {
  if (buf.length > LIMITS.blockBytes) return { refusals: [refusal('renderer', 'size', `${gate.shown(file)}: larger than ${LIMITS.blockBytes} bytes`)] };
  const rep = new gate.Report();
  const text = gate.scanText(buf, file, rep);
  if (text === null) return { refusals: rep.lines.map(l => refusal('renderer (gate scanText)', 'characters', l.replace(/^FAIL /, ''))) };
  if (skip) return { lines: text.replace(/\n$/, '').split('\n') };
  const R = [];
  const at = gate.shown(file);
  if (!text.endsWith('\n') || text.endsWith('\n\n') || text.length < 2) R.push(refusal('renderer', 'shape', `${at}: must hold text and end with exactly one line feed`));
  if (text.includes('<!--')) R.push(refusal('renderer', 'comment', `${at}: an HTML comment (a forged mark or hidden text)`));
  text.slice(0, -1).split('\n').forEach((line, i) => {
    const ln = `${at} line ${i + 1}`;
    if (line.trim() === '') R.push(refusal('renderer', 'structure', `${ln}: a blank line`));
    else if (/^\s/.test(line)) R.push(refusal('renderer', 'structure', `${ln}: leading space or tab`));
    else if (FENCE_RE.test(line)) R.push(refusal('renderer', 'structure', `${ln}: a code fence`));
    else if (SETEXT_RE.test(line) || HEADING_LIKE_RE.test(line)) R.push(refusal('renderer', 'structure', `${ln}: a heading`));
    else if (NUMBERED_RE.test(line)) R.push(refusal('renderer', 'structure', `${ln}: a numbered list line`));
    if (IMPORT_RE.test(line)) R.push(refusal('renderer', 'import', `${ln}: an @ import`));
  });
  return R.length ? { refusals: R } : { lines: text.slice(0, -1).split('\n') };
}

// ------------------------------------------------------------------ layering

/**
 * User file then project file. `rule` is 'per-mark' (the project's edit to a
 * mark drops every user edit to it) or 'per-slot' (a mark has two slots:
 * its content, set by replace or remove, and what follows it, set by
 * add-after; the project wins each slot separately). Settings: project wins.
 */
export function layer(user, project, rule) {
  const settings = new Map();
  for (const c of [user, project]) if (c) for (const [k, v] of c.settings) settings.set(k, { value: v, origin: c.origin });
  const slot = e => (rule === 'per-slot' ? `${e.mark}|${e.op === 'add-after' ? 'after' : 'content'}` : e.mark);
  const taken = new Set((project ? project.edits : []).map(slot));
  const kept = (user ? user.edits : []).filter(e => !taken.has(slot(e)));
  const edits = [...kept, ...(project ? project.edits : [])];
  // A setting and a content edit across the two files that set the same
  // block: the project file's one wins, as for any other edit.
  for (const [k, s] of [...settings]) {
    const mark = SETTINGS.get(k).mark;
    const i = edits.findIndex(e => e.mark === mark && e.op !== 'add-after');
    if (i < 0) continue;
    if (edits[i].origin === 'project') settings.delete(k);
    else if (s.origin === 'project') edits.splice(i, 1);
  }
  return { settings, edits };
}

// ------------------------------------------------------------------ rendering

/** Every pact mark in `text`: name -> { begin, end, indent }. */
export function parseMarks(text) {
  const lines = text.split('\n');
  const blocks = new Map();
  const errors = [];
  let open = null;
  lines.forEach((line, i) => {
    const m = MARKER_RE.exec(line);
    if (!m) {
      if (line.includes('<!--')) errors.push(`line ${i + 1}: a comment that is not a mark`);
      return;
    }
    const [, indent, kind, name] = m;
    if (!MARKS.has(name)) return errors.push(`line ${i + 1}: an unknown mark`);
    if (kind === 'begin') {
      if (open) return errors.push(`line ${i + 1}: a mark opens inside another`);
      if (blocks.has(name)) return errors.push(`line ${i + 1}: ${name} opens twice`);
      open = { name, begin: i, indent };
    } else {
      if (!open || open.name !== name) return errors.push(`line ${i + 1}: an end with no matching begin`);
      blocks.set(name, { begin: open.begin, end: i, indent: open.indent });
      open = null;
    }
  });
  if (open) errors.push(`${open.name} never closes`);
  return { lines, blocks, errors };
}

/**
 * Wrap the open parts of today's pact in open marks: the simulated future
 * source. Throws if the anchors moved, so a stale prototype fails loudly.
 */
export function simulateFutureSource(head) {
  const lines = head.split('\n');
  const usage = lines.indexOf('## Watching usage');
  if (usage < 0 || lines[usage + 1] !== '' || USAGE_TEMPLATE(75).some((l, i) => lines[usage + 2 + i] !== l)) throw new Error('usage-pause anchor moved');
  const m2 = lines.findIndex(l => l.startsWith('2. **I do the thinking before the doing.**'));
  let m2end = m2 + 1;
  while (lines[m2end].startsWith('   ')) m2end += 1;
  if (m2 < 0 || !lines[m2end].startsWith('3. ')) throw new Error('move-2 anchor moved');
  const out = [...lines];
  // Insert from the bottom up so earlier indexes stay valid.
  out.splice(usage + 2 + 5, 0, '<!-- pact:end usage-pause -->');
  out.splice(usage + 2, 0, '<!-- pact:begin usage-pause -->');
  out.splice(m2end, 0, '   <!-- pact:end move-2 -->');
  out.splice(m2 + 1, 0, '   <!-- pact:begin move-2 -->');
  return out.join('\n');
}

/**
 * Render the effective configuration into the source. `blockLines` maps an
 * edit's origin|file to its checked lines. Gated marks stay in the output for
 * the gate; open marks are stripped. Returns { text, regions } or { refusals }.
 */
export function render(source, eff, blockLines) {
  const { lines, blocks, errors } = parseMarks(source);
  if (errors.length) return { refusals: errors.map(e => refusal('renderer', 'source', e)) };
  const content = new Map();
  const after = new Map();
  for (const [k, { value, origin }] of eff.settings) {
    const spec = SETTINGS.get(k);
    const b = blocks.get(spec.mark);
    if (!b) return { refusals: [refusal('renderer', 'source', `${spec.mark} is not in the source`)] };
    const def = spec.template(spec.def);
    const now = lines.slice(b.begin + 1, b.end).map(l => l.slice(b.indent.length));
    if (def.length !== now.length || def.some((l, i) => l !== now[i])) return { refusals: [refusal('renderer', 'template', `${spec.mark}: the template at its default no longer matches the source`)] };
    content.set(spec.mark, { lines: spec.template(value), origin, op: `setting ${k}` });
  }
  for (const e of eff.edits) {
    if (!blocks.has(e.mark)) return { refusals: [refusal('renderer', 'mark', `${e.mark} is not in the source`)] };
    const entry = { lines: e.op === 'remove' ? null : blockLines.get(`${e.origin}|${e.file}`), origin: e.origin, op: e.op };
    (e.op === 'add-after' ? after : content).set(e.mark, entry);
  }
  const out = [];
  const regions = [];
  const put = (name, entry, indent) => {
    const from = out.length + 1;
    for (const l of entry.lines) out.push(indent + l);
    regions.push({ mark: name, op: entry.op, origin: entry.origin, from, to: out.length });
  };
  for (let i = 0; i < lines.length; i += 1) {
    const m = MARKER_RE.exec(lines[i]);
    if (!m || m[2] !== 'begin') {
      out.push(lines[i]);
      continue;
    }
    const name = m[3];
    const b = blocks.get(name);
    const keepMarks = MARKS.get(name) === 'gated';
    const c = content.get(name);
    if (c && c.op === 'remove') regions.push({ mark: name, op: 'remove', origin: c.origin, from: out.length, to: out.length });
    else {
      if (keepMarks) out.push(lines[b.begin]);
      if (c) put(name, c, b.indent);
      else out.push(...lines.slice(b.begin + 1, b.end));
      if (keepMarks) out.push(lines[b.end]);
    }
    const a = after.get(name);
    if (a) put(name, a, b.indent);
    i = b.end;
  }
  const text = out.join('\n');
  if (new TextEncoder().encode(text).length > LIMITS.renderedBytes) return { refusals: [refusal('renderer', 'size', 'the rendered rules file is larger than 1 MiB')] };
  return { text, regions };
}

// ------------------------------------------------------------------ judging

/** The exact compare: each installed gated block against its canonical text. */
export function exactCompare(rendered, canon, eff) {
  const { blocks, lines } = parseMarks(rendered);
  const rows = [];
  for (const name of GATED) {
    if (NOT_INSTALLED.has(name)) continue;
    const b = blocks.get(name);
    let state = 'same';
    if (!b) state = 'removed';
    else if (lines.slice(b.begin + 1, b.end).join('\n') !== canon.get(name)) state = 'changed';
    const next = eff.edits.some(e => e.mark === name && e.op === 'add-after');
    rows.push({ name, state, next });
  }
  return rows;
}

/** What each policy does with this result. */
export function decide(refusals, exact) {
  const weakened = exact.filter(r => r.state !== 'same').map(r => `${r.name} ${r.state}`);
  if (refusals.length) return { refuse: 'REFUSE (installer check)', warn: 'REFUSE (installer check)', weakened };
  if (!weakened.length) return { refuse: 'INSTALL', warn: 'INSTALL', weakened };
  return { refuse: `REFUSE: ${weakened.join(', ')}`, warn: `WARN, then INSTALL: ${weakened.join(', ')}`, weakened };
}
