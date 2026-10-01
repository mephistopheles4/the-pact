// Seam A's checks on the pact's own text (#33), imported by seam-a.mjs.
//
//   C3 routing: every installed agent's name is a whole code span in one of
//     moves 1 to 4 of "Implementing a change", or in a listed role line.
//   C4 shared blocks: plan-reviewer's risk-floor block equals the pact's.
//   Required clauses: each marked block equals its canonical text in
//     gate/clauses/, word for word, and sits where it belongs.
//
// A block is the whole lines between two marker lines:
//
//   <!-- pact:begin NAME -->
//   ...
//   <!-- pact:end NAME -->
//
// Each marker is alone on its line, after optional spaces. Claude Code strips
// HTML comments from CLAUDE.md before the model reads it, so any other comment
// in a checked file fails: text the check reads must be text the model reads.
//
// Like seam A, nothing here echoes a file's content. Output names files, line
// numbers and this module's own fixed clause names, never a name read from a
// file.

import { lstatSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLAUSE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'clauses');

const PACT = 'claude/CLAUDE.md';
const RULES = 'AGENTS.md';
const IMPLEMENTING = 'Implementing a change';

// Every block, the file that must hold it, and where in that file. The
// canonical text of each is gate/clauses/<name>.md.
const CLAUSES = new Map([
  ['risk-floor', { file: PACT, section: IMPLEMENTING }],
  ['no-skill-overrides', { file: PACT, section: 'When a skill and these rules disagree' }],
  ['security-route', { file: PACT, section: IMPLEMENTING, move: 3 }],
  ['never-substitute', { file: PACT, section: IMPLEMENTING, move: 3 }],
  ['move-4', { file: PACT, section: IMPLEMENTING, move: 4 }],
  ['stop-and-escalate', { file: PACT, section: IMPLEMENTING }],
  ['install-go-ahead', { file: RULES, section: 'Changes here reach every project' }],
]);
// Shared blocks: block name -> the installed agent that holds a copy of the
// pact's block. Found by name, not path, so it holds wherever the agent lives.
const SHARED = new Map([['risk-floor', 'plan-reviewer']]);
// The role lines that route agents, by their bold lead-in. "Reading agents."
// is not one: it names agents without giving them work.
const ROLE_LEADS = ['**Lookups and searches.**'];
const MOVES = [1, 2, 3, 4];

const MARKER_RE = /^ *<!-- pact:(begin|end) ([a-z][a-z0-9-]*) -->$/;
const FENCE_RE = /^ *(?:```|~~~)/;
const MOVE_RE = /^([0-9]+)\. /;
const SPAN_RE = /`([^`]+)`/g;
const PACT_MARKER_RE = /<!--\s*pact\s*:/i;

/** The canonical texts, as a Map from clause name to text. A bad file fails and is left out. */
function loadClauses(report) {
  const out = new Map();
  for (const name of CLAUSES.keys()) {
    const rel = `gate/clauses/${name}.md`;
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(join(CLAUSE_DIR, `${name}.md`)));
    } catch {
      report.fail('clause-text', rel, null, 'missing, or not valid UTF-8');
      continue;
    }
    if (text.includes('\r')) report.fail('clause-text', rel, null, 'a carriage return');
    else if (text.charCodeAt(0) === 0xfeff) report.fail('clause-text', rel, null, 'a byte-order mark');
    else if (!text.endsWith('\n') || text.endsWith('\n\n')) report.fail('clause-text', rel, null, 'must end with exactly one line feed');
    else if (text.includes('<!--')) report.fail('clause-text', rel, null, 'a comment');
    else out.set(name, text.slice(0, -1));
  }
  return out;
}

/**
 * Read one checked file into lines, each with its section and whether it sits
 * in a fence, and its blocks. `allowed` is the set of block names this file
 * may hold. Every grammar failure is recorded in `report`.
 */
function parseDoc(text, file, allowed, report) {
  const lines = text.split('\n');
  const meta = [];
  const blocks = new Map();
  const seen = new Set();
  let section = null;
  let fenced = false;
  let open = null;
  lines.forEach((line, i) => {
    const ln = i + 1;
    const fence = FENCE_RE.test(line);
    if (fence) fenced = !fenced;
    const inFence = fence || fenced;
    if (!inFence) {
      if (line.startsWith('## ')) section = line.slice(3);
      else if (line.startsWith('# ')) section = null;
    }
    meta.push({ section, fenced: inFence, marker: false });
    if (!line.includes('<!--')) return;
    meta[i].marker = true;
    if (inFence) return report.fail('marker', file, ln, 'a comment inside a fenced code block');
    const m = MARKER_RE.exec(line);
    if (!m) return report.fail('marker', file, ln, 'a comment that is not a pact marker alone on its line');
    const [, kind, name] = m;
    if (!CLAUSES.has(name)) return report.fail('marker', file, ln, 'an unknown block name');
    if (!allowed.has(name)) return report.fail('marker', file, ln, `${name} is not a block this file may hold`);
    if (kind === 'begin') {
      if (open) return report.fail('marker', file, ln, 'a block that opens inside another');
      if (seen.has(name)) return report.fail('marker', file, ln, `${name} opens twice`);
      seen.add(name);
      open = { name, line: i };
      return;
    }
    if (!open || open.name !== name) return report.fail('marker', file, ln, `an end of ${name} with no open begin of the same name`);
    blocks.set(name, { begin: open.line, end: i, text: lines.slice(open.line + 1, i).join('\n') });
    open = null;
  });
  if (open) report.fail('marker', file, open.line + 1, `${open.name} never closes`);
  return { lines, meta, blocks };
}

/** Moves 1 to 4 of "Implementing a change": number -> [first line, last line]. */
function findMoves(doc, report) {
  const moves = new Map();
  const { lines, meta } = doc;
  let i = 0;
  while (i < lines.length) {
    const m = meta[i].section === IMPLEMENTING && !meta[i].fenced ? MOVE_RE.exec(lines[i]) : null;
    if (!m) {
      i += 1;
      continue;
    }
    const n = Number(m[1]);
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== '' && lines[j][0] === ' ') j += 1;
    if (MOVES.includes(n)) {
      if (moves.has(n)) report.fail('moves', PACT, i + 1, `move ${n} appears more than once`);
      else moves.set(n, [i, j - 1]);
    }
    i = j;
  }
  if (!meta.some(x => x.section === IMPLEMENTING)) report.fail('moves', PACT, null, `no "${IMPLEMENTING}" section`);
  else for (const n of MOVES) if (!moves.has(n)) report.fail('moves', PACT, null, `move ${n} is missing`);
  return moves;
}

/** Every whole code span in moves 1 to 4 and the listed role lines, outside fences and markers. */
function routedNames(doc, moves) {
  const { lines, meta } = doc;
  const take = new Set();
  for (const [a, b] of moves.values()) for (let i = a; i <= b; i += 1) take.add(i);
  lines.forEach((line, i) => {
    if (meta[i].section !== IMPLEMENTING || meta[i].fenced || !ROLE_LEADS.some(lead => line.startsWith(lead))) return;
    for (let j = i; j < lines.length && lines[j].trim() !== '' && meta[j].section === IMPLEMENTING; j += 1) take.add(j);
  });
  const names = new Set();
  for (const i of take) {
    if (meta[i].fenced || meta[i].marker) continue;
    for (const m of lines[i].matchAll(SPAN_RE)) names.add(m[1]);
  }
  return names;
}

/** A pact file from the stage, read through seam A's own encoding and character rules. */
function readPactFile(root, rel, report, scanText) {
  const abs = join(root, ...rel.split('/'));
  let st;
  try {
    st = lstatSync(abs);
  } catch {
    report.fail('pact-file', rel, null, 'missing');
    return null;
  }
  if (!st.isFile()) {
    report.fail('pact-file', rel, null, 'not a regular file');
    return null;
  }
  return scanText(readFileSync(abs), rel, report);
}

function namesFor(file) {
  return new Set([...CLAUSES].filter(([, c]) => c.file === file).map(([n]) => n));
}

/**
 * Check the pact's text. `agents` are seam A's installed agents, each with
 * `file` and, once its frontmatter was read, `name`. `scanText(buf, file,
 * report)` is seam A's encoding and character check; it returns the text, or
 * null after recording why not.
 */
export function checkPactText(root, agents, report, scanText) {
  const canon = loadClauses(report);
  const docs = new Map();
  for (const rel of [PACT, RULES]) {
    const text = readPactFile(root, rel, report, scanText);
    if (text !== null) docs.set(rel, parseDoc(text, rel, namesFor(rel), report));
  }

  // Required clauses: present, word for word, and where they belong.
  const pact = docs.get(PACT);
  const moves = pact ? findMoves(pact, report) : new Map();
  for (const [name, spec] of CLAUSES) {
    const doc = docs.get(spec.file);
    if (!doc) continue;
    const block = doc.blocks.get(name);
    if (!block) {
      report.fail('required-clause', spec.file, null, `${name} is missing`);
      continue;
    }
    if (canon.has(name) && block.text !== canon.get(name)) report.fail('required-clause', spec.file, null, `${name} differs from its canonical text`);
    const inSection = doc.meta[block.begin].section === spec.section && doc.meta[block.end].section === spec.section;
    const range = spec.move ? moves.get(spec.move) : null;
    const inMove = !spec.move || (range && block.begin >= range[0] && block.end <= range[1]);
    if (!inSection || !inMove) {
      report.fail('anchor', spec.file, block.begin + 1, `${name} is outside ${spec.move ? `move ${spec.move}` : `"${spec.section}"`}`);
    }
  }

  // Shared blocks: the holder's copy equals the pact's. Other agents hold none.
  const holders = new Set();
  for (const [name, holderName] of SHARED) {
    const holder = agents.find(a => a.name === holderName);
    if (!holder) {
      report.fail('shared-block', null, null, `no installed agent named ${holderName} holds the shared ${name} block`);
      continue;
    }
    holders.add(holder);
    const doc = parseDoc(readFileSync(join(root, ...holder.file.split('/')), 'utf8'), holder.file, new Set([name]), report);
    const block = doc.blocks.get(name);
    const source = pact && pact.blocks.get(name);
    if (!block) report.fail('shared-block', holder.file, null, `no shared ${name} block`);
    else if (!source || block.text !== source.text) report.fail('shared-block', holder.file, block.begin + 1, `the shared ${name} block differs from the pact's`);
  }
  for (const a of agents) {
    if (holders.has(a)) continue;
    const lines = readFileSync(join(root, ...a.file.split('/')), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (PACT_MARKER_RE.test(line)) report.fail('marker', a.file, i + 1, 'a pact marker in an agent that holds no block');
    });
  }

  // C3 routing.
  if (pact) {
    const routed = routedNames(pact, moves);
    for (const a of agents) {
      if (typeof a.name === 'string' && !routed.has(a.name)) report.fail('routing', a.file, null, 'not named in moves 1 to 4 or a listed role line');
    }
  }
}
