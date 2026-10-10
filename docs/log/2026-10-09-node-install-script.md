# A Node install script, started by an install prompt

**2026-10-09** — A Node install script, `gate/install.mjs`, replaced the PowerShell installer (mephistopheles4/the-pact#153). The work was cut into three tickets: T1 (#165), T2 (#166) and T3, the cutover (#167). On the owner's word, the cutover was folded into T2. Four ADRs record the result: [0039](../adr/0039-the-install-is-a-node-bootstrap-and-a-staged-runner.md), the bootstrap and the runner; [0040](../adr/0040-a-link-test-replaces-the-reparse-attribute-test.md), the link test; [0041](../adr/0041-a-required-ci-check-guards-main.md), the CI check; and [0042](../adr/0042-the-apply-guard-asks-on-any-command-naming-the-install.md), the apply guard, which supersedes [ADR 0020](../adr/0020-the-apply-guard-catches-what-text-can.md).

## Before the spec: could a plugin replace the installer? (#152)

#152 asked whether a Claude Code plugin could carry the agents and skills, so the installer could shrink. It can't help. A plugin can't supply a rules file or general settings: a `CLAUDE.md` in a plugin isn't loaded, and a plugin's settings keep only two keys. A hook's added context is capped at 10,000 characters, against about 33,000 for the rules file. And a plugin's agents load renamed as `<plugin>:<name>`, which would break three gated clauses that name the lenses bare. So the Node script keeps the rules file, the agents, the settings overlay, the records and project installs (#153, S1). #152 has no log of its own; its result is #152's comment 6072154307.

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

## T2: the Node install, with the cutover folded in (#166, #167)

Two sessions built it: `build-166`, which wrote the install (PR #201), and `build-166b`, which moved the tests and cut over (PR #204).

### What was built

- **The home install** (S3 to S8): the bootstrap `gate/install.mjs` (244 of its 250 lines), the runner `gate/install-run.mjs`, the decisions in `gate/install-core.mjs`, and `gate/install-io.mjs`. ADR 0039 has the shape and its known limits; ADR 0040, the link test that replaced the reparse test.
- **The project install** (J1 to J4). A project dry run's apply line carries `--project-folder`.
- **The CI workflow** (S11) and Dependabot, locked down as ADR 0041 says. The lead turned on the required `gate` check at the owner's word.
- **The test move** (S13). On the owner's word, every old install-tier case runs the Node script in place, keeping its file and name; the prune (#189) decides which stay.
  - The harness's `install()` is the Node install. `wrapCheck` plants a fault in a core's `check()`, which the runner calls in-process.
  - Cases built on the old script's Node lookup, wrapper processes or PowerShell parsing check what S6 put in their place, each with a comment: no Node lookup (P2), `NODE_OPTIONS` refused (A7), a check's verdict in-process (R4, S-1), the strict parser (A3).
  - Two refusals now come from another check. On Windows, an unreadable configuration file refuses at the link test, which fails closed (S7); on Linux the renderer still refuses it. A review folder spelled `.claude.` refuses because its parent isn't found: Node's file calls keep the trailing dot that PowerShell dropped.
  - The install tier went from about 2,183 s summed under PowerShell to 945 s, on 256 cases. S13 had targeted 20 to 30 end-to-end cases plus in-process rows; that split was not done.
- **The cutover** (#167's list, S9 and S10).
  - The gated clause `install-go-ahead` spells the flag `--apply`.
  - The twelve `install.ps1` ask rules gave way to `PowerShell(*install.ps1*)` and `Bash(*nstall.ps1*)`, in the overlay, the allow-list, seam A's list and the cloud copy. ADR 0042 records the guard and its misses, and supersedes ADR 0020.
  - `scripts/install.ps1` is deleted, with the copy list's entry and the harness's PowerShell path. The tests that read it now read the install core's constants.
  - The PowerShell-only baseline cases became table rows in their own files, through `moves.tsv`: the table "retired install rules" (20 rows, one per old rule case: each old spelling, put in place of the broad rule, fails as missing), and "apply only as typed" (2 rows, for the parameter-block cases).
  - AGENTS.md, the README, `docs/install.md` (the install prompt, the rollback and the limits), the threat model and the scout practice case moved to the Node install. A test finds the exact clone address in the prompt.
  - The Linux container moved to Node 24.

### The owner's decisions

- **Fold the cutover in** (option B): one PR adds the Node install and deletes `install.ps1`, so `main` never holds both.
- **Two applies before the merge,** from the branch: the first while `install.ps1` was still the fallback, the second from the final head.
- **The test move in place,** to leave the cutting to the prune.
- **The first apply was handed to the session** ("you can install"). It ran through the PowerShell tool after the ask rule prompted. It exited 0 with every file verified; only the record changed. A fresh dry run then showed "Nothing to do."

### The clause probe

The expected result went on #166 before the run. A new required-clause row puts the old `-Apply` text back into AGENTS.md, and seam A refuses it with `install-go-ahead differs from its canonical text`. The table's base, holding the new text, passes. Seam A's required list was also seen to fail with `PowerShell(*install.ps1*)` taken out, and the copy list's new bad case failed against the old list.

### What was not done, on the owner's word or by choice

- **The live-prompt probe was skipped again,** on the owner's word: "Skip it please". Only `PowerShell(*install.mjs*)` has been seen to prompt live, at the first apply. That leaves the other ask rules unseen live: the Bash ones, the record's, the `gh` ones and the two lasting `install.ps1` rules. This falls short of S15 and AGENTS.md's probe floor for the settings guard, as #165's skip did. The rollback stand-in, a live prompt check, went with it. What a rollback needs besides the prompt was checked: an `install.ps1` dry run from a4e6546 read the Node record with no drift.
- **The scout contract's worked example still cites `install.ps1`.** Its samples are a dated record of the owner's 2026-10-05 pick, marked "drafted, not real". Editing the contract changes the digest its familiar's seal pins. Its practice case moved to the Node install.
- **S13's split was not done,** so the install tier is 945 s summed, past both of S13's deferral triggers. #189 has the numbers, and the intent of #146 and #147.
- **#110** is closed by construction: rules compare exactly. A bad case shows a rule that differs by an invisible character counts as missing.
- **#28's Linux run** is the container in `gate/tests/fixtures/linux/`, now on Node 24, where the whole suite passes.

### Move 4

One run of seven lenses covered #201's merged diff and #204's together, a4e6546..993c8d9, on the lead's go. Every cross call passed. The fixes are in 173f8e3, and each new check was seen to fail with its code taken out:

- **Security pair.**
  - The bootstrap now refuses unless it is `gate/install.mjs` itself.
  - An apply refuses before any write when a `.pact-tmp` file is left over.
  - Every workflow file keeps the CI lockdown.
  - A settings file an older install widened draws a warning; the docs had called #177 fixed outright.
- **QA pair.**
  - The purity guard lost count after a skipped subtest, because node runs no afterEach for one, so later tests in the file went unchecked. It now keys on each test's full name.
  - New bad cases cover the runner's own project link test, the lockdown's and the bootstrap checker's untested parts, and environment variables that try to turn on `--apply`.
  - A `--name=value` refusal no longer shows the value.
- **Standards pair and `unstated-lens`.**
  - The ADR's rule count is corrected.
  - The README lists PowerShell 7 for part of the tests.
  - The install prompt says to back up first.
  - The Record list below is filled in.

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

Issue comments on mephistopheles4/the-pact#166:

- `6088979990` and `6089050313`: the owner's decisions to fold the cutover in, and to apply twice.
- `6089436240`: `build-166`'s hand-off, with parts 1, 2 and 4 and their evidence.
- `6090304847`: the test move, with the owner's decision to move it in place.
- `6091616772`: the first Node apply, handed to the session by the owner.
- `6091641998`: the clause probe's expected result, posted before the run; `6092194828`: its record; `6093235617`: a correction.
- `6093328959`: the S15 CI probe's expected results.
- `6093408674`: move 4's scope note; verbatim cross sections: the standards pair `6093408777`, `unstated-lens` `6093408898`, the security pair `6093429379`, and the QA pair `6093608252`.
- `6093728441`: the Lens dispositions, with the owner's decision to skip the live-prompt probe.

Issue comments elsewhere, for #166:

- #152 `6072154307`: the plugin question's result.
- #189 `6090306125` and `6093729310`: the timing, the deferral triggers, and #146's and #147's intent.
Issue comments elsewhere:

- #167 `6085608739`: findings carried to the cutover's ADR.
- #181 `6084890936` and `6085609060`: the cloud-copy hand-off and its correction.
