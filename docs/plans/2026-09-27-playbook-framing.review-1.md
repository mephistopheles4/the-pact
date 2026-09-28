# plan-reviewer round 1: playbook framing, draft 1

*Verbatim report from `plan-reviewer`, 2026-09-27, on `2026-09-27-playbook-framing.md` draft 1 (commit `216ddec`).*

REVISE

Headline: Triage now runs before the one-sentence exemption
Blocker: Move 1 in C1 puts `triage` first ("Triage it first (`triage`)") and only then says "If the change fits in one sentence, just do it". Read literally, every typo fix now invokes `triage`. Pocock's `triage` labels work on the issue tracker, so a typo fix would write to the tracker. Where the skill is missing, D2 makes every typo fix print a missing-skill line. That fires on routine work. The unhappy path "Move 1 keeps 'fits in one sentence, just do it' inside the triage step, word for word" is the defect, not the guard. Probe P2 checks only "no spec, no tickets", so it cannot catch this.
Evidence: docs/plans/2026-09-27-playbook-framing.md:87-92 (order in move 1), :188 (unhappy path), :219 (P2 expectation); claude/CLAUDE.md:58-60 (current sizing rule sits before any flow step).
Minimum revision: Put the one-sentence exemption ahead of `triage`, so that a one-sentence change skips triage, the tracker and the missing-skill line. Make P2's expected result say that no `triage` call, tracker write or missing-skill line appears.
Acceptance check: In the C1 text, the one-sentence rule comes before any skill is named. P2's committed expected result names "no triage, no missing-skill line".

Headline: D4 conflicts with "a skill may replace that section's steps"
Blocker: `claude/CLAUDE.md` keeps "The stop-and-escalate signals in 'Implementing a change': a skill may replace that section's steps, never its stops." The plan does not touch this line. The builder route, the gate and `result-checker` are steps, not stops. So the retained line still licenses Pocock's `implement` (or any skill) to replace move 3 and build in the main session. That contradicts D4's "Don't build a ticket in the main session, with `implement` or otherwise". The unhappy path says "'What no skill overrides' already protects the stops. D4 closes the route." It protects only the stops, not the builder route that D4 depends on. C1-C3 name no hunk for this line, and done-criterion 1 ("only those hunks") would reject one.
Evidence: claude/CLAUDE.md:48-52; docs/plans/2026-09-27-playbook-framing.md:53, :109-110, :190, :208.
Minimum revision: Add a named change, for example C1b, that amends the "What no skill overrides" sentence. It must state that the builder route in move 3, the builder gate and `result-checker` are not steps a skill may replace. Add that hunk to done-criterion 1.
Acceptance check: The plan's exact-changes list includes the amended "What no skill overrides" text. Done-criterion 1 lists it among the allowed hunks.

Headline: Move 3 forbids a gate option the plan keeps
Blocker: Move 3 says "Don't build a ticket in the main session, with `implement` or otherwise." The unchanged gate text still offers the owner "keep it in the main session" as an option for a step that trips a signal. Read literally, the two rules conflict. The plan claims gate text is unchanged (Non-goals), yet move 3 now bans one of the gate's three options.
Evidence: docs/plans/2026-09-27-playbook-framing.md:26, :109-110; claude/CLAUDE.md:114-116.
Minimum revision: Carve out the owner's explicit choice at a gate warning in move 3 (security steps excepted, as the gate already says). Or state that the gate option is withdrawn, which would be a gate change and needs an owner decision.
Acceptance check: The C1 text and the gate paragraph can both be followed literally at once. When the owner picks "keep it in the main session" for a non-security step, no sentence forbids it.

Headline: Prototype lets security-touching code bypass security-builder
Blocker: Move 2 has the main session build a throwaway (`prototype`) before review. The security routing ("goes through `security-reviewer` on the spec, then `security-builder`, whatever its size") appears only in move 3, and the main-session ban covers only "a ticket". A throwaway that touches auth, secrets, crypto or input validation is therefore built in the main session, outside the security route. C2 adds the same route after two stalled review rounds. Today the flow allows no main-session build of non-trivial work, and a security step can never stay in the main session. This weakens an existing security rule, which the brief lists as a check target.
Evidence: docs/plans/2026-09-27-playbook-framing.md:97-99 (move 2 prototype), :109-114 (ban and security route scoped to tickets and move 3), :130 (C2); claude/CLAUDE.md:62, :72-75, :115-116.
Minimum revision: State who builds a throwaway, and that a throwaway touching auth, secrets, crypto or input validation follows the security route (or is not built). Apply this to both the move 2 prototype and the C2 option.
Acceptance check: The C1 and C2 text names the security route for security-touching throwaways. No sentence lets the main session write such code.

Headline: A ticket may close before the owner decides
Blocker: Move 4 reads "Verify each ticket before closing it. ... I decide whether it's done." It does not say that closing waits for the owner's decision. On a tracker or a wayfinder map, closing a ticket unblocks its dependents, so the session could release downstream work before the owner has ruled. Today's step 3 has no closing action, so this is a new, material ambiguity in the "stay the owner" move.
Evidence: docs/plans/2026-09-27-playbook-framing.md:115-119; claude/CLAUDE.md:76-80.
Minimum revision: Make the order explicit: verify, give the owner the `result-checker` table, then close only on the owner's decision.
Acceptance check: The move 4 text says the ticket is closed only after the owner decides it is done.

Headline: Private-name check can't run without leaking the names
Blocker: Done-criterion 4 requires "no private research folder name, no employer name". The unhappy path has "the implementer" (`spec-builder`) grep for them, and done-criterion 5 has `result-checker` confirm it. The plan is tracked, so it cannot hold the names, and neither agent is told where to get them. Either the check cannot be run, which trips the gate's "no checkable done-criteria", or the names get handed to subagents. That runs against the earlier decision that private material stays with the main session. Separately, C6 says ADR 0009 is "listed here so the plan's done-criteria include it", but done-criteria 1-5 do not include it.
Evidence: docs/plans/2026-09-27-playbook-framing.md:182, :192, :211-212; .gitignore:12-13 (`*.private.md` holds the names, untracked); docs/adr/0007-only-decisions-are-committed.md:15 (round 1 asked "for private material to stay with the main session").
Minimum revision: Assign the private-name grep to the main session, run against the untracked `*.private.md` list. Remove it from the `spec-builder` and `result-checker` duties. Also add ADR 0009 to the done-criteria, or drop the C6 claim that they include it.
Acceptance check: Done-criteria 4 and 5 name the main session as the runner of the private-name check and say where its list comes from, with no names in tracked text. The ADR 0009 claim and the done-criteria agree.

Headline: Probe controls missing; P1 and P3 expectations unfalsifiable
Blocker: AGENTS.md counts a probe's pass only once the probe has been seen to fail. Only P2 has a control, so passes on P1 and P3 cannot count. P1 expects "It does not stop". A correct run of the new flow does stop, for owner sign-off after `plan-reviewer`, so a correct run reads as a fail and the expectation is not checkable. P3 says only "ask to build a ticket". Whether the prompt invokes `/implement` by name decides which rule applies ("A skill you invoke by name wins for that turn"), so the prompt wording must be fixed. Evidence gap: P1 needs no Pocock skills and P3 needs `implement`. Skills install per user, and the plan does not say how both setups are arranged in fresh sessions.
Evidence: docs/plans/2026-09-27-playbook-framing.md:216-221; AGENTS.md "Testing a change to an agent or a rule"; claude/CLAUDE.md:39-42.
Minimum revision: Give P1 and P3 each a control or a planted bad case, for example a run against the current installed pact before install. Change P1's expected result so that "does not stop" means not halting over the missing skill, and so that it expects the stop at owner sign-off. Fix P3's exact prompt, including whether `implement` is invoked by name. State how the skill set differs between the P1 and P3 sessions.
Acceptance check: The committed probe expectations list a control for each of P1-P3. P1's expected result includes the sign-off stop. P3 quotes its exact prompt. The skill setup for each run is named.
