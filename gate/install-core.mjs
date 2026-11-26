// The install's decisions (#153, S3): pure functions over values, with no I/O,
// tested in-process by the tables in gate/tests/. The runner
// (gate/install-run.mjs) reads and writes; every choice it makes about what
// it read is one of these. Each refusal is a Refusal with one rule id, a
// string literal here, so a table row can name it. Where a check compares
// paths, it does so without regard to case, except the hook key (#482), which
// folds case on Windows only.
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
export const PACT_COMMANDS = Object.freeze(['make-it-so', 'finis', 'scriptorium', 'scry']);
// The pact's own tools (#280): the install's own copy of PACT_TOOLS in
// gate/shared.mjs. A tool installs to TOOLS_DEST<name>.mjs only when the
// configuration's tools list names it; gh-app is the exception: it is on the
// list so seam A takes its file, but the tools list refuses it, and only the
// agent-identity switch (a later ticket of #599) installs it.
export const PACT_TOOLS = Object.freeze(['poster', 'cleaner', 'clef', 'gh-app']);
const TOOLS_DEST = '.pact/tools/';
// The pact's hook script (#482), the install's own copy of PACT_HOOKS in gate/seam-a-core.mjs: claude/hooks/<name>.mjs installs to HOOKS_DEST<name>.mjs only while the auto-compact window is on.
export const PACT_HOOKS = Object.freeze(['compact-handoff']);
const HOOKS_DEST = '.pact/hooks/';
export const HOOK_SCRIPT_REL = `${HOOKS_DEST}compact-handoff.mjs`;
export const HOOK_EVENTS = Object.freeze(['PostToolUse', 'UserPromptSubmit', 'Stop', 'PreCompact', 'SessionStart']);
const HOOK_SCRIPT_TOKEN = '__PACT_HOOK_SCRIPT__';
const HOOK_WINDOW_TOKEN = '__PACT_WINDOW__';
// What each tool does, said in its dry run WARN line after where it installs.
const TOOL_WARNS = Object.freeze({
  poster: " and posts and edits on GitHub as your gh account. Permission rules on gh commands don't see its calls, and its scan is a backstop, not a guarantee.",
  cleaner: ' and removes worktrees and local branches in the repository it runs in, and stops a finished background session in a worktree it removes. Its deny rules on raw removal commands are a speed bump, not a gate.',
  clef: ' and, when you run its setup, downloads a llama.cpp server build (about 25–39 MB) and a Clef model (about 6.7 GB) from GitHub and Hugging Face, then runs them on this machine, listening on 127.0.0.1 only.',
  'gh-app': ' and mints GitHub App tokens from a key in Windows Credential Manager, so git over HTTPS in every session runs as the app; an askpass program, an SSH remote and a global git write still go around it (docs/agent-identity.md).',
});
// The pact's guard rules as data (spec 0007 S8). Claude Code's permission rules
// below are made from this table, and so is rules.json, which the shared guard
// reads in a harness with a hook. Each rule: an id, a decision, the switch it
// hangs on, and either the command words it matches, `*` standing for one or
// more words, or the parts a command's text holds in order.
const rule = (id, decision, on, key, list) => Object.freeze({ id, decision, switch: on, [key]: Object.freeze(list) });
const deny = (id, on, words) => rule(id, 'deny', on, 'words', words.split(' '));
export const GUARD_RULES = Object.freeze([
  deny('worktree-remove', 'cleaner', 'git worktree remove'),
  deny('worktree-remove-after-options', 'cleaner', 'git * worktree remove'),
  deny('branch-d', 'cleaner', 'git branch -d'),
  deny('branch-d-after-options', 'cleaner', 'git * branch -d'),
  deny('branch-force-d', 'cleaner', 'git branch -D'),
  deny('branch-force-d-after-options', 'cleaner', 'git * branch -D'),
  deny('branch-delete', 'cleaner', 'git branch --delete'),
  deny('branch-delete-after-options', 'cleaner', 'git * branch --delete'),
  deny('session-remove', 'cleaner', 'claude rm'),
  // One contains pattern with a gap on every side, since quotes, `env -u NODE_OPTIONS`, `node.exe`, `& node` and
  // `$env:` prefixes all sit around the path; for an ask rule a match it shouldn't make only prompts.
  rule('cleaner-override', 'ask', 'cleaner', 'contains', ['cleaner.mjs', 'remove', '--override']),
  // Suffix only: a mid `*` would catch a session start whose prompt says "stop".
  deny('session-stop', 'session-stop-deny', 'claude stop'),
  deny('session-kill', 'session-stop-deny', 'claude kill'),
  deny('daemon-stop', 'session-stop-deny', 'claude daemon stop'),
  deny('session-respawn', 'session-stop-deny', 'claude respawn'),
]);
const permissionRules = (on, decision) => {
  const patterns = GUARD_RULES.filter(r => r.switch === on && r.decision === decision).map(r => (r.words ? `${r.words.join(' ')} *` : `*${r.contains.join('*')}*`));
  return Object.freeze([...patterns.map(p => `Bash(${p})`), ...patterns.map(p => `PowerShell(${p})`)]);
};
// The cleaner's deny rules (#438 S2.3): settings.json holds them only while
// the cleaner is on. The install adds the ones not already there and records
// those under cleanerDeny; turning the cleaner off removes only rules both
// recorded and on this list, so an identical rule the owner wrote stays.
export const CLEANER_DENY = permissionRules('cleaner', 'deny');
// The cleaner's ask rules (#523 S3b): the same switch as its deny rules, in the ask list. The install records those it
// adds under cleanerAsk. The builder's copy is in shared.mjs, held equal to this one by a test.
export const CLEANER_ASK = permissionRules('cleaner', 'ask');
// The stop switch's deny rules (#439 S1.2; `claude kill`, the supervisor stop and `claude respawn` added at Test, the lead's pick): settings.json holds them only
// while the user setting session-stop-deny is on. The install records those it
// adds under stopDeny, and removes only rules both recorded and on this list.
// The builder's copy is in shared.mjs, held equal to this one by a test.
export const STOP_DENY = permissionRules('session-stop-deny', 'deny');
// The shared guard's files (spec 0007 S8): claude/guard/<name>.mjs installs to
// GUARD_DEST<name>.mjs only while a harness with a guard hook is in and a rule
// is on. rules.json is made by the install beside them, never in a commit.
export const GUARD_FORMATS = Object.freeze(['codex', 'antigravity']);
export const GUARD_SCRIPTS = Object.freeze(['guard', ...GUARD_FORMATS]);
const GUARD_DEST = '.pact/guard/';
export const GUARD_TABLE_REL = 'claude/guard/rules.json';
export const GUARD_TABLE_DEST = `${GUARD_DEST}rules.json`;
export const guardScriptRel = format => `${GUARD_DEST}${format}.mjs`;
// The builder kit (#203 S6; #262), the install's own copy of seam A's list in
// gate/shared.mjs: installed under pact/builder/ in the repo's own layout
// whenever /scriptorium installs. Its gate files are the only gate files that
// ever install. The agents and the presets go by pattern.
export const BUILDER_KIT = Object.freeze(['builder/build.mjs', 'builder/default-config.mjs', 'builder/parts.mjs', 'builder/scriptorium.html', 'claude/rules.source.md', 'docs/brand/scriptorium/scriptorium-mark.svg', 'examples/pact-config/builder.json', 'gate/render-core.mjs', 'gate/render.mjs', 'gate/shared.mjs']);
export const BUILDER_KIT_PATTERNS = Object.freeze([/^claude\/agents\/[^/]+\.md$/, /^claude\/commands\/[^/]+\.md$/, /^claude\/review\.md$/, /^claude\/settings\.overlay\.json$/, /^builder\/presets\/[^/]+\.json$/, /^builder\/default-config\/config\.json$/, /^builder\/default-config\/blocks\/[^/]+\.md$/]);
export const inKit = rel => BUILDER_KIT.includes(rel) || BUILDER_KIT_PATTERNS.some(re => re.test(rel));
const KIT_DEST = '.pact/builder/';
// The unrendered rules file, which the install copies into the stage for the kit; never in a commit.
export const KIT_RULES_REL = 'claude/rules.source.md';
// The kit's files outside claude/, gate/ and builder/, staged by exact path.
export const KIT_EXTRA = Object.freeze(['docs/brand/scriptorium/scriptorium-mark.svg', 'examples/pact-config/builder.json']);
// The command that brings the kit. It installs whenever its file is in the commit (#262: the builder is part of the pact).
export const KIT_COMMAND = 'scriptorium';
export const INSTALL_FILES = Object.freeze(['gate/install.mjs', 'gate/install-run.mjs', 'gate/install-core.mjs', 'gate/install-io.mjs']);
export const RULES_REL = 'claude/CLAUDE.md';
// Where the install writes each harness's render in the stage (spec 0007 S7); isStaged takes no commit's file there.
export const RENDERED_REL = 'rendered/';
// Each agent format's names for the pact's tools (spec 0007 S7). Antigravity's is empty until a probe fills it, so no agent installs there.
export const TOOL_TABLES = Object.freeze({ 'antigravity-md': Object.freeze({}) });
export const OVERLAY_REL = 'claude/settings.overlay.json';
// The review procedure file (#261): staged here, installed to one fixed live path.
export const REVIEW_REL = 'claude/review.md';
export const REVIEW_DEST = '.pact/review.md';
// The diagram format file review.md points to: staged and installed beside it.
export const REVIEW_DIAGRAMS_REL = 'claude/review-diagrams.md';
export const REVIEW_DIAGRAMS_DEST = '.pact/review-diagrams.md';
/** The folder every harness's skills are linked from (spec 0007 S7). */
export const SKILLS_DEST = '.pact/skills/';
// Every path the install works with is relative to the home folder (spec 0007 S4).
export const NEUTRAL_REL = '.pact';
/** The harness id the neutral home's own files carry in the record and the backups; no harness may take it. */
export const PACT_ID = 'pact';
export const HARNESS_ID_RE = /^[a-z][a-z0-9-]{0,31}$/;
// The skills folder Claude Code reads, where a skill shadows a command of its name.
export const CLAUDE_SKILLS_REL = '.claude/skills';
export const CONFIG_REL = '.pact/config.json';
export const BLOCKS_REL = '.pact/blocks';
export const RECORD_REL = '.pact/install.json';
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
// `hooks` left this list in #482: the overlay carries the pact's own hooks
// block, which the allow-list holds exactly.
export const BANNED_SETTINGS = Object.freeze(['mcpServers', 'statusLine', 'fileSuggestion', 'apiKeyHelper', 'awsAuthRefresh', 'awsCredentialExport', 'otelHeadersHelper', 'enabledPlugins', 'extraKnownMarketplaces', 'enableAllProjectMcpServers', 'enabledMcpjsonServers']);
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
const VALUED = new Set(['--commit', '--rendered-hash', '--home', '--review-folder', '--project-folder']);
const PATH_OPTIONS = ['--home', '--review-folder', '--project-folder'];
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
      refuse('path-not-full', opt === '--home' ? '--home must be a full path, such as the default (your home folder). A hash goes after --rendered-hash.' : `${opt} must be a full path.`);
    }
    if (!SAFE_PATH.test(v) || (win && v.indexOf(':', 2) >= 0)) refuse('path-chars', `${opt} holds a character the install does not take in a path: only letters, digits, spaces and . _ - : \\ / are taken. Use a folder whose full path holds only those.`);
  }
  if (given.has('--review-folder') && given.has('--project-folder')) refuse('args-review-project', '--review-folder is for a home install; a project install writes no review output.');
  if (given.has('--apply') && !given.has('--commit')) refuse('args-apply-commit', '--apply needs --commit with the full commit id the dry run printed.');
  return {
    apply: given.has('--apply'),
    commit: given.get('--commit') ?? null,
    renderedHash: given.has('--rendered-hash') ? given.get('--rendered-hash') : null,
    home: given.get('--home') ?? null,
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
export const isStaged = rel => rel === 'AGENTS.md' || KIT_EXTRA.includes(rel) || (/^(builder|claude|familiars|gate|harnesses)\//.test(rel) && !rel.startsWith('gate/tests/'));

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

// ------------------------------------------------------------ the checkout behind the last install (#407)

/**
 * The bootstrap's `git rev-list <commit>`, as a Set: each line 40 lower-case
 * hex, one trailing empty line allowed, and the commit itself listed, since
 * rev-list always lists its start. Its refusals name nothing from the file.
 */
export function parseReachable(bytes, commit) {
  const lines = Buffer.from(bytes).toString('latin1').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  if (!lines.includes(commit) || !lines.every(l => /^[0-9a-f]{40}$/.test(l))) refuse('reachable-malformed', "the install bootstrap's list of this commit's history is not in the form it writes.");
  return new Set(lines);
}

/**
 * The warning that this checkout is behind the last install's commit, or on
 * another line, or null: none with no record, at that commit, or when it is in
 * this commit's history, compared lower-cased. Only a commit id is printed;
 * anything else in the record shows as fixed words (S5).
 */
export function behindLine(recordCommit, commit, reachable) {
  if (recordCommit === null) return null;
  const last = recordCommit.toLowerCase();
  if (last === commit || reachable.has(last)) return null;
  const named = /^[0-9a-f]{40}$/.test(last) ? ` ${last}` : ', a commit id the install does not read,';
  return `WARN: the last install's commit${named} is not in this checkout's history: this checkout is behind it or on another line. Installing may roll the pact back; fast-forward the checkout first, unless you mean to.`;
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

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const TARGET_KEYS = Object.freeze(['rules', 'agents', 'commands', 'skills', 'settings']);
/** A record's target, held to what a description's path may be: plain, outside the neutral home and every secret store, a rules file .md and a settings file .json. */
const targetOk = (kind, v) => typeof v === 'string' && isCanonical(v) && v.split('/')[0].toLowerCase() !== NEUTRAL_REL && !isSecretStore(v) && (kind !== 'rules' || /\.md$/i.test(v)) && (kind !== 'settings' || /\.json$/i.test(v));

/**
 * The install record (.pact/install.json), or null when there is none. It must
 * hold `commit` and a `files` list, which may be empty (an install into no
 * harness). Keys are read without regard to case, and the configuration
 * entries' keys are only compared, never printed (G6).
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
  if (!(truthy(commit) && Array.isArray(files))) refuse('record-not-pact', 'the install record is not a pact manifest (needs commit and a files list); fix or remove it.');
  const config = new Map();
  for (const c of truthy(ci(doc, 'config')) ? asList(ci(doc, 'config')) : []) {
    const kind = ci(c, 'kind');
    const sha = ci(c, 'sha256');
    if (typeof kind !== 'string' || typeof sha !== 'string') continue;
    if (kind === 'user') config.set('user', sha);
    else if (kind === 'block' && typeof ci(c, 'path') === 'string') config.set(`block ${ci(c, 'path')}`, sha);
  }
  const digest = ci(doc, 'digest');
  // The harnesses the last install took, each with the paths it wrote into.
  const harnesses = ci(doc, 'harnesses') ?? [];
  const badHarness = () => refuse('record-not-pact', 'the install record\'s harnesses are not ids with their target paths; fix or remove it.');
  if (!Array.isArray(harnesses)) badHarness();
  for (const h of harnesses) {
    if (!isPlainObject(h) || typeof h.id !== 'string' || !HARNESS_ID_RE.test(h.id) || h.id === PACT_ID) badHarness();
    for (const [k, v] of Object.entries(h)) if (k !== 'id' && !(TARGET_KEYS.includes(k) && targetOk(k, v))) badHarness();
  }
  // Every settings entry the install wrote: where, which key, its value and the value's hash.
  const entries = ci(doc, 'entries') ?? [];
  if (!Array.isArray(entries) || !entries.every(e => isPlainObject(e) && ['harness', 'path', 'key', 'sha256'].every(k => typeof e[k] === 'string') && Object.hasOwn(e, 'value'))) refuse('record-not-pact', 'the install record\'s entries are not a list of settings entries; fix or remove it.');
  // Every skill link the install made: the harness, the link and the folder it points at.
  const links = ci(doc, 'links') ?? [];
  if (!Array.isArray(links) || !links.every(l => isPlainObject(l) && ['harness', 'path', 'target'].every(k => typeof l[k] === 'string'))) refuse('record-not-pact', 'the install record\'s links are not a list of skill links; fix or remove it.');
  const valuesAt = key => entries.filter(e => e.key === key && typeof e.value === 'string').map(e => e.value);
  // The two env keys the identity switch set (#603), and the auto-compact window (#482): each only in the form the install writes.
  const identityEnv = Object.fromEntries(IDENTITY_ENV_KEYS.flatMap(k => valuesAt(`env.${k}`).slice(0, 1).map(v => [k, v])));
  const recordedWindow = entries.find(e => e.key === 'autoCompactWindow')?.value;
  return {
    harnesses: harnesses.map(h => ({ ...h })),
    links: links.map(l => ({ harness: l.harness, path: l.path, target: l.target })),
    entries: entries.map(e => ({ harness: e.harness, path: e.path, key: e.key, value: e.value, sha256: e.sha256 })),
    cleanerDeny: valuesAt('permissions.deny'),
    identityEnv,
    cleanerAsk: valuesAt('permissions.ask'),
    stopDeny: valuesAt('permissions.deny'),
    autoCompactWindow: typeof recordedWindow === 'number' && compactWindowOk(recordedWindow) && recordedWindow > 0 ? recordedWindow : null,
    commit: psString(commit),
    digest: typeof digest === 'string' && /^[0-9a-f]{12}$/.test(digest) ? digest : null,
    files: files.map(e => ({ harness: typeof ci(e, 'harness') === 'string' ? ci(e, 'harness') : null, path: typeof ci(e, 'path') === 'string' ? ci(e, 'path') : null, sha256: psString(ci(e, 'sha256')) })),
    config,
    gate: truthy(ci(doc, 'gate')) ? asList(ci(doc, 'gate')).map(g => [psString(ci(g, 'path')), psString(ci(g, 'sha256'))]) : [],
  };
}

/**
 * The record the install writes (S6, X6; spec 0007 S9): commit, digest, the
 * harnesses with their paths, config, every file with its harness and hash,
 * every settings entry, and the gate. `files` is path to { harness, sha256 }.
 */
export function recordText({ commit, digest, harnesses, userHash, blockHashes, files, links = [], entries, gateNow }) {
  const doc = {
    commit,
    digest: digest ?? null,
    harnesses,
    config: [...(userHash ? [{ kind: 'user', sha256: userHash }] : []), ...[...blockHashes].map(([path, sha256]) => ({ kind: 'block', path, sha256 }))],
    files: [...files].map(([path, f]) => ({ harness: f.harness, path, sha256: f.sha256 })),
    ...(links.length ? { links } : {}),
    entries,
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
// #482: a home render may also report the auto-compact window; a project render never does.
// #439: and the stop switch, as the word on or off.
const HOME_VALUE_RE = /^VALUE (?:(usage-pause|usage-pause-session) (0|[1-9][0-9]?|100)|(usage-pause) (off)|(auto-compact-window) (0|[1-9][0-9]{5,6})|(session-stop-deny) (on|off)|(agent-identity) (on|off))$/;
// The settings the pact retired (#564): the install's own copy of RETIRED_SETTINGS in gate/render-core.mjs, as it keeps AGENT_NAMES. Each copy is pinned to the same value by its own test (install-core and builder-page).
// The render reports each one a file sets as `RETIRED-SETTING <name> <true|false>`, at most once; the line changes nothing in the rules file.
export const RETIRED_SETTINGS = Object.freeze(['checkpoint-stops']);
const RETIRED_SETTING_RE = /^RETIRED-SETTING ([a-z-]+) (true|false)$/;
/** The retired setting `l` reports, as [name, 'true'|'false'], or null when `l` is no such line: an unknown name is refused by the caller. */
function retiredSettingOf(l) {
  const m = RETIRED_SETTING_RE.exec(l);
  if (!m) return null;
  const name = RETIRED_SETTINGS.find(s => s === m[1]);
  return name ? [name, m[2]] : null;
}
// The auto-compact window (#482): the install's own copy of the default in gate/render-core.mjs, as it keeps PACT_TOOLS. A test holds them equal.
export const AUTO_COMPACT_DEFAULT = 400000;
const AUTO_COMPACT_MIN = 100000;
const AUTO_COMPACT_MAX = 1000000;
const AUTO_COMPACT_STEP = 10000;
/** Whether `n` is a window the install takes: 0 (off), or 100000 to 1000000 in steps of 10000. */
export const compactWindowOk = n => n === 0 || (Number.isInteger(n) && n >= AUTO_COMPACT_MIN && n <= AUTO_COMPACT_MAX && (n - AUTO_COMPACT_MIN) % AUTO_COMPACT_STEP === 0);
/** The window the install uses: the reported value, else the default. 0 is off. */
export const compactWindow = parsed => (parsed.values.has('auto-compact-window') ? Number(parsed.values.get('auto-compact-window')) : AUTO_COMPACT_DEFAULT);
// The one NOTE every home dry run prints (#564): whoever loses the wait is told at the install's dry run.
const CHECKPOINTS_NOTE = "NOTE: checkpoints never wait; each is the session's own logged pick (ADR 0157).";
/** The WARN a retired setting draws in a dry run: `where` is "the user configuration", "the pact's default configuration" or "the project configuration"; fixed words only, since the value is `true` or `false`. */
function retiredSettingWarn(name, value, where, project) {
  const tail = value === 'true' ? `: checkpoints no longer wait${project ? ' in this project' : ''}` : '; false changes nothing';
  return `  WARN: ${where} sets ${name}, which the pact retired${tail}. Take the key out.`;
}
/** Whether the stop switch is on (#439): only a reported `VALUE session-stop-deny on`; no line means off. */
export const stopSwitchOn = parsed => parsed.values.get('session-stop-deny') === 'on';
/** Whether the agent-identity switch is on (#603): only a reported `VALUE agent-identity on`; no line means off. */
export const identitySwitchOn = parsed => parsed.values.get('agent-identity') === 'on';
const COMMANDS_RE = /^COMMANDS (none|[a-z-]+(?:,[a-z-]+)*)$/;
const TOOLS_RE = /^TOOLS (none|[a-z-]+(?:,[a-z-]+)*)$/;
// A skill source's path (#183 T4a), as the renderer checks it: owner/name, a full commit, a relative folder whose last segment is the skill's name.
const SKILL_LINE_RE = /^SKILL ([A-Za-z0-9][A-Za-z0-9-]*\/(?!\.+ )(?![A-Za-z0-9._-]*\.[Gg][Ii][Tt] )[A-Za-z0-9._-]+) ([0-9a-f]{40}) ([A-Za-z0-9._][A-Za-z0-9._-]*(?:\/[A-Za-z0-9._][A-Za-z0-9._-]*)*)$/;
const SKILL_PATHS_MAX = 100;
// The pact's default configuration (#183 T4a): the stage folder the renderer
// reads when the home folder holds no user file, and the preset it is
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
  const retiredSettings = new Map();
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
    } else if ((m = HOME_VALUE_RE.exec(l))) {
      const name = m[1] ?? m[3] ?? m[5] ?? m[7] ?? m[9];
      const value = m[2] ?? m[4] ?? m[6] ?? m[8] ?? m[10];
      if (name === 'auto-compact-window' && !compactWindowOk(Number(value))) refuse('render-unknown-line', 'the renderer printed a line the install does not read.');
      if (values.has(name)) refuse('render-value-twice', 'the renderer reported one setting twice.');
      values.set(name, value);
    } else if ((m = retiredSettingOf(l))) {
      if (retiredSettings.has(m[0])) refuse('render-retired-setting-twice', 'the renderer reported one retired setting twice.');
      retiredSettings.set(m[0], m[1]);
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
  // #603: gh-app is on the TOOLS line exactly when the render reported the identity switch on; the two lines come from one render, so a mismatch is a fault.
  if (tools.includes('gh-app') !== (values.get('agent-identity') === 'on')) refuse('render-unknown-line', 'the renderer printed a line the install does not read.');
  if (skills.length > SKILL_PATHS_MAX) refuse('render-skill-count', `the renderer reported more than ${SKILL_PATHS_MAX} skill paths.`);
  const config = configs[0];
  if (project && config.kind !== 'none') refuse('render-project-config', "the stage's render on a project install read a configuration.");
  if (config.kind === 'none') {
    if (digest || values.size || edits.size || agentSets.size || retiredNames.length || retiredSettings.size) refuse('render-none-extras', 'the renderer reported a digest, a value, an edit, a retired name or an agent setting with no configuration.');
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
  return { renderHash, diffHash, config, digest, values, edits, blockHashes, retiredNames, retiredSettings, agentSets, commands, tools, skills };
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

export const PROJECT_LEFT = "The project's .claude/rules folder may hold what the write left; nothing was installed in the home folder.";

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
  const retiredSettings = new Map();
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
    } else if ((m = retiredSettingOf(l))) {
      if (retiredSettings.has(m[0])) refuse('project-render-retired-setting-twice', 'the project render reported one retired setting twice.');
      retiredSettings.set(m[0], m[1]);
    } else if ((m = /^QUALITIES ([1-9])$/.exec(l))) {
      // A project's own qualities list (#262 S25): its row count, one row per ISO/IEC 25010:2023 quality at most.
      if (qualities) refuse('project-render-two-qualities', 'the project render reported two qualities lines.');
      qualities = Number(m[1]);
    } else if ((m = /^COST-LIMITS ([1-9])$/.exec(l))) {
      // A project's own Cost limits (#278): its row count, at most nine rows.
      if (costLimits) refuse('project-render-two-cost-limits', 'the project render reported two Cost limits lines.');
      costLimits = Number(m[1]);
    } else if ((m = /^COST-LIMITS-UNNAMED ([1-9](?: [1-9])*)$/.exec(l))) {
      // The positions of the cost rows no quality names (#299): an unnamed row only draws a note in the dry run (#377), a bad line still refuses; order and range are checked below.
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
  // A retired setting counts as content: a project file holding only it still installs (#564).
  if (!projectHash || !userSeen || !fileHash || (!values.size && !retiredSettings.size && !qualities && !costLimits)) refuse('project-render-counts', 'the project render did not report exactly one output hash, one user configuration line, one project file hash, and a value, a retired setting, a qualities list or a Cost limits list.');
  const text = `${user ? `user ${user}\n` : ''}project ${fileHash}\n`;
  if (digest !== hash(Buffer.from(text, 'ascii')).slice(0, 12)) refuse('project-render-digest', "the project render's configuration digest is missing or does not match the hashes it reported.");
  return { projectHash, fileHash, digest, user, values, retiredSettings, qualities, costLimits, unnamedCosts: unnamedCosts ?? [], retiredNames };
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
 * your cost rows binds a lens there; each limits the review itself (#377).
 */
export function projectNoteLine(parsed) {
  if (!parsed.qualities || parsed.costLimits) return null;
  return "NOTE: the project configuration sets its own qualities list and no Cost limits, so none of its qualities names your Cost limits and they limit the review itself there; add costLimits, and name them in the enoughCosts of each quality they should hold back.";
}

/** The project render's output (J3): exactly its rules file, a plain file of at most 64 KiB, holding the reported hash. */
export function checkProjectOutput(entries, actualHash, reported) {
  const e = entries[0];
  if (entries.length !== 1 || e.name !== 'pact-project.md' || !e.file || e.link || e.size > PROJECT_CAP) refuse('project-output', 'the project render did not leave exactly its rules file of at most 64 KiB.');
  if (actualHash !== reported) refuse('project-rules-hash', "the project rules file's hash does not match the one the renderer reported.");
}

/** The NOTE line for the project's cost rows no quality names (#299, #377): they limit the review itself there. By place; fixed words and digits only. */
function unnamedCostsLine(positions) {
  const one = positions.length === 1;
  const list = one ? `${positions[0]}` : `${positions.slice(0, -1).join(', ')} and ${positions.at(-1)}`;
  return `  NOTE: the project configuration's Cost limits ${one ? 'row' : 'rows'} ${list} ${one ? 'is' : 'are'} named by no quality's enoughCosts, so ${one ? 'it limits' : 'they limit'} the review itself in this project; to hold back a quality's lenses instead, name ${one ? 'it' : 'each'} in that quality's enoughCosts in the project's .claude/pact-config.json.`;
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
    ...[...parsed.retiredSettings].map(([k, v]) => retiredSettingWarn(k, v, 'the project configuration', true) + (parsed.values.size || parsed.qualities || parsed.costLimits ? '' : " It is the file's only setting, so remove the file.")),
    ...parsed.retiredNames.map(a => `  WARN: the project configuration's qualities list names ${a}, an agent the pact retired; take the name out of the list.`),
    ...(parsed.unnamedCosts.length ? [unnamedCostsLine(parsed.unnamedCosts)] : []),
    '  Nothing is installed in the home folder, and no agents go into the project.',
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
 * Which parts of a harness this pact writes (spec 0007 S5, S7, S9): its rules,
 * its agents (antigravity-md only once `tables` names tools for it), its
 * commands folder, a skills folder's skills, the settings merge for Claude
 * Code's own hooks file, and the guard hook in a hooks file of a format the
 * guard speaks (S8).
 */
export function builtParts(h, tables = TOOL_TABLES) {
  const agents = Boolean(h.agents) && (h.agents.format !== 'antigravity-md' || Object.keys(tables['antigravity-md'] ?? {}).length > 0);
  return { rules: true, agents, commands: Boolean(h.commands), skills: Boolean(h.skills), settings: h.id === 'claude' && h.hooks?.format === 'claude', guard: GUARD_FORMATS.includes(h.hooks?.format) };
}

/** Where a harness's files go, as the record keeps it: only the parts this pact writes. */
export function targetsOf(h) {
  const p = builtParts(h);
  return { id: h.id, ...(p.rules ? { rules: h.rules.path } : {}), ...(p.agents ? { agents: h.agents.dir } : {}), ...(p.commands ? { commands: h.commands.dir } : {}), ...(p.skills ? { skills: h.skills.dir } : {}), ...(p.settings ? { settings: h.hooks.file } : {}) };
}

/** Seam A's --harness value for the harnesses that are in: `none`, or each id with the parts it takes; `guard` only while the rule table holds a rule. */
export function harnessArg(harnesses, guard = false) {
  const list = harnesses.map(h => {
    const p = builtParts(h);
    const parts = ['rules', 'agents', 'commands', ...(guard ? ['guard'] : [])].filter(k => p[k]);
    return `${h.id}:${parts.length ? parts.join('+') : 'none'}`;
  });
  return list.length ? list.join(',') : 'none';
}

/**
 * The copy set by the install's own reading of the stage (#203, S8): a list
 * of [staged path, destination] pairs, one source to one or more destinations.
 * A destination is a path under the neutral home, or `@<harness>/<part>` for a
 * harness's own file. A pact command installs only when `commands` names it, a
 * pact tool only when `tools` names it, and a gate file only as a BUILDER_KIT
 * entry under .pact/builder/. A harness with a render in the stage takes its
 * parts from there alone; any other takes them from claude/. A rendered skill
 * installs into the neutral home with its command. With no harness in, nothing
 * installs. A staged file of no known kind pairs with null, which no INSTALL
 * line can match.
 */
export function expectedCopySet(stagedRels, commands = [], tools = [], compact = false, harnesses = [], guard = false) {
  const out = [];
  const kitOn = commands.includes(KIT_COMMAND);
  const rels = [...stagedRels];
  const rendered = new Set(rels.flatMap(rel => (rel.startsWith(RENDERED_REL) ? [rel.split('/')[1]] : [])));
  const parts = harnesses.map(h => ({ id: h.id, ...builtParts(h) }));
  const pact = (rel, dest) => {
    if (harnesses.length) out.push([rel, dest]);
  };
  const guarded = guard && parts.some(p => p.guard);
  const each = (rel, part, tail) => {
    for (const p of parts) if (p[part] && !rendered.has(p.id)) out.push([rel, `@${p.id}/${tail}`]);
  };
  for (const rel of rels) {
    if (rel.startsWith(RENDERED_REL)) {
      const skill = /^rendered\/skills\/([^/]+)\/(SKILL\.md|agents\/openai\.yaml)$/.exec(rel);
      const own = /^rendered\/([^/]+)\/(?:(rules)\.md|(agents)\/([^/]+\.(?:md|toml))|(commands)\/([^/]+)\.md)$/.exec(rel);
      if (skill && PACT_COMMANDS.includes(skill[1])) {
        if (commands.includes(skill[1])) pact(rel, `${SKILLS_DEST}${skill[1]}/${skill[2]}`);
      } else if (own && own[1] !== 'skills') {
        const [, id, rules, agents, agent, , command] = own;
        const part = rules ? 'rules' : agents ? 'agents' : 'commands';
        if (command !== undefined && !PACT_COMMANDS.includes(command)) out.push([rel, null]);
        else if (command === undefined || commands.includes(command)) {
          if (parts.some(p => p.id === id && p[part])) out.push([rel, `@${id}/${rules ? 'rules' : agents ? `agents/${agent}` : `commands/${command}.md`}`]);
        }
      } else out.push([rel, null]);
      continue;
    }
    if (kitOn && inKit(rel)) pact(rel, `${KIT_DEST}${rel}`);
    if (rel.startsWith('gate/') || rel.startsWith('harnesses/') || rel === 'AGENTS.md' || rel === OVERLAY_REL || rel === 'familiars/.gitkeep' || rel === KIT_RULES_REL) continue;
    if (/^familiars\/[^/]+\.(contract|practice-test)\.md$/.test(rel)) continue;
    // A builder or kit file goes only to the kit; one the kit doesn't list pairs with null.
    if (rel.startsWith('builder/') || KIT_EXTRA.includes(rel)) {
      if (!inKit(rel)) out.push([rel, null]);
      continue;
    }
    let m;
    if ((m = /^claude\/commands\/(.*)$/.exec(rel))) {
      const name = /^([^/]+)\.md$/.exec(m[1])?.[1];
      if (commands.includes(name)) each(rel, 'commands', `commands/${name}.md`);
      else if (!PACT_COMMANDS.includes(name)) out.push([rel, null]);
    } else if ((m = /^claude\/tools\/(.*)$/.exec(rel))) {
      // A pact tool (#280): claude/tools/<name>.mjs to .pact/tools/<name>.mjs.
      const name = /^([^/]+)\.mjs$/.exec(m[1])?.[1];
      if (tools.includes(name)) pact(rel, `${TOOLS_DEST}${name}.mjs`);
      else if (!PACT_TOOLS.includes(name)) out.push([rel, null]);
    } else if ((m = /^claude\/hooks\/(.*)$/.exec(rel))) {
      // The pact's hook (#482): claude/hooks/<name>.mjs to .pact/hooks/<name>.mjs, only while the window is on.
      const name = /^([^/]+)\.mjs$/.exec(m[1])?.[1];
      if (compact && PACT_HOOKS.includes(name)) pact(rel, `${HOOKS_DEST}${name}.mjs`);
      else if (!PACT_HOOKS.includes(name)) out.push([rel, null]);
    } else if ((m = /^claude\/guard\/(.*)$/.exec(rel))) {
      // The shared guard (spec 0007 S8): claude/guard/<name>.mjs to .pact/guard/<name>.mjs, only while a guard hook installs.
      const name = /^([^/]+)\.mjs$/.exec(m[1])?.[1];
      if (guarded && GUARD_SCRIPTS.includes(name)) pact(rel, `${GUARD_DEST}${name}.mjs`);
      else if (!GUARD_SCRIPTS.includes(name)) out.push([rel, null]);
    } else if (rel === REVIEW_REL) pact(rel, REVIEW_DEST);
    else if (rel === REVIEW_DIAGRAMS_REL) pact(rel, REVIEW_DIAGRAMS_DEST);
    else if (rel === RULES_REL) each(rel, 'rules', 'rules');
    else if ((m = /^claude\/agents\/([^/]+\.md)$/.exec(rel))) each(rel, 'agents', `agents/${m[1]}`);
    else out.push([rel, null]);
  }
  return out;
}

/**
 * Each checked destination as a path under the home folder, with the harness it
 * belongs to: `@<harness>/<part>` through that harness's description, and
 * everything else the neutral home's own.
 */
export function resolveDestinations(checked, harnesses) {
  const byId = new Map(harnesses.map(h => [h.id, h]));
  return checked.map(([rel, { dest, sha256 }]) => {
    if (!dest.startsWith('@')) {
      if (!dest.startsWith(`${NEUTRAL_REL}/`)) refuse('dest-skip', `unsafe path for an install destination: ${formatPlain(dest)}.`);
      return [rel, { dest, sha256, harness: PACT_ID }];
    }
    const m = /^@([a-z][a-z0-9-]*)\/(?:(rules)|(agents|commands)\/([^/]+))$/.exec(dest);
    const h = m && byId.get(m[1]);
    const base = h && (m[2] ? h.rules?.path : h[m[3]]?.dir);
    if (!base) refuse('dest-skip', `no harness takes an install destination: ${formatPlain(dest)}.`);
    return [rel, { dest: m[2] ? base : `${base}/${m[4]}`, sha256, harness: h.id }];
  });
}

/**
 * The one hash --apply binds, over every harness's rendered rules (spec 0007
 * S9): with one harness, its rules file's own hash; with more, the hash of one
 * "<id> <hash>" line each, in id order; with none, the configured render's.
 */
export function boundHash(rules, configured, hash) {
  if (rules.length < 2) return rules.length ? rules[0].sha256 : configured;
  return hash(Buffer.from([...rules].sort((a, b) => (a.id < b.id ? -1 : 1)).map(r => `${r.id} ${r.sha256}\n`).join(''), 'utf8'));
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
 * .claude/skills/<name>, a folder, a file or a link, refuses. `present(rel)`
 * tests presence without following a link; nothing else in the folder is read.
 */
export function checkSkillClash(commands, present) {
  for (const name of commands) {
    const rel = `${CLAUDE_SKILLS_REL}/${name}`;
    if (present(rel)) refuse('command-skill-clash', `${rel} exists in your home folder, and Claude Code would run that skill in place of the pact command /${name}. Rename or move it${name === KIT_COMMAND ? '' : `, or take ${name} out of the commands list`}.`);
  }
}

/**
 * A command, tool, kit or review file the install would add over a live file its
 * record does not list (#203 S8, #261 S5): refused, never overwritten. Agents
 * keep today's first-install behaviour, and rules files have their own refusal
 * (unrecordedRules). `live(rel)` is the plan's live state; `commandDirs` the
 * harnesses' commands folders.
 */
export function checkNewPaths(repoFiles, record, live, commandDirs = []) {
  const listed = new Set(record ? record.files.map(e => e.path) : []);
  for (const rel of repoFiles.keys()) {
    const command = commandDirs.find(d => rel.startsWith(`${d}/`));
    const always = rel === REVIEW_DEST || rel === REVIEW_DIAGRAMS_DEST || rel.startsWith(KIT_DEST) || rel.startsWith(HOOKS_DEST) || rel.startsWith(SKILLS_DEST) || rel === `${command}/${KIT_COMMAND}.md`;
    if (!(command || always || rel.startsWith(TOOLS_DEST)) || listed.has(rel)) continue;
    const next = always ? 'Move it out of the way, then install again.' : `Move it, or take its name out of the ${rel.startsWith(TOOLS_DEST) ? 'tools' : 'commands'} list.`;
    if (live(rel).exists) refuse('unlisted-live', `${formatPlain(rel)} already exists, and the install record does not list it, so the pact did not put it there. ${next}`);
  }
}

/** The rules targets that hold something the record doesn't list (spec 0007 S9): the pact owns the whole file, so the apply refuses. */
export function unrecordedRules(rulesPaths, record, live) {
  const listed = new Set(record ? record.files.map(e => e.path) : []);
  return rulesPaths.filter(rel => !listed.has(rel) && live(rel).exists);
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
    out.push(`  /${name}: ${always ? 'on, always: part of the pact, with the builder kit under .pact/builder/' : on.includes(name) ? 'on' : 'off'}${here ? '' : ' (not in this commit)'}`);
  }
  const example = PACT_COMMANDS.find(name => name !== KIT_COMMAND && staged.has(`claude/commands/${name}.md`));
  out.push(example ? `  To turn one on, list its name in ${CONFIG_REL}, for example: "commands": ["${example}"]` : '  No pact command that can be turned on is in this commit.');
  for (const name of on) if (!(name === KIT_COMMAND && staged.has(`claude/commands/${name}.md`))) out.push(`  WARN: the user configuration turns on the pact command /${name}; it installs as ${name}.md in each harness's commands folder, or as a skill in ~/.pact/skills.`);
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
  // #599: gh-app is not listed here; only the agent-identity switch installs it, never this list.
  const listable = PACT_TOOLS.filter(n => n !== 'gh-app');
  for (const name of listable) out.push(`  ${name}: ${on.includes(name) ? 'on' : 'off'}${staged.has(`claude/tools/${name}.mjs`) ? '' : ' (not in this commit)'}`);
  const example = listable.find(name => staged.has(`claude/tools/${name}.mjs`));
  out.push(example ? `  To turn one on, list its name in ${CONFIG_REL}, for example: "tools": ["${example}"]` : '  No pact tool that can be turned on is in this commit.');
  // #603: gh-app is not listable; its line shows only while the switch has it on.
  if (on.includes('gh-app')) out.push('  gh-app: on (the agent-identity switch)');
  for (const name of on) out.push(`  WARN: ${name === 'gh-app' ? 'the agent-identity switch' : 'the user configuration'} turns on the pact tool ${name}; it installs to ${TOOLS_DEST}${name}.mjs${TOOL_WARNS[name]}`);
  // PACT-81: a new installer learns clef's next step from the install itself.
  if (on.includes('clef')) out.push('  clef next step: run `node ~/.pact/tools/clef.mjs setup`, then the same with `--yes`; docs/clef.md says what it does.');
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
 * `hooks` never go through that deep merge: they merge by key (hooksPlan), and
 * `autoCompactWindow` follows `compact.window` (#482).
 */
export function mergeSettings(live, overlay, deny = NO_DENY, compact = NO_COMPACT, ask = NO_DENY, identity = NO_IDENTITY, overlayDrop = []) {
  // #482: hooks never go through the deep merge, which would replace an owner's list; they merge by key below.
  const plain = new Map(overlay);
  plain.delete('hooks');
  const m = mergeDeep(live, plain);
  // With no overlay, the merge shares the live permissions map; every change below is made on a copy.
  if (isMap(m.get('permissions'))) m.set('permissions', new Map(m.get('permissions')));
  if (compact.script !== null) {
    const hp = hooksPlan(live, compact.window > 0 ? overlay.get('hooks') : null, compact);
    if (hp.hooks === undefined) m.delete('hooks');
    else m.set('hooks', hp.hooks);
    const had = live.get('autoCompactWindow');
    if (compact.window > 0) m.set('autoCompactWindow', new Num(String(compact.window)));
    else if (compact.recorded !== null && had instanceof Num && had.raw === String(compact.recorded)) m.delete('autoCompactWindow');
  }
  for (const k of LIVE_OWN_SETTINGS) if (live.has(k)) m.set(k, live.get(k));
  const pa = isMap(live.get('permissions')) ? live.get('permissions') : new Map();
  const pb = overlay.has('permissions') ? overlay.get('permissions') : new Map();
  for (const k of ['allow', 'deny', 'ask']) if (pa.has(k) || pb.has(k)) m.get('permissions').set(k, union(pa.get(k), pb.get(k)));
  const mp = m.get('permissions');
  if (isMap(mp) && mp.has('ask')) mp.set('ask', mp.get('ask').filter(r => !RETIRED_ASK.includes(r)));
  if (deny.add.length || deny.drop.length) {
    if (!isMap(m.get('permissions'))) m.set('permissions', new Map());
    const p = m.get('permissions');
    p.set('deny', union(p.get('deny'), deny.add).filter(r => !deny.drop.includes(r)));
  }
  // #523: the cleaner's ask rules, after the retired filter, so only the plan's own rules are added or dropped.
  if (ask.add.length || ask.drop.length) {
    if (!isMap(m.get('permissions'))) m.set('permissions', new Map());
    const p = m.get('permissions');
    p.set('ask', union(p.get('ask'), ask.add).filter(r => !ask.drop.includes(r)));
  }
  // #603: the identity switch's two env keys, set or dropped as the plan says; an env left empty goes with them.
  if (identity.set.size || identity.drop.length) {
    const env = new Map(isMap(m.get('env')) ? m.get('env') : []);
    for (const [k, v] of identity.set) env.set(k, v);
    for (const k of identity.drop) env.delete(k);
    if (env.size) m.set('env', env);
    else m.delete('env');
  }
  for (const key of overlayDrop) {
    const [top, name] = key.split('.');
    if (name === undefined) m.delete(top);
    else if (isMap(m.get(top))) m.get(top).delete(name);
  }
  return m;
}

const NO_DENY = Object.freeze({ add: [], drop: [], record: [] });
const NO_IDENTITY = Object.freeze({ set: new Map(), drop: [], record: {} });

// ------------------------------------------------------------ the overlay's plain keys (spec 0007 S9)

/** The overlay's keys that are neither a list nor a hook: auto mode and its skipped prompt. */
export const OVERLAY_KEYS = Object.freeze(['permissions.defaultMode', 'skipAutoPermissionPrompt']);
const valueAt = (map, key) => {
  const [top, name] = key.split('.');
  if (name === undefined) return map.get(top);
  return isMap(map.get(top)) ? map.get(top).get(name) : undefined;
};
const same = (a, b) => a !== undefined && b !== undefined && canonical(a) === canonical(b);

/**
 * Which of the overlay's plain keys the install owns. With an overlay applied,
 * `record` holds each key the record already listed, and each whose value the
 * live settings don't hold yet: a value already there is the owner's. With none
 * (Claude Code taken out), `drop` holds each recorded key whose live value is
 * still the recorded one. `recorded` is the record's entries.
 */
export function overlayKeysPlan(live, overlay, recorded) {
  const record = [];
  const drop = [];
  for (const key of OVERLAY_KEYS) {
    const was = recorded.find(e => e.key === key);
    const want = valueAt(overlay, key);
    if (want !== undefined) {
      if (was || !same(valueAt(live, key), want)) record.push(key);
    } else if (was && same(valueAt(live, key), toMaps(was.value))) drop.push(key);
  }
  return { record, drop };
}

// ------------------------------------------------------------ the pact's hooks (#482)

/**
 * What the hooks and the window need from the install: `window` (0 is off),
 * `script` (the installed script's absolute path, or null for no hook handling),
 * `recorded` (the window the last install set, or null) and `platform`.
 */
const NO_COMPACT = Object.freeze({ window: 0, script: null, recorded: null, platform: 'linux' });

/** A path as the key compares it: forward slashes, doubled ones joined, and case folded on Windows. */
const pathKey = (p, platform) => {
  const s = String(p).replace(/\\/g, '/').replace(/\/+/g, '/');
  return platform === 'win32' ? s.toLowerCase() : s;
};

/** The overlay with the hook script's path and the window put in place of the overlay's two tokens, after its hash check. The script must sit under the home folder. */
export function fillHooks(overlay, home, script, window, platform = 'linux') {
  const root = pathKey(home, platform).replace(/\/$/, '');
  if (!pathKey(script, platform).startsWith(`${root}/`)) refuse('hook-script-path', "the hook script's install path is not under the home folder.");
  const fill = v => {
    if (Array.isArray(v)) return v.map(fill);
    if (isMap(v)) return new Map([...v].map(([k, x]) => [k, fill(x)]));
    return v === HOOK_SCRIPT_TOKEN ? script : v === HOOK_WINDOW_TOKEN ? String(window) : v;
  };
  const out = new Map(overlay);
  if (overlay.has('hooks')) out.set('hooks', fill(overlay.get('hooks')));
  return out;
}

const innerHooks = group => (isMap(group) && Array.isArray(group.get('hooks')) ? group.get('hooks') : []);
/**
 * The pact's own inner hook (#482, round 1): exactly the overlay's entry, its
 * one variable being the window, a decimal string. A hook that carries the
 * script's path but differs in its command, type, timeout or arguments, or has
 * another key, is not the pact's: it is left alone and draws the dry run's
 * warning.
 */
const isPactHook = (h, key, platform) => {
  if (!isMap(h) || h.size !== 4 || h.get('type') !== 'command' || h.get('command') !== 'node') return false;
  const t = h.get('timeout');
  const a = h.get('args');
  return t instanceof Num && t.raw === '15' && Array.isArray(a) && a.length === 2 && typeof a[0] === 'string' && pathKey(a[0], platform) === key && typeof a[1] === 'string' && /^[0-9]{6,7}$/.test(a[1]);
};
const holdsPact = (group, key, platform) => innerHooks(group).some(h => isPactHook(h, key, platform));

/** `group` with the pact's inner hooks taken out; null when that leaves it no inner hook. Other fields and hooks stay. */
function stripPact(group, key, platform) {
  const rest = innerHooks(group).filter(h => !isPactHook(h, key, platform));
  if (!rest.length) return null;
  const g = new Map(group);
  g.set('hooks', rest);
  return g;
}

/** The first group that holds a pact hook, brought up to the overlay's `want`: replaced whole when it holds nothing else, else only its first pact hook is replaced and its other pact hooks go. */
function updatePact(group, want, key, platform) {
  const inner = innerHooks(group);
  if (inner.every(h => isPactHook(h, key, platform))) return want;
  const at = inner.findIndex(h => isPactHook(h, key, platform));
  const g = new Map(group);
  g.set('hooks', inner.flatMap((h, i) => (i === at ? [want.get('hooks')[0]] : isPactHook(h, key, platform) ? [] : [h])));
  return g;
}

/**
 * The keyed merge of the pact's hooks (#482 S4, round 1). A pact entry is an
 * inner hook equal to the overlay's for the event, its window aside (see
 * isPactHook). With `overlayHooks` (on): the first group holding a pact entry
 * is updated in place (only that inner hook, when the group holds others), a
 * missing one is appended after the event's other groups, and a second pact
 * entry elsewhere is taken out. With null (off): every pact inner hook is
 * removed, a group left empty goes, then an event the removal left with no
 * group, then `hooks` if the removal emptied it. Every other group, inner
 * hook and field stays as it was, in order. Returns { hooks, events, skipped }: `hooks` is
 * undefined when the key should be absent, `events` the [event, op] pairs
 * the merge makes, `skipped` the events whose live value is not a list.
 */
export function hooksPlan(live, overlayHooks, compact) {
  const key = pathKey(compact.script, compact.platform);
  const liveHooks = live.get('hooks');
  const events = [];
  const skipped = [];
  if (liveHooks !== undefined && !isMap(liveHooks)) return { hooks: liveHooks, events, skipped: overlayHooks ? [...HOOK_EVENTS] : [] };
  const out = new Map(liveHooks ?? []);
  if (overlayHooks) {
    for (const [event, groups] of overlayHooks) {
      for (const group of groups) {
        const list = out.get(event);
        if (list === undefined) {
          out.set(event, [group]);
          events.push([event, 'added']);
        } else if (!Array.isArray(list)) skipped.push(event);
        else {
          const at = list.findIndex(g => holdsPact(g, key, compact.platform));
          if (at < 0) {
            out.set(event, [...list, group]);
            events.push([event, 'added']);
          } else {
            // The first group holding a pact hook is updated in place; the pact hooks in any later group are taken out, a group they leave empty going with them.
            const next = list.flatMap((g, i) => (i < at || !holdsPact(g, key, compact.platform) ? [g] : i === at ? [updatePact(g, group, key, compact.platform)] : stripPact(g, key, compact.platform) ?? []));
            if (canonical(next) !== canonical(list)) {
              out.set(event, next);
              events.push([event, 'updated']);
            }
          }
        }
      }
    }
    return { hooks: out, events, skipped };
  }
  for (const [event, list] of [...out]) {
    if (!Array.isArray(list)) continue;
    // Only the pact's inner hooks go; a group left with none goes too, and every other group, hook and field stays.
    const kept = list.flatMap(g => (holdsPact(g, key, compact.platform) ? stripPact(g, key, compact.platform) ?? [] : [g]));
    if (canonical(kept) === canonical(list)) continue;
    events.push([event, 'removed']);
    if (kept.length) out.set(event, kept);
    else out.delete(event);
  }
  return { hooks: events.length && out.size === 0 ? undefined : liveHooks === undefined ? undefined : out, events, skipped };
}

/** A live event's name as a dry-run line shows it: cleaned and cut, like the other live keys. */
const eventShown = event => {
  const n = formatPlain(event);
  return n.length > 40 ? `${n.slice(0, 40)}...` : n;
};

/**
 * The dry run's block for the window and its hooks: a header line, the
 * autoCompactWindow change, and each pact hook event added, updated or
 * removed. Names constants, the window's number and, for a hook removed or
 * not addable, the live event, cleaned and cut by eventShown.
 */
export function compactLines(live, overlay, compact) {
  const on = compact.window > 0;
  const out = [`auto-compact-window: ${on ? `on, ${compact.window} tokens` : 'off'}`];
  const had = live.get('autoCompactWindow');
  if (on) {
    if (!(had instanceof Num) || had.raw !== String(compact.window)) out.push(`  set autoCompactWindow = ${compact.window}`);
  } else if (had !== undefined) {
    if (compact.recorded !== null && had instanceof Num && had.raw === String(compact.recorded)) out.push('  - autoCompactWindow');
    else out.push('  NOTE: settings.json holds an autoCompactWindow the pact did not set; it is left as it is.');
  }
  const hp = hooksPlan(live, on ? overlay.get('hooks') : null, compact);
  for (const [event, op] of hp.events) out.push(`  hook ${eventShown(event)}: ${op}`);
  for (const event of hp.skipped) out.push(`  WARN: settings.json hooks.${eventShown(event)} is not a list; the pact's hook was not added there.`);
  return out;
}

/**
 * The cleaner's deny rules for this install (#438 S2.3): on, the fixed rules
 * not yet in the live deny list are added, and the record keeps those it
 * already held that are still fixed rules, plus the added; off, only rules
 * both recorded and fixed are dropped, and the record holds none.
 */
export function cleanerDenyPlan(live, toolsOn, recorded) {
  return denyPlan(live, CLEANER_DENY, toolsOn.includes('cleaner'), recorded);
}

/**
 * The cleaner's ask rules for this install (#523 S3b): the same plan as the
 * deny rules, over the ask list and CLEANER_ASK, and recorded under cleanerAsk.
 * On, the rules not yet in the live ask list are added; off, only rules both
 * recorded and fixed are dropped, so an identical rule the owner wrote stays.
 */
export function cleanerAskPlan(live, toolsOn, recorded) {
  return denyPlan(live, CLEANER_ASK, toolsOn.includes('cleaner'), recorded, 'ask');
}

/**
 * The stop switch's deny rules for this install (#439 S1.2): the same plan,
 * over STOP_DENY only: it never drops, prints or records one of the cleaner's
 * rules, though the record lists both, and the cleaner's plan likewise.
 */
export function stopDenyPlan(live, on, recorded) {
  return denyPlan(live, STOP_DENY, on, recorded);
}

function denyPlan(live, fixed, on, recorded, list = 'deny') {
  const lp = live.get('permissions');
  const had = isMap(lp) ? listOf(lp.get(list)).map(ruleString) : [];
  const ours = recorded.filter(r => fixed.includes(r));
  if (!on) return { add: [], drop: ours.filter(r => had.includes(r)), record: [] };
  const add = fixed.filter(r => !had.includes(r));
  return { add, drop: [], record: [...new Set([...ours, ...add])] };
}

// ------------------------------------------------------------ the guard's hook entry (spec 0007 S8)

/** The rules the switches leave on: `on` names the switches that are. */
export const guardRules = on => GUARD_RULES.filter(r => on.includes(r.switch));

/** rules.json's text for those rules. */
export const guardTableText = rules => `${JSON.stringify({ rules }, null, 2)}\n`;

/** The line the dry run and the apply print when a Codex hook entry is new or changed (C15). */
export const CODEX_TRUST_LINE = 'Codex: open /hooks and trust pact-guard; until then Codex runs unguarded.';

/**
 * Whether the pact installs the guard on this platform. Not on Windows yet: the
 * hook command is written for cmd, a harness may run hooks under PowerShell,
 * and there the command prints the environment and lets the call through.
 */
export const guardOnPlatform = platform => platform !== 'win32';
/** The warning for a harness that would take the guard where it is not installed. */
export const guardNotYetLine = h => `WARN: ${h.id}: the pact's guard isn't installed on Windows yet, so ${h.name} runs unguarded.`;

// Characters cmd or a shell would read as more than part of a path.
const WIN_PATH_BAD = /["%!^&|<>\p{Cc}]/u;

/**
 * The hook's command for a wrapper at `script`, an absolute path (S8). It
 * clears NODE_OPTIONS in the platform's own form, so an inherited option can't
 * crash node before the wrapper runs. On Windows it names cmd.exe by its full
 * path, from `systemRoot`, and sets NoDefaultCurrentDirectoryInExePath, so no
 * `node` or `cmd` in the session's working folder runs. The text depends only
 * on the machine, so a harness's trust in the entry holds across installs.
 */
export function guardCommand({ script, platform, systemRoot }) {
  if (platform === 'win32') {
    const root = String(systemRoot || 'C:\\Windows');
    if (!/^[A-Za-z]:\\[A-Za-z0-9_.\\-]+$/.test(root) || !/^[A-Za-z]:\\/.test(script) || WIN_PATH_BAD.test(script)) refuse('hook-command-path', "the guard's path or the Windows folder holds a character the hook command can't carry, or is not a full path.");
    // SystemRoot's case differs between environments (C:\WINDOWS, C:\Windows); one spelling keeps the entry the same.
    const folder = root.replace(/\\$/, '').replace(/^[a-z]/, d => d.toUpperCase()).replace(/\\windows$/i, '\\Windows');
    return `${folder}\\System32\\cmd.exe /d /c "set "NODE_OPTIONS=" & set "NoDefaultCurrentDirectoryInExePath=1" & node "${script}""`;
  }
  if (!script.startsWith('/') || /\p{Cc}/u.test(script)) refuse('hook-command-path', "the guard's path holds a character the hook command can't carry, or is not a full path.");
  return `env -u NODE_OPTIONS node '${script.replaceAll("'", `'\\''`)}'`;
}

// Where each harness keeps its PreToolUse list, and what the pact's group there holds.
const GUARD_SHAPES = Object.freeze({
  codex: Object.freeze({ path: Object.freeze(['hooks', 'PreToolUse']), matcher: '^Bash$', more: Object.freeze([['statusMessage', 'pact-guard']]) }),
  antigravity: Object.freeze({ path: Object.freeze(['pact-guard', 'PreToolUse']), matcher: 'run_command', more: Object.freeze([]) }),
});

/** The pact's matcher group for a format, as settings maps: one hook, its command and a 15 s timeout. */
export function guardGroup(format, command) {
  const { matcher, more } = GUARD_SHAPES[format];
  const hook = new Map([['type', 'command'], ['command', command], ['timeout', new Num('15')], ...more]);
  return new Map([['matcher', matcher], ['hooks', [hook]]]);
}

/** A recorded entry's value, a group, as settings maps; null when it is not one. */
const recordedGroup = value => readSettings(JSON.stringify({ group: value }))?.get('group') ?? null;

/** The key an entry of the record carries for a guard hook. */
export const guardKey = format => `guard.${format}`;
/** The guard format a record entry holds, or null when it is not a guard hook's. */
export const guardFormatOf = entry => GUARD_FORMATS.find(f => entry.key === guardKey(f)) ?? null;

/**
 * One hooks file's keyed merge. `drop` holds the groups the record lists for
 * it, and `want` the groups it should hold now, each { format, group }. The
 * pact's own hooks are those equal to a hook of either list; every other hook,
 * group and key stays as it was, in order. A group left empty by a removal
 * goes, then a list and a key the removal emptied. Returns { merged, changed,
 * added, warnings }: `added` the formats whose entry is new or changed. A file
 * whose PreToolUse path holds something else refuses when a hook should go in.
 */
export function guardMerge(live, { drop = [], want = [] }) {
  const merged = new Map(live);
  const warnings = [];
  const added = [];
  for (const format of GUARD_FORMATS) {
    const wanted = want.find(w => w.format === format) ?? null;
    const groups = [...drop.filter(d => d.format === format), ...(wanted ? [wanted] : [])].map(d => d.group).filter(isMap);
    if (!groups.length) continue;
    const ours = new Set(groups.flatMap(g => innerHooks(g).map(canonical)));
    const [top, event] = GUARD_SHAPES[format].path;
    const holder = merged.get(top);
    const list = isMap(holder) ? holder.get(event) : undefined;
    if ((holder !== undefined && !isMap(holder)) || (list !== undefined && !Array.isArray(list))) {
      if (wanted) refuse('hooks-shape', `a hooks file's ${top}.${event} is not the list the harness reads, so the pact's guard cannot be added; fix the file first.`);
      continue;
    }
    // The pact's hook is already there, once, under its matcher: the list
    // stays as it is, with any hook the person put beside it in that group.
    const mine = (list ?? []).flatMap(g => innerHooks(g).filter(h => ours.has(canonical(h))).map(h => [g.get('matcher'), canonical(h)]));
    const held = wanted !== null && mine.length === 1 && mine[0][0] === wanted.group.get('matcher') && mine[0][1] === canonical(innerHooks(wanted.group)[0]);
    // Where the pact's own group sits now, so an update keeps its place.
    let place = -1;
    const kept = held ? [...list] : [];
    for (const g of held ? [] : list ?? []) {
      const rest = innerHooks(g).filter(h => !ours.has(canonical(h)));
      if (rest.length === innerHooks(g).length) kept.push(g);
      else if (rest.length) kept.push(new Map([...g, ['hooks', rest]]));
      else if (place < 0) place = kept.length;
    }
    if (wanted) {
      if (!held) kept.splice(place < 0 ? kept.length : place, 0, wanted.group);
      const script = `${format}.mjs`;
      if (kept.some(g => g !== wanted.group && innerHooks(g).some(h => isMap(h) && !ours.has(canonical(h)) && typeof h.get('command') === 'string' && h.get('command').includes('.pact') && h.get('command').includes(script)))) warnings.push(`another hook there names the pact's ${script} and differs from the pact's; it is left as it is.`);
      if (format === 'antigravity' && isMap(holder) && holder.get('enabled') === false) warnings.push(`${top} is switched off there ("enabled": false), so the harness runs unguarded; the pact leaves that setting as it is.`);
      if (!held) added.push(format);
    }
    if (list !== undefined && canonical(kept) === canonical(list)) continue;
    if (!wanted && list === undefined) continue;
    const next = new Map(holder ?? []);
    if (kept.length) next.set(event, kept);
    else next.delete(event);
    if (next.size) merged.set(top, next);
    else merged.delete(top);
  }
  return { merged, changed: canonical(merged) !== canonical(live), added, warnings };
}

/**
 * The guard hooks of this install, one plan per hooks file: the files of the
 * harnesses that are in (`want`: { harness, path, format, command }), and
 * those the record lists a guard hook in.
 */
export function guardPlans(recordEntries, want) {
  const files = new Map();
  const at = path => {
    if (!files.has(path)) files.set(path, { path, want: [], drop: [], recorded: [] });
    return files.get(path);
  };
  for (const e of recordEntries) {
    const format = guardFormatOf(e);
    if (format === null) continue;
    const f = at(e.path);
    f.recorded.push(e);
    f.drop.push({ format, group: recordedGroup(e.value) });
  }
  for (const w of want) at(w.path).want.push({ harness: w.harness, format: w.format, group: guardGroup(w.format, w.command) });
  return [...files.values()];
}

/** The record's entries for one file's wanted groups, one per harness. */
export const guardEntries = (plan, hash) => plan.want.map(w => ({ harness: w.harness, path: plan.path, key: guardKey(w.format), value: toJsonValue(w.group), sha256: hash(Buffer.from(canonical(w.group), 'utf8')) }));

/** Each recorded guard hook the live file no longer holds as recorded, as a drift line naming the file only. */
export function guardDrift(plan, live) {
  return plan.recorded.filter(e => {
    const format = guardFormatOf(e);
    const group = recordedGroup(e.value);
    const [top, event] = GUARD_SHAPES[format].path;
    const holder = live.get(top);
    const list = isMap(holder) ? holder.get(event) : undefined;
    return !(isMap(group) && Array.isArray(list) && list.some(g => isMap(g) && canonical(g.get('matcher') ?? null) === canonical(group.get('matcher')) && innerHooks(group).every(h => innerHooks(g).some(x => canonical(x) === canonical(h)))));
  }).map(e => ({ harness: e.harness, line: `${formatPlain(e.path)} (the pact's guard hook changed since the install)` }));
}

/** The dry run's lines for one hooks file, in one harness's block. */
export function guardLines(plan, id) {
  const wants = plan.want.some(w => w.harness === id);
  const file = formatPlain(plan.path);
  const out = [`${file}: ${!plan.changed ? 'unchanged' : plan.bytes === null ? 'would be created' : 'would be merged'}`];
  if (plan.changed) out.push(`  pact-guard hook: ${!wants && !plan.want.length ? 'removed' : plan.recorded.length ? 'updated' : 'added'}`);
  for (const w of plan.warnings) out.push(`WARN: ${file}: ${w}`);
  if (plan.trust && wants) out.push(CODEX_TRUST_LINE);
  return out;
}

/** Whether a path the install would merge a guard hook into is one it may write: relative, plain, a .json file outside the neutral home and every secret store, through no link. */
export function guardPathReason(rel, throughLink) {
  // A recorded hooks path is held to what a recorded target is.
  if (!targetOk('settings', rel)) return 'unsafe path';
  if (throughLink(rel)) return 'path through a link';
  return null;
}

// ------------------------------------------------------------ the settings entries the record keeps (spec 0007 S9)

/**
 * Every settings entry this install wrote into `path`, for the record: each
 * permission rule it added, each of the overlay's plain keys it set, each env
 * key it set, the window, and each of the overlay's hooks, each with its value
 * and the value's hash. An entry the
 * merged settings don't hold (a hook event that isn't a list) is left out.
 */
export function settingsEntries({ harness, path, merged, deny, ask, identityEnv, window, hooks, hash, overlayKeys = [] }) {
  const out = [];
  // The value as the record reads it back: plain JSON, a number a number.
  const add = (key, value) => out.push({ harness, path, key, value: JSON.parse(JSON.stringify(toJsonValue(value))), sha256: hash(Buffer.from(canonical(value), 'utf8')) });
  for (const rule of deny) add('permissions.deny', rule);
  for (const rule of ask) add('permissions.ask', rule);
  for (const key of overlayKeys) {
    const value = valueAt(merged, key);
    if (value !== undefined) add(key, value);
  }
  for (const [k, v] of Object.entries(identityEnv)) add(`env.${k}`, v);
  if (window > 0) {
    add('autoCompactWindow', new Num(String(window)));
    for (const [event, groups] of hooks ?? []) for (const g of groups) for (const h of innerHooks(g)) add(`hooks.${event}`, h);
  }
  return out.filter(e => !entryDrift([e], merged).length);
}

/** Each recorded entry the live settings no longer hold as recorded, as a drift line naming the file and the key only. */
export function entryDrift(entries, live) {
  const out = [];
  const permissions = isMap(live.get('permissions')) ? live.get('permissions') : new Map();
  const env = isMap(live.get('env')) ? live.get('env') : new Map();
  const hooks = isMap(live.get('hooks')) ? live.get('hooks') : new Map();
  for (const e of entries) {
    const want = canonical(toMaps(e.value));
    const [top, name = ''] = e.key.split('.');
    let held;
    if (top === 'permissions') held = listOf(permissions.get(name)).some(r => canonical(r) === want);
    else if (top === 'env') held = env.has(name) && canonical(env.get(name)) === want;
    else if (top === 'hooks') held = listOf(hooks.get(name)).some(g => innerHooks(g).some(h => canonical(h) === want));
    else held = live.has(e.key) && canonical(live.get(e.key)) === want;
    if (!held) out.push(`${e.path} ${formatPlain(e.key)} (the pact's entry changed since the install)`);
  }
  return out;
}

// ------------------------------------------------------------ the agent-identity switch (#603, S7)

/** The two env keys the switch owns in settings.json: the install sets them while it is on, records them in its entries, and removes only a key whose live value is the recorded one; a recorded key changed since is drift. */
export const IDENTITY_ENV_KEYS = Object.freeze(['GIT_CONFIG_GLOBAL', 'GIT_TERMINAL_PROMPT']);
const slashed = p => String(p).replaceAll('\\', '/');
/** The gitconfig setup writes for the claude app, in the neutral home under the home folder. */
export const identityGitconfigPath = home => `${slashed(home).replace(/\/$/, '')}/.pact/gh-app-claude.gitconfig`;
/** The value the install gives each switch-owned key, a Map in key order. */
export const identityEnvWanted = home => new Map([['GIT_CONFIG_GLOBAL', identityGitconfigPath(home)], ['GIT_TERMINAL_PROMPT', '0']]);

/**
 * The switch's env plan: `set` (key to value, only where the live value differs),
 * `drop` (keys), `record` (what the record holds next) and `conflicts` (keys the
 * owner's own env already sets). On, a key is the install's own only when the
 * record lists it with the live value; any other live value is the owner's and a
 * conflict, and the install never overwrites it. Off, only a recorded key whose
 * live value is still the recorded one is dropped.
 */
export function identityEnvPlan(live, on, recorded, wanted) {
  const env = isMap(live.get('env')) ? live.get('env') : new Map();
  const ours = k => Object.hasOwn(recorded, k) && env.get(k) === recorded[k];
  if (!on) return { set: new Map(), drop: IDENTITY_ENV_KEYS.filter(k => env.has(k) && ours(k)), record: {}, conflicts: [] };
  const set = new Map();
  const record = {};
  const conflicts = [];
  for (const [k, v] of wanted) {
    if (env.has(k) && !ours(k)) {
      conflicts.push(k);
      continue;
    }
    record[k] = v;
    if (env.get(k) !== v) set.set(k, v);
  }
  return { set, drop: [], record, conflicts };
}

/**
 * Whether `p` is a Node the gitconfig may name: an absolute path to a program
 * called node, with no quote or control character. The same on every platform;
 * the machine is out of the threat model's scope, so no folder is required.
 */
export const identityNodeOk = p => typeof p === 'string' && /^(?:[A-Za-z]:[\\/]|\/)/.test(p) && /^node(?:\.exe)?$/i.test(p.split(/[\\/]/).at(-1)) && !/["\p{Cc}]/u.test(p);

/** The claude app's entry in github.json's text, or null when the file is not the pin's exact shape or holds no claude app. Nothing is looked up. */
export function identityPinApp(text) {
  let pin;
  try {
    pin = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return null;
  }
  const keys = (o, want) => o !== null && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length === want.length && want.every(k => Object.hasOwn(o, k));
  if (!keys(pin, ['owner', 'apps']) || !keys(pin.owner, ['login', 'id']) || pin.apps === null || typeof pin.apps !== 'object' || Array.isArray(pin.apps)) return null;
  const a = pin.apps.claude;
  const isId = n => Number.isSafeInteger(n) && n > 0;
  if (!keys(a, ['app_id', 'slug', 'bot_login', 'bot_id']) || !isId(a.app_id) || !isId(a.bot_id) || typeof a.slug !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(a.slug) || a.bot_login !== `${a.slug}[bot]`) return null;
  return { app_id: a.app_id, slug: a.slug, bot_login: a.bot_login, bot_id: a.bot_id };
}

/** One gitconfig value, as gh-app.mjs writes it: raw when plain, else quoted with " and \ escaped. */
function iniValue(v, force = false) {
  if (/[\r\n\0]/.test(v)) refuse('identity-gitconfig', 'the agent gitconfig would hold a line break.');
  return force || /["\\#;]|^\s|\s$/.test(v) ? `"${v.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"` : v;
}

/**
 * The text the claude app's gitconfig must hold: the install's own copy of
 * gitconfigText in claude/tools/gh-app.mjs, which a test holds equal. `userHome`
 * is the home folder; `xdg` is whether the XDG config exists.
 */
export function identityGitconfigText({ userHome, nodePath, app, xdg }) {
  const h = slashed(userHome);
  const helper = `!"${slashed(nodePath)}" "${h.replace(/\/$/, '')}/.pact/tools/gh-app.mjs" git-credential --provider claude`;
  return [
    '[include]',
    `  path = ${iniValue(`${h}/.gitconfig`)}`,
    ...(xdg ? [`  path = ${iniValue(`${h}/.config/git/config`)}`] : []),
    '[user]',
    `  name = ${iniValue(app.bot_login)}`,
    `  email = ${iniValue(`${app.bot_id}+${app.bot_login}@users.noreply.github.com`)}`,
    '[credential "https://github.com"]',
    '  helper =',
    `  helper = ${iniValue(helper, true)}`,
    '  useHttpPath = true',
    '',
  ].join('\n');
}

/**
 * The verdict on the gitconfig on disk: `{ ok }`, and when not ok the parts that
 * differ, from node path, include list and other lines, never the file's lines.
 */
export function identityGitconfigVerdict(actual, expected) {
  if (actual === expected) return { ok: true, parts: [] };
  const split = text => {
    const lines = text.split(/\r?\n/);
    return { helper: lines.filter(l => /^ {2}helper = ./.test(l)), include: lines.filter(l => /^ {2}path = /.test(l)), other: lines.filter(l => !/^ {2}helper = ./.test(l) && !/^ {2}path = /.test(l)) };
  };
  const a = split(actual);
  const e = split(expected);
  const parts = [];
  if (a.helper.join('\n') !== e.helper.join('\n')) parts.push('node path differs');
  if (a.include.join('\n') !== e.include.join('\n')) parts.push('include list differs');
  if (a.other.join('\n') !== e.other.join('\n') || !parts.length) parts.push('other lines differ');
  return { ok: false, parts };
}

/** The fixed line the dry run prints for the gitconfig check, with the verdict's parts named when it fails. */
export const identityGitconfigLine = v => `gitconfig as expected: ${v.ok ? 'yes' : `no: ${v.parts.join(', ')}, run gh-app.mjs refresh`}`;

/** Two deny plans as the one `deny` that mergeSettings and settingsChanges take: adds and drops joined; each record is kept apart by the caller. */
export const joinDeny = (a, b) => ({ add: [...a.add, ...b.add], drop: [...a.drop, ...b.drop], record: [] });

const pathIn = (map, segs) => {
  let v = map;
  for (const s of segs) {
    if (!isMap(v) || !v.has(s)) return { has: false };
    v = v.get(s);
  }
  return { has: true, value: v };
};

/** What the merge changes, told from the overlay's side only (S6, L6): a live value is never printed. */
export function settingsChanges(live, overlay, deny = NO_DENY, ask = NO_DENY, identity = NO_IDENTITY) {
  const paths = [];
  for (const [top, v] of overlay) {
    // The hooks block merges by key and prints its own lines (compactLines, #482).
    if (top === 'hooks') continue;
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
  // The cleaner's rules are the pact's fixed list, so printing them shows no live entry (#438).
  const shown = new Set(out);
  for (const rule of deny.add) if (!shown.has(`  + permissions.deny: ${formatRule(rule)}`)) out.push(`  + permissions.deny: ${formatRule(rule)}`);
  for (const rule of deny.drop) out.push(`  - permissions.deny: ${formatRule(rule)}`);
  // #523: the cleaner's ask rules, the pact's fixed list as well.
  for (const rule of ask.add) if (!shown.has(`  + permissions.ask: ${formatRule(rule)}`)) out.push(`  + permissions.ask: ${formatRule(rule)}`);
  for (const rule of ask.drop) out.push(`  - permissions.ask: ${formatRule(rule)}`);
  // #603: the identity switch's env keys. The gitconfig's path is the owner's own, so it is named, not printed.
  for (const [k, v] of identity.set) out.push(k === 'GIT_CONFIG_GLOBAL' ? `  set env.${k} (the agent gitconfig)` : `  set env.${k} = ${formatPlain(v)}`);
  for (const k of identity.drop) out.push(`  - env.${k}`);
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
 * still there (#265), a mode other than auto, and (#482) a hook the pact did
 * not install, once per event. The owner's own keys are named
 * once, capped; env names are only counted, since a name can say what a secret
 * is for.
 */
export function liveSettingsLines(live, overlay, compact = NO_COMPACT) {
  const out = [];
  for (const k of bannedKeys(live)) if (!LIVE_OWN_SETTINGS.includes(k)) out.push(`WARN: settings.json holds ${k}, a command-running setting the pact never sets.`);
  // #482: a hook the pact did not install, once per event; the pact's own, matched by key, draw nothing.
  const lh = live.get('hooks');
  if (isMap(lh) && compact.script !== null) {
    const key = pathKey(compact.script, compact.platform);
    for (const [event, groups] of lh) {
      if (Array.isArray(groups) && groups.some(g => innerHooks(g).some(h => !isPactHook(h, key, compact.platform)))) out.push(`WARN: settings.json holds a hook the pact did not install: ${eventShown(event)}`);
    }
  }
  const lp = live.get('permissions');
  const retired = retiredIn(live).length;
  if (retired) out.push(`NOTE: settings.json holds ${retired} of the pact's retired ask rules; --apply removes them.`);
  const mode = isMap(lp) ? lp.get('defaultMode') : undefined;
  if (mode !== 'auto') out.push('WARN: settings.json: permissions.defaultMode is not auto; --apply sets it.');
  const ownWindow = (v) => compact.window > 0 || (compact.recorded !== null && v instanceof Num && v.raw === String(compact.recorded));
  const own = [...live.keys()].filter(k => !overlay.has(k) && !(k === 'autoCompactWindow' && ownWindow(live.get(k))) && (!BANNED_SETTINGS.includes(k) || LIVE_OWN_SETTINGS.includes(k))).sort();
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

// The settings and hooks files the known harnesses read: merged by key, never copied over or deleted.
const MERGED_FILES = Object.freeze(['.claude/settings.json', '.claude.json', '.codex/hooks.json', '.gemini/config/hooks.json']);

/** A path as Windows reads its name: forward slashes, no stream suffix, no trailing dot or space, lower case. */
const windowsName = rel => rel
  .replace(/\\/g, '/')
  .split('/')
  .map(s => s.replace(/:.*$/, '').replace(/[. ]+$/, ''))
  .filter(Boolean)
  .join('/')
  .toLowerCase();

// Programs' keys and sign-ins under the home folder, and any file whose name starts .credentials.
const SECRET_STORES = /^(\.ssh|\.aws|\.gnupg|\.config\/gh)(\/|$)|^(\.claude\.json|\.codex\/auth\.json|\.gemini\/(oauth_creds|google_accounts)\.json|\.git-credentials|\.gitconfig|\.netrc)$|(^|\/)\.credentials[^/]*$/;

/** Whether a home-relative path is one of them: no harness path may be, and the install never reads, writes or deletes one. */
export const isSecretStore = rel => SECRET_STORES.test(windowsName(rel));

/**
 * Never deleted, overwritten or listed, whatever the record says: normalised as
 * Windows reads a name. `merged` adds the hooks files the person's own harness
 * descriptions name.
 */
export function isProtected(rel, merged = []) {
  const n = windowsName(rel);
  if (isSecretStore(rel)) return true;
  if ([...MERGED_FILES, ...merged].some(f => f.toLowerCase() === n)) return true;
  if (/^\.claude\/(projects|memory|skills|handover)(\/|$)/.test(n)) return true;
  return /^\.pact\/((install|config|builder|github|linear)\.json$|gh-app-|(blocks|presets|backups|handoffs|source)(\/|$))/.test(n);
}

/** Only plain, canonical record paths are acted on: a name that is not already plain could be a Windows alias. */
export function isCanonical(rel) {
  if (!rel || rel.includes('\\')) return false;
  return rel.split('/').every(seg => /^\.?[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(seg) && !seg.endsWith('.'));
}

/** Null when a record or install path is safe to act on; otherwise why not (S6, L1). `throughLink` is the I/O test. */
export function skipReason(rel, throughLink, merged = []) {
  if (typeof rel !== 'string' || !rel || /^([\\/]|[A-Za-z]:)/.test(rel) || /(^|[\\/])\.\.([\\/]|$)/.test(rel)) return 'unsafe path';
  if (isProtected(rel, merged)) return 'protected path';
  if (!isCanonical(rel)) return 'non-canonical path';
  if (throughLink(rel)) return 'path through a link';
  return null;
}

const oneMd = (rel, dir) => Boolean(dir) && rel.startsWith(`${dir}/`) && /^[^/]+\.md$/.test(rel.slice(dir.length + 1));

/** A file of a skill folder the install copied where it could not link one (spec 0007 S7). */
const skillCopy = (rel, dir) => Boolean(dir) && rel.startsWith(`${dir}/`) && /^[a-z0-9][a-z0-9-]*\/(?:SKILL\.md|agents\/openai\.yaml)$/.test(rel.slice(dir.length + 1));

/**
 * Whether the install may act on `rel` for `harness`: the neutral home for the
 * pact's own files, and otherwise only a harness's rules file or a .md file
 * directly in its agents or commands folder. `targets` holds the target sets of
 * this run's harnesses and of the record's, so a harness taken out, or moved,
 * can still be cleared.
 */
export function inTargets(rel, harness, targets) {
  if (typeof rel !== 'string') return false;
  const neutral = rel.toLowerCase().startsWith(`${NEUTRAL_REL}/`);
  if (harness === PACT_ID) return neutral;
  return !neutral && targets.some(t => t.id === harness && (rel === t.rules || oneMd(rel, t.agents) || oneMd(rel, t.commands) || skillCopy(rel, t.skills)));
}

/** The live destinations of the copy set (S6, L1): each must be safe, and no two may fold to one name. */
export function installDestinations(checked, throughLink, merged = []) {
  const repoFiles = new Map();
  const sourceOf = new Map();
  const harnessOf = new Map();
  const seen = new Set();
  for (const [rel, { dest, sha256, harness }] of checked) {
    const why = skipReason(dest, throughLink, merged);
    if (why) refuse('dest-skip', `${why} for an install destination: ${formatPlain(dest)}.`);
    if (seen.has(dest.toLowerCase())) refuse('dest-twice', `two files install to ${dest}.`);
    seen.add(dest.toLowerCase());
    repoFiles.set(dest, sha256);
    sourceOf.set(dest, rel);
    harnessOf.set(dest, harness);
  }
  return { repoFiles, sourceOf, harnessOf };
}

// ------------------------------------------------------------ the skill links (spec 0007 S7, S9)

/** Each skill folder the harnesses are to hold: one per path, for the first harness that reads it. */
export function skillsWanted(harnesses, names) {
  const out = new Map();
  for (const h of harnesses) {
    if (!builtParts(h).skills) continue;
    for (const name of names) {
      const path = `${h.skills.dir}/${name}`;
      if (!out.has(path.toLowerCase())) out.set(path.toLowerCase(), { harness: h.id, path, target: `${SKILLS_DEST}${name}` });
    }
  }
  return [...out.values()];
}

/** Why a link, recorded or wanted, is not one the install may act on, or null: a skill's name directly in its harness's skills folder, pointing at that skill, through no linked folder. */
function linkReason(l, targets, throughLink, merged) {
  const cut = l.path.lastIndexOf('/');
  const dir = l.path.slice(0, cut);
  const name = l.path.slice(cut + 1);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || l.target !== `${SKILLS_DEST}${name}`) return 'unsafe path';
  if (!targets.some(t => t.id === l.harness && t.skills === dir)) return "path outside its harness's folders";
  // The path itself may be the link, so the link test stops at the folder that holds it.
  return skipReason(l.path, () => throughLink(dir), merged);
}

/**
 * What the skill folders need. `state(path, target)` is the live answer:
 * 'absent', 'ours' (a link to the target) or 'other'. `add` is linked, `copy`
 * copied (no link can be made, or the record already lists a copy), `keep`
 * linked already, `remove` a recorded link no harness takes, `yours` a path the
 * record doesn't list, left as is, `drift` a recorded link that became
 * something else, and `blocked` a wanted path the install may not act on, for
 * checkLinks. A recorded link that is gone is made again.
 */
export function linkPlan({ wanted, record, targets, state, canLink, throughLink, merged = [] }) {
  const out = { add: [], copy: [], keep: [], remove: [], yours: [], drift: [], blocked: [], warnings: [] };
  const files = record ? record.files : [];
  const copied = path => files.some(f => f.path?.toLowerCase().startsWith(`${path.toLowerCase()}/`));
  const recorded = new Map();
  for (const l of record ? record.links : []) {
    const why = linkReason(l, targets, throughLink, merged);
    if (why) out.warnings.push(`${why} in the install record, skipped: ${l.path}`);
    else recorded.set(l.path.toLowerCase(), l);
  }
  const changed = l => out.drift.push({ harness: l.harness, line: `${l.path} (the pact's skill link changed since the install)` });
  const taken = new Set();
  for (const w of wanted) {
    const why = linkReason(w, targets, throughLink, merged);
    if (why) {
      out.blocked.push({ path: w.path, why });
      continue;
    }
    const key = w.path.toLowerCase();
    taken.add(key);
    const now = state(w.path, w.target);
    if (recorded.has(key) && now !== 'absent') {
      if (now === 'ours') out.keep.push(w);
      else changed(w);
    } else if (copied(w.path)) out.copy.push(w);
    else if (now !== 'absent') out.yours.push(w);
    else (canLink ? out.add : out.copy).push(w);
  }
  for (const [key, l] of recorded) {
    if (taken.has(key)) continue;
    const now = state(l.path, l.target);
    if (now === 'ours') out.remove.push(l);
    else if (now !== 'absent') changed(l);
  }
  return out;
}

/** The first skill folder the install may not act on refuses, as a file's destination does. */
export function checkLinks({ blocked }) {
  if (blocked.length) refuse('dest-skip', `${blocked[0].why} for a skill folder: ${formatPlain(blocked[0].path)}.`);
}

/** A copied skill's files as destinations: each file the neutral home gets for it, installed into its folder as well. */
export const copyDestinations = (copy, destinations) => copy.flatMap(w => destinations
  .filter(([, d]) => d.dest.startsWith(`${w.target}/`))
  .map(([rel, d]) => [rel, { dest: `${w.path}${d.dest.slice(w.target.length)}`, sha256: d.sha256, harness: w.harness }]));

/** The folders a deleted skill copy may leave empty, deepest first. */
export function skillFolders(deleted, targets) {
  const out = new Set();
  for (const rel of deleted) {
    for (const { skills } of targets) {
      if (!skillCopy(rel, skills)) continue;
      const parts = rel.split('/');
      const root = skills.split('/').length + 1;
      for (let n = parts.length - 1; n >= root; n--) out.add(parts.slice(0, n).join('/'));
    }
  }
  return [...out].sort((a, b) => b.split('/').length - a.split('/').length);
}

/** The dry run's lines for one harness's links. */
export const linkLines = (plan, harness) => [
  ...plan.add.filter(l => l.harness === harness).map(l => `  link ${l.path} -> ${l.target}`),
  ...plan.remove.filter(l => l.harness === harness).map(l => `  unlink ${l.path}`),
];

export const NO_LINK_LINE = 'WARN: a skill link cannot be made on this machine, so each new skill folder is copied instead.';

/** The old builder agents' paths in Claude Code's agents folder, which a first install deletes (#262). */
export const retiredPaths = targets => targets.filter(t => t.id === 'claude' && t.agents).flatMap(t => RETIRED.map(r => `${t.agents}/${r.slice('agents/'.length)}`));

/**
 * The plan (S6, L2 and L3), from the record, the repo's files and each live
 * path's state ({ exists, file, sha256 }, by `live(rel)`): drift, overwrite,
 * add, delete and unchanged. A first install deletes only the retired agents.
 * `targets` bounds what a record entry may name, and holds the agents folders.
 */
export function plan(record, repoFiles, live, throughLink, targets = [], merged = []) {
  const drift = [];
  const overwrite = [];
  const add = [];
  let del = [];
  const warnings = [];
  // #262: an agent file the pact didn't write, or changed since it wrote it, is the person's: never overwritten, deleted or recorded.
  const yours = [];
  const isAgent = rel => targets.some(t => oneMd(rel, t.agents));
  let same = 0;
  if (record) {
    const entries = [];
    for (const e of record.files) {
      const why = skipReason(e.path, throughLink, merged) ?? (inTargets(e.path, e.harness, targets) ? null : "path outside its harness's folders");
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
  } else del = retiredPaths(targets).filter(r => live(r).exists);
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
 * line holds a harness's agents folder and the constant name only.
 */
export function retiredAgentLines(exists, deleting, dir) {
  return RETIRED_AGENTS.filter(a => exists(`${dir}/${a}.md`) && !deleting.includes(`${dir}/${a}.md`))
    .map(a => `WARN: ${dir}/${a}.md is named for ${a}, an agent the pact retired; the file is not the pact's, so the install leaves it as is.`);
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
  if (parsed.config.kind === 'default') {
    // The record holds the default's digest, and no configuration file, when the last install rendered the default.
    const lastDefault = record && record.digest && !record.config.size;
    const was = !record ? 'No install is recorded to compare with' : !lastDefault ? 'The last install did not render the pact\'s default' : record.digest === parsed.digest ? 'The default is unchanged since the last install' : 'The default CHANGED since the last install';
    return `WARN: SECURITY DEFAULTS: you have no configuration of your own, so the pact's default configuration (${DEFAULT_CONFIG_NAME}) renders; it edits ${parts.join(', ')}, which changes the pact's security defaults; read those parts in the rendered rules file before you install. ${was}.`;
  }
  const since = !record ? 'no install is recorded to compare with' : configStale(configNow(parsed), record.config) ? 'the configuration CHANGED since the last install' : 'the configuration is unchanged since the last install';
  return `WARN: SECURITY DEFAULTS: the user configuration edits ${parts.join(', ')}, which changes the pact's security defaults; read those parts in the rendered rules file before you install. ${since[0].toUpperCase()}${since.slice(1)}.`;
}

/**
 * The note line for a home Qualities edit with no Enough column (#278), or
 * null. The shipped cost rows reach a lens only through a quality's Enough, so
 * an edit that leaves the column out leaves every cost row limiting the review
 * itself (#377).
 * `rules` is the rendered rules file's text, which carries no marks. The
 * column counts when a table header that names Quality also names Enough, in
 * any position.
 */
export function enoughNoteLine(parsed, rules) {
  if (!parsed.edits.has('qualities')) return null;
  const cells = l => l.split('|').map(c => c.trim());
  const header = l => l.startsWith('|') && l.trimEnd().endsWith('|') && cells(l).includes('Quality');
  if (rules.split('\n').some(l => header(l) && cells(l).includes('Enough'))) return null;
  return "NOTE: the user configuration edits qualities, and its table has no Enough column, so the Cost limits limit the review itself rather than any quality's lenses; add an Enough column to the qualities you want them to hold back.";
}

/** The Configuration block, built from the renderer's parsed lines and the ids of the harnesses the hash covers. */
export function configBlock(parsed, rulesHash, record, ids = []) {
  // With two harnesses or more the hash is boundHash, which matches no one file.
  const hashLine = ids.length > 1 ? `  rendered rules of ${ids.join(', ')}, one hash over them all: sha256 ${rulesHash}` : `  rendered rules file: sha256 ${rulesHash}`;
  const last = record ? record.config : new Map();
  const now = configNow(parsed);
  const since = key => (!record ? 'no install recorded' : !last.has(key) ? 'new since the last install' : last.get(key) === now.get(key) ? 'unchanged since the last install' : 'CHANGED since the last install');
  const out = [];
  if (parsed.config.kind === 'none') {
    out.push('  no configuration');
    out.push(`  ${CHECKPOINTS_NOTE}`);
    if (last.size) out.push('  the last install had a configuration; this install removes it from the rules file');
    return out;
  }
  if (parsed.config.kind === 'default') {
    out.push(`  configuration: the pact's default, ${DEFAULT_CONFIG_NAME} (${parsed.digest}): you have no ${CONFIG_REL}`);
    // A person's own configuration that has gone is said, not only replaced.
    if (last.has('user')) out.push(`  the last install had your own configuration; ${CONFIG_REL} is gone now, so the pact's default renders in its place`);
    out.push(hashLine);
    for (const [k, v] of parsed.values) out.push(`  WARN: the pact's default configuration sets ${k} to ${v}.`);
    for (const [k, v] of parsed.retiredSettings) out.push(retiredSettingWarn(k, v, "the pact's default configuration", false));
    out.push(`  ${CHECKPOINTS_NOTE}`);
    for (const [k, e] of parsed.edits) out.push(`  WARN: the pact's default configuration edits ${k} (${e.op}).`);
    out.push(`  To keep the pact's own text instead, write a ${CONFIG_REL} of your own; docs/install.md says how.`);
    return out;
  }
  out.push(`  user file ${CONFIG_REL}: sha256 ${parsed.config.sha256}, ${since('user')}`);
  for (const [bp, sha] of parsed.blockHashes) out.push(`  block file ${BLOCKS_REL}/${bp}: sha256 ${sha}, ${since(`block ${bp}`)}`);
  const removed = [...last.keys()].filter(k => k.startsWith('block ') && !now.has(k)).length;
  if (removed) out.push(`  ${removed} block file(s) the last install read are no longer used`);
  out.push(`  configuration digest: ${parsed.digest}`);
  out.push(hashLine);
  for (const [k, v] of parsed.values) out.push(k === 'usage-pause' && v === 'off' ? '  WARN: the user configuration turns usage-pause off.' : `  WARN: the user configuration sets ${k} to ${v}.`);
  for (const [k, v] of parsed.retiredSettings) out.push(retiredSettingWarn(k, v, 'the user configuration', false));
  out.push(`  ${CHECKPOINTS_NOTE}`);
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
    '  This install fetches and installs none of them; a session here uses one only if you installed it yourself, or if a repo you work in carries a skill of that name, which it then uses.',
  ];
}

// ------------------------------------------------------------ binding and apply

/** A hash or commit given is always compared, dry run or --apply (S6, H1). */
export function checkBinding(opts, rulesHash, commit) {
  // `rulesHash` is the home install's bound hash (boundHash), or a project's rules file hash.
  if (opts.renderedHash !== null && opts.renderedHash !== rulesHash) {
    refuse('hash-mismatch', 'the hash given with --rendered-hash is not the full hash of the rules this run rendered: the configuration or the commit changed since the dry run, or the hash was cut short or mistyped.');
  }
  if (opts.commit !== null && opts.commit !== commit) refuse('commit-mismatch', 'the commit given with --commit is not the commit HEAD names now: the clone changed since the dry run, or the id was cut short or mistyped.');
}

/** --apply's own refusals (S6, X1), in order. */
export function checkApply({ configApplies, hashGiven, selfDiffers, drift, dirty, settingsObject, unrecorded = [] }) {
  if (configApplies && !hashGiven) refuse('apply-needs-hash', 'a configuration applies, so --apply needs the full rendered hash the dry run showed, given with --rendered-hash.');
  if (selfDiffers) refuse('apply-self-differs', 'this install script differs from the committed copy.');
  if (drift) refuse('apply-drift', 'installed files or settings entries changed since the last install. Whether to keep or replace those edits is the owner\'s decision; docs/install.md says how.');
  if (unrecorded.length) refuse('unrecorded-target', `${unrecorded.map(formatPlain).join(', ')} already exists and the install record does not list it. The pact owns the whole rules file: move your own text into your configuration and the file out of the way. After an install from before ~/.pact, follow the one-time removal in docs/install.md.`);
  if (dirty) refuse('apply-dirty', 'the working tree is not clean.');
  if (!settingsObject) refuse('apply-settings', "settings.json is not a strict JSON object, so the pact's guard cannot be merged into it; fix the file first.");
}

const REVIEW_LEFT = 'The review folder may hold what the review module wrote; nothing was installed.';

/** The runner's own refusals, each with its rule id, for what it finds on disk or in its own process. */
export const stops = Object.freeze({
  preload: () => refuse('run-preload', 'NODE_OPTIONS is set, or the runner was started with an option; start the install with node gate/install.mjs.'),
  runArgs: () => refuse('run-args', 'the install runner was not started by the install bootstrap: run node gate/install.mjs.'),
  stageUnreadable: () => refuse('stage-unreadable', 'the stage could not be read.'),
  reachableMissing: () => refuse('reachable-missing', "the install bootstrap wrote no list of this commit's history; run node gate/install.mjs from a clean checkout."),
  configLink: () => refuse('config-link', 'the user configuration file, or the .pact folder that holds it, is a link or other reparse point.'),
  configChanged: () => refuse('config-changed', 'the user configuration changed while the install ran; run the install again.'),
  homeWorkTree: () => refuse('home-work-tree', '--home is inside a git work tree; give a folder outside any repository.'),
  harnessKnownMissing: () => refuse('harness-known', 'the commit holds no harnesses/known.json.'),
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
  hooksNotObject: rel => refuse('hooks-not-object', `${formatPlain(rel)} is not a strict JSON object, so the pact's guard hook cannot be merged into it; fix the file first.`),
  hooksPath: (rel, why) => refuse('hooks-path', `${why} for a hooks file: ${formatPlain(rel)}.`),
  tempLeft: rel => refuse('temp-left', `a temp file the install writes through is already there: ${formatPlain(rel)}.pact-tmp. An earlier install stopped mid-write, and the file may hold a copy of your settings; check it, delete it, and run the install again.`),
});

// ------------------------------------------------------------ the backup (#272, S7 to S9)

export const BACKUPS_REL = '.pact/backups';
export const BACKUP_FORMAT = 'pact-backup-2';
/** A backup's folder name: the UTC time to the millisecond, the commit's short id, and a free suffix when that is taken. */
export const BACKUP_NAME_RE = /^\d{8}T\d{9}Z-[0-9a-f]{7}(-(0[2-9]|[1-9][0-9]))?$/;
export const backupName = (date, commit) => `${date.toISOString().replace(/[-:.]/g, '')}-${commit.slice(0, 7)}`;
/** What a run that ends between BACKUP STARTED and CHECKS DONE says, other than by the backup's own refusal. */
export const STAGING_LEFT = '.pact/backups may hold a staging folder with a copy of your settings: check it and delete it; the next dry run names it.';
export const backupKept = name => `The files it replaced are in ${BACKUPS_REL}/${name}; see Undo an apply in docs/install.md.`;

const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/**
 * The backup's entries, sorted by path (S7), each naming its harness: each
 * path the apply overwrites or deletes, with the hash the plan read
 * (`live(rel)`, memoised for the run); each path it adds, as absent; each
 * settings file the apply writes (`settings`: its path, harness and the hash of
 * the bytes the merge read, or null when it creates the file); the record
 * (`record`: its hash, or null when there is none).
 */
export function backupEntries({ copy, add, live, settings = [], record, harnessOf = () => PACT_ID, links = { add: [], remove: [] } }) {
  const out = [];
  for (const rel of copy) {
    const s = live(rel);
    if (!s || !s.file || !s.sha256) refuse('backup-source', `${formatPlain(rel)} is not a plain file, so the backup cannot copy it.`);
    out.push({ path: rel, harness: harnessOf(rel), was: 'file', sha256: s.sha256 });
  }
  for (const rel of add) out.push({ path: rel, harness: harnessOf(rel), was: 'absent' });
  for (const l of links.add) out.push({ path: l.path, harness: l.harness, was: 'absent' });
  for (const l of links.remove) out.push({ path: l.path, harness: l.harness, was: 'link', target: l.target });
  const one = (path, harness, sha) => (sha === null ? { path, harness, was: 'absent' } : { path, harness, was: 'file', sha256: sha });
  for (const f of settings) out.push(one(f.path, f.harness, f.sha256));
  out.push(one(RECORD_REL, PACT_ID, record));
  return out.sort(byPath);
}

/** The manifest, written last into a backup: two-space JSON, keys in a fixed order, entries sorted by path. */
export function manifestText({ commit, created, entries }) {
  const listed = [...entries].sort(byPath).map(e => (e.was === 'file' ? { path: e.path, harness: e.harness, was: 'file', sha256: e.sha256, bytes: e.bytes } : { path: e.path, harness: e.harness, was: e.was, ...(e.was === 'link' ? { target: e.target } : {}) }));
  return `${JSON.stringify({ format: BACKUP_FORMAT, commit, created, entries: listed }, null, 2)}\n`;
}

/** The dry run's backup line (S9): how many files the apply will copy, and whether settings.json is one. */
export const backupLine = (count, settings) => `Backup: ${count} file(s) to copy into ${BACKUPS_REL}/ before the first write${settings ? ' (settings.json included)' : ''}`;

/** The dry run's warning for staging folders an earlier apply left (S9): each name cleaned. */
export const stagingLine = names => `WARN: ${BACKUPS_REL} holds ${names.length} leftover staging folder(s) (${names.map(formatPlain).join(', ')}); each may hold a copy of your settings. Check and delete them; --apply refuses while they are there.`;

/** How many backups the prune keeps by name, this run's included (S8). */
export const BACKUP_KEEP = 10;
export const MANIFEST_CAP = 1024 * 1024;

/**
 * A backup candidate from its manifest's text (S8): null unless it is a
 * JSON object of this format with a list of entries. `noRecord` is true when
 * the backup was taken with no install record before it (q8).
 */
export function readManifest(name, text) {
  let m;
  try {
    m = JSON.parse(text);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object' || m.format !== BACKUP_FORMAT || !Array.isArray(m.entries)) return null;
  return { name, noRecord: m.entries.some(e => e && e.path === RECORD_REL && e.was === 'absent') };
}

/**
 * Which candidates the prune removes (S8), oldest first: it keeps the ten
 * newest, this run's (`own`) included, every one named after this run's, and
 * every one taken with no record. `later` counts those named after this run's.
 */
export function pruneSelect(candidates, own) {
  const rest = candidates.filter(c => c.name <= own).sort((a, b) => (a.name < b.name ? 1 : -1));
  const keep = new Set([own, ...rest.slice(0, BACKUP_KEEP).map(c => c.name)]);
  return { remove: rest.filter(c => !keep.has(c.name) && !c.noRecord).map(c => c.name).reverse(), later: candidates.filter(c => c.name > own).length };
}

/** The non-candidates line, for the dry run and the apply (S8): entries the prune never touches. */
export const othersLine = n => `WARN: ${BACKUPS_REL} holds ${n} entry(ies) the install does not recognise as backups; the prune leaves them as they are, and they may hold copies of your settings.`;

/** What the apply prints after its prune (S9): each pruned name, then the warnings. */
export function pruneLines({ pruned, later, others, failed }) {
  const out = [];
  if (pruned.length) out.push(`pruned ${pruned.length} old backup(s)`, ...pruned.map(n => `  ${formatPlain(n)}`));
  if (later) out.push(`WARN: ${BACKUPS_REL} holds ${later} backup(s) named later than this run's; the prune leaves them, and they may hold copies of your settings.`);
  if (others) out.push(othersLine(others));
  if (failed) out.push(`WARN: the prune of old backups in ${BACKUPS_REL} stopped on an error; what is left there is safe to keep, and the next apply tries again.`);
  return out;
}

/** The backup step's refusals (S7). A refusal after a full clean-up keeps "Nothing was changed."; one whose clean-up failed names the staging folder. */
export const backupStops = Object.freeze({
  link: rel => refuse('backup-link', `${formatPlain(rel)}, on the backup's path, is a link, another reparse point or not what the backup expects; move it out of the way, then run the install again.`),
  stagingLeft: n => refuse('backup-staging-left', `${BACKUPS_REL} holds ${n} staging folder(s) an earlier apply left; each may hold a copy of your settings. Check and delete them, then run the install again.`),
  nameTaken: () => refuse('backup-name-taken', `no free backup name is left in ${BACKUPS_REL} for this millisecond, or the name was taken while the install ran; run the install again.`),
  changed: rel => refuse('backup-changed', `${formatPlain(rel)} changed while the install ran; run the install again.`),
  mode: () => refuse('backup-mode', 'a backup file or folder can be read by other accounts on this machine; check the umask and the file system the home folder sits on, then run the install again.'),
  failed: () => refuse('backup-failed', 'the backup of the files this install replaces could not be written in full; check free space and that you can write to .pact/backups, then run the install again.'),
  cleanup: stagingRel => refuse('backup-cleanup', 'the backup failed, and what it wrote could not be removed.', `${stagingRel} may hold a copy of your settings: check it and delete it, then run the install again.`),
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
