# The pact keeps no rollback path to install.ps1

The live docs and the gate describe only the Node install. The supported rollback route to `scripts/install.ps1`, and the gate code and tests that existed only for it, are gone (#242). This supersedes [ADR 0048](0048-the-gates-tests-never-need-powershell.md) in part: its "what stays" bullets on the runner's rule that a test file naming `install.ps1` is in the install tier, that rule's two fixtures, and `docs/install.md`'s rollback note. It supersedes [ADR 0052](0052-the-ask-rules-no-longer-guard-a-rollback-to-install-ps1.md) in part: its "`docs/install.md` gives the step". The how-to now points to ADR 0052 for the text to search for, and keeps the warning and the two checks.

## What changed

- **The gate.** The dry run's gate block no longer prints the cutover line. That line printed only on the first Node install after an `install.ps1` install, and never after a rollback, because every older commit's gate files differ from today's. The `removed` and `added` lines still name each file. Two comments that described the old installer lose those words.
- **The test runner.** The install tier is exactly the test files that reach the install harness through relative imports. The rule that also put a file naming `install.ps1` there is gone, with its two fixtures and its two tests. No file changed tier: all 12 install-tier files were there by a harness import.
- **The settings tests.** The #217 tests that the old installer's rules stay out are gone. The allow-list is the control they sat on top of: a rule put back into the overlay alone fails as a rule outside it, and changing the allow-list takes the security route. One row stays, now on a generic rule: a rule put into the overlay alone fails `settings-value`, with its passing control that adds the rule to both files. The retired-rule constants, the two old-installer entries in the broad rules ADR 0049 retired, and the two old-installer rows of the mention fixtures are gone.
- **The docs.** `AGENTS.md`'s "Rolling back" and `docs/install.md`'s rollback section support rollback only to commits from the Node install's cutover (`6821d68`) on. Step 5's cleanup is one paragraph that names no old installer. The threat model words R22 as an attack path, not a documented route.

## The stop before a rollback

Before checking out a commit to roll back to, a session checks two things: the commit holds `gate/install.mjs`, and it descends from the cutover (`git merge-base --is-ancestor 6821d68 <commit>`). If either fails, it doesn't check the commit out, never runs an installer from it, and stops to ask the owner. From a commit that passes it runs only `gate/install.mjs`.

- **Why two checks.** `gate/install.mjs` arrived in the first part of #166, before the cutover deleted `scripts/install.ps1`, so the commits between them hold both installers. The first check alone would pass them.
- **Why the ancestor check, not a file check.** The plan named a check that the commit holds no `scripts/install.ps1`. That form would spell the old installer's name in the live docs, which this change removes. The ancestor check covers the same commits on `main`: no `.ps1` file was added under `scripts/` after the cutover. A check that `scripts/` holds no `.ps1` at all would not do: `check-skill-flags.ps1` was still there at the cutover.
- **Why before the checkout.** An older commit's own `AGENTS.md` presents its PowerShell installer as the route, and a session that has checked it out reads that file.

## What still holds

- **#217's risk acceptance stands (threat model R22).** Commits from before #166 stay in history. A fooled session can still check one out in any clone and run its installer's apply with no prompt. This change removes the supported route and the code for it, not the attack path. The stop above is text a session reads, not a control.
- **ADR and log bodies stay as written.** ADRs 0048 and 0052 gain a one-line pointer to this ADR, as the repo's convention does for a decision superseded in part.
- **`familiars/scout.contract.md` stays as written.** Its samples are a dated record of the owner's pick, and editing them would break scout's seal.

## Why

- **A route nobody will use is a route someone can be steered down.** The rollback note told a reader how to run the old installer. With no reason left to run it, the note only helped a fooled session.
- **Code that guards nothing still costs review.** The cutover line and the runner's name rule each guarded a transition that is over.
- **Not chosen: retargeting the runner's rule to the Node script's name.** `AGENTS.md` says a test that only reads the install script belongs in a file that never installs; a name rule would put such files in the install tier.

## How this was decided

- **2026-10-11** in mephistopheles4/the-pact#242: the owner chose to clean the live layer and keep the history (option A, from chat). Spec revision 3 and its correction 1 were read by the security pair, the spec pair and `unstated-lens`. The owner said "proceed, confirm all" through the head chef, and chose to merge #242 before #238's tickets, with the cloud copy regenerated in #242's own PR. The ancestor check replaced correction 1's file check at build time, as an auto-take the head chef confirmed.
