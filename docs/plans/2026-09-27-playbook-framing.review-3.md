# plan-reviewer round 3: playbook framing, draft 3

*Verbatim report from `plan-reviewer`, 2026-09-27, on `2026-09-27-playbook-framing.md` draft 3 (commit `11c90b0`).*

REVISE

Headline: P4 cannot be judged: trigger timing and unscripted reply
Blocker: P4 expects a fresh-session suggestion when the `--verbose` request arrives with the sign-off. Read literally, C1c does not fire there. Its trigger is "when the next move starts a different piece of work". At the move 2→3 boundary, the next move is move 3 of the approved `--dry-run` work, which is the same piece of work. The same holds at the move 3→4 boundary. The scripted replies end the run at the next sign-off with no named reply, which is move 4's "I decide whether it's done". So the run can end before any boundary where `--verbose` is literally "the next move", and a correct session may never make the suggestion. There is a second gap. No reply is scripted for the suggestion itself, so it gets the catch-all *"Use your best judgement; I have no further constraints."* That reply can fairly be read as "keep going". A correct session may then start `--verbose`, and the run would be scored as a fail. This is the same kind of defect as round-2 finding 1.
Evidence: docs/plans/2026-09-27-playbook-framing.md:181-182 (C1c trigger wording), :285-287 (scripted replies and catch-all), :297 (P4 expected result); claude/CLAUDE.md:76-80 (the move-4 owner decision that becomes the run's end).
Minimum revision: Pick one of two fixes. (a) Reword C1c's trigger so a request for a new piece of work fires it at the next move boundary. (b) Rewrite P4's expected result to match the current wording, including where the run ends. Also script the prober's exact reply to the fresh-session suggestion, or state that the run ends when the suggestion is made.
Acceptance check: A session that follows C1c's committed text literally reaches the suggestion before P4's run ends. The probe record lists the prober's reply to the suggestion word for word, or states that the run ends at the suggestion.

Headline: C1c says "on the tracker" with no fallback for tracker-less repos
Blocker: C1c tells the session to put every artifact "on the tracker", then give a one-line start "naming the issue or ticket". It does not repeat the fallback from the C1 tracker paragraph for a repo without a tracker. This repo has no tracker today, and neither does any probe's scratch repo. There, C1c's literal instruction cannot be carried out: no tracker exists and no issue can be named. P4 nonetheless expects the session to confirm artifacts "under `docs/plans/`", which C1c's text does not say. The expected result rests on an inference the rule does not force.
Evidence: docs/plans/2026-09-27-playbook-framing.md:109-112 (C1 fallback), :182-185 (C1c "on the tracker", "naming the issue or ticket"), :279 (scratch repos have no tracker), :297 (P4 expects `docs/plans/`).
Minimum revision: Add one clause to C1c, for example "on the tracker, or where the repo keeps plans". Let the one-line start name the plan file when there is no issue.
Acceptance check: C1c's committed text covers a repo with no tracker. P4's expected result follows from C1c's literal wording.

Headline: C1c's wayfinder handoff stalls on the presumed-live rule
Blocker: C1c suggests `wayfinder` at move 1 for big work, then a fresh session started on a named ticket. The handing-off session will usually have created that ticket within the last hour. The existing wayfinder rule says such a ticket is presumed to belong to its author until the author confirms it is finished, and that silence does not clear it. The author session has ended and cannot answer. So the fresh session that C1c sends to that ticket must stall and ask the owner. This happens on the routine path C1c recommends, not an edge case. It is recoverable, because the owner can clear it, so P2.
Evidence: docs/plans/2026-09-27-playbook-framing.md:184-187 (C1c one-line start and `wayfinder`); claude/CLAUDE.md:201-205 (presumed-live rule).
Minimum revision: Make C1c's handoff clear the presumption. For example, the handing-off session records on the ticket that it is finished with it, or the one-line start states that. Alternatively, state that the one-line start counts as the author's confirmation.
Acceptance check: A fresh session started from C1c's one-line start on a ticket less than an hour old can proceed under the presumed-live rule without a further owner round-trip.

Headline: Probe skill lists get committed verbatim with no private-name check
Blocker: The pre-run check records each fresh session's full skill list with the run. AGENTS.md commits every run's record verbatim into tracked files. `~/.claude/skills/` holds a `synced/` set that includes user-specific skills beyond the Pocock and public Anthropic sets. Done-criterion 4's private-name grep covers only the build diff, not the probe records. So a non-public skill name can reach a tracked file unchecked. This is an evidence gap: I did not compare those names against the `*.private.md` lists, and I name none of them here.
Evidence: docs/plans/2026-09-27-playbook-framing.md:283 (full list recorded with each run), :273 (done-criterion 4 scoped to "the diff"); AGENTS.md "Testing a change to an agent or a rule" (record every run verbatim, committed).
Minimum revision: Pick one of two fixes. (a) Record only presence or absence of the named skills (`triage`, `to-spec`, `implement`, `grilling`). (b) Extend done-criterion 4's main-session name grep to each probe record before it is committed.
Acceptance check: The probe section either limits the recorded list to the named skills, or requires the private-name grep on every probe record before commit.

All four round-2 findings are resolved in draft 3:
- **P1** now has a multi-part prompt, a grilling step and scripted replies.
- **Skill setup** names the load path and adds a pre-run skill-list check.
- **The sizing rule** now skips only the four moves.
- **Done-criterion 1** has no hunk count, and C3 quotes its insertion point.

I checked C1, C1b, C2 and C3 against the current text of `claude/CLAUDE.md`. None of them weakens a gate, stop, relay or security rule.

Files reviewed: docs/plans/2026-09-27-playbook-framing.md, docs/plans/2026-09-27-playbook-framing.review-2.md, claude/CLAUDE.md, docs/adr/0008-throwaway-after-two-paper-rounds.md.
