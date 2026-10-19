// The install's decisions (#153, S3): pure functions over values, with no I/O,
// tested in-process by the tables in gate/tests/. The runner
// (gate/install-run.mjs) reads and writes; every choice it makes about what
// it read is one of these. Each refusal is a Refusal with one rule id, a
// string literal here, so a table row can name it. Where a check compares
// paths, it does so without regard to case.
//
// Nothing here runs on import. Imports nothing.

export const AGENT_NAMES = Object.freeze(['adversarial-lens', 'behaviour-lens', 'conventions-lens', 'data-lens', 'executability-lens', 'integrity-lens', 'reader-lens', 'scout', 'unstated-lens']);
// Retired lens names (#302), warned about and never deleted: the render warns when a block or a project qualities list names one, and the plan says so when a live agent file is named for one. Not RETIRED below, the old builders a first install does delete. A test holds this equal to the renderer's list; the builder page keeps a third copy in builder/parts.mjs.
export const RETIRED_AGENTS = Object.freeze(['good-enough-lens']);
// The renderer's model shape and efforts (#262), copied: a test holds them equal.
// A model is one word: no space or line break, at most 128 characters.
export const AGENT_MODEL_RE = /^\S{1,128}$/;
export const AGENT_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
// The old builder agents, which a first install deletes (#262). Not RETIRED_AGENTS above.
export const RETIRED = Object.freeze(['agents/builder.md', 'agents/spec-builder.md', 'agents/security-builder.md']);
// The pact's own commands (#203): the install's own copy of PACT_COMMANDS in
// gate/shared.mjs, so it works out its copy set without seam A's list.
export const PACT_COMMANDS = Object.freeze(['make-it-so', 'finis', 'scriptorium']);
// The pact's own tools (#280): the install's own copy of PACT_TOOLS in
// gate/shared.mjs. A tool installs to TOOLS_DEST<name>.mjs only when the
// configuration's tools list names it.
export const PACT_TOOLS = Object.freeze(['poster']);
const TOOLS_DEST = 'pact/tools/';
// What each tool does, said in its dry run WARN line after where it installs.
const TOOL_WARNS = Object.freeze({
  poster: " and posts to GitHub as your gh account. Permission rules on gh commands don't see its calls, and its scan is a backstop, not a guarantee.",
});
// The builder kit (#203 S6; #262), the install's own copy of seam A's list in
// gate/shared.mjs: installed under pact/builder/ in the repo's own layout
// whenever /scriptorium installs. Its gate files are the only gate files that
// ever install. The agents and the presets go by pattern.
export const BUILDER_KIT = Object.freeze(['builder/build.mjs', 'builder/default-config.mjs', 'builder/parts.mjs', 'builder/scriptorium.html', 'claude/rules.source.md', 'docs/brand/scriptorium/scriptorium-mark.svg', 'examples/pact-config/builder.json', 'gate/render-core.mjs', 'gate/render.mjs', 'gate/shared.mjs']);
export const BUILDER_KIT_PATTERNS = Object.freeze([/^claude\/agents\/[^/]+\.md$/, /^builder\/presets\/[^/]+\.json$/, /^builder\/default-config\/config\.json$/, /^builder\/default-config\/blocks\/[^/]+\.md$/]);
export const inKit = rel => BUILDER_KIT.includes(rel) || BUILDER_KIT_PATTERNS.some(re => re.test(rel));
const KIT_DEST = 'pact/builder/';
// The unrendered rules file, which the install copies into the stage for the kit; never in a commit.
export const KIT_RULES_REL = 'claude/rules.source.md';
// The kit's files outside claude/, gate/ and builder/, staged by exact path.
export const KIT_EXTRA = Object.freeze(['docs/brand/scriptorium/scriptorium-mark.svg', 'examples/pact-config/builder.json']);
// The command that brings the kit. It installs whenever its file is in the commit (#262: the builder is part of the pact).
export const KIT_COMMAND = 'scriptorium';
export const INSTALL_FILES = Object.freeze(['gate/install.mjs', 'gate/install-run.mjs', 'gate/install-core.mjs', 'gate/install-io.mjs']);
export const RULES_REL = 'claude/CLAUDE.md';
export const OVERLAY_REL = 'claude/settings.overlay.json';
// The review procedure file (#261): staged here, installed to one fixed live path.
export const REVIEW_REL = 'claude/review.md';
export const REVIEW_DEST = 'pact/review.md';
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
// The ask rules the pact once set and retired (#265, ADR 0063): the 52 the
// overlay held until #265, then the four broad rules ADR 0049 retired. The
// merge takes each out of the live ask list, matched exactly, so the prompts
// stop after the next install. Hard-coded, so only a gate change can widen it.
export const RETIRED_ASK = Object.freeze([
  'PowerShell(*--apply*)',
  'Bash(*--apply*)',
  'PowerShell(*install.mjs*--a*)',
  'PowerShell(*install.mjs*$*)',
  'PowerShell(*install.mjs*@*)',
  'PowerShell(*install.mjs*(*)',
  'PowerShell(*install.mjs*%*)',
  'PowerShell(*install.mjs*`*)',
  'PowerShell(*install.mjs*-"*)',
  "PowerShell(*install.mjs*-'*)",
  'PowerShell(*install-run.mjs*--a*)',
  'PowerShell(*install-run.mjs*$*)',
  'PowerShell(*install-run.mjs*@*)',
  'PowerShell(*install-run.mjs*(*)',
  'PowerShell(*install-run.mjs*%*)',
  'PowerShell(*install-run.mjs*`*)',
  'PowerShell(*install-run.mjs*-"*)',
  "PowerShell(*install-run.mjs*-'*)",
  'Bash(*nstall.mjs*--a*)',
  'Bash(*nstall.mjs*$*)',
  'Bash(*nstall.mjs*`*)',
  'Bash(*nstall.mjs*\\*)',
  'Bash(*nstall.mjs*\\\\*)',
  'Bash(*nstall.mjs*-"*)',
  "Bash(*nstall.mjs*-'*)",
  'Bash(*nstall-run.mjs*--a*)',
  'Bash(*nstall-run.mjs*$*)',
  'Bash(*nstall-run.mjs*`*)',
  'Bash(*nstall-run.mjs*\\*)',
  'Bash(*nstall-run.mjs*\\\\*)',
  'Bash(*nstall-run.mjs*-"*)',
  "Bash(*nstall-run.mjs*-'*)",
  'PowerShell(*--review-folder*)',
  'Bash(*--review-folder*)',
  'PowerShell(*install.mjs*--r*)',
  'Bash(*nstall.mjs*--r*)',
  'PowerShell(*.pact-install.json*)',
  'Bash(*.pact-install.json*)',
  'PowerShell(*gh*ruleset*)',
  'PowerShell(*gh*protection*)',
  'Bash(*gh*uleset*)',
  'Bash(*gh*rotection*)',
  'Edit(~/.claude/agents/**)',
  'Edit(~/.claude/settings.json)',
  'Edit(~/.claude/CLAUDE.md)',
  'Edit(~/.claude/.pact-install.json)',
  'Edit(~/.claude.json)',
  'Edit(~/.claude/skills/**)',
  'Edit(~/.claude/plugins/**)',
  'Edit(~/.claude/output-styles/**)',
  'Edit(~/.claude/commands/**)',
  'Edit(~/.claude/pact/**)',
  'PowerShell(*install.mjs*)',
  'PowerShell(*install-run.mjs*)',
  'Bash(*nstall.mjs*)',
  'Bash(*nstall-run.mjs*)',
]);

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
      // Only the part before an = is a name; a value typed after one is never shown (S4).
      const n = w.split('=')[0].replace(/[^A-Za-z0-9-]/g, '?');
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

/** True for a path the install stages: claude/ (the pact's tools in claude/tools/ among it, #280), familiars/ and gate/ but its tests, and AGENTS.md. */
export const isStaged = rel => rel === 'AGENTS.md' || KIT_EXTRA.includes(rel) || (/^(builder|claude|familiars|gate)\//.test(rel) && !rel.startsWith('gate/tests/'));

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
 * record's.
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
  }
  if (selfDiffers) lines.push('WARN: this install script differs from the committed copy; --apply will refuse.');
  return lines;
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

const RETIRED_BLOCK_RE = /^RETIRED-NAME block (moves|tiers|sensitive|workflow|lenses|qualities|cost-limits) ([a-z-]+)$/;
const EDIT_RE =/^EDIT (moves|tiers|sensitive|workflow|lenses|qualities|cost-limits) (?:(remove)|(replace|add-after) ([0-9a-f]{64}) ([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+){0,7}))$/;
const AGENT_RE = /^AGENT ([a-z-]+) (\S+) (\S+) ([0-9a-f]{64}) (plain|security-set) (default|override) (local|egress)$/;
const VALUE_RE = /^VALUE (usage-pause|usage-pause-session) (0|[1-9][0-9]?|100)$/;
const COMMANDS_RE = /^COMMANDS (none|[a-z-]+(?:,[a-z-]+)*)$/;
const TOOLS_RE = /^TOOLS (none|[a-z-]+(?:,[a-z-]+)*)$/;
// A skill source's path (#183 T4a), as the renderer checks it: owner/name, a full commit, a relative folder whose last segment is the skill's name.
const SKILL_LINE_RE = /^SKILL ([A-Za-z0-9-]+\/[A-Za-z0-9._-]+) ([0-9a-f]{40}) ([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)$/;
const SKILL_PATHS_MAX = 100;
// The pact's default configuration (#183 T4a): the stage folder the renderer
// reads when the Claude home folder holds no user file, and the preset it is
// generated from, by title (a test holds the title equal to the preset's).
export const DEFAULT_CONFIG_DIR = 'builder/default-config';
export const DEFAULT_CONFIG_NAME = 'Level 3 · Full';

/**
 * The renderer's lines (S6, R5 to R8), every one before RESULT matched to one
 * exact pattern, in these counts: one RENDERED, one DIFF, one CONFIG, one
 * COMMANDS; with a user configuration one DIGEST that must be the digest of
 * the reported hashes, at most one VALUE per setting, one EDIT per open part
 * and one AGENT per lens; with none, none of those, and COMMANDS none. The
 * COMMANDS line names pact commands, each once, in PACT_COMMANDS order (#203).
 * One TOOLS line follows it straight after, naming pact tools the same way
 * (#280), and none with no configuration.
 * A CONFIG line names a user file, the pact's default (#183 T4a) or none; the
 * digest is taken over "user" or "default" to match. SKILL lines follow the
 * TOOLS line, one per skill path, none with no configuration (#183 T4a).
 * `hash` is sha256 over bytes, as hex.
 */
export function parseRenderLines(lines, { project, hash }) {
  let renderHash = null;
  let diffHash = null;
  let digest = null;
  const configs = [];
  const values = new Map();
  const edits = new Map();
  const blockHashes = new Map();
  const retiredNames = [];
  const agentSets = new Map();
  let commands = null;
  let tools = null;
  let commandsAt = -1;
  let toolsAt = -1;
  const skills = [];
  for (const [at, l] of lines.slice(0, -1).entries()) {
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
    } else if ((m = RETIRED_BLOCK_RE.exec(l))) {
      const retired = RETIRED_AGENTS.find(a => a === m[2]);
      if (!retired) refuse('render-unknown-line', 'the renderer printed a line the install does not read.');
      if (retiredNames.some(r => r.mark === m[1] && r.agent === retired)) refuse('render-retired-twice', 'the renderer reported one retired name twice.');
      retiredNames.push({ mark: m[1], agent: retired });
    } else if (l === 'CONFIG none') configs.push({ kind: 'none' });
    else if ((m = /^CONFIG (user|default) ([0-9a-f]{64})$/.exec(l))) configs.push({ kind: m[1], sha256: m[2] });
    else if ((m = SKILL_LINE_RE.exec(l))) {
      const segs = m[3].split('/');
      const last = segs[segs.length - 1];
      if (toolsAt < 0 || segs.some(g => g === '.' || g === '..') || /^[.-]/.test(last)) refuse('render-unknown-line', 'the renderer printed a line the install does not read.');
      if (skills.some(k => k.name.toLowerCase() === last.toLowerCase())) refuse('render-skill-twice', 'the renderer reported two skill paths that install under one name.');
      skills.push({ repo: m[1], commit: m[2], path: m[3], name: last });
    }
    else if ((m = /^DIGEST ([0-9a-f]{12})$/.exec(l))) {
      if (digest) refuse('render-two-digests', 'the renderer reported two configuration digests.');
      digest = m[1];
    } else if ((m = AGENT_RE.exec(l))) {
      const name = AGENT_NAMES.find(a => a === m[1]);
      const modelOk = AGENT_MODEL_RE.test(m[2]);
      if (!name || !modelOk || !AGENT_EFFORTS.includes(m[3])) refuse('render-unknown-line', 'the renderer printed a line the install does not read.');
      if (agentSets.has(name)) refuse('render-agent-twice', 'the renderer reported one agent setting twice.');
      agentSets.set(name, { model: m[2], effort: m[3], sha256: m[4], security: m[5] === 'security-set', override: m[6] === 'override', egress: m[7] === 'egress' });
    } else if ((m = VALUE_RE.exec(l))) {
      if (values.has(m[1])) refuse('render-value-twice', 'the renderer reported one setting twice.');
      values.set(m[1], m[2]);
    } else if ((m = COMMANDS_RE.exec(l))) {
      if (commands) refuse('render-commands-twice', 'the renderer reported two commands lines.');
      const names = m[1] === 'none' ? [] : m[1].split(',');
      const order = PACT_COMMANDS.filter(c => names.includes(c));
      if (order.length !== names.length || order.some((c, i) => c !== names[i])) refuse('render-unknown-line', 'the renderer printed a line the install does not read.');
      commands = order;
      commandsAt = at;
    } else if ((m = TOOLS_RE.exec(l))) {
      if (tools) refuse('render-tools-twice', 'the renderer reported two tools lines.');
      const names = m[1] === 'none' ? [] : m[1].split(',');
      const order = PACT_TOOLS.filter(c => names.includes(c));
      if (order.length !== names.length || order.some((c, i) => c !== names[i])) refuse('render-unknown-line', 'the renderer printed a line the install does not read.');
      tools = order;
      toolsAt = at;
    } else refuse('render-unknown-line', 'the renderer printed a line the install does not read.');
  }
  if (!renderHash || !diffHash || configs.length !== 1) refuse('render-counts', 'the renderer did not report exactly one output hash, one diff hash and one configuration line.');
  if (!commands) refuse('render-commands-missing', 'the renderer did not report which pact commands are on.');
  if (!tools) refuse('render-tools-missing', 'the renderer did not report which pact tools are on.');
  if (toolsAt !== commandsAt + 1) refuse('render-unknown-line', "the renderer's TOOLS line does not come straight after its COMMANDS line.");
  if (skills.length > SKILL_PATHS_MAX) refuse('render-skill-count', `the renderer reported more than ${SKILL_PATHS_MAX} skill paths.`);
  const config = configs[0];
  if (project && config.kind !== 'none') refuse('render-project-config', "the stage's render on a project install read a configuration.");
  if (config.kind === 'none') {
    if (digest || values.size || edits.size || agentSets.size || retiredNames.length) refuse('render-none-extras', 'the renderer reported a digest, a value, an edit, a retired name or an agent setting with no configuration.');
    if (commands.length) refuse('render-none-extras', 'the renderer reported a pact command with no configuration.');
    if (tools.length) refuse('render-none-extras', 'the renderer reported a pact tool with no configuration.');
    if (skills.length) refuse('render-none-extras', 'the renderer reported a skill source with no configuration.');
  } else {
    // A retired name is reported only for a part the configuration edits with a block file (#302).
    for (const r of retiredNames) if (!edits.get(r.mark)?.path) refuse('render-retired-no-block', 'the renderer reported a retired name in a part with no edit block.');
    let text = `${config.kind} ${config.sha256}\n`;
    for (const e of edits.values()) if (e.path) text += `block ${e.path} ${e.sha256}\n`;
    if (digest !== hash(Buffer.from(text, 'ascii')).slice(0, 12)) refuse('render-digest', "the renderer's configuration digest is missing or does not match the configuration hashes it reported.");
  }
  return { renderHash, diffHash, config, digest, values, edits, blockHashes, retiredNames, agentSets, commands, tools, skills };
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

// ------------------------------------------------------------ the project install (J1 to J4)

export const PROJECT_LEFT = "The project's .claude/rules folder may hold what the write left; nothing was installed in the Claude home folder.";

/** A path the platform calls fully qualified: a drive path or a UNC path on Windows, a rooted one elsewhere. */
const fullyQualified = (p, platform) => (platform === 'win32' ? /^[A-Za-z]:[\\/]|^[\\/]{2}[^\\/]/.test(p) : p.startsWith('/'));

/**
 * The project check's lines (S6, J1): it passed, and printed exactly three
 * lines, ROOT with a full path (parsed here, never shown), STATE new or STATE
 * update <hash>, and RESULT: pass.
 */
export function parseProjectCheck(report, platform) {
  const lines = outputLines(report.lines);
  if (report.failed || lines[lines.length - 1] !== 'RESULT: pass') refuse('project-check', 'the project folder failed its checks.');
  const root = lines.length === 3 ? /^ROOT (.+)$/.exec(lines[0]) : null;
  if (!root) refuse('project-check-lines', 'the project check did not report exactly the folder and its state.');
  if (!fullyQualified(root[1], platform)) refuse('project-check-root', 'the project check reported a folder that is not a full path.');
  let state;
  let m;
  if (lines[1] === 'STATE new') state = { kind: 'new' };
  else if ((m = /^STATE update ([0-9a-f]{64})$/.exec(lines[1]))) state = { kind: 'update', sha256: m[1] };
  else refuse('project-check-state', 'the project check did not report the state of the rules file.');
  return { root: root[1], state };
}

/** A project path found to be a link or other redirect, or unreadable (S7, J2): `hit` is the first, or null. */
export function checkProjectLinks(hit) {
  if (hit !== null) refuse('project-link', `a project path is a link or other reparse point, or could not be read: ${hit}.`);
}

/**
 * The project render's lines (S6, J3): one RENDERED, one CONFIG (none or
 * user), one PROJECT, one DIGEST that must be the digest of the reported
 * hashes, and a VALUE, a QUALITIES line or a COST-LIMITS line, each setting
 * at most once. It also reads RETIRED-NAME qualities (#302) and
 * COST-LIMITS-UNNAMED (#299), whose positions must be ascending, once, and
 * within the COST-LIMITS count.
 */
export function parseProjectRenderLines(lines, hash) {
  let projectHash = null;
  let fileHash = null;
  let digest = null;
  let user = null;
  let userSeen = false;
  const values = new Map();
  let qualities = 0;
  let costLimits = 0;
  let unnamedCosts = null;
  const retiredNames = [];
  for (const l of lines.slice(0, -1)) {
    let m;
    if ((m = /^RENDERED ([0-9a-f]{64})$/.exec(l))) {
      if (projectHash) refuse('project-render-two-hashes', 'the project render reported two output hashes.');
      projectHash = m[1];
    } else if ((m = /^CONFIG (?:none|user ([0-9a-f]{64}))$/.exec(l))) {
      if (userSeen) refuse('project-render-two-users', 'the project render reported two user configuration lines.');
      userSeen = true;
      user = m[1] ?? null;
    } else if ((m = /^PROJECT ([0-9a-f]{64})$/.exec(l))) {
      if (fileHash) refuse('project-render-two-files', 'the project render reported two project file hashes.');
      fileHash = m[1];
    } else if ((m = /^DIGEST ([0-9a-f]{12})$/.exec(l))) {
      if (digest) refuse('project-render-two-digests', 'the project render reported two configuration digests.');
      digest = m[1];
    } else if ((m = VALUE_RE.exec(l))) {
      if (values.has(m[1])) refuse('project-render-value-twice', 'the project render reported one setting twice.');
      values.set(m[1], m[2]);
    } else if ((m = /^QUALITIES ([1-9])$/.exec(l))) {
      // A project's own qualities list (#262 S25): its row count, one row per ISO/IEC 25010:2023 quality at most.
      if (qualities) refuse('project-render-two-qualities', 'the project render reported two qualities lines.');
      qualities = Number(m[1]);
    } else if ((m = /^COST-LIMITS ([1-9])$/.exec(l))) {
      // A project's own Cost limits (#278): its row count, at most nine rows.
      if (costLimits) refuse('project-render-two-cost-limits', 'the project render reported two Cost limits lines.');
      costLimits = Number(m[1]);
    } else if ((m = /^COST-LIMITS-UNNAMED ([1-9](?: [1-9])*)$/.exec(l))) {
      // The positions of the cost rows no quality names (#299): an unnamed row only warns in the dry run, a bad line still refuses; order and range are checked below.
      if (unnamedCosts) refuse('project-render-two-unnamed', 'the project render reported two unnamed Cost limits lines.');
      unnamedCosts = m[1].split(' ').map(Number);
    } else if ((m = /^RETIRED-NAME qualities ([a-z-]+)$/.exec(l))) {
      // A retired agent's name in the project's qualities list (#302): a warning, never a refusal.
      const retired = RETIRED_AGENTS.find(a => a === m[1]);
      if (!retired) refuse('project-render-unknown-line', 'the project render printed a line the install does not read.');
      if (retiredNames.includes(retired)) refuse('project-render-two-retired', 'the project render reported one retired name twice.');
      retiredNames.push(retired);
    } else refuse('project-render-unknown-line','the project render printed a line the install does not read.');
  }
  if (unnamedCosts) {
    if (!costLimits) refuse('project-render-unnamed-no-cost-limits', 'the project render reported unnamed Cost limits rows with no Cost limits list.');
    if (unnamedCosts.some((p, i) => i && p <= unnamedCosts[i - 1])) refuse('project-render-unnamed-order', 'the project render reported unnamed Cost limits rows out of order or twice.');
    if (unnamedCosts.at(-1) > costLimits) refuse('project-render-unnamed-range', 'the project render reported an unnamed Cost limits row past the last row.');
  }
  if (retiredNames.length && !qualities) refuse('project-render-retired-no-qualities', 'the project render reported a retired name with no qualities list.');
  if (!projectHash || !userSeen || !fileHash || (!values.size && !qualities && !costLimits)) refuse('project-render-counts', 'the project render did not report exactly one output hash, one user configuration line, one project file hash, and a value, a qualities list or a Cost limits list.');
  const text = `${user ? `user ${user}\n` : ''}project ${fileHash}\n`;
  if (digest !== hash(Buffer.from(text, 'ascii')).slice(0, 12)) refuse('project-render-digest', "the project render's configuration digest is missing or does not match the hashes it reported.");
  return { projectHash, fileHash, digest, user, values, qualities, costLimits, unnamedCosts: unnamedCosts ?? [], retiredNames };
}

/**
 * The project dry run's security-defaults line (#262 S25, #278), or null: a
 * project's own qualities list, and its own Cost limits, take the place of the
 * person's in that repo, so they are the project settings that can loosen a
 * default. Printed before every other warning. The render refuses Cost limits
 * without a qualities list (`project-cost-limits-alone`); this line names
 * whichever of the two it is told, so it never goes quiet on a Cost limits list.
 */
export function projectSecurityLine(parsed) {
  if (!parsed.qualities && !parsed.costLimits) return null;
  const rows = n => `${n} row${n === 1 ? '' : 's'}`;
  const lists = [parsed.qualities && `its own qualities list (${rows(parsed.qualities)})`, parsed.costLimits && `its own Cost limits (${rows(parsed.costLimits)})`].filter(Boolean);
  const sets = `${lists.join(' and ')}, which ${lists.length > 1 ? 'take' : 'takes'}`;
  return `WARN: SECURITY DEFAULTS: the project configuration sets ${sets} the place of yours in this project; read its rows in the project's .claude/pact-config.json before you install.`;
}

/**
 * The note line for a project with its own qualities and no Cost limits
 * (#278), or null. Your Cost limits reach a lens only through a quality's
 * Enough, and a project's qualities list takes the place of yours, so none of
 * your cost rows binds a lens there.
 */
export function projectNoteLine(parsed) {
  if (!parsed.qualities || parsed.costLimits) return null;
  return "NOTE: the project configuration sets its own qualities list and no Cost limits, so your Cost limits reach none of its qualities; add costLimits, and name them in the enoughCosts of each quality they should hold back.";
}

/** The project render's output (J3): exactly its rules file, a plain file of at most 64 KiB, holding the reported hash. */
export function checkProjectOutput(entries, actualHash, reported) {
  const e = entries[0];
  if (entries.length !== 1 || e.name !== 'pact-project.md' || !e.file || e.link || e.size > PROJECT_CAP) refuse('project-output', 'the project render did not leave exactly its rules file of at most 64 KiB.');
  if (actualHash !== reported) refuse('project-rules-hash', "the project rules file's hash does not match the one the renderer reported.");
}

/** The WARN line for the project's cost rows no quality names (#299, ADR 0079), by place; fixed words and digits only. */
function unnamedCostsLine(positions) {
  const one = positions.length === 1;
  const list = one ? `${positions[0]}` : `${positions.slice(0, -1).join(', ')} and ${positions.at(-1)}`;
  return `  WARN: the project configuration's Cost limits ${one ? 'row' : 'rows'} ${list} ${one ? 'is' : 'are'} named by no quality's enoughCosts; read ${one ? 'it' : 'them'} in the project's .claude/pact-config.json and ${one ? 'take it out unless you meant it' : 'take out any you did not mean'}, or name ${one ? 'it' : 'each'} in the enoughCosts of a quality that should hold it back.`;
}

/** The Project block of a dry run. */
export function projectBlock(state, parsed) {
  const rulesLine = state.kind === 'new' ? 'would be written (new)' : state.sha256 === parsed.projectHash ? 'unchanged' : `would replace the existing file its record names (sha256 ${state.sha256}); the record is a file in the project, not proof the pact wrote it`;
  return [
    'Project:',
    `  project configuration ${PROJECT_CONFIG_REL}: sha256 ${parsed.fileHash}`,
    parsed.user ? `  user configuration ${CONFIG_REL}: sha256 ${parsed.user} (its values bound the project's)` : `  user configuration ${CONFIG_REL}: none (the defaults bound the project's values)`,
    `  rules file ${PROJECT_RULES_REL}: ${rulesLine}`,
    `  record ${PROJECT_RECORD_REL}: holds only the rules file's name and hash`,
    `  configuration digest: ${parsed.digest}`,
    `  rendered project rules file: sha256 ${parsed.projectHash}`,
    ...[...parsed.values].map(([k, v]) => `  WARN: the project configuration sets ${k} to ${v}; the rules file reads it as the lower of that and the user's value.`),
    ...parsed.retiredNames.map(a => `  WARN: the project configuration's qualities list names ${a}, an agent the pact retired; take the name out of the list.`),
    ...(parsed.unnamedCosts.length ? [unnamedCostsLine(parsed.unnamedCosts)] : []),
    '  Nothing is installed in the Claude home folder, and no agents go into the project.',
  ];
}

/** The project write's lines (J4): exactly WROTE <rules hash> <record hash>, then RESULT: pass. Returns the record's hash. */
export function parseProjectWrite(report, projectHash) {
  const lines = outputLines(report.lines);
  const m = lines.length === 2 && lines[1] === 'RESULT: pass' && !report.failed ? new RegExp(`^WROTE ${projectHash} ([0-9a-f]{64})$`).exec(lines[0]) : null;
  if (!m) refuse('project-write', 'the project write failed its checks.', PROJECT_LEFT);
  return m[1];
}

// ------------------------------------------------------------ seam A's copy set and overlay

/**
 * The copy set by the install's own reading of the stage (#203, S8): a list
 * of [staged path, live path] pairs, one source to one or more live paths. A
 * pact command installs only when `commands` names it, a pact tool only when
 * `tools` names it, and a gate file only as a BUILDER_KIT entry under
 * pact/builder/. A staged file of no known kind pairs with null, which no
 * INSTALL line can match.
 */
export function expectedCopySet(stagedRels, commands = [], tools = []) {
  const out = [];
  const kitOn = commands.includes(KIT_COMMAND);
  for (const rel of stagedRels) {
    if (kitOn && inKit(rel)) out.push([rel, `${KIT_DEST}${rel}`]);
    if (rel.startsWith('gate/') || rel === 'AGENTS.md' || rel === OVERLAY_REL || rel === 'familiars/.gitkeep' || rel === KIT_RULES_REL) continue;
    if (/^familiars\/[^/]+\.(contract|practice-test)\.md$/.test(rel)) continue;
    // A builder or kit file goes only to the kit; one the kit doesn't list pairs with null.
    if (rel.startsWith('builder/') || KIT_EXTRA.includes(rel)) {
      if (!inKit(rel)) out.push([rel, null]);
      continue;
    }
    let m;
    if ((m = /^claude\/commands\/(.*)$/.exec(rel))) {
      const name = /^([^/]+)\.md$/.exec(m[1])?.[1];
      if (commands.includes(name)) out.push([rel, `commands/${name}.md`]);
      else if (!PACT_COMMANDS.includes(name)) out.push([rel, null]);
    } else if ((m = /^claude\/tools\/(.*)$/.exec(rel))) {
      // A pact tool (#280): claude/tools/<name>.mjs to pact/tools/<name>.mjs, never the general rule's tools/ at the home root.
      const name = /^([^/]+)\.mjs$/.exec(m[1])?.[1];
      if (tools.includes(name)) out.push([rel, `${TOOLS_DEST}${name}.mjs`]);
      else if (!PACT_TOOLS.includes(name)) out.push([rel, null]);
    } else if (rel === REVIEW_REL) out.push([rel, REVIEW_DEST]);
    else if ((m = /^claude\/(.+)$/.exec(rel))) out.push([rel, m[1]]);
    else out.push([rel, null]);
  }
  return out;
}

/**
 * With /scriptorium on, every file the builder kit lists by name is staged, so
 * the builder never installs half a kit (#203 S6). The rules source is the
 * install's own copy, made before this runs.
 */
export function checkKit(on, stagedRels) {
  if (!on.includes(KIT_COMMAND)) return;
  const staged = new Set(stagedRels);
  const missing = BUILDER_KIT.filter(rel => !staged.has(rel));
  if (missing.length) refuse('kit-incomplete', `the commit holds /${KIT_COMMAND} but not all of its builder kit: ${missing.map(formatPlain).join(', ')}.`);
}

/**
 * The pact commands that install: those the configuration lists, and the
 * builder's command whenever its file is in the commit (#262), in
 * PACT_COMMANDS order. A project install installs none.
 */
export function commandsOn(listed, stagedRels) {
  const staged = new Set(stagedRels);
  return PACT_COMMANDS.filter(c => listed.includes(c) || (c === KIT_COMMAND && staged.has(`claude/commands/${c}.md`)));
}

/**
 * Seam A's INSTALL lines against the install's own reading (S6, S-2, #203
 * S8): the same pairs and hashes exactly, each pair listed once, and a gate
 * file only as a kit entry at its kit path. Returns [[staged path, { dest,
 * sha256 }], ...] in seam A's order.
 */
export function matchCopySet(lines, expected, stagedHashes, commit) {
  const checked = [];
  const pairs = new Map();
  for (const l of lines) {
    const m = /^INSTALL ([0-9a-f]{64}) (\S+) (\S+)$/.exec(l);
    if (!m) continue;
    const key = `${m[2]} ${m[3]}`;
    if (pairs.has(key)) refuse('copy-set-twice', 'the check listed one file twice.');
    if (m[2].startsWith('gate/') && !(inKit(m[2]) && m[3] === `${KIT_DEST}${m[2]}`)) refuse('copy-set-gate', `the check listed a gate file for install outside the builder kit: ${formatPlain(m[2])}.`);
    pairs.set(key, m[1]);
    checked.push([m[2], { dest: m[3], sha256: m[1] }]);
  }
  let ok = pairs.size === expected.length;
  for (const [rel, dest] of expected) {
    if (!ok) break;
    ok = dest !== null && stagedHashes.has(rel) && pairs.get(`${rel} ${dest}`) === stagedHashes.get(rel);
  }
  if (!ok) refuse('copy-set-mismatch', `the check's copy set does not match the install's own reading of commit ${commit}.`);
  return checked;
}

/**
 * The pact commands against the owner's skills folder (#203, S8): a skill
 * of the same name runs in place of the command, so anything at
 * skills/<name>, a folder, a file or a link, refuses. `present(rel)` tests
 * presence without following a link; nothing else in the folder is read.
 */
export function checkSkillClash(commands, present) {
  for (const name of commands) {
    const rel = `skills/${name}`;
    if (present(rel)) refuse('command-skill-clash', `${rel} exists in the Claude home folder, and Claude Code would run that skill in place of the pact command /${name}. Rename or move it${name === KIT_COMMAND ? '' : `, or take ${name} out of the commands list`}.`);
  }
}

/**
 * A command, tool, kit or review file the install would add over a live file its
 * record does not list (#203 S8, #261 S5): refused, never overwritten. Agents
 * keep today's first-install behaviour. `live(rel)` is the plan's live state.
 */
export function checkNewPaths(repoFiles, record, live) {
  const listed = new Set(record ? record.files.map(e => e.path) : []);
  for (const rel of repoFiles.keys()) {
    if (!(rel.startsWith('commands/') || rel.startsWith(KIT_DEST) || rel.startsWith(TOOLS_DEST) || rel === REVIEW_DEST) || listed.has(rel)) continue;
    const always = rel === REVIEW_DEST || rel.startsWith(KIT_DEST) || rel === `commands/${KIT_COMMAND}.md`;
    const next = always ? 'Move it out of the way, then install again.' : `Move it, or take its name out of the ${rel.startsWith(TOOLS_DEST) ? 'tools' : 'commands'} list.`;
    if (live(rel).exists) refuse('unlisted-live', `${formatPlain(rel)} already exists in the Claude home folder, and the install record does not list it, so the pact did not put it there. ${next}`);
  }
}

/**
 * The Commands block of a dry run (#203, S7): every pact command, on or off,
 * and how to turn one on. /scriptorium installs whenever it is in the commit
 * (#262); a list that still names it is told to drop the name, which an older
 * pact would refuse on a rollback.
 */
export function commandsBlock(on, stagedRels, listed = []) {
  const staged = new Set(stagedRels);
  const out = ['Commands:'];
  for (const name of PACT_COMMANDS) {
    const here = staged.has(`claude/commands/${name}.md`);
    const always = name === KIT_COMMAND && here;
    out.push(`  /${name}: ${always ? 'on, always: part of the pact, with the builder kit under pact/builder/' : on.includes(name) ? 'on' : 'off'}${here ? '' : ' (not in this commit)'}`);
  }
  const example = PACT_COMMANDS.find(name => name !== KIT_COMMAND && staged.has(`claude/commands/${name}.md`));
  out.push(example ? `  To turn one on, list its name in ${CONFIG_REL}, for example: "commands": ["${example}"]` : '  No pact command that can be turned on is in this commit.');
  for (const name of on) if (!(name === KIT_COMMAND && staged.has(`claude/commands/${name}.md`))) out.push(`  WARN: the user configuration turns on the pact command /${name}; it installs to commands/${name}.md.`);
  if (listed.includes(KIT_COMMAND) && staged.has(`claude/commands/${KIT_COMMAND}.md`)) out.push(`  NOTE: ${CONFIG_REL} lists ${KIT_COMMAND}, which now always installs; take it out of the list, since an older pact refuses it.`);
  return out;
}

/**
 * The Tools block of a dry run (#280): every pact tool, on or off, how to turn
 * one on, and a WARN line for each tool on, naming where it installs and what
 * it does.
 */
export function toolsBlock(on, stagedRels) {
  const staged = new Set(stagedRels);
  const out = ['Tools:'];
  for (const name of PACT_TOOLS) out.push(`  ${name}: ${on.includes(name) ? 'on' : 'off'}${staged.has(`claude/tools/${name}.mjs`) ? '' : ' (not in this commit)'}`);
  const example = PACT_TOOLS.find(name => staged.has(`claude/tools/${name}.mjs`));
  out.push(example ? `  To turn one on, list its name in ${CONFIG_REL}, for example: "tools": ["${example}"]` : '  No pact tool that can be turned on is in this commit.');
  for (const name of on) out.push(`  WARN: the user configuration turns on the pact tool ${name}; it installs to ${TOOLS_DEST}${name}.mjs${TOOL_WARNS[name]}`);
  return out;
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

/** The live ask list's entries that are retired pact rules, as rule strings, sorted, once each. */
function retiredIn(live) {
  const lp = live.get('permissions');
  if (!isMap(lp) || !lp.has('ask')) return [];
  return union(lp.get('ask')).filter(r => RETIRED_ASK.includes(r));
}

/**
 * The live settings with the overlay merged in (S6, L5): the overlay wins,
 * objects merge, the plugin keys stay the owner's, and the allow, deny and ask
 * lists are unioned and sorted ordinally, so the owner's own rules survive.
 * Then the retired pact rules leave the ask list (#265), matched exactly.
 */
export function mergeSettings(live, overlay) {
  const m = mergeDeep(live, overlay);
  for (const k of LIVE_OWN_SETTINGS) if (live.has(k)) m.set(k, live.get(k));
  const pa = isMap(live.get('permissions')) ? live.get('permissions') : new Map();
  const pb = overlay.has('permissions') ? overlay.get('permissions') : new Map();
  for (const k of ['allow', 'deny', 'ask']) if (pa.has(k) || pb.has(k)) m.get('permissions').set(k, union(pa.get(k), pb.get(k)));
  const mp = m.get('permissions');
  if (isMap(mp) && mp.has('ask')) mp.set('ask', mp.get('ask').filter(r => !RETIRED_ASK.includes(r)));
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
  // A removal prints the pact's own retired rule, never a live entry (#265).
  for (const rule of retiredIn(live)) out.push(`  - permissions.ask: ${formatRule(rule)}`);
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
 * Warnings about the live file (S6, L7): a banned key, retired pact ask rules
 * still there (#265), a mode other than auto. The owner's own keys are named
 * once, capped; env names are only counted, since a name can say what a secret
 * is for.
 */
export function liveSettingsLines(live, overlay) {
  const out = [];
  for (const k of bannedKeys(live)) if (!LIVE_OWN_SETTINGS.includes(k)) out.push(`WARN: settings.json holds ${k}, a command-running setting the pact never sets.`);
  const lp = live.get('permissions');
  const retired = retiredIn(live).length;
  if (retired) out.push(`NOTE: settings.json holds ${retired} of the pact's retired ask rules; --apply removes them.`);
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

/** The guard, in the settings Claude Code reads (S6, X7; #265): auto mode, and no retired pact ask rule left. An absent ask list holds; one that is not a list fails. */
export function guardHolds(after) {
  const ap = isMap(after) ? after.get('permissions') : null;
  if (!isMap(ap) || ap.get('defaultMode') !== 'auto') return false;
  if (!ap.has('ask')) return true;
  const ask = ap.get('ask');
  return Array.isArray(ask) && !ask.some(x => RETIRED_ASK.includes(x));
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
  return n === 'settings.json' || n === '.pact-install.json' || n === 'pact/config.json' || n === 'pact/builder.json' || leaf.startsWith('.credentials') || /^(projects|memory|skills|handover|pact\/blocks|pact\/presets)(\/|$)/.test(n);
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
  // #262: an agent file the pact didn't write, or changed since it wrote it, is the person's: never overwritten, deleted or recorded.
  const yours = [];
  const isAgent = rel => rel.startsWith('agents/');
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
      // A deleted agent file comes back as an add, not as drift.
      if (isAgent(e.path) && !s.exists) continue;
      // A changed regular file is the person's; anything else at the path (a folder, say) is drift, so the install stops.
      if (isAgent(e.path) && s.file && s.sha256 !== e.sha256.toLowerCase()) yours.push(e.path);
      else if (!s.file) drift.push(`${e.path} (deleted since the install)`);
      else if (s.sha256 !== e.sha256.toLowerCase()) drift.push(`${e.path} (changed since the install)`);
    }
    del = entries.filter(e => !repoFiles.has(e.path) && live(e.path).exists && !yours.includes(e.path)).map(e => e.path);
  } else del = RETIRED.filter(r => live(r).exists);
  const listed = new Set(record ? record.files.map(e => e.path) : []);
  for (const [rel, sha] of repoFiles) {
    const s = live(rel);
    if (yours.includes(rel)) continue;
    if (isAgent(rel) && s.exists && !listed.has(rel)) {
      // An agent file of the person's, with a pact agent's name: theirs, unless it is byte for byte the pact's.
      if (s.file && s.sha256 === sha) same++;
      else yours.push(rel);
      continue;
    }
    if (!s.file) add.push(rel);
    else if (s.sha256 !== sha) overwrite.push(rel);
    else same++;
  }
  return { drift, overwrite, add, delete: del, warnings, same, yours };
}

/**
 * The dry run's line for each live agent file that carries a retired agent's
 * name and that this install does not delete (#302, S8): the file is not the
 * pact's, so the install leaves it as is. Without the line such a file drops
 * out of every dry run, because the plan looks only at names in its payload.
 * `exists(rel)` is the live state; `deleting` is the plan's delete list. The
 * line holds the constant name only.
 */
export function retiredAgentLines(exists, deleting) {
  return RETIRED_AGENTS.filter(a => exists(`agents/${a}.md`) && !deleting.includes(`agents/${a}.md`))
    .map(a => `WARN: agents/${a}.md is named for ${a}, an agent the pact retired; the file is not the pact's, so the install leaves it as is.`);
}

// ------------------------------------------------------------ the configuration against the record

/** This run's configuration files, keyed as the record's are. */
export function configNow(parsed) {
  const now = new Map();
  // The pact's default is part of the commit, not the person's files: the record holds none of it (#183 T4a).
  if (parsed.config.kind !== 'user') return now;
  now.set('user', parsed.config.sha256);
  for (const [bp, sha] of parsed.blockHashes) now.set(`block ${bp}`, sha);
  return now;
}

/** True when a configuration file was added, changed or removed since the last install, even if the render came out the same. */
export function configStale(now, last) {
  if (now.size !== last.size) return true;
  for (const [k, v] of now) if (!last.has(k) || last.get(k) !== v) return true;
  return false;
}

// The parts Scriptorium builds (#262). An edit to any of them changes the
// security defaults: what Claude looks for as sensitive, the route it
// recommends, and which lenses are offered when.
export const SECURITY_PARTS = Object.freeze(['tiers', 'sensitive', 'workflow', 'lenses', 'qualities', 'cost-limits']);

/**
 * The security-defaults line (#262, S8), or null when no edit reaches one of
 * SECURITY_PARTS. The dry run prints it before every other warning. It points
 * by part name and never names a block file. An agent setting never shows it:
 * a person may run any agent on any model (#262).
 */
export function securityDefaultsLine(parsed, record) {
  const parts = SECURITY_PARTS.filter(p => parsed.edits.has(p));
  if (!parts.length) return null;
  if (parsed.config.kind === 'default') return `WARN: SECURITY DEFAULTS: you have no configuration of your own, so the pact's default configuration (${DEFAULT_CONFIG_NAME}) renders; it edits ${parts.join(', ')}, which changes the pact's security defaults; read those parts in the rendered rules file before you install.`;
  const since = !record ? 'no install is recorded to compare with' : configStale(configNow(parsed), record.config) ? 'the configuration CHANGED since the last install' : 'the configuration is unchanged since the last install';
  return `WARN: SECURITY DEFAULTS: the user configuration edits ${parts.join(', ')}, which changes the pact's security defaults; read those parts in the rendered rules file before you install. ${since[0].toUpperCase()}${since.slice(1)}.`;
}

/**
 * The note line for a home Qualities edit with no Enough column (#278), or
 * null. The shipped cost rows reach a lens only through a quality's Enough, so
 * an edit that leaves the column out leaves every cost row binding nothing.
 * `rules` is the rendered rules file's text, which carries no marks. The
 * column counts when a table header that names Quality also names Enough, in
 * any position.
 */
export function enoughNoteLine(parsed, rules) {
  if (!parsed.edits.has('qualities')) return null;
  const cells = l => l.split('|').map(c => c.trim());
  const header = l => l.startsWith('|') && l.trimEnd().endsWith('|') && cells(l).includes('Quality');
  if (rules.split('\n').some(l => header(l) && cells(l).includes('Enough'))) return null;
  return "NOTE: the user configuration edits qualities, and its table has no Enough column, so the Cost limits reach no lens; add an Enough column to the qualities you want them to hold back.";
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
  if (parsed.config.kind === 'default') {
    out.push(`  configuration: the pact's default, ${DEFAULT_CONFIG_NAME} (${parsed.digest}): you have no ${CONFIG_REL}`);
    // C35: a person's own configuration that has gone is said, not only replaced.
    if (last.has('user')) out.push(`  the last install had your own configuration; ${CONFIG_REL} is gone now, so the pact's default renders in its place`);
    out.push(`  rendered rules file: sha256 ${rulesHash}`);
    for (const [k, v] of parsed.values) out.push(`  WARN: the pact's default configuration sets ${k} to ${v}.`);
    for (const [k, e] of parsed.edits) out.push(`  WARN: the pact's default configuration edits ${k} (${e.op}).`);
    out.push(`  To keep the pact's own text instead, write a ${CONFIG_REL} of your own; docs/install.md says how.`);
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
  for (const [name, a] of parsed.agentSets) out.push(`  WARN: the user configuration sets ${name} to \`${a.model}\`, ${a.effort} effort.`);
  for (const r of parsed.retiredNames) out.push(`  WARN: the user configuration's ${r.mark} block names ${r.agent}, an agent the pact retired; take the name out of the block, and where it sat in the spec pair put unstated-lens in its place.`);
  out.push('  Edited text is checked only for its characters and line ends, not for wording, meaning or file imports: read each block before you install.');
  return out;
}

/**
 * The skill sources the configuration names (#183 T4a): one summary line, one
 * line per repo with its short pin and path count, and that this install
 * fetches none of them. Empty when it names none.
 */
export function skillsBlock(parsed) {
  if (!parsed.skills.length) return [];
  const repos = [...new Set(parsed.skills.map(k => k.repo))];
  return [
    `skills: ${parsed.skills.length} path${parsed.skills.length === 1 ? '' : 's'} from ${repos.length} repo${repos.length === 1 ? '' : 's'}, fetched only by the cloud setup`,
    ...repos.map(r => {
      const own = parsed.skills.filter(k => k.repo === r);
      return `  ${r} at ${own[0].commit.slice(0, 12)}: ${own.length} path${own.length === 1 ? '' : 's'}`;
    }),
    '  This install fetches and installs none of them; the workflow names them, and a session here has only the skills you installed yourself.',
  ];
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
  configLink: () => refuse('config-link', 'the user configuration file, or the pact folder that holds it, is a link or other reparse point.'),
  blocksLink: () => refuse('blocks-link', 'the configuration blocks folder is a link or other reparse point.'),
  blocksUnreadable: () => refuse('blocks-unreadable', 'the configuration blocks folder could not be read.'),
  blocksHoldLink: () => refuse('blocks-hold-link', 'the configuration blocks folder holds a link or other reparse point.'),
  moduleMissing: name => refuse('module-missing', `the commit's ${name} could not be loaded.`),
  rulesMissing: () => refuse('rules-missing', `the commit holds no ${RULES_REL}.`),
  rulesSourceInTree: () => refuse('rules-source-in-tree', `the commit holds ${KIT_RULES_REL}, a file only the install makes, from ${RULES_REL}.`),
  rulesSourceHash: () => refuse('rules-source-hash', `the copy of ${RULES_REL} made for the builder kit does not match the commit's.`),
  renderChangedStage: () => refuse('render-changed-stage', 'the renderer changed the stage.'),
  stageChanged: rel => refuse('stage-changed', `the staged copy of ${formatPlain(rel)} changed after the check.`),
  reviewRulesChanged: () => refuse('review-rules-changed', 'the staged rules file changed after the check.'),
  reviewChangedStage: () => refuse('review-changed-stage', 'the review module changed the stage.', REVIEW_LEFT),
  reviewFailed: () => refuse('review-failed', 'the review output was not written, or not as this run rendered it.', REVIEW_LEFT),
  tempLeft: rel => refuse('temp-left', `a temp file the install writes through is already there: ${formatPlain(rel)}.pact-tmp. An earlier install stopped mid-write, and the file may hold a copy of your settings; check it, delete it, and run the install again.`),
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
