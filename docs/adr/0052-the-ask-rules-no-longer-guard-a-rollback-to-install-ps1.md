# The ask rules no longer guard a rollback to install.ps1

The 18 ask rules that guarded the old PowerShell installer's apply step are gone from the settings overlay, the settings allow-list and seam A's required list. A rollback that runs an older commit's `install.ps1` with its apply switch now runs without a prompt. This supersedes [ADR 0049](0049-the-apply-guard-asks-on-an-apply-not-a-mention.md) in part: its "old PowerShell installer, 18 rules" item, and its "Seam A requires all 60", which is now 42. It also ends the "what stays" bullet in [ADR 0048](0048-the-gates-tests-never-need-powershell.md) on the `install.ps1` ask rules.

## What changed

- **The rules.** The 10 PowerShell and 8 Bash rules that watched what follows `install.ps1` (its apply switch, a splat, the three dashes PowerShell reads as a hyphen, and the words a rule can't read) leave both files. The other 52 ask rules stay as they were: the Node installer's 36, the install record's 2, the ruleset and protection rules' 4, and the 10 `Edit(...)` rules. No rule is added.
- **Seam A** requires 42 rules (Node 36, record 2, ruleset 4) and the cross script's rule. Its `DASHES` constant is gone, since nothing there used it. Every overlay rule must still be on the allow-list, so an `install.ps1` rule put back into the overlay alone fails as a rule outside it. Changing the allow-list takes the security route.
- **The tests.** The near-miss table's six hyphen-for-dash rows are deleted, and its two splat rows guard the Node rules `PowerShell(*install.mjs*@*)` and `PowerShell(*install-run.mjs*@*)`, so ADR 0020's miss (d) stays guarded for the installer that ships. Every pact ask rule must now be printable ASCII, with no exception for the dashes. New cases show that no rule names the old installer, that a seam A still requiring one would refuse today's overlay, and that one put back into the overlay alone fails.
- **The owner's live settings are cleaned by hand.** The install only adds rules. After installing this pact, the owner deletes every line in `permissions.ask` that contains `nstall.ps1`, and checks two things: the editor's search finds no match, and a fresh dry run shows no warning that `settings.json` lacks a pact rule or is not a strict JSON object, and shows `settings.json: unchanged`. No session reads or edits the live file, which can hold API keys. `docs/install.md` gives the step.

## The accepted risk (threat model R22)

A fooled session, one in auto mode steered by text it read such as a tracker comment, can roll the live pact back to any older one without a prompt. In any clone it can check out a commit from before #166 from history, and run that commit's `install.ps1` with its apply switch. The installer replaces the live rules file and agents with the older pact, which lacks later defences such as the rules on whose tracker text counts, and every later session runs under it until the owner reinstalls.

- **The file mode too.** On Linux or macOS the old installer also widens `settings.json`'s mode, so other local users can read any key in it (the threat model's #177 note). That now happens with no prompt as well. The next Node dry run warns of it.
- **Drift does not show it.** Both installers write the same install record, so the record moves with the files. The next Node dry run does show it: the record names an older commit, the gate line says the gate changed or wasn't recorded, and the pact's files are listed under Overwrite.
- **What remains:** the installed go-ahead clause, which the same injection could target, and Claude Code's own auto-mode checks, which aren't documented to stop this.

## Why

- **The rules had no remaining job.** `install.ps1` left the repo in #204. The rules matched only a command naming it, so only an old checkout could trigger them, and that is the case the owner accepted.
- **It adds a little, not a new class.** The threat model already accepts that a session's shell command can write the Claude home folder without a prompt. Only the owner ever ran `install.ps1`.
- **Not chosen: a backstop.** The adversarial lens offered keeping two or three of the old apply-switch rules, which since #210 ask only on an apply. That would undo part of the owner's decision to remove them. The owner made no objection to the spec's recommendation, so none is kept.
- **By hand, not by the install.** As ADR 0049 did for its six broad rules: the install never removes rules, and the dry run gets no new warning. A pattern, not a list of lines, because three of the rules hold dash characters that look like hyphens on screen, and the pattern also catches the two stale splat-with-space variants #210 dropped.

## How this was decided

- **2026-10-10** in mephistopheles4/the-pact#217: the owner accepted the risk of a rollback to `install.ps1` and chose the by-hand cleanup, both from chat. Spec revisions 1 to 3 are on #217, read by the security pair, the spec pair and `unstated-lens`. The owner approved revision 3 with no backstop. Built in #218.
