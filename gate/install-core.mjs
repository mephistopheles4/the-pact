// The install's decisions (#153, S3): pure functions over values, with no I/O,
// tested in-process by the tables in gate/tests/. The runner
// (gate/install-run.mjs) reads and writes; every choice it makes about what
// it read is one of these. Each refusal is a Refusal with one rule id, a
// string literal here, so a table row can name it. Ported check by check from
// scripts/install.ps1 (S6); where PowerShell compared without regard to case,
// so does this.
//
// Nothing here runs on import. Imports nothing.

export const AGENT_NAMES = Object.freeze(['adversarial-lens', 'behaviour-lens', 'conventions-lens', 'data-lens', 'executability-lens', 'good-enough-lens', 'integrity-lens', 'reader-lens', 'unstated-lens']);
export const RETIRED = Object.freeze(['agents/builder.md', 'agents/spec-builder.md', 'agents/security-builder.md']);
export const INSTALL_FILES = Object.freeze(['gate/install.mjs', 'gate/install-run.mjs', 'gate/install-core.mjs', 'gate/install-io.mjs']);
export const RULES_REL = 'claude/CLAUDE.md';
export const OVERLAY_REL = 'claude/settings.overlay.json';
export const CONFIG_REL = 'pact/config.json';
export const BLOCKS_REL = 'pact/blocks';
export const PROJECT_CONFIG_REL = '.claude/pact-config.json';
export const PROJECT_RULES_REL = '.claude/rules/pact-project.md';
export const PROJECT_RECORD_REL = '.claude/rules/pact-project.record.json';
export const PROJECT_ATTR_RELS = Object.freeze(['.claude', '.claude/rules', PROJECT_RULES_REL, PROJECT_CONFIG_REL, PROJECT_RECORD_REL]);
export const LINES_MAX = 400;
export const LINE_CHARS = 300;
export const RULES_CAP = 1024 * 1024;
export const OUT_CAP = 4 * 1024 * 1024;
export const PROJECT_CAP = 64 * 1024;
export const JSON_DEPTH_MAX = 64;
// Settings that run a command, load code or reach a tool server: the names
// seam A refuses in the overlay (BANNED_SETTINGS in gate/seam-a-core.mjs).
export const BANNED_SETTINGS = Object.freeze(['hooks', 'mcpServers', 'statusLine', 'fileSuggestion', 'apiKeyHelper', 'awsAuthRefresh', 'awsCredentialExport', 'otelHeadersHelper', 'enabledPlugins', 'extraKnownMarketplaces', 'enableAllProjectMcpServers', 'enabledMcpjsonServers']);
// Banned in the overlay, but the owner's own in the live file, which the merge keeps.
export const LIVE_OWN_SETTINGS = Object.freeze(['enabledPlugins', 'extraKnownMarketplaces']);

/** A refusal: the rule id a table names, and the sentence the install prints. */
export class Refusal extends Error {
  constructor(rule, why, outcome = 'Nothing was changed.') {
    super(why);
    this.rule = rule;
    this.why = why;
    this.outcome = outcome;
  }
}
const refuse = (rule, why, outcome) => {
  throw new Refusal(rule, why, outcome);
};

// ------------------------------------------------------------ printing

/** Text from outside the install (a record, a check's line) made safe to print: no control, format or separator character. */
export const formatPlain = s => String(s).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '?');

/** A check's line, cleaned, cut to length, and prefixed by its source, so it never passes for the install's own. */
export function formatCheckLine(line, prefix) {
  let s = formatPlain(line);
  if (s.length > LINE_CHARS) s = `${s.slice(0, LINE_CHARS)}...`;
  return `${prefix}| ${s}`;
}

/** A check's lines as the install shows them: at most LINES_MAX, then a count of the rest. */
export function showLines(lines, prefix) {
  const out = [];
  for (const [i, l] of lines.entries()) {
    if (i >= LINES_MAX) {
      out.push(`${prefix}| (${lines.length - i} more lines not shown)`);
      break;
    }
    out.push(formatCheckLine(l, prefix));
  }
  return out;
}

/** A permission rule as the owner approves it: every character outside printable ASCII, and the backslash, as a \u escape (#89). */
export const formatRule = s => String(s).replace(/[^\x20-\x5b\x5d-\x7e]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/** A module's lines as its wrapper would print them and the old install split them: joined, split on newlines, empty lines dropped. */
export const outputLines = lines => lines.join('\n').split('\n').filter(l => l !== '');

// ------------------------------------------------------------ the command line

const FLAGS = new Set(['--apply']);
const VALUED = new Set(['--commit', '--rendered-hash', '--claude-home', '--review-folder', '--project-folder']);
const PATH_OPTIONS = ['--claude-home', '--review-folder', '--project-folder'];
const SAFE_PATH = /^[A-Za-z0-9 ._\-:\\/]+$/;

/**
 * The command line, strictly (S4): known options only, spelled exactly, each
 * once, a value as the next word. Nothing is read from the environment. Option
 * names are shown cleaned; values never are.
 */
export function parseArgs(argv, platform) {
  const win = platform === 'win32';
  const given = new Map();
  const unread = [];
  for (let i = 0; i < argv.length; i++) {
    const w = argv[i];
    if (FLAGS.has(w) && !given.has(w)) given.set(w, true);
    else if (VALUED.has(w) && !given.has(w)) {
      if (i + 1 >= argv.length) refuse('args-no-value', `${w} needs a value after it.`);
      given.set(w, argv[++i]);
    } else unread.push(w);
  }
  if (unread.length) {
    const names = unread.filter(w => w.startsWith('-')).map(w => {
      const n = w.replace(/[^A-Za-z0-9-]/g, '?');
      return n.length > 40 ? `${n.slice(0, 40)}...` : n;
    });
    const words = unread.length === 1 ? '1 word' : `${unread.length} words`;
    refuse('args-unread', `the command line holds ${words} the script does not read${names.length ? ` (${names.join(', ')})` : ''}. Check each option's spelling.`);
  }
  for (const opt of PATH_OPTIONS) {
    if (!given.has(opt)) continue;
    const v = given.get(opt);
    if (/^[\\/]{2}/.test(v)) refuse('path-network', `${opt} names a network or device path; give a full path on this machine.`);
    if (!(win ? /^[A-Za-z]:[\\/]/.test(v) : v.startsWith('/'))) {
      refuse('path-not-full', opt === '--claude-home' ? "--claude-home must be a full path, such as the default (your home folder's .claude). A hash goes after --rendered-hash." : `${opt} must be a full path.`);
    }
    if (!SAFE_PATH.test(v) || (win && v.indexOf(':', 2) >= 0)) refuse('path-chars', `${opt} holds a character the install does not take in a path: only letters, digits, spaces and . _ - : \\ / are taken. Use a folder whose full path holds only those.`);
  }
  if (given.has('--review-folder') && given.has('--project-folder')) refuse('args-review-project', '--review-folder is for a home install; a project install writes no review output.');
  if (given.has('--apply') && !given.has('--commit')) refuse('args-apply-commit', '--apply needs --commit with the full commit id the dry run printed.');
  return {
    apply: given.has('--apply'),
    commit: given.get('--commit') ?? null,
    renderedHash: given.has('--rendered-hash') ? given.get('--rendered-hash') : null,
    claudeHome: given.get('--claude-home') ?? null,
    reviewFolder: given.get('--review-folder') ?? null,
    projectFolder: given.get('--project-folder') ?? null,
    paths: PATH_OPTIONS.filter(o => given.has(o)).map(o => [o, given.get(o)]),
  };
}

/** The apply command a dry run prints, runnable as typed (S12): the dry run's paths, single-quoted, then --apply --commit, and the hash when a configuration applies. */
export function applyLine(paths, commit, renderedHash, platform) {
  const head = platform === 'win32' ? '$env:NODE_OPTIONS = $null; node gate/install.mjs' : 'env -u NODE_OPTIONS node gate/install.mjs';
  const opts = paths.map(([o, v]) => ` ${o} '${v}'`).join('');
  return `${head}${opts} --apply --commit ${commit}${renderedHash ? ` --rendered-hash ${renderedHash}` : ''}`;
}

// ------------------------------------------------------------ the commit's tree

/** True for a path the install stages: claude/, familiars/ and gate/ but its tests, AGENTS.md, and the cross script. */
export const isStaged = rel => rel === 'AGENTS.md' || rel === 'cross/cross.mjs' || (/^(claude|familiars|gate)\//.test(rel) && !rel.startsWith('gate/tests/'));

/**
 * The commit's tree from `ls-tree -r -z` bytes (S6, G7), checked again from
 * committed code: every record well-formed, and every staged path a plain
 * file with safe segments, no two differing only in case. Returns the staged
 * paths and their blob ids, in listed order.
 */
export function parseTree(bytes) {
  const staged = new Map();
  const folded = new Set();
  for (const rec of Buffer.from(bytes).toString('utf8').split('\0')) {
    if (rec === '') continue;
    const m = /^(\d{6}) (\w+) ([0-9a-f]{40})\t([\s\S]+)$/.exec(rec);
    if (!m) refuse('tree-record', 'git listed the commit in a form the install does not read.');
    const [, mode, type, id, rel] = m;
    if (!isStaged(rel)) continue;
    const shownRel = rel.replace(/[^A-Za-z0-9._/-]/g, '?');
    if (mode !== '100644' || type !== 'blob') refuse('tree-mode', `the commit holds ${shownRel} with file mode ${mode}; only plain files (100644) are installed.`);
    for (const seg of rel.split('/')) if (!/^[A-Za-z0-9._-]+$/.test(seg) || seg === '.' || seg === '..') refuse('tree-segment', `the commit holds a path with unsafe characters: ${shownRel}.`);
    if (folded.has(rel.toLowerCase())) refuse('tree-case', `the commit holds two paths that differ only in case: ${shownRel}.`);
    folded.add(rel.toLowerCase());
    staged.set(rel, id);
  }
  return staged;
}

/** A blob's bytes against its id: the stage holds exactly the commit's bytes (S6, G9). */
export function checkStagedBlob(rel, id, actualId) {
  if (actualId !== id) refuse('stage-blob', `the bytes staged for ${rel.replace(/[^A-Za-z0-9._/-]/g, '?')} are not its blob.`);
}

// ------------------------------------------------------------ the install record

const ci = (o, name) => {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return undefined;
  const keys = Object.keys(o).filter(k => k.toLowerCase() === name);
  if (keys.length > 1) refuse('record-unreadable', 'the install record is not readable JSON (two keys differ only in case); fix or remove it.');
  return keys.length ? o[keys[0]] : undefined;
};
/** PowerShell's truth test, which the record check used. */
const truthy = v => (v === null || v === undefined ? false : Array.isArray(v) ? (v.length === 1 ? truthy(v[0]) : v.length > 1) : typeof v === 'object' ? true : Boolean(v));
const asList = v => (v === null || v === undefined ? [] : Array.isArray(v) ? v : [v]);
/** PowerShell's [string]: null is empty, a boolean is True or False. */
const psString = v => (v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'True' : 'False') : typeof v === 'object' ? JSON.stringify(v) : String(v));

/**
 * The install record (.pact-install.json), or null when there is none. It must
 * hold `commit` and `files` (S6, G5). Keys are read without regard to case, as
 * PowerShell read them, and the configuration entries' keys are only compared,
 * never printed (G6).
 */
export function parseRecord(text) {
  if (text === null) return null;
  let doc;
  try {
    doc = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    refuse('record-unreadable', 'the install record is not readable JSON; fix or remove it.');
  }
  const commit = ci(doc, 'commit');
  const files = ci(doc, 'files');
  if (!(truthy(commit) && truthy(files))) refuse('record-not-pact', 'the install record is not a pact manifest (needs commit and files); fix or remove it.');
  const config = new Map();
  for (const c of truthy(ci(doc, 'config')) ? asList(ci(doc, 'config')) : []) {
    const kind = ci(c, 'kind');
    const sha = ci(c, 'sha256');
    if (typeof kind !== 'string' || typeof sha !== 'string') continue;
    if (kind === 'user') config.set('user', sha);
    else if (kind === 'block' && typeof ci(c, 'path') === 'string') config.set(`block ${ci(c, 'path')}`, sha);
  }
  const digest = ci(doc, 'digest');
  return {
    commit: psString(commit),
    digest: typeof digest === 'string' && /^[0-9a-f]{12}$/.test(digest) ? digest : null,
    files: asList(files).map(e => ({ path: typeof ci(e, 'path') === 'string' ? ci(e, 'path') : null, sha256: psString(ci(e, 'sha256')) })),
    config,
    gate: truthy(ci(doc, 'gate')) ? asList(ci(doc, 'gate')).map(g => [psString(ci(g, 'path')), psString(ci(g, 'sha256'))]) : [],
  };
}

/** The record the install writes (S6, X6): commit, digest, config, files, gate, in today's shape. */
export function recordText({ commit, digest, userHash, blockHashes, repoFiles, gateNow }) {
  const doc = {
    commit,
    digest: digest ?? null,
    config: [...(userHash ? [{ kind: 'user', sha256: userHash }] : []), ...[...blockHashes].map(([path, sha256]) => ({ kind: 'block', path, sha256 }))],
    files: [...repoFiles].map(([path, sha256]) => ({ path, sha256 })),
    gate: [...gateNow].map(([path, sha256]) => ({ path, sha256 })),
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// ------------------------------------------------------------ the gate's fingerprints

/**
 * The gate block (S6, G11): every gate file but the tests, against the
 * record's. The first Node install's change set, exactly install.ps1 out and
 * the four install files in, gets one line saying so (S9).
 */
export function gateBlock(gateNow, recordGate, selfDiffers) {
  const then = new Map(recordGate);
  let lines;
  if (!then.size) lines = ['Gate: no gate recorded at the last install'];
  else {
    const added = [];
    const changed = [];
    const removed = [];
    for (const [k, v] of gateNow) {
      if (!then.has(k)) added.push(k);
      else if (then.get(k).toLowerCase() !== v.toLowerCase()) changed.push(k);
    }
    for (const k of then.keys()) if (!gateNow.has(k)) removed.push(k);
    const order = [];
    for (const k of gateNow.keys()) order.push(added.includes(k) ? `  added ${k}` : changed.includes(k) ? `  changed ${k}` : null);
    const changes = [...order.filter(Boolean), ...removed.map(k => `  removed ${formatPlain(k)}`)];
    lines = changes.length ? ['Gate: CHANGED since the last install', ...changes] : ['Gate: unchanged since the last install'];
    const cutover = !changed.length && removed.length === 1 && removed[0] === 'scripts/install.ps1' && added.length === INSTALL_FILES.length && INSTALL_FILES.every(f => added.includes(f));
    if (cutover) lines.push('  This is the expected change of the first Node install: scripts/install.ps1 replaced by the four gate/install*.mjs files.');
  }
  if (selfDiffers) lines.push('WARN: this install script differs from the committed copy; --apply will refuse.');
  return lines;
}

// ------------------------------------------------------------ the pinned check

/** The pin file's text: exactly a commit line and a sha256 line (S6, P1). */
export function parsePin(text, pinnedSha) {
  const m = /^commit ([0-9a-f]{40})\nsha256 ([0-9a-f]{64})\n$/.exec(text);
  if (!m) refuse('pin-format', 'the pin file is not exactly "commit <40 hex>" and "sha256 <64 hex>".');
  if (pinnedSha !== m[2]) refuse('pin-mismatch', 'the pinned check script does not match its pin.');
  return m[1];
}

// ------------------------------------------------------------ a check's verdict

/** ADR 0032's control 4: a check passes only when it did not fail and its last line is RESULT: pass. */
export function checkVerdict(report, what) {
  const lines = outputLines(report.lines);
  if (report.failed) refuse('verdict-failed', `${what} failed.`);
  if (lines[lines.length - 1] !== 'RESULT: pass') refuse('verdict-last-line', `${what} did not end with "RESULT: pass".`);
  return lines;
}

// ------------------------------------------------------------ the renderer's lines

const EDIT_RE = /^EDIT (move-1|move-2|move-3|move-4-extra) (?:(remove)|(replace|add-after) ([0-9a-f]{64}) ([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+){0,7}))$/;
const AGENT_RE = /^AGENT ([a-z-]+) (opus|sonnet) (low|medium|high) ([0-9a-f]{64}) (plain|security-set) (default|override) (local|egress)$/;
const VALUE_RE = /^VALUE (usage-pause) (0|[1-9][0-9]?|100)$/;

/**
 * The renderer's lines (S6, R5 to R8), every one before RESULT matched to one
 * exact pattern, in these counts: one RENDERED, one DIFF, one CONFIG; with a
 * user configuration one DIGEST that must be the digest of the reported
 * hashes, at most one VALUE per setting, one EDIT per open part and one AGENT
 * per lens; with none, none of those. `hash` is sha256 over bytes, as hex.
 */
export function parseRenderLines(lines, { project, hash }) {
  let renderHash = null;
  let diffHash = null;
  let digest = null;
  const configs = [];
  const values = new Map();
  const edits = new Map();
  const blockHashes = new Map();
  const agentSets = new Map();
  for (const l of lines.slice(0, -1)) {
    let m;
    if ((m = /^RENDERED ([0-9a-f]{64})$/.exec(l))) {
      if (renderHash) refuse('render-two-hashes', 'the renderer reported two output hashes.');
      renderHash = m[1];
    } else if ((m = /^DIFF ([0-9a-f]{64})$/.exec(l))) {
      if (diffHash) refuse('render-two-diffs', 'the renderer reported two diff hashes.');
      diffHash = m[1];
    } else if ((m = EDIT_RE.exec(l))) {
      const mark = m[1];
      if (edits.has(mark)) refuse('render-edit-twice', 'the renderer reported one open part edited twice.');
      if (m[2]) edits.set(mark, { op: 'remove', sha256: null, path: null });
      else {
        const bp = m[5];
        if (bp.length > 200 || bp.split('/').some(s => s === '.' || s === '..' || s.endsWith('.'))) refuse('render-block-path', 'the renderer reported a block path the install does not read.');
        if (blockHashes.has(bp) && blockHashes.get(bp) !== m[4]) refuse('render-block-changed', 'the renderer reported two hashes for one block file: it changed while it was read.');
        blockHashes.set(bp, m[4]);
        edits.set(mark, { op: m[3], sha256: m[4], path: bp });
      }
    } else if (l === 'CONFIG none') configs.push({ kind: 'none' });
    else if ((m = /^CONFIG user ([0-9a-f]{64})$/.exec(l))) configs.push({ kind: 'user', sha256: m[1] });
    else if ((m = /^DIGEST ([0-9a-f]{12})$/.exec(l))) {
      if (digest) refuse('render-two-digests', 'the renderer reported two configuration digests.');
      digest = m[1];
    } else if ((m = AGENT_RE.exec(l))) {
      const name = AGENT_NAMES.find(a => a === m[1]);
      if (!name) refuse('render-unknown-line', 'the renderer printed a line the install does not read.');
      if (agentSets.has(name)) refuse('render-agent-twice', 'the renderer reported one agent setting twice.');
      agentSets.set(name, { model: m[2], effort: m[3], sha256: m[4], security: m[5] === 'security-set', override: m[6] === 'override', egress: m[7] === 'egress' });
    } else if ((m = VALUE_RE.exec(l))) {
      if (values.has(m[1])) refuse('render-value-twice', 'the renderer reported one setting twice.');
      values.set(m[1], m[2]);
    } else refuse('render-unknown-line', 'the renderer printed a line the install does not read.');
  }
  if (!renderHash || !diffHash || configs.length !== 1) refuse('render-counts', 'the renderer did not report exactly one output hash, one diff hash and one configuration line.');
  const config = configs[0];
  if (project && config.kind !== 'none') refuse('render-project-config', "the stage's render on a project install read a configuration.");
  if (config.kind === 'none') {
    if (digest || values.size || edits.size || agentSets.size) refuse('render-none-extras', 'the renderer reported a digest, a value, an edit or an agent setting with no configuration.');
  } else {
    let text = `user ${config.sha256}\n`;
    for (const e of edits.values()) if (e.path) text += `block ${e.path} ${e.sha256}\n`;
    if (digest !== hash(Buffer.from(text, 'ascii')).slice(0, 12)) refuse('render-digest', "the renderer's configuration digest is missing or does not match the configuration hashes it reported.");
  }
  return { renderHash, diffHash, config, digest, values, edits, blockHashes, agentSets };
}

/**
 * The renderer's output folder (S6, R9): exactly its rules file and its diff,
 * plus one agent file per AGENT line, each a plain file within its cap.
 * `entries` are { name, file, link, size }.
 */
export function checkRenderOutput(entries, agentNames) {
  const want = ['CLAUDE.md', 'config.diff', ...[...agentNames].map(n => `agent-${n}.md`)];
  let ok = entries.length === want.length && want.every(n => entries.filter(e => e.name === n).length === 1);
  if (entries.some(e => !e.file || e.link || e.size > OUT_CAP)) ok = false;
  const rules = entries.find(e => e.name === 'CLAUDE.md');
  if (!ok || rules.size > RULES_CAP) refuse('render-output', 'the renderer did not leave exactly its rules file of at most 1 MiB, its diff, and an agent file only for an agent setting it reported.');
}

/** The hashes the renderer reported against the bytes it left (R9, R10). */
export function checkRenderedHashes({ rules, diff }, parsed) {
  if (rules !== parsed.renderHash) refuse('render-rules-hash', "the rendered rules file's hash does not match the one the renderer reported.");
  if (diff !== parsed.diffHash) refuse('render-diff-hash', "the diff's hash does not match the one the renderer reported.");
}

const strictUtf8 = b => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(b);

/**
 * A rendered agent file against its committed copy (S6, R10): it may differ
 * only in its frontmatter's model and effort lines, which must hold the
 * reported values; the override word must match whether it changed; the
 * committed file holds exactly one tools line, and the egress word must match
 * it; an egress lens must be security-set.
 */
export function checkAgentFile(name, set, committed, rendered, renderedHash) {
  const rel = `claude/agents/${name}.md`;
  if (committed === null) refuse('agent-not-committed', `the configuration sets ${name}, but the commit holds no ${rel}.`);
  if (rendered.length > RULES_CAP) refuse('agent-too-big', 'the rendered agent file is larger than 1 MiB.');
  if (renderedHash !== set.sha256) refuse('agent-hash', "the rendered agent file's hash does not match the one the renderer reported.");
  let newLines;
  let oldLines;
  try {
    newLines = strictUtf8(rendered).split('\n');
    oldLines = strictUtf8(committed).split('\n');
  } catch {
    refuse('agent-utf8', 'the rendered or the committed agent file is not UTF-8.');
  }
  let ok = newLines.length === oldLines.length && newLines.length > 2 && newLines[0] === '---';
  let close = -1;
  for (let i = 1; ok && i < newLines.length; i++) {
    if (newLines[i] === '---') {
      close = i;
      break;
    }
  }
  if (close < 0) ok = false;
  let models = 0;
  let efforts = 0;
  let changed = false;
  for (let i = 0; ok && i < newLines.length; i++) {
    if (i > 0 && i < close) {
      if (newLines[i].startsWith('model:')) {
        models++;
        if (newLines[i] !== `model: ${set.model}`) ok = false;
      }
      if (newLines[i].startsWith('effort:')) {
        efforts++;
        if (newLines[i] !== `effort: ${set.effort}`) ok = false;
      }
    }
    if (newLines[i] === oldLines[i]) continue;
    changed = true;
    if (i <= 0 || i >= close) ok = false;
    else if (!((oldLines[i].startsWith('model:') && newLines[i].startsWith('model:')) || (oldLines[i].startsWith('effort:') && newLines[i].startsWith('effort:')))) ok = false;
  }
  if (!ok || models !== 1 || efforts !== 1) refuse('agent-lines', 'the rendered agent file differs from the committed one beyond its model and effort lines, or does not hold the reported values.');
  if (changed !== set.override) refuse('agent-override', `the renderer's override word for ${name} does not match whether its file changed.`);
  const tools = oldLines.slice(1, close).filter(l => l.startsWith('tools:'));
  if (tools.length !== 1) refuse('agent-tools', `the committed ${rel} does not hold exactly one tools line.`);
  if ((tools[0] !== 'tools: [Read, Glob, Grep]') !== set.egress) refuse('agent-egress', `the renderer's egress word for ${name} does not match its committed tools line.`);
  if (set.egress && !set.security) refuse('agent-egress-security', `the renderer called ${name} egress but not security-set.`);
}

// ------------------------------------------------------------ seam A's copy set and overlay

/** Where each staged file installs, by the install's own reading of the stage: null for one that never installs. */
export function expectedCopySet(stagedRels) {
  const out = new Map();
  for (const rel of stagedRels) {
    if (rel.startsWith('gate/') || rel === 'AGENTS.md' || rel === OVERLAY_REL || rel === 'familiars/.gitkeep') continue;
    if (/^familiars\/[^/]+\.(contract|practice-test)\.md$/.test(rel)) continue;
    let m;
    if ((m = /^claude\/(.+)$/.exec(rel))) out.set(rel, m[1]);
    else if ((m = /^familiars\/([^/]+\.md)$/.exec(rel))) out.set(rel, `agents/${m[1]}`);
    else if (rel === 'cross/cross.mjs') out.set(rel, 'pact/cross.mjs');
    else out.set(rel, null);
  }
  return out;
}

/**
 * Seam A's INSTALL lines against the install's own reading (S6, S-2): the
 * same paths, destinations and hashes exactly, each listed once. Returns
 * staged path -> { dest, sha256 }.
 */
export function matchCopySet(lines, expected, stagedHashes, commit) {
  const checked = new Map();
  for (const l of lines) {
    const m = /^INSTALL ([0-9a-f]{64}) (\S+) (\S+)$/.exec(l);
    if (!m) continue;
    if (checked.has(m[2])) refuse('copy-set-twice', 'the check listed one file twice.');
    checked.set(m[2], { dest: m[3], sha256: m[1] });
  }
  let ok = checked.size === expected.size;
  for (const [rel, dest] of expected) {
    if (!ok) break;
    const c = checked.get(rel);
    ok = Boolean(c) && c.dest === dest && c.sha256 === stagedHashes.get(rel);
  }
  if (!ok) refuse('copy-set-mismatch', `the check's copy set does not match the install's own reading of commit ${commit}.`);
  return checked;
}

/** Seam A's one SETTINGS line, bound to the staged overlay's bytes (S6, S-3). Returns the overlay as a settings map. */
export function checkOverlay(lines, overlayHash, stagedHash, overlayText) {
  const settings = lines.filter(l => l.startsWith('SETTINGS '));
  const m = settings.length === 1 ? /^SETTINGS ([0-9a-f]{64}) claude\/settings\.overlay\.json$/.exec(settings[0]) : null;
  if (!m) refuse('overlay-line', 'the check did not report exactly one settings overlay hash.');
  if (stagedHash === undefined) refuse('overlay-missing', 'the commit holds no settings overlay.');
  if (overlayHash !== m[1] || overlayHash !== stagedHash) refuse('overlay-hash', "the settings overlay's hash does not match the one the check passed.");
  const overlay = readSettings(overlayText);
  if (overlay === null) refuse('overlay-not-object', 'the settings overlay is not a JSON object.');
  return overlay;
}

// ------------------------------------------------------------ settings JSON (S8)

/** A JSON number held as its source text, so it is never rounded. */
export class Num {
  constructor(raw) {
    this.raw = raw;
  }
}
const isMap = v => v instanceof Map;

function depthOf(v) {
  let max = 0;
  const stack = [[v, 1]];
  while (stack.length) {
    const [x, d] = stack.pop();
    if (x === null || typeof x !== 'object' || x instanceof Num) continue;
    max = Math.max(max, d);
    for (const c of Array.isArray(x) ? x : Object.values(x)) stack.push([c, d + 1]);
  }
  return max;
}

function toMaps(v) {
  if (Array.isArray(v)) return v.map(toMaps);
  if (v === null || typeof v !== 'object' || v instanceof Num) return v;
  const m = new Map();
  for (const k of Object.keys(v)) m.set(k, toMaps(v[k]));
  return m;
}

/**
 * Settings text as maps, or null when it is not one strict JSON object (S6,
 * L4): no comments or trailing commas, case-sensitive keys, the last of two
 * equal keys wins, at most 64 levels deep, a leading byte order mark dropped,
 * as PowerShell's reader did. Numbers keep their source text. A __proto__ key
 * is a plain key.
 */
export function readSettings(text) {
  let v;
  try {
    v = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text, (k, val, ctx) => (typeof val === 'number' ? new Num(ctx.source) : val));
  } catch {
    return null;
  }
  if (v === null || typeof v !== 'object' || Array.isArray(v) || v instanceof Num) return null;
  if (depthOf(v) > JSON_DEPTH_MAX) return null;
  return toMaps(v);
}

function toJsonValue(v) {
  if (v instanceof Num) return JSON.rawJSON(v.raw);
  if (Array.isArray(v)) return v.map(toJsonValue);
  if (isMap(v)) {
    const o = Object.create(null);
    for (const [k, x] of v) Object.defineProperty(o, k, { value: toJsonValue(x), enumerable: true, writable: true, configurable: true });
    return o;
  }
  return v;
}

/** Settings maps as the text the install writes: two-space JSON, numbers as their source text. */
export const settingsText = m => `${JSON.stringify(toJsonValue(m), null, 2)}\n`;

/** Key-order-insensitive text, to tell a real change from a reformat. */
export function canonical(v) {
  if (isMap(v)) return `{${[...v.keys()].sort().map(k => `${JSON.stringify(k)}:${canonical(v.get(k))}`).join(',')}}`;
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v instanceof Num) return v.raw;
  return JSON.stringify(v);
}

/** A rule list item as PowerShell's [string] read it. */
const ruleString = v => (v instanceof Num ? v.raw : typeof v === 'boolean' ? (v ? 'True' : 'False') : isMap(v) || Array.isArray(v) ? canonical(v) : String(v));
const listOf = v => (v === null || v === undefined ? [] : Array.isArray(v) ? v : [v]);

function mergeDeep(a, b) {
  const r = new Map(a);
  for (const [k, v] of b) {
    if (isMap(v)) r.set(k, mergeDeep(isMap(r.get(k)) ? r.get(k) : new Map(), v));
    else r.set(k, v);
  }
  return r;
}

/** The ordinal, sorted union of two rule lists. */
function union(x, y) {
  const set = new Set();
  for (const i of [...listOf(x), ...listOf(y)]) if (i !== null && i !== undefined) set.add(ruleString(i));
  return [...set].sort();
}

/**
 * The live settings with the overlay merged in (S6, L5): the overlay wins,
 * objects merge, the plugin keys stay the owner's, and the allow, deny and ask
 * lists are unioned and sorted ordinally, so the owner's own rules survive.
 */
export function mergeSettings(live, overlay) {
  const m = mergeDeep(live, overlay);
  for (const k of LIVE_OWN_SETTINGS) if (live.has(k)) m.set(k, live.get(k));
  const pa = isMap(live.get('permissions')) ? live.get('permissions') : new Map();
  const pb = overlay.has('permissions') ? overlay.get('permissions') : new Map();
  for (const k of ['allow', 'deny', 'ask']) if (pa.has(k) || pb.has(k)) m.get('permissions').set(k, union(pa.get(k), pb.get(k)));
  return m;
}

const pathIn = (map, segs) => {
  let v = map;
  for (const s of segs) {
    if (!isMap(v) || !v.has(s)) return { has: false };
    v = v.get(s);
  }
  return { has: true, value: v };
};

/** What the merge changes, told from the overlay's side only (S6, L6): a live value is never printed. */
export function settingsChanges(live, overlay) {
  const paths = [];
  for (const [top, v] of overlay) {
    if ((top === 'env' || top === 'permissions') && isMap(v)) for (const k of v.keys()) paths.push([top, k]);
    else paths.push([top]);
  }
  const out = [];
  for (const segs of paths) {
    const name = segs.join('.');
    const now = pathIn(overlay, segs).value;
    const old = pathIn(live, segs);
    if (name === 'permissions.allow' || name === 'permissions.deny' || name === 'permissions.ask') {
      const had = old.has && Array.isArray(old.value) ? old.value.map(ruleString) : [];
      for (const rule of listOf(now)) if (!had.includes(ruleString(rule))) out.push(`  + ${name}: ${formatRule(ruleString(rule))}`);
    } else if (!old.has || canonical(old.value) !== canonical(now)) out.push(`  set ${name} = ${formatPlain(canonical(now))}`);
  }
  return out;
}

function bannedKeys(v) {
  const found = new Set();
  const stack = [v];
  while (stack.length) {
    const x = stack.pop();
    if (isMap(x)) {
      for (const [k, c] of x) {
        if (BANNED_SETTINGS.includes(k)) found.add(k);
        stack.push(c);
      }
    } else if (Array.isArray(x)) stack.push(...x);
  }
  return [...found].sort();
}

/**
 * Warnings about the live file (S6, L7): a banned key, missing pact ask rules,
 * a mode other than auto. The owner's own keys are named once, capped; env
 * names are only counted, since a name can say what a secret is for.
 */
export function liveSettingsLines(live, overlay, pactAsk) {
  const out = [];
  for (const k of bannedKeys(live)) if (!LIVE_OWN_SETTINGS.includes(k)) out.push(`WARN: settings.json holds ${k}, a command-running setting the pact never sets.`);
  const lp = live.get('permissions');
  const liveAsk = isMap(lp) && Array.isArray(lp.get('ask')) ? lp.get('ask').map(ruleString) : [];
  const missing = pactAsk.filter(r => !liveAsk.includes(r));
  if (missing.length) out.push(`WARN: settings.json lacks ${missing.length} of the pact's ask rules; --apply adds them back.`);
  const mode = isMap(lp) ? lp.get('defaultMode') : undefined;
  if (mode !== 'auto') out.push('WARN: settings.json: permissions.defaultMode is not auto; --apply sets it.');
  const own = [...live.keys()].filter(k => !overlay.has(k) && (!BANNED_SETTINGS.includes(k) || LIVE_OWN_SETTINGS.includes(k))).sort();
  if (own.length) {
    const names = own.slice(0, 20).map(k => {
      const n = formatPlain(k);
      return n.length > 40 ? `${n.slice(0, 40)}...` : n;
    });
    let line = `NOTE: live keys the pact does not set (yours, not checked): ${names.join(', ')}`;
    if (own.length > 20) line += ` and ${own.length - 20} more`;
    if (line.length > LINE_CHARS) line = `${line.slice(0, LINE_CHARS)}...`;
    out.push(line);
  }
  const le = live.get('env');
  const oe = overlay.get('env');
  if (isMap(le)) {
    const n = [...le.keys()].filter(k => !(isMap(oe) && oe.has(k))).length;
    if (n) out.push(`NOTE: live env names the pact does not set: ${n}`);
  }
  return out;
}

/** The guard, in the settings Claude Code reads (S6, X7): every pact ask rule, compared exactly, and auto mode. */
export function guardHolds(after, pactAsk) {
  const ap = isMap(after) ? after.get('permissions') : null;
  return isMap(ap) && ap.get('defaultMode') === 'auto' && Array.isArray(ap.get('ask')) && pactAsk.every(r => ap.get('ask').some(x => x === r));
}

// ------------------------------------------------------------ the plan

/** Never deleted, overwritten or listed, whatever the record says: normalised as Windows reads a name. */
export function isProtected(rel) {
  const segs = rel
    .replace(/\\/g, '/')
    .split('/')
    .map(s => s.replace(/:.*$/, '').replace(/[. ]+$/, ''))
    .filter(Boolean);
  const n = segs.join('/').toLowerCase();
  const leaf = segs.length ? segs[segs.length - 1].toLowerCase() : '';
  return n === 'settings.json' || n === '.pact-install.json' || n === 'pact/config.json' || leaf.startsWith('.credentials') || /^(projects|memory|skills|handover|pact\/blocks)(\/|$)/.test(n);
}

/** Only plain, canonical record paths are acted on: a name that is not already plain could be a Windows alias. */
export function isCanonical(rel) {
  if (!rel || rel.includes('\\')) return false;
  return rel.split('/').every(seg => /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(seg) && !seg.endsWith('.'));
}

/** Null when a record or install path is safe to act on; otherwise why not (S6, L1). `throughLink` is the I/O test. */
export function skipReason(rel, throughLink) {
  if (typeof rel !== 'string' || !rel || /^([\\/]|[A-Za-z]:)/.test(rel) || /(^|[\\/])\.\.([\\/]|$)/.test(rel)) return 'unsafe path';
  if (isProtected(rel)) return 'protected path';
  if (!isCanonical(rel)) return 'non-canonical path';
  if (throughLink(rel)) return 'path through a link';
  return null;
}

/** The live destinations of the copy set (S6, L1): each must be safe, and no two may fold to one name. */
export function installDestinations(checked, throughLink) {
  const repoFiles = new Map();
  const sourceOf = new Map();
  const seen = new Set();
  for (const [rel, { dest, sha256 }] of checked) {
    const why = skipReason(dest, throughLink);
    if (why) refuse('dest-skip', `${why} for an install destination: ${formatPlain(dest)}.`);
    if (seen.has(dest.toLowerCase())) refuse('dest-twice', `two files install to ${dest}.`);
    seen.add(dest.toLowerCase());
    repoFiles.set(dest, sha256);
    sourceOf.set(dest, rel);
  }
  return { repoFiles, sourceOf };
}

/**
 * The plan (S6, L2 and L3), from the record, the repo's files and each live
 * path's state ({ exists, file, sha256 }, by `live(rel)`): drift, overwrite,
 * add, delete and unchanged. A first install deletes only the retired agents.
 */
export function plan(record, repoFiles, live, throughLink) {
  const drift = [];
  const overwrite = [];
  const add = [];
  let del = [];
  const warnings = [];
  let same = 0;
  if (record) {
    const entries = [];
    for (const e of record.files) {
      const why = skipReason(e.path, throughLink);
      if (why) warnings.push(`${why} in the install record, skipped: ${e.path ?? ''}`);
      else entries.push(e);
    }
    for (const e of entries) {
      const s = live(e.path);
      if (!s.file) drift.push(`${e.path} (deleted since the install)`);
      else if (s.sha256 !== e.sha256.toLowerCase()) drift.push(`${e.path} (changed since the install)`);
    }
    del = entries.filter(e => !repoFiles.has(e.path) && live(e.path).exists).map(e => e.path);
  } else del = RETIRED.filter(r => live(r).exists);
  for (const [rel, sha] of repoFiles) {
    const s = live(rel);
    if (!s.file) add.push(rel);
    else if (s.sha256 !== sha) overwrite.push(rel);
    else same++;
  }
  return { drift, overwrite, add, delete: del, warnings, same };
}

// ------------------------------------------------------------ the configuration against the record

/** This run's configuration files, keyed as the record's are. */
export function configNow(parsed) {
  const now = new Map();
  if (parsed.config.kind === 'user') now.set('user', parsed.config.sha256);
  for (const [bp, sha] of parsed.blockHashes) now.set(`block ${bp}`, sha);
  return now;
}

/** True when a configuration file was added, changed or removed since the last install, even if the render came out the same. */
export function configStale(now, last) {
  if (now.size !== last.size) return true;
  for (const [k, v] of now) if (!last.has(k) || last.get(k) !== v) return true;
  return false;
}

/** The Configuration block, built from the renderer's parsed lines alone. */
export function configBlock(parsed, rulesHash, record) {
  const last = record ? record.config : new Map();
  const now = configNow(parsed);
  const since = key => (!record ? 'no install recorded' : !last.has(key) ? 'new since the last install' : last.get(key) === now.get(key) ? 'unchanged since the last install' : 'CHANGED since the last install');
  const out = [];
  if (parsed.config.kind === 'none') {
    out.push('  no configuration');
    if (last.size) out.push('  the last install had a configuration; this install removes it from the rules file');
    return out;
  }
  out.push(`  user file ${CONFIG_REL}: sha256 ${parsed.config.sha256}, ${since('user')}`);
  for (const [bp, sha] of parsed.blockHashes) out.push(`  block file ${BLOCKS_REL}/${bp}: sha256 ${sha}, ${since(`block ${bp}`)}`);
  const removed = [...last.keys()].filter(k => k.startsWith('block ') && !now.has(k)).length;
  if (removed) out.push(`  ${removed} block file(s) the last install read are no longer used`);
  out.push(`  configuration digest: ${parsed.digest}`);
  out.push(`  rendered rules file: sha256 ${rulesHash}`);
  for (const [k, v] of parsed.values) out.push(`  WARN: the user configuration sets ${k} to ${v}.`);
  for (const [k, e] of parsed.edits) out.push(`  WARN: the user configuration edits ${k} (${e.op}).`);
  for (const [name, a] of parsed.agentSets) {
    let warn = `  WARN: the user configuration sets ${name} to ${a.model}, ${a.effort} effort.`;
    if (a.security && a.override) {
      warn += ` ${name} is a security-set lens, so this is an override, not security-tested: its security set ran only on its default.`;
      if (a.egress) warn += ' On a weaker setting it may follow instructions planted in the code it reviews, or send a secret out through a command, a browser address or a search query.';
    }
    out.push(warn);
  }
  out.push('  Open text is checked for form, imports, routing and the roster, not for meaning.');
  return out;
}

// ------------------------------------------------------------ binding and apply

/** A hash or commit given is always compared, dry run or --apply (S6, H1). */
export function checkBinding(opts, rulesHash, commit) {
  if (opts.renderedHash !== null && opts.renderedHash !== rulesHash) {
    refuse('hash-mismatch', 'the hash given with --rendered-hash is not the full hash of the rules file this run rendered: the configuration or the commit changed since the dry run, or the hash was cut short or mistyped.');
  }
  if (opts.commit !== null && opts.commit !== commit) refuse('commit-mismatch', 'the commit given with --commit is not the commit HEAD names now: the clone changed since the dry run, or the id was cut short or mistyped.');
}

/** --apply's own refusals (S6, X1), in order. */
export function checkApply({ configApplies, hashGiven, selfDiffers, drift, dirty, settingsObject }) {
  if (configApplies && !hashGiven) refuse('apply-needs-hash', 'a configuration applies, so --apply needs the full rendered hash the dry run showed, given with --rendered-hash.');
  if (selfDiffers) refuse('apply-self-differs', 'this install script differs from the committed copy.');
  if (drift) refuse('apply-drift', 'live files changed since the last install. Whether to keep or replace those edits is the owner\'s decision; docs/install.md says how.');
  if (dirty) refuse('apply-dirty', 'the working tree is not clean.');
  if (!settingsObject) refuse('apply-settings', "settings.json is not a strict JSON object, so the pact's guard cannot be merged into it; fix the file first.");
}

const REVIEW_LEFT = 'The review folder may hold what the review module wrote; nothing was installed.';

/** The runner's own refusals, each with its rule id, for what it finds on disk or in its own process. */
export const stops = Object.freeze({
  preload: () => refuse('run-preload', 'NODE_OPTIONS is set, or the runner was started with an option; start the install with node gate/install.mjs.'),
  runArgs: () => refuse('run-args', 'the install runner was not started by the install bootstrap: run node gate/install.mjs.'),
  stageUnreadable: () => refuse('stage-unreadable', 'the stage could not be read.'),
  pinMissing: () => refuse('pin-missing', 'the pinned check script or its pin file is missing.'),
  configLink: () => refuse('config-link', 'the user configuration file, or the pact folder that holds it, is a link or other reparse point.'),
  blocksLink: () => refuse('blocks-link', 'the configuration blocks folder is a link or other reparse point.'),
  blocksUnreadable: () => refuse('blocks-unreadable', 'the configuration blocks folder could not be read.'),
  blocksHoldLink: () => refuse('blocks-hold-link', 'the configuration blocks folder holds a link or other reparse point.'),
  moduleMissing: name => refuse('module-missing', `the commit's ${name} could not be loaded.`),
  rulesMissing: () => refuse('rules-missing', `the commit holds no ${RULES_REL}.`),
  renderChangedStage: () => refuse('render-changed-stage', 'the renderer changed the stage.'),
  stageChanged: rel => refuse('stage-changed', `the staged copy of ${formatPlain(rel)} changed after the check.`),
  reviewRulesChanged: () => refuse('review-rules-changed', 'the staged rules file changed after the check.'),
  reviewChangedStage: () => refuse('review-changed-stage', 'the review module changed the stage.', REVIEW_LEFT),
  reviewFailed: () => refuse('review-failed', 'the review output was not written, or not as this run rendered it.', REVIEW_LEFT),
});

/** The review module's lines (S6, V1): exactly the hashes this run rendered, then RESULT: pass. */
export function checkReviewLines(report, rulesHash, diffHash) {
  const lines = outputLines(report.lines);
  if (report.failed || lines.length !== 2 || lines[1] !== 'RESULT: pass' || lines[0] !== `REVIEW ${rulesHash} ${diffHash}`) stops.reviewFailed();
}

/** The runner's own command line from the bootstrap: work folder, commit, dirty count, self-differs, then the words as typed. */
export function parseRunnerArgs(argv) {
  const [work, commit, dirty, self, sep] = argv;
  if (argv.length < 5 || sep !== '--' || !/^[0-9a-f]{40}$/.test(commit) || !/^(0|[1-9][0-9]{0,8})$/.test(dirty) || !/^(yes|no)$/.test(self)) stops.runArgs();
  return { work, commit, dirty: Number(dirty), selfDiffers: self === 'yes', words: argv.slice(5) };
}

/** The runner's work folder (S3): directly in the temp folder, named pact-install-*, holding the runner's own stage. */
export function checkWorkFolder({ parentReal, tmpReal, name, hasGit, runnerReal, expectedRunnerReal, fold }) {
  const eq = (a, b) => (fold ? a.toLowerCase() === b.toLowerCase() : a === b);
  if (!eq(parentReal, tmpReal) || !/^pact-install-[A-Za-z0-9]+$/.test(name) || hasGit || !eq(runnerReal, expectedRunnerReal)) {
    refuse('run-work-folder', 'the install runner runs only from the stage the bootstrap made: run node gate/install.mjs.');
  }
}
