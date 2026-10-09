# Work logs

One line per finished piece of work: date, issue, and what it changed. Each entry ends with a Record list of the comments or commits that hold the verbatim plan and reviews.

- [2026-09-26](2026-09-26-agent-names-and-allowlists.md) — **Agent names and allowlists** (before the tracker). Agents got job-title names and explicit tool allowlists.
- [2026-09-26](2026-09-26-missing-tool-probe.md) — **Missing-tool probe** (before the tracker). Agents report a missing tool; a planted probe checked it.
- [2026-09-27](2026-09-27-adr-and-log.md) — **ADRs and logs** (before the tracker). The docs tree became `docs/adr/` and `docs/log/`.
- [2026-09-27](2026-09-27-human-in-the-loop-gate.md) — **Human-in-the-loop gate** (before the tracker). Builder hand-offs gated on after-dispatch needs, plus the STATUS line.
- [2026-09-27](2026-09-27-repo-rules-and-tracker.md) — **Repo rules and tracker** (before the tracker). Root AGENTS.md, CLAUDE.md import and `docs/agents/` config.
- [2026-09-29](2026-09-29-hand-over-the-trigger.md) — **Hand over the trigger** (#12). The `▶ Your move` line for user-only skills; headless versus interactive probes.
- [2026-10-04](2026-10-04-effort-follows-the-tier.md) — **Effort follows the tier** (#50). One effort value per tier and phase, and the xhigh rerun at a stop.
- [2026-10-04](2026-10-04-install-cross-script-and-roster.md) — **Cross script and roster** (#45). The install copies the cross script; the gate learned the reviewer roster.
- [2026-10-04](2026-10-04-next-move-as-a-choice.md) — **Next move as a choice** (#73). Sessions show the live options side by side.
- [2026-10-04](2026-10-04-retire-docs-plans.md) — **Retire `docs/plans/`** (#52). Plans and reviews live on issues; logs cite the comments.
- [2026-10-05](2026-10-05-right-size-the-probe-rule.md) — **Right-size the probe rule** (#67). Planted probes only on the security floor.
- [2026-10-05](2026-10-05-scout-the-one-search-helper.md) — **scout, the one search helper** (#70). `scout` became the first sealed familiar; the `Explore` override retired.
- [2026-10-06](2026-10-06-qa-pair-swap.md) — **QA pair swap** (#35, #47). `behaviour-lens` and `integrity-lens` replaced the old move-4 reviewers.
- [2026-10-06](2026-10-06-finishing-pr-carries-the-docs.md) — **Finishing PR carries the docs** (#84). The PR that finishes work carries its log entry and ADRs; a PR template asks for it.
- [2026-10-06](2026-10-06-docs-indexes.md) — **Docs indexes** (#79). One-line indexes for `docs/adr/` and `docs/log/`, kept complete by a test.
- [2026-10-06](2026-10-06-pick-as-prior-and-auto-take.md) — **Pick as prior, auto-take** (#87). The pick is the owner's prior, pre-filled answers, recommendations taken by default with an audit trail.
- [2026-10-06](2026-10-06-cli-prs-carry-the-checkbox.md) — **CLI PRs carry the checkbox** (#88). A session opening a PR with `gh pr create` starts `--body` with the template's close-out line.
- [2026-10-06](2026-10-06-sessions-assign-their-issue.md) — **Sessions assign their issue** (#105). A session assigns the issue it takes, for visibility; the assignee is not a claim.
- [2026-10-07](2026-10-07-apply-guard-splat-and-dashes.md) — **Apply guard: splat and Unicode dashes** (#89, #108). Eight ask rules catch a splatted `-Apply` and the three dashes PowerShell reads as a hyphen; the rest are named misses.
- [2026-10-07](2026-10-07-spec-pair-swap.md) — **Spec pair swap** (#35, #99). `executability-lens`, `good-enough-lens` and `unstated-lens` replaced the plan reviewer; six of six security-set runs pass.
- [2026-10-08](2026-10-08-security-pair-swap.md) — **Security pair swap** (#35, #100). `adversarial-lens` and `data-lens` replaced the security reviewer; five of five security-set runs pass after one fix.
- [2026-10-08](2026-10-08-pact-configuration.md) — **The pact gets a configuration file** (#53, #91 to #97). A user file sets values, edits open parts and sets any lens's model and effort; a project file only tightens; the builder page and the `scriptorium` skill write one; locked rules stay locked.
- [2026-10-08](2026-10-08-a-lighter-gate-suite.md) — **A lighter gate suite** (#133). The install tests' repo leaves out `gate/tests` (579 to 52 files) and the documented commands cap the suite at 4 files at once.
- [2026-10-08](2026-10-08-fast-test-runs.md) — **Fast test runs, no tests cut** (#140; #144, #145, #154 to #157, #151). One fail-closed runner, `gate/tests/run.mjs`, with `full`, `fast` and `changed` tiers; record mode for posting test output; tables of bad cases and the no-loss compare; gate cores run in-process; one layer per test file; test helpers split by what they touch.
- [2026-10-08](2026-10-08-moves-without-skills.md) — **The moves name practices, not skills** (#123, #126 to #130). The default rules name no skill; a person binds their own through config blocks. Installed with the measure skipped by the owner.
- [2026-10-09](2026-10-09-ready-to-publish.md) — **Ready to publish** (#10, #9; #161, #162). Personal paths out of the tree and a guard test; gitleaks, private-term and third-party scans over every published surface; a README for any reader, a dependency list and an install how-to.
- [2026-10-09](2026-10-09-only-the-owners-tracker-text-counts.md) — **Only the owner's tracker text counts** (#160, #170, #171). The gated `tracker-authors` clause: only the owner's account's text decides, read from JSON authors and editors, and outsiders' code never runs; the P-TRACKER probe failed on the old pact and passed on the new one; installed from `279df4d`.
- [2026-10-09](2026-10-09-cloud-copy-generated.md) — **The cloud copy is generated** (#179, #181). `cloud-sessions/gen.mjs` replaces `gen.ps1` and the hand-kept `CLAUDE.cloud.md`; the cloud setup now carries the whole pact, checks its own hashes, and a `fast` test keeps it current.
- [2026-10-09](2026-10-09-node-install-script.md) — **A Node install script, started by an install prompt** (#153; T1 #165). T1: ten ask rules guard the coming Node script, the install record and the CI ruleset, installed before the script exists; the live probe after the install was skipped on the owner's word.
