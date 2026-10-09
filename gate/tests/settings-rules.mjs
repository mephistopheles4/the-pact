// The settings guard's rule lists (#34), shared by settings.test.mjs (seam A)
// and settings-install.test.mjs (the install), so the two can't drift (#140,
// T6). The lists name the install script, so they live here: a test file that
// names it is in the install tier, and seam A's checks never install.
import { realOverlay } from './payload.mjs';

export const OVERLAY = 'claude/settings.overlay.json';

// The three characters PowerShell reads as a parameter's hyphen (#89): en
// dash, em dash and horizontal bar. Always written as escapes, never typed.
export const DASHES = ['\u2013', '\u2014', '\u2015'];

// The Node install script's ask rules (#165, from #153's S10). They name the
// script's two files and the install record, so they prompt on any command
// that names one, whatever the shell does to the words after it. The `gh`
// rules catch ruleset and branch-protection commands; under Bash, which
// matches case exactly, each drops its first letter, as the `nstall` rules do.
export const NODE_GUARD_ASK = [
  'PowerShell(*install.mjs*)',
  'PowerShell(*install-run.mjs*)',
  'Bash(*nstall.mjs*)',
  'Bash(*nstall-run.mjs*)',
  'PowerShell(*.pact-install.json*)',
  'Bash(*.pact-install.json*)',
  'PowerShell(*gh*ruleset*)',
  'PowerShell(*gh*protection*)',
  'Bash(*gh*uleset*)',
  'Bash(*gh*rotection*)',
];

// The pact's "ask" rules, as #34 and its pre-build review settled them.
export const PACT_ASK = [
  'PowerShell(./scripts/install.ps1 -Apply)',
  'PowerShell(*install.ps1*-A*)',
  'Bash(*nstall.ps1*-A*)',
  'Bash(*nstall.ps1*-a*)',
  // #89: a splat, and each dash PowerShell takes in place of the hyphen.
  'PowerShell(*install.ps1* @*)',
  'PowerShell(*install.ps1*\u2013*)',
  'PowerShell(*install.ps1*\u2014*)',
  'PowerShell(*install.ps1*\u2015*)',
  'Bash(*nstall.ps1* @*)',
  'Bash(*nstall.ps1*\u2013*)',
  'Bash(*nstall.ps1*\u2014*)',
  'Bash(*nstall.ps1*\u2015*)',
  // #165: the Node install script's guard, landed before the script (#153,
  // S10): any command naming it or the install record, and any `gh` command
  // naming rulesets or branch protection.
  ...NODE_GUARD_ASK,
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
  'Edit(~/.claude/pact/**)',
];

// The apply-step rules, hard-coded in seam A as the permission mode is, and
// the Node script's guard beside them (#165). Named one by one, so a rule
// added to the pact's list can't push one out.
export const APPLY_ASK = [
  'PowerShell(./scripts/install.ps1 -Apply)',
  'PowerShell(*install.ps1*-A*)',
  'Bash(*nstall.ps1*-A*)',
  'Bash(*nstall.ps1*-a*)',
  'PowerShell(*install.ps1* @*)',
  'PowerShell(*install.ps1*\u2013*)',
  'PowerShell(*install.ps1*\u2014*)',
  'PowerShell(*install.ps1*\u2015*)',
  'Bash(*nstall.ps1* @*)',
  'Bash(*nstall.ps1*\u2013*)',
  'Bash(*nstall.ps1*\u2014*)',
  'Bash(*nstall.ps1*\u2015*)',
  ...NODE_GUARD_ASK,
];
// The cross script's rule, hard-coded in seam A beside them.
export const CROSS_ASK = 'Edit(~/.claude/pact/**)';

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
