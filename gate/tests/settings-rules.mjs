// The settings guard's shared test data (#34), used by settings.test.mjs (seam
// A) and settings-install.test.mjs (the install), so the two can't drift (#140,
// T6). Since #265 the pact sets no ask rules; what is left is the list of the
// rules it retired, which the install takes out of a live file.
import { realOverlay } from './payload.mjs';

export const OVERLAY = 'claude/settings.overlay.json';

// #265 C5: the pact's retired ask rules, frozen as a literal. The first 52 are
// the overlay's ask list on main at d2cd915, in its order; the last four are the
// broad installer rules ADR 0049 retired. The install's own copy must equal it.
export const RETIRED_RULES = Object.freeze([
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
