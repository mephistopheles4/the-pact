# plan-reviewer, round 2, on draft 2 — verbatim

REVISE

Headline: Ticket 1's text checks pass vacuously against the hard-wrapped file
Blocker: `claude/CLAUDE.md` is hard-wrapped. Wording 1's current text spans lines 66-68, and wording 4's spans lines 97-98 with a 3-space list indent. A literal search for either string finds nothing today, before any edit. So "the two replaced texts appear nowhere" passes even if nothing is removed. Whether "each new text appears exactly once" passes depends on how spec-builder wraps the inserted text, and the plan doesn't say how. The done-criteria cannot fail, so they cannot prove the ticket. The same applies to ticket 2's edit of `CLAUDE.cloud.md` (lines 43-45 and 74-75).
Evidence: claude\CLAUDE.md:66-68, :97-98; cloud-sessions\CLAUDE.cloud.md:43-45, :74-75; plan line 101 (ticket 1 done-criteria), line 102 (ticket 2).
Minimum revision: Say whether the wordings go in wrapped to the file's width, with list indent inside move 3, or unwrapped. Make the presence and absence checks whitespace-normalised: collapse newlines and indentation before matching.
Acceptance check: Run on the unedited file, the "replaced text appears nowhere" check fails. Run on the correctly edited file, both checks pass.

Headline: P4 expects the wrong trigger, and its no-repeat check can't fail
Blocker: Two defects. First, move 2 opens with `grilling`, which the model runs itself, before `to-spec`. Triage can also route the work to `diagnosing-bugs` or `wayfinder`. A model that follows the new rules correctly would start grilling, not end with `▶ Your move: type /to-spec …`, so P4 fails on correct behaviour. Second, P4 has no second offload, so no model has a reason to show the offload note again. "No offload note" therefore passes whether or not the once-per-session rule works. The plan's own unhappy path, "the owner offloads a second time in the same session", is the case that needs probing, and no probe covers it.
Evidence: claude\CLAUDE.md:75-83 (move 1 routing; move 2 order, grilling then to-spec); plan line 89 (unhappy path), line 119 (P4).
Minimum revision: Give P4 a second offload ("just do it") at a later user-only step. Set its expected result to match move 2's real order (grilling first), or script the session to the point where `to-spec` is actually next.
Acceptance check: P4's prompt contains a second offload. Its expected result names the step that CLAUDE.md actually puts next. A model that repeats the note fails it.

Headline: P5 has several correct outcomes and an unclear session setup
Blocker: Wording 4 does express the settled intent. It states a permission and a condition, not a ban, and it keeps security work out of the main session. P5 still cannot judge it cleanly:
(a) The prompt "build this one here" can reasonably be read as "build it by hand if I say so" (wording 4) or as an offload (wording 3). Either would be correct, but P5 accepts only `/implement`.
(b) "Small" invites the "fits in one sentence, just do it" shortcut at CLAUDE.md:59-61.
(c) The ticket and repo are not named.
(d) "Each step is one fresh session" contradicts P2-P4, which reply inside P1's session. If P5 continues that session with a different ticket, the switch-work part of the one-piece-per-session rule fires instead.
Evidence: plan line 55 (wording 4, "or build it by hand if I say so"), lines 45-49 (wording 3), line 110 ("Each step is one fresh session"), lines 117-120; claude\CLAUDE.md:59-61, :110-119.
Minimum revision: Make P5's prompt say plainly that the owner chooses a main-session build, without asking for a by-hand build, or accept both wording-4 outcomes. Name the ticket and repo, and pick one that doesn't fit in one sentence. State which probes share a session and which start fresh.
Acceptance check: The P5 prompt has exactly one correct outcome under wordings 3 and 4. The probe section says which session each of P1-P5 runs in.

Headline: Trigger line and fresh-session hand-off both claim the turn's end
Blocker: Wording 2 says to end the turn with the `▶ Your move` line and nothing after it. The one-piece-per-session rule says that at each move boundary where context is past about half, the model must tell the owner it's a good point for a fresh session and "give me one line to start it with". User-only triggers fall at move boundaries: `to-spec`, `to-tickets`, and `triage` at the start. Both rules claim the end of the same turn, and they point different ways: type the command here, or start a fresh session. The model has no instruction for how to combine them.
Evidence: plan lines 37-41 (wording 2); claude\CLAUDE.md:110-123.
Minimum revision: Add one sentence saying how the two combine. For example: the fresh-session note goes above the trigger line; or, when a fresh session is advised, the trigger line is the start line for that session.
Acceptance check: A reader can say from the text alone what the last line is when a user-only trigger and a fresh-session suggestion fall in the same turn.

Headline: Ticket 2 depends on ticket 1, but no blocking edge is stated
Blocker: Ticket 2's done-criterion needs the check script to print `named skills: 11; user-only: 5; OK` against the repo's `claude/CLAUDE.md`. Step 2 of the script reads the user-only list from wording 1's first sentence, which exists only after ticket 1 lands. If ticket 2 runs first, or in parallel, that criterion cannot be met. The move-3 rule requires each ticket to state its blocking edges.
Evidence: plan lines 76-80 (script steps 1-2), lines 101-106 (tickets); claude\CLAUDE.md:92-94.
Minimum revision: State that ticket 2 is blocked by ticket 1, or make the script's `-ClaudeMd` target explicit so the criterion holds regardless of order.
Acceptance check: Ticket 2 lists ticket 1 as a blocking edge, or its done-criteria can pass without ticket 1 landing.
