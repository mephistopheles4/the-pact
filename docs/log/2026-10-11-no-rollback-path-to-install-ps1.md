# No rollback path to install.ps1

**2026-10-11.** The live docs and the gate now describe only the Node install (mephistopheles4/the-pact#242). The rollback route to `scripts/install.ps1` is gone from `AGENTS.md`, `docs/install.md` and the threat model. So are the gate code and tests that existed only for it. The history stays: ADR and log bodies are untouched, and ADRs 0048 and 0052 gain a one-line pointer to ADR 0058, which records the cut.

## What it set out to do

The Node install (#166) replaced `scripts/install.ps1`, and #217 removed its ask rules. The current-state text still offered a rollback to it, and the gate still carried code for the switch from one installer to the other. The owner chose option A in chat: clean the live layer of the retired installer, and keep the history.

## What was built

- **The gate.** The dry run's gate block loses its cutover line, which explained the first Node install after an `install.ps1` install and never printed after a rollback. Two comments lose their mention of the old installer.
- **The test runner.** The install tier is now exactly the test files that reach the install harness through imports. The rule that also put a file naming `install.ps1` there is gone, with its two fixtures and two tests. All 12 install-tier files stayed in the tier, each by a harness import.
- **The settings tests.** The #217 tests that the old installer's rules stay out are gone. One row stays, on a generic rule: a rule put into the overlay alone fails `settings-value`, beside a control that passes with the rule on both files.
- **The docs.** Rollback is supported only to commits on the published `main` from the cutover, `6821d68`, on. Before checking out a target, a session resolves it to its full id and checks three things: it holds `gate/install.mjs`, it descends from the cutover, and it is on `main` as fetched by the repo's URL. If any check fails, it stops and asks the owner. Step 5's cleanup names no old installer by file. It lists the four Node broad rules ADR 0049 retired, and points to ADR 0052 for the older rules. It keeps the warning not to hand the settings file to a session, and the two checks. The threat model words R22 as an attack path with its boundary at the cutover, and the owner's acceptance of it stands.
- **The cloud copy** was regenerated and came out byte-identical. `AGENTS.md` is in the generator's payload list, but seam A never installs it.

## What the build found

- **#238 had grown to touch the same files.** #242's issue said the renovation (#238) would leave these files alone. #238's spec revision 6 is a four-ticket chain whose later tickets edit five files this change edits. That was a listed stop. The owner chose, through the head chef, to merge #242 first and regenerate the cloud copy in its own PR, so #238's tickets rebase onto it.
- **The planned rollback check spelled the name it was removing.** Correction 1 checked for `scripts/install.ps1` in the target commit, which put the old installer's name back into the docs and failed the change's own search. The build checks ancestry from the cutover instead, which covers the same commits on `main`. A check that `scripts/` holds no PowerShell file would have been wrong: `check-skill-flags.ps1` was still there at the cutover.
- **Move 4 tightened the stop.** `adversarial-lens` showed that a commit pushed to a fork on top of the cutover passed both planned checks, and that a short id can be shadowed by a tag. The stop gained the main bound and full ids. Three lenses found the docs gave the checkout before the checks, and the threat model drew its boundary at #166 instead of the cutover; both were fixed. The checks were then run on real commits, and each commit landed where the docs say.
- **One rule had arrived after the plan.** #241 added a clause on the runner's install-tier name rule to "Writing a gate test" after the spec's base commit. It went with the rule.

## Record

- The spec, revision 3 with correction 1: mephistopheles4/the-pact#242 (comments 6111775754 and 6111811241); revisions 1 and 2: 6111661216 and 6111723633.
- Its reviews and dispositions: the security pair on revision 1 (6111712797, 6111723821); `unstated-lens` and the spec pair on revision 2 (6111744207, 6111755398, 6111775890).
- The owner's decisions on #242: the head chef's O1 to O3 (6111668494); proceed and confirm all, with the hand-off (6111822168); merge first, from the build's stop (6111863836, answered in 6111950712).
- The build record, claims and test cuts: 6111950712.
- Move 4's reports, as crossed sections on #242: the standards pair (6112060702), `unstated-lens` (6112060905), the security pair (6112071547) and the QA pair (6112112033).
- Move 4's Lens dispositions, the rollback checks run on real commits, and the claims as now written: 6112252465.
- The rebase note for #238's tickets: mephistopheles4/the-pact#238 (comment 6112253722).
- The PR: #252.
