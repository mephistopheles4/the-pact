// The harness descriptions (spec 0007 S5): where each harness keeps each part,
// read from the commit's harnesses/known.json and the person's own entries, and
// which of them an install takes. Pure decisions, no I/O: whether a path sits
// in a git work tree, and which detect folders exist, are the runner's facts,
// handed in. Each refusal is an install-core Refusal with one rule id.
//
// Nothing here runs on import. Imports install-core.mjs only.

import { Refusal, formatPlain } from './install-core.mjs';

export const KNOWN_REL = 'harnesses/known.json';
/** The neutral home, under the home folder (S4). */
export const NEUTRAL = '.pact';
/** The harness id the neutral home's own files carry in the record; no harness may take it. */
export const PACT_ID = 'pact';
export const AGENT_FORMATS = Object.freeze(['claude-md', 'codex-toml', 'antigravity-md']);
export const HOOK_FORMATS = Object.freeze(['claude', 'codex', 'antigravity']);
export const CAPABILITIES = Object.freeze(['subagents', 'tool-limits', 'cleaner', 'archive', 'native-rules', 'hook-ask', 'hook-trust', 'explicit-skills']);
const ID_RE = /^[a-z][a-z0-9-]{0,31}$/;
// One path segment below the home folder: a plain name, a leading dot allowed, never . or .., none ending in a dot.
const SEGMENT_RE = /^\.?[A-Za-z0-9_-](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/;
const MODEL_RE = /^\S{1,128}$/;
const NAME_MAX = 64;
const CAP_MAX = 16 * 1024 * 1024;

// Each part's keys: its path key, and the others.
const PARTS = Object.freeze({
  rules: { path: 'path', more: ['cap', 'sharedCap'] },
  agents: { path: 'dir', more: ['format'], formats: AGENT_FORMATS },
  skills: { path: 'dir', more: [] },
  commands: { path: 'dir', more: [] },
  hooks: { path: 'file', more: ['format'], formats: HOOK_FORMATS },
});
const FIELDS = Object.freeze(['id', 'name', 'detect', ...Object.keys(PARTS), 'models', 'defaultInstall', 'capabilities']);

const refuse = (rule, why) => {
  throw new Refusal(rule, why);
};
const isObject = v => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A description's path as one relative to the home folder, with forward
 * slashes: `~/x`, or a full path under the home folder (compared without
 * regard to case on Windows and macOS), outside the neutral home. Refuses
 * `harness-path` otherwise; the path itself is never printed.
 */
function homeRel(value, where, { home, platform }) {
  const bad = why => refuse('harness-path', `${where} ${why}.`);
  if (typeof value !== 'string') bad('is not text');
  const win = platform === 'win32';
  const slashed = s => (win ? s.replaceAll('\\', '/') : s);
  let rest;
  const v = slashed(value);
  if (v.startsWith('~/')) rest = v.slice(2);
  else {
    const root = `${slashed(home).replace(/\/+$/, '')}/`;
    const fold = s => (win || platform === 'darwin' ? s.toLowerCase() : s);
    if (!fold(v).startsWith(fold(root))) bad('is not a full path under the home folder, or ~/ and a path');
    rest = v.slice(root.length);
  }
  const segs = rest.split('/');
  if (!segs.every(s => SEGMENT_RE.test(s))) bad("holds a part that is empty, . or .., ends in a dot, or has a character outside letters, digits, '.', '_' and '-'");
  if (segs[0].toLowerCase() === NEUTRAL) bad(`is inside ~/${NEUTRAL}`);
  return segs.join('/');
}

/** One entry's given fields, checked and with paths made home-relative. `ctx.inWorkTree` null skips the work-tree check. */
function checkFields(entry, id, ctx) {
  const out = {};
  const shown = `the harness ${id}'s`;
  const path = (value, where) => {
    const rel = homeRel(value, `${shown} ${where}`, ctx);
    if (ctx.inWorkTree && ctx.inWorkTree(`${ctx.home}/${rel}`)) refuse('harness-path', `${shown} ${where} is inside a git work tree.`);
    return rel;
  };
  for (const key of Object.keys(entry)) if (!FIELDS.includes(key)) refuse('harness-field', `${shown} entry holds ${formatPlain(key).slice(0, 40)}, a field the pact does not know.`);
  if (Object.hasOwn(entry, 'name')) {
    const n = entry.name;
    if (typeof n !== 'string' || !n.trim() || n.length > NAME_MAX || formatPlain(n) !== n) refuse('harness-shape', `${shown} name is not a line of at most ${NAME_MAX} characters.`);
    out.name = n;
  }
  if (Object.hasOwn(entry, 'detect')) out.detect = path(entry.detect, 'detect');
  for (const [part, spec] of Object.entries(PARTS)) {
    if (!Object.hasOwn(entry, part) || entry[part] === undefined) continue;
    const v = entry[part];
    if (!isObject(v) || !Object.hasOwn(v, spec.path)) refuse('harness-shape', `${shown} ${part} is not an object with ${spec.path}.`);
    for (const key of Object.keys(v)) if (key !== spec.path && !spec.more.includes(key)) refuse('harness-field', `${shown} ${part} holds a field the pact does not know.`);
    const made = { [spec.path]: path(v[spec.path], `${part}.${spec.path}`) };
    if (spec.formats) {
      if (!spec.formats.includes(v.format)) refuse('harness-format', `${shown} ${part}.format is not one of ${spec.formats.join(', ')}.`);
      made.format = v.format;
    }
    if (part === 'rules') {
      for (const key of spec.more) {
        const n = v[key] ?? null;
        if (n !== null && !(Number.isInteger(n) && n > 0 && n <= CAP_MAX)) refuse('harness-shape', `${shown} rules.${key} is not a whole number of bytes.`);
        made[key] = n;
      }
    }
    out[part] = made;
  }
  if (Object.hasOwn(entry, 'models')) {
    const m = entry.models;
    const ok = isObject(m) && Object.keys(m).every(k => ['planning', 'executor', 'light'].includes(k)) && ['planning', 'executor'].every(k => typeof m[k] === 'string') && Object.values(m).every(x => typeof x === 'string' && MODEL_RE.test(x));
    if (!ok) refuse('harness-shape', `${shown} models is not planning, executor and an optional light, each one word.`);
    out.models = { planning: m.planning, executor: m.executor, light: m.light ?? null };
  }
  if (Object.hasOwn(entry, 'defaultInstall')) {
    if (typeof entry.defaultInstall !== 'boolean') refuse('harness-shape', `${shown} defaultInstall is not true or false.`);
    out.defaultInstall = entry.defaultInstall;
  }
  if (Object.hasOwn(entry, 'capabilities')) {
    const c = entry.capabilities;
    if (!Array.isArray(c) || !c.every(x => CAPABILITIES.includes(x))) refuse('harness-format', `${shown} capabilities is not a list from ${CAPABILITIES.join(', ')}.`);
    out.capabilities = [...c];
  }
  return out;
}

const EMPTY = Object.freeze({ rules: null, agents: null, skills: null, commands: null, hooks: null, models: null, defaultInstall: true, capabilities: [] });

/** The commit's known.json as a list of raw entries; a file the install cannot read refuses. */
export function parseKnown(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    doc = null;
  }
  if (!Array.isArray(doc) || !doc.every(e => isObject(e) && typeof e.id === 'string' && ID_RE.test(e.id))) refuse('harness-known', `the commit's ${KNOWN_REL} is not a list of harness descriptions.`);
  return doc;
}

/**
 * The known harnesses with the person's own entries laid over them, then the
 * person's own, in that order. An own entry with a known id overrides it field
 * by field, named in `overrides`. Only own fields are held to the work-tree
 * check: a person's ~/.claude may be a dotfiles repository.
 */
export function resolveHarnesses({ known, own = [], home, platform, inWorkTree }) {
  const seen = new Set();
  const mine = new Map();
  for (const entry of own) {
    if (!isObject(entry)) refuse('harness-shape', 'an own harness is not an object.');
    const id = entry.id;
    if (typeof id !== 'string' || !ID_RE.test(id) || id === PACT_ID) refuse('harness-id', `an own harness's id is not a lower-case letter and at most 31 more letters, digits or dashes, or is ${PACT_ID}.`);
    if (seen.has(id)) refuse('harness-id', `two own harnesses have the id ${id}.`);
    seen.add(id);
    mine.set(id, entry);
  }
  const out = known.map(base => {
    const described = { ...EMPTY, ...checkFields(base, base.id, { home, platform, inWorkTree: null }), id: base.id, own: false, overrides: [] };
    const entry = mine.get(base.id);
    if (!entry) return described;
    mine.delete(base.id);
    const given = checkFields(entry, base.id, { home, platform, inWorkTree });
    return { ...described, ...given, id: base.id, overrides: Object.keys(given) };
  });
  for (const [id, entry] of mine) {
    const given = checkFields(entry, id, { home, platform, inWorkTree });
    if (!given.name || !given.detect || !given.rules) refuse('harness-shape', `the own harness ${id} needs a name, a detect folder and rules.`);
    out.push({ ...EMPTY, ...given, id, own: true, overrides: [] });
  }
  return out;
}

/**
 * Which harnesses this install takes (S5, Detection). `install` is the
 * configuration's list, or null when it has none; `detected` the ids whose
 * detect folder exists; `recorded` the ids the install record lists. Returns
 * rows { id, harness, detected, in }, one per detected known harness, own
 * harness, recorded harness and listed harness, and the warnings. A recorded
 * harness nothing describes any more has `harness: null` and is out.
 */
export function chooseHarnesses({ harnesses, install, detected, recorded }) {
  const byId = new Map(harnesses.map(h => [h.id, h]));
  const warnings = [];
  for (const id of install ?? []) if (!byId.has(id)) refuse('harness-unknown', `harnesses.install names ${formatPlain(id).slice(0, 40)}, which no harness description has.`);
  const lost = recorded.filter(id => !byId.has(id));
  if (install === null && lost.length) refuse('harness-gone', `the install record lists ${lost.map(formatPlain).join(', ')}, which your configuration no longer describes; describe it again, or write a harnesses.install list that leaves it out.`);
  const rows = [];
  for (const h of harnesses) {
    const here = detected.has(h.id);
    const kept = recorded.includes(h.id);
    const listed = install !== null && install.includes(h.id);
    if (!(here || kept || listed || h.own)) continue;
    const taken = install === null ? (kept && !here) || (here && !h.own && h.defaultInstall) : listed;
    if (taken && !here) warnings.push(kept ? `${h.id}: the install record lists it and its detect folder is gone; it stays in until a harnesses.install list leaves it out.` : `${h.id}: listed, but its detect folder was not found; it is installed into all the same.`);
    if (h.overrides.length) warnings.push(`${h.id}: your configuration overrides ${h.overrides.join(', ')}.`);
    rows.push({ id: h.id, harness: h, detected: here, in: taken });
  }
  for (const id of lost) rows.push({ id, harness: null, detected: false, in: false });
  return { rows, warnings };
}
