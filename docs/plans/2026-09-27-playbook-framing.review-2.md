# plan-reviewer round 2: playbook framing, draft 2

*Verbatim report from `plan-reviewer`, 2026-09-27, on `2026-09-27-playbook-framing.md` draft 2 (commit `10f9b2b`).*

REVISE

Headline: P1's prompt fits in one sentence, so sizing skips the flow
Blocker: The P1 prompt is itself one sentence: "Add a `--dry-run` flag to the script in this repo, which prints what it would delete instead of deleting it." The new sizing rule says "If the change fits in one sentence, just do it: no triage, no skills, no tracker." A session that follows the pact correctly may take the one-sentence path. P1 would then "fail" for a reason unrelated to D2, the rule it is meant to test. The expected result assumes the session "sizes it as more than one sentence", and no rule forces that. A second gap in the same probe: `grilling` stays installed in P1, so move 2 will question the prober. The expected sequence never mentions grilling. It also does not script the prober's replies, including the answer to "where do plans live". A correct run can therefore go off-script, and its result cannot be judged.
Evidence: docs/plans/2026-09-27-playbook-framing.md:91-93 (sizing text in C1), :254 (only `triage` and `to-spec` are moved aside), :256 (P1 prompt and expected sequence); claude/CLAUDE.md:58-60.
Minimum revision: Give P1 a task that clearly cannot be stated in one sentence. Add grilling to its expected sequence. Commit the prober's scripted replies, including the answer to the plans-location question.
Acceptance check: The committed P1 prompt describes a multi-part change. The P1 expected result names the grilling step. The probe record lists every reply the prober will give.

Headline: Probe skill setup names an unverified load path
Blocker: The probe section says Pocock's skills are installed at user level, and that P1 moves `triage` and `to-spec` "out of `~/.claude/skills/`". A read of this machine found no `triage`, `to-spec`, `to-tickets`, `implement` or `wayfinder` skill under `~/.claude/skills/`. It holds only `synced/` entries. The current Pocock set, with the new names, sits in `~/.agents/skills/`. The only copy under `~/.claude/` is `~/.claude/skills-backup-2026-07-31/`, and it still uses the old names `to-prd` and `to-issues`. One caveat: the search tool does not follow symlinks or junctions, so linked entries in `~/.claude/skills/` could exist and not show up. Treat this as an evidence gap, not a proven absence. Either way, the plan does not show which path Claude Code loads these skills from. Three runs depend on that path. If the move-aside misses the real load path, P1 cannot show D2. If the skills don't load at all, the P2 control cannot invoke `triage`, and P3 has no `implement` to resist.
Evidence: docs/plans/2026-09-27-playbook-framing.md:254, :256-262. Evidence gap: the fresh session's actual skill list is not recorded or checked.
Minimum revision: Add a pre-run check to each probe that does not depend on the path. Before the prompt goes in, the fresh session's available-skill list must show `triage`, `to-spec` and `implement` present for P2, its control and P3. For P1 and its control, `triage` and `to-spec` must be absent. Record that list with the run. Name the real load path and the move-aside step to match it.
Acceptance check: The committed probe setup states where the skills load from. Each run's record includes the skill list captured before the prompt, and it matches that run's required setup.

Headline: One-sentence exemption "no skills, no tracker" conflicts with other rules
Blocker: C1's sizing sentence says a one-sentence change is done with "no triage, no skills, no tracker". Read literally, that goes beyond skipping the four moves. It blocks three things that other rules require or allow for small changes:
- **Named skills:** a skill the user invokes by name. The precedence rule gives such a skill priority only over style rules, so it does not settle this case.
- **Diataxis:** the plain-language rule's "use the `diataxis` skill" when writing documentation files.
- **Wayfinder work:** the `/wayfinder` skill and its tracker writes when a map ticket's fix is one line. The wayfinder claim and coordination rules exist because of a real double claim (gate G36). An instruction to skip the tracker on small changes works against them.

The brief asked whether any sentence, read literally, fires on routine work or conflicts with another rule. This one does both.
Evidence: docs/plans/2026-09-27-playbook-framing.md:91-93; claude/CLAUDE.md:34, :39-42, :180-216.
Minimum revision: Scope the exemption to the four moves, for example "skip the four moves below", so it no longer bans all skills and all tracker work.
Acceptance check: The C1 sizing text names only the moves (or their skills) as skipped. No sentence in C1 forbids an invoked skill, `diataxis`, or wayfinder's tracker and claim steps for a one-sentence change.

Headline: Done-criterion 1's "four hunks" fails on a correct build
Blocker: Done-criterion 1 requires "`git diff` shows only those four hunks". C1b changes claude/CLAUDE.md:50-52, and C1 starts at :58. The gap is small enough that git's default 3-line context merges the two changes into one hunk. So a correct build shows three hunks, not four. Read literally, the criterion fails on correct work. That gives `result-checker` or the `spec-builder` gate a false failure. A secondary gap: C3 places its sentence "after 'Every plan's **Needs a human** section…'", but that paragraph has several sentences. It is unclear whether the new sentence goes after the first sentence or after the whole paragraph, yet done-criterion 1 demands C3 "exactly".
Evidence: docs/plans/2026-09-27-playbook-framing.md:165 (C3 placement), :243 (done-criterion 1); claude/CLAUDE.md:50-52, :58, :106-110.
Minimum revision: Reword done-criterion 1 to "the diff contains only the changes C1, C1b, C2 and C3", with no hunk count. Give C3's exact insertion point, either by quoting the sentence it follows or by saying "at the end of the paragraph".
Acceptance check: Done-criterion 1 has no hunk count. C3 names one unambiguous insertion point. A correct build passes criterion 1 as written.
