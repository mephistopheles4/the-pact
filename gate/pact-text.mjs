// Seam A's checks on the pact's own text (#33, thinned by #261), imported by
// seam-a.mjs. The thin gate checks what can run and with what power, not what
// the rules file says or how it is shaped. So these are all it checks:
//
//   Pinned blocks: each block on PINNED (shared.mjs) is present in its file
//     and equals its canonical text in gate/clauses/, word for word.
//   The marker grammar: every comment in the rules file and AGENTS.md is a
//     marker alone on its line, naming a pinned block, opened and closed once.
//   No file import: no line of the rendered rules file holds an @ followed by
//     text, which Claude Code would load as more rules that no check reads.
//   Agents hold no pact marker, but for one named exemption: executability-lens
//     keeps its risk-floor marker pair, once each.
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
// The marker parser and the text scanner live in shared.mjs (#91).
//
// Like seam A, nothing here echoes a file's content. Output names files, line
// numbers and this module's own fixed block names, never a name read from a
// file.

import { lstatSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AT_IMPORT_RE, PACT_MARKER_RE, PINNED, parseDoc, scanText } from './shared.mjs';

const CLAUSE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'clauses');

const PACT = 'claude/CLAUDE.md';
const RULES = 'AGENTS.md';

// The file that holds each pinned block. A name on PINNED with no file here
// fails closed, so the list and this map cannot drift apart in silence.
const PINNED_FILE = new Map([
  ['stop-and-escalate', PACT],
  ['install-go-ahead', RULES],
]);

// The one agent that may hold pact markers, and the only lines it may hold
// (#261, S5): executability-lens's copy of the retired risk floor. Matched by
// the installed agent's name, so it holds wherever the agent lives.
const EXEMPT_AGENT = 'executability-lens';
const EXEMPT_LINES = Object.freeze(['<!-- pact:begin risk-floor -->', '<!-- pact:end risk-floor -->']);

// The roster (#35): every reviewer name the pact has had, the four of old and
// the nine lenses. The gate no longer checks the text against it (#261); the
// tests read it to keep retired names out of the repo.
export const OLD_REVIEWERS = Object.freeze(['plan-reviewer', 'result-checker', 'test-reviewer', 'security-reviewer']);
export const LENSES = Object.freeze([
  'behaviour-lens',
  'integrity-lens',
  'adversarial-lens',
  'data-lens',
  'executability-lens',
  'good-enough-lens',
  'conventions-lens',
  'reader-lens',
  'unstated-lens',
]);
export const ROSTER = Object.freeze([...OLD_REVIEWERS, ...LENSES]);

/** The canonical texts, as a Map from block name to text. A bad file fails and is left out. */
function loadClauses(report) {
  const out = new Map();
  for (const name of PINNED) {
    const rel = `gate/clauses/${name}.md`;
    if (!PINNED_FILE.has(name)) {
      report.fail('clause-text', rel, null, 'a pinned block with no file named for it in the gate');
      continue;
    }
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

/** A pact file from the stage, read through the gate's text scanner. */
function readPactFile(root, rel, report) {
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
  return new Set([...PINNED_FILE].filter(([n, f]) => f === file && PINNED.includes(n)).map(([n]) => n));
}

/**
 * The agents' markers: none, but for the exempt agent's exact pair, each line
 * once. Any other comment line that names pact, in any agent, fails.
 */
function checkAgentMarkers(root, agents, report) {
  for (const a of agents) {
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(join(root, ...a.file.split('/'))));
    } catch {
      continue; // seam A's own reader has already failed it
    }
    const exempt = a.name === EXEMPT_AGENT;
    const seen = new Set();
    text.split('\n').forEach((line, i) => {
      if (!PACT_MARKER_RE.test(line)) return;
      if (exempt && EXEMPT_LINES.includes(line) && !seen.has(line)) {
        seen.add(line);
        return;
      }
      report.fail('marker', a.file, i + 1, exempt ? `a pact marker other than ${EXEMPT_AGENT}'s risk-floor pair, once each` : 'a pact marker in an agent');
    });
  }
}

/**
 * Check the pact's text. `agents` are seam A's installed agents, each with
 * `file` and, once its frontmatter was read, `name`.
 */
export function checkPactText(root, agents, report) {
  const canon = loadClauses(report);
  const docs = new Map();
  for (const rel of [PACT, RULES]) {
    const text = readPactFile(root, rel, report);
    if (text === null) continue;
    docs.set(rel, parseDoc(text, rel, new Set(PINNED), namesFor(rel), report));
    if (rel !== PACT) continue;
    text.split('\n').forEach((line, i) => {
      if (AT_IMPORT_RE.test(line)) report.fail('rules-import', rel, i + 1, 'an @ followed by text, which Claude Code may load as a file import');
    });
  }

  // Pinned blocks: present, and word for word.
  for (const name of PINNED) {
    const file = PINNED_FILE.get(name);
    const doc = file && docs.get(file);
    if (!doc) continue;
    const block = doc.blocks.get(name);
    if (!block) report.fail('required-clause', file, null, `${name} is missing`);
    else if (canon.has(name) && block.text !== canon.get(name)) report.fail('required-clause', file, null, `${name} differs from its canonical text`);
  }

  checkAgentMarkers(root, agents, report);
}
