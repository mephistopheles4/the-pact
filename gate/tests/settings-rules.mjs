// The settings guard's rule lists (#34), shared by settings.test.mjs (seam A)
// and settings-install.test.mjs (the install), so the two can't drift (#140,
// T6). The lists name the install script, so they live here: a test file that
// names it is in the install tier, and seam A's checks never install.
import { realOverlay } from './payload.mjs';

export const OVERLAY = 'claude/settings.overlay.json';

// The three characters PowerShell reads as a parameter's hyphen (#89): en
// dash, em dash and horizontal bar. Built from their codes, never typed, so no
// source file holds one; the rule files write them as \u escapes.
export const DASHES = [0x2013, 0x2014, 0x2015].map(c => String.fromCharCode(c));

// The apply guard asks on an apply, not a mention (#210, ADR 0049). Under
// Bash, whose match the docs leave open, each name drops its first letter, as
// before, so a capitalised name still matches.
//
// The Node installer: the one flag spelling the script reads, anywhere; then,
// after each of its two names, what hands the script a word the rule can't
// read. PowerShell passes a dash-like character to a native program as typed,
// and the script refuses it, so the Node rules need no dash forms. A quote
// that splits the flag before its "a" sits right after a dash (#210, round 2).
// Under Bash, a doubled backslash backs up the single one, in case the live
// matcher reads a backslash before a star as an escape.
const NODE_NAMES = { PowerShell: ['install.mjs', 'install-run.mjs'], Bash: ['nstall.mjs', 'nstall-run.mjs'] };
const AFTER = { PowerShell: ['--a', '$', '@', '(', '%', '`', '-"', "-'"], Bash: ['--a', '$', '`', '\\', '\\\\', '-"', "-'"] };
export const NODE_INSTALL_ASK = [
  'PowerShell(*--apply*)',
  'Bash(*--apply*)',
  ...['PowerShell', 'Bash'].flatMap(tool => NODE_NAMES[tool].flatMap(n => AFTER[tool].map(a => `${tool}(*${n}*${a}*)`))),
  // A dry run that writes the owner's rendered rules to a folder still asks:
  // its option wherever the script is named, and after the name its first
  // letter, which no other dry-run option starts with.
  'PowerShell(*--review-folder*)',
  'Bash(*--review-folder*)',
  'PowerShell(*install.mjs*--r*)',
  'Bash(*nstall.mjs*--r*)',
];
// Rules no apply row needs alone, by design: each backs up another rule that
// catches every form it does under the model.
export const BACKUP_ASK = [
  'PowerShell(./scripts/install.ps1 -Apply)',
  'Bash(*nstall.mjs*\\\\*)',
  'Bash(*nstall-run.mjs*\\\\*)',
];

// The old PowerShell installer, which a rollback runs: ADR 0020's apply-step
// spellings, the splat without its space, and the forms D1 covers for Node.
// PowerShell binds this script's own parameters, so the three dashes stay.
export const OLD_INSTALL_ASK = [
  'PowerShell(./scripts/install.ps1 -Apply)',
  'PowerShell(*install.ps1*-A*)',
  'PowerShell(*install.ps1*@*)',
  ...DASHES.map(d => `PowerShell(*install.ps1*${d}*)`),
  'PowerShell(*install.ps1*$*)',
  'PowerShell(*install.ps1*(*)',
  'PowerShell(*install.ps1*%*)',
  'PowerShell(*install.ps1*`*)',
  'Bash(*nstall.ps1*-A*)',
  'Bash(*nstall.ps1*-a*)',
  'Bash(*nstall.ps1*@*)',
  ...DASHES.map(d => `Bash(*nstall.ps1*${d}*)`),
  'Bash(*nstall.ps1*$*)',
  'Bash(*nstall.ps1*`*)',
];

// The install record, kept broad: it is the dry run's drift baseline, and a
// write to it has no closed set of spellings (#210, D3).
export const RECORD_ASK = ['PowerShell(*.pact-install.json*)', 'Bash(*.pact-install.json*)'];

// The CI ruleset's guard (S11), kept broad: a `gh` command naming rulesets or
// branch protection (#210, D4). The Bash pair also catches GitHub's
// capitalised GraphQL names.
export const RULESET_ASK = [
  'PowerShell(*gh*ruleset*)',
  'PowerShell(*gh*protection*)',
  'Bash(*gh*uleset*)',
  'Bash(*gh*rotection*)',
];

// The broad installer rules ADR 0049 retired: any command naming the files.
// The matcher table's control shows they ask on a mention.
export const BROAD_INSTALL_ASK = [
  'PowerShell(*install.ps1*)',
  'Bash(*nstall.ps1*)',
  'PowerShell(*install.mjs*)',
  'PowerShell(*install-run.mjs*)',
  'Bash(*nstall.mjs*)',
  'Bash(*nstall-run.mjs*)',
];

// The install's rules, hard-coded in seam A as the permission mode is. Named
// one by one, so a rule added to the pact's list can't push one out.
export const APPLY_ASK = [...OLD_INSTALL_ASK, ...NODE_INSTALL_ASK, ...RECORD_ASK, ...RULESET_ASK];
// The cross script's rule, hard-coded in seam A beside them.
export const CROSS_ASK = 'Edit(~/.claude/pact/**)';

// The pact's "ask" rules, as #34 and its pre-build review settled them.
export const PACT_ASK = [
  ...APPLY_ASK,
  'Edit(~/.claude/agents/**)',
  'Edit(~/.claude/settings.json)',
  'Edit(~/.claude/CLAUDE.md)',
  'Edit(~/.claude/.pact-install.json)',
  'Edit(~/.claude.json)',
  'Edit(~/.claude/skills/**)',
  'Edit(~/.claude/plugins/**)',
  'Edit(~/.claude/output-styles/**)',
  'Edit(~/.claude/commands/**)',
  // The installed cross script (#45).
  CROSS_ASK,
];

// ------------------------------------------------------------ a model of Claude Code's matcher (#210, S2)

// From Claude Code's permissions docs, read on 2026-10-10: `*` matches any
// text, spaces included, anywhere in a rule; PowerShell rules match without
// regard to case, and Bash rules are taken as exact, which the docs leave
// open; a compound command is split on its separators and an ask rule fires
// when any part matches. Escapes and continuations are not modelled, so this
// can't show what the live matcher does with them (#210, S5 c).
const SEPARATORS = /&&|\|\||\|&|[;|&\n]/;

/** Whether `rule` (`Tool(pattern)`) matches the whole of `part` run under `tool`. */
function ruleMatches(rule, tool, part) {
  const m = /^(\w+)\(([\s\S]*)\)$/.exec(rule);
  if (!m || m[1] !== tool) return false;
  const source = m[2].split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*');
  return new RegExp(`^${source}$`, tool === 'PowerShell' ? 'i' : '').test(part.trim());
}

/** Whether a command run under `tool` asks under `rules`: any part of it, split on the separators, matches any rule. */
export function asks(rules, tool, command) {
  return command.split(SEPARATORS).some(part => rules.some(rule => ruleMatches(rule, tool, part)));
}

// Commands that change something, each of which must ask. [tool, command, why]
export const APPLY_COMMANDS = [
  ['PowerShell', '$env:NODE_OPTIONS = $null; node gate/install.mjs --claude-home C:\\h --apply --commit 0123456789abcdef0123456789abcdef01234567', 'the apply line a dry run prints'],
  ['Bash', 'env -u NODE_OPTIONS node gate/install.mjs --apply --commit 0123456789abcdef0123456789abcdef01234567', 'the POSIX apply line'],
  ['PowerShell', '$s = "gate/install.mjs"; node $s --apply --commit abc', 'the name in one statement and the flag in another'],
  ['PowerShell', 'Get-Item gate/install.mjs | ForEach-Object { node $_.FullName --apply --commit abc }', 'the name in one pipeline stage and the flag in another'],
  ['PowerShell', 'node gate/install.mjs --a"pply" --commit abc', 'the flag split by quotes after --a'],
  ['PowerShell', 'node gate/install.mjs $flag --commit abc', 'the flag in a variable'],
  ['PowerShell', 'node gate/install.mjs $(Get-Flag) --commit abc', 'the flag from a subexpression'],
  ['PowerShell', 'node gate/install.mjs @params', 'a splat'],
  ['PowerShell', 'node gate/install.mjs (Get-Flag) --commit abc', 'a parenthesised expression'],
  ['PowerShell', "node gate/install.mjs ('--ap' + 'ply') --commit abc", 'a parenthesised expression of two pieces'],
  ['PowerShell', 'node gate/install.mjs --% %FLAG%', 'an environment variable after the stop-parsing token'],
  ['PowerShell', 'node gate/install.mjs -`-apply --commit abc', 'a backtick escape before the flag'],
  ['PowerShell', 'node gate/install.mjs --claude-home C:\\h `', 'a backtick line wrap after the name'],
  ['PowerShell', 'node gate/install.mjs --"apply" --commit abc', 'the flag split by double quotes before its a'],
  ['PowerShell', "node gate/install.mjs --'apply' --commit abc", 'the flag split by single quotes before its a'],
  ['PowerShell', 'node gate/install.mjs "-"-apply --commit abc', 'the flag split by quotes between its dashes'],
  ['Bash', 'node gate/install.mjs --claude-home /h \\', 'a backslash line wrap after the name'],
  ['Bash', 'node gate/install.mjs --claude-home /h \\\\', 'two backslashes after the name'],
  ['Bash', 'node gate/install.mjs --a"pply" --commit abc', 'the flag split by quotes after --a, under Bash'],
  ['Bash', 'node gate/install.mjs "$FLAG" --commit abc', 'the flag in a variable, under Bash'],
  ['Bash', 'node gate/install.mjs `get-flag` --commit abc', 'the flag from a command substitution, under Bash'],
  ['Bash', 'node gate/install.mjs `printf -- --apply`', 'the flag spelled out in a command substitution, under Bash'],
  ['Bash', 'node gate/install.mjs --"apply" --commit abc', 'the flag split by double quotes before its a, under Bash'],
  ['Bash', "node gate/install.mjs --'apply' --commit abc", 'the flag split by single quotes before its a, under Bash'],
  ['Bash', 's=gate/install.mjs; node "$s" --apply --commit abc', 'the name in one statement and the flag in another, under Bash'],
  ['PowerShell', 'node gate/install-run.mjs C:\\w 0123 3 no -- --apply', 'the runner started by hand'],
  ['PowerShell', 'node gate/install-run.mjs C:\\w 0123 3 no -- --a"pply"', 'the runner, the flag split by quotes after --a'],
  ['PowerShell', 'node gate/install-run.mjs C:\\w 0123 3 no -- $flag', 'the runner, the flag in a variable'],
  ['PowerShell', 'node gate/install-run.mjs @params', 'the runner, a splat'],
  ['PowerShell', 'node gate/install-run.mjs (Get-Args)', 'the runner, a parenthesised expression'],
  ['PowerShell', 'node gate/install-run.mjs --% %ARGS%', 'the runner, the stop-parsing token'],
  ['PowerShell', 'node gate/install-run.mjs C:\\w 0123 3 no -- -`-apply', 'the runner, a backtick escape'],
  ['PowerShell', 'node gate/install-run.mjs C:\\w 0123 3 no -- --"apply"', 'the runner, the flag split by double quotes'],
  ['PowerShell', "node gate/install-run.mjs C:\\w 0123 3 no -- --'apply'", 'the runner, the flag split by single quotes'],
  ['Bash', 'node gate/install-run.mjs /w 0123 3 no -- --a"pply"', 'the runner, the flag split by quotes after --a, under Bash'],
  ['Bash', 'node gate/install-run.mjs /w 0123 3 no -- "$FLAG"', 'the runner, the flag in a variable, under Bash'],
  ['Bash', 'node gate/install-run.mjs /w 0123 3 no -- `get-flag`', 'the runner, a command substitution, under Bash'],
  ['Bash', 'node gate/install-run.mjs /w 0123 3 no \\', 'the runner, a backslash line wrap, under Bash'],
  ['Bash', 'node gate/install-run.mjs /w 0123 3 no -- --"apply"', 'the runner, the flag split by double quotes, under Bash'],
  ['Bash', "node gate/install-run.mjs /w 0123 3 no -- --'apply'", 'the runner, the flag split by single quotes, under Bash'],
  ['PowerShell', 'node gate/install.mjs --review-folder D:\\review', "a dry run that writes the owner's rendered rules to a folder"],
  ['PowerShell', '$s = "gate/install.mjs"; node $s --review-folder D:\\review', 'a review-folder dry run with the name in another statement'],
  ['Bash', 's=gate/install.mjs; node "$s" --review-folder /review', 'a review-folder dry run with the name in another statement, under Bash'],
  ['PowerShell', 'node gate/install.mjs --r"eview-folder" D:\\review', 'the review-folder option split by quotes after --r'],
  ['Bash', "node gate/install.mjs --r'eview-folder' /review", 'the review-folder option split by quotes after --r, under Bash'],
  ['PowerShell', './scripts/install.ps1 -Apply', 'the old installer, by its path'],
  ['PowerShell', 'pwsh -File scripts/install.ps1 -ap', 'the old installer, a prefix of its switch'],
  ['PowerShell', 'pwsh scripts/install.ps1@p', 'the old installer, a splat with no space'],
  ['PowerShell', 'pwsh scripts/install.ps1 @p', 'the old installer, a splat with a space'],
  ...DASHES.map(d => ['PowerShell', `pwsh scripts/install.ps1 ${d}Apply`, `the old installer, ${shown(d)} for the hyphen`]),
  ['PowerShell', 'pwsh scripts/install.ps1 $sw', 'the old installer, its switch in a variable'],
  ['PowerShell', 'pwsh scripts/install.ps1 $(Get-Sw)', 'the old installer, its switch from a subexpression'],
  ['PowerShell', 'pwsh scripts/install.ps1 (Get-Sw)', 'the old installer, a parenthesised expression'],
  ['PowerShell', 'pwsh scripts/install.ps1 --% %SW%', 'the old installer, the stop-parsing token'],
  ['PowerShell', 'pwsh scripts/install.ps1 -`Apply', 'the old installer, a backtick escape'],
  ['Bash', 'pwsh -File scripts/install.ps1 -a', 'the old installer, under Bash'],
  ['Bash', 'pwsh -File scripts/install.ps1 -Apply', 'the old installer, its switch capitalised, under Bash'],
  ['Bash', 'pwsh scripts/install.ps1 @p', 'the old installer, a splat, under Bash'],
  ...DASHES.map(d => ['Bash', `pwsh scripts/install.ps1 ${d}Apply`, `the old installer, ${shown(d)} for the hyphen, under Bash`]),
  ['Bash', 'pwsh scripts/install.ps1 "$SW"', 'the old installer, its switch in a variable, under Bash'],
  ['Bash', 'pwsh scripts/install.ps1 `get-sw`', 'the old installer, a command substitution, under Bash'],
  ['PowerShell', 'Set-Content ~/.claude/.pact-install.json "{}"', 'a write to the install record'],
  ['Bash', 'echo {} > ~/.claude/.pact-install.json', 'a write to the install record, under Bash'],
  ['PowerShell', 'gh api -X DELETE repos/o/r/rulesets/1', 'a ruleset write'],
  ['PowerShell', 'gh api -X PUT repos/o/r/branches/main/protection', 'a branch-protection write'],
  ['Bash', 'gh api -X DELETE repos/o/r/rulesets/1', 'a ruleset write, under Bash'],
  ['Bash', 'gh api -X PUT repos/o/r/branches/main/protection', 'a branch-protection write, under Bash'],
];

// Commands that change nothing, each of which must run. [tool, command, why]
export const MENTION_COMMANDS = [
  ['PowerShell', 'git diff -- gate/install.mjs gate/install-run.mjs', 'a diff'],
  ['PowerShell', 'Get-Content gate/install.mjs', 'a read'],
  ['PowerShell', 'Select-String -Path gate/install-run.mjs -Pattern parseArgs', 'a search'],
  ['Bash', 'grep -n parseArgs gate/install.mjs', 'a search, under Bash'],
  ['PowerShell', '$env:NODE_OPTIONS = $null; node gate/install.mjs', 'a dry run'],
  ['Bash', 'env -u NODE_OPTIONS node gate/install.mjs', 'a dry run, under Bash'],
  ['PowerShell', 'node gate/install.mjs --project-folder C:\\proj', 'a project dry run'],
  ['PowerShell', 'node gate/install.mjs --claude-home "C:\\tmp\\home"', 'a dry run with a double-quoted throwaway home'],
  ['PowerShell', "node gate/install.mjs --claude-home 'C:\\tmp\\home'", 'a dry run with a single-quoted throwaway home'],
  ['Bash', 'node gate/install.mjs --claude-home "/tmp/home"', 'a dry run with a quoted throwaway home, under Bash'],
  ['PowerShell', 'git log --oneline -- scripts/install.ps1', "the old installer's history"],
  ['Bash', 'git show 0980943:scripts/install.ps1', 'the old installer read from history'],
];

/** Today's overlay as an object, changed by `edit`, as JSON text. */
export function overlayWith(edit) {
  const o = JSON.parse(realOverlay());
  edit(o);
  return `${JSON.stringify(o, null, 2)}\n`;
}

/** A rule as the dry run should print it: anything outside printable ASCII, and the backslash, as a \u-and-four-hex-digits escape. */
export function shown(rule) {
  return rule.replace(/[^\x20-\x5b\x5d-\x7e]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
