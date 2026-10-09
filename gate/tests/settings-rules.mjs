// The settings guard's rule lists (#34), shared by settings.test.mjs (seam A)
// and settings-install.test.mjs (the install), so the two can't drift (#140,
// T6). The lists name the install script, so they live here: a test file that
// names it is in the install tier, and seam A's checks never install.
import { realOverlay } from './payload.mjs';

export const OVERLAY = 'claude/settings.overlay.json';

// The three characters PowerShell reads as a parameter's hyphen (#89): en
// dash, em dash and horizontal bar. Always written as escapes, never typed.
export const DASHES = ['\u2013', '\u2014', '\u2015'];

// The ask rules #165 adds, from #153's S10, in two lists by what they guard.
// Under Bash, which matches case exactly, each drops its first letter, as the
// `nstall.ps1` rules do.
//
// The Node install script's guard: its two files and the install record. They
// prompt on any command that names one, whatever the shell does to the words
// after it.
export const NODE_INSTALL_ASK = [
  'PowerShell(*install.mjs*)',
  'PowerShell(*install-run.mjs*)',
  'Bash(*nstall.mjs*)',
  'Bash(*nstall-run.mjs*)',
  'PowerShell(*.pact-install.json*)',
  'Bash(*.pact-install.json*)',
];
// The CI ruleset's guard (S11): a `gh` command naming rulesets or branch
// protection, so a session can't quietly turn the ruleset off through the
// owner's shared GitHub login. The Bash pair also catches GitHub's
// capitalised GraphQL names.
export const RULESET_ASK = [
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
  // #165: see NODE_INSTALL_ASK and RULESET_ASK.
  ...NODE_INSTALL_ASK,
  ...RULESET_ASK,
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
// #165's two guards beside them. Named one by one, so a rule added to the
// pact's list can't push one out.
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
  ...NODE_INSTALL_ASK,
  ...RULESET_ASK,
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
