# A Node install script, started by an install prompt

**2026-10-09** — The PowerShell installer is being replaced by a Node install script (mephistopheles4/the-pact#153). The work is cut into three tickets: T1 (#165), T2 (#166) and T3, the cutover (#167). Each ticket adds its part here. The ADRs, including the apply guard's ADR that supersedes [ADR 0020](../adr/0020-the-apply-guard-catches-what-text-can.md), are written at the cutover.

## T1: the apply guard lands first (#165)

Ten ask rules from the spec's S10 now sit beside the twelve `install.ps1` rules. They were installed with today's `install.ps1`, before any Node script exists, so the first Node `--apply` will already be guarded. They are not yet proved live: the owner skipped the probe after the install.

### What was built

- **Ten rules in four places.** They went into the settings overlay, the settings allow-list, seam A's required list and the tests' rule lists. They are:
  - six that name the Node script's two files (`install.mjs`, `install-run.mjs`) or the install record (`.pact-install.json`), under PowerShell and Bash;
  - four that catch a `gh` command naming rulesets or branch protection, the CI ruleset's guard (S11).

  Under Bash, which matches case exactly, each rule drops its first letter.
- **Test-first.**
  - **The red commit (`c8c1a87`)** held the data and the tests, with seam A unchanged. Ten tests failed, one per rule: "stays required when both the allow-list and the overlay drop it". Each failed because seam A passed an overlay without the rule.
  - **The green commit (`89101db`)** extended seam A's list.
- **The how-to.** `docs/install.md` says what the new rules ask before. It also says that the `gh` rules match the letters `gh` anywhere before the word, so an ordinary word like "through" can make a command ask.
- **The cloud copies were not regenerated,** on the owner's decision. `gen.ps1` would have rewritten about 1,700 lines in each setup script, because the copies have been stale since #34 (#111). #181 is replacing that generator and adding a freshness test, so whichever of #165 and #181 merges second regenerates. Until then, cloud sessions lack the ten rules. That includes the four `gh` rules, which guard a ruleset that is already active.

### The probe

- **Expected results** went on #153 before any run. There was one stand-in per S10 spelling class, plus the install record, the four `gh` rules and two negative controls.
- **The control run, before the install.** No stand-in prompted. The probe session first refused to run at all, until the owner confirmed the pasted probe was theirs. After auto mode's classifier refused the plain `install.mjs --apply` (P1), the session declined P2 to P8, B1 and B2 as disguised retries of a refused command. So three rules have no control data: `PowerShell(*install-run.mjs*)`, `Bash(*nstall.mjs*)` and `Bash(*nstall-run.mjs*)`. The record, P9 and B3, and the four `gh` rules, P10, P11, B4 and B5, ran unprompted.
- **The install.** On the owner's go-ahead and the lead's go, `install.ps1 -Apply` installed `89101db`, exit 0, with every file verified. A script check found that the live settings hold all 32 overlay ask rules.
- **The probe after the install was skipped,** on the owner's word: "Skip the probe". None of the ten rules has been seen to prompt live. That falls short of the ticket and of AGENTS.md's probe floor for the settings guard, and it is recorded as a deviation. A five-minute shortened step list is on #153 for the cutover's first Node apply.
- **What the owner said about the floor.** The probe cost more than it seemed to buy here: it needed fresh, interactive sessions the owner starts, and the model in them pushed back on the probe's own steps. The owner asked whether this is "a test with a lot of work in advance" for a risk not seen in the field. The answer given was partly yes: the risk is reasoned, not observed. The live check that matters is the one after the install, and the before-install control mostly settles which rule made a prompt.

### Move 4

- **Tests.**
  - **Windows:** the full suite passes, and so does the no-loss compare: `RESULT: compare pass, unchanged 1527, moved 124, new 446`.
  - **The Linux container (#96, Node 20):** the only failures are the four `node:sqlite` practice-scorer cases, which `main` fails the same way. #149 tracks them. The owner accepted that as a pass.
  - **The final commit, after move 4's fixes:** Windows full and the compare pass again, and Linux shows only the same four failures.
  - **A slip found by the final run.** One fix's new comment named the PowerShell install script by its file name. The runner reads any mention of that name as an install-tier file, so `settings.test.mjs` left the fast tier. Two guard tests caught it. The comment was reworded.
- **The QA pair, `unstated-lens`, the standards pair and the security pair** ran on the diff. Every cross passed.
  - **Fixed:** comments that named the lists wrongly or said too little. The new rules are now two lists, `NODE_INSTALL_ASK` and `RULESET_ASK`. The test that can't fail for the new rules says so. The how-to states the `gh` rules' false-prompt cost.
  - **Carried to #167, for the apply-guard ADR:** the `gh` rules miss other HTTP clients, other capitals under Bash, and the endpoint word in a separate statement. The record rules miss a wildcard. An installed mod may approve over ask rules (unverified).
  - **Carried to #181:** the cloud credential's permission names.
  - **Dismissed:**
    - the cloud copies, on the owner's decision;
    - converting the settings test's loops to tables, because the cases grew through the shared list and the test file's cases weren't edited.

## Record

Issue comments on mephistopheles4/the-pact#153:

- `6079188332`: the signed-off spec, revision 6.
- `6079359527`: move 3, the tickets cut, with D4 amended.
- `6084323047`: the S15 expected results, posted before any run.
- `6085223373`: verbatim, the control run record.
- `6085373064`: the install, and the shortened step list.
- `6085385776`: the probe not run.

Issue comments on mephistopheles4/the-pact#165:

- `6084820517`: build progress, the red and green record, and the Linux run.
- `6084890604`: the owner's decision on the cloud copies and the Linux run.
- `6085385507`: the owner's decision to skip the probe.
- `6085567781`: the owner's go-ahead for the install.
- `6085429254`: verbatim, `unstated-lens`'s cross section.
- `6085450771`: verbatim, the standards pair's cross section.
- `6085521008`: verbatim, the security pair's cross section.
- `6085567523`: verbatim, the QA pair's cross section.

Issue comments elsewhere:

- #167 `6085608739`: findings carried to the cutover's ADR.
- #181 `6084890936` and `6085609060`: the cloud-copy hand-off and its correction.
