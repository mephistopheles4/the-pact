# plan-reviewer, round 1 — verbatim

Reviewed: `2026-09-27-resume-and-handoff.md`, draft 1 (`28c217f`). 2026-09-27.

```text
REVISE

Headline: Verbatim hand-offs can publish secrets or vulnerability details
Blocker: P2 — D3 and E1 require the main session to keep every builder hand-off verbatim. It keeps them beside the plan, and later as issue comments. "Verbatim" rules out redaction by the main session. So the only possible control is on the writer, and E2 gives the builders no exclusion rule. A `security-builder` "Learned" or "Dead ends" section is exactly where credentials, secret values, or details of unpatched weaknesses would appear. In this repo, that text is committed under docs/plans/ in a repo that will be public, then posted to public issue comments. E1 is global, so every project gets the same exposure. No unhappy path covers this.
Evidence: docs/plans/2026-09-27-resume-and-handoff.md:41 (D3, verbatim and issue comments), :57 (E1, "Keep it verbatim"), :67 (E2 text, no exclusion), :92-96 (unhappy paths omit it); AGENTS.md:26-30 (plans committed in docs/plans/)
Minimum revision: Add a writer-side exclusion to E2's paragraph for all three builders. It should forbid secret values, credentials, and unpatched vulnerability details in the hand-off, and say to point to where they are handled instead. Add a matching unhappy path.
Acceptance check: E2's quoted paragraph, and A2's expected text, contain the exclusion. The Unhappy paths section names the leak case and the control that prevents it.

Headline: Rollback re-installs live config, skipping the repo's install rules
Blocker: P2 — The Rollback step says "re-copy the four files to `~/.claude/`". That is an install. It has no owner go-ahead, no drift check against the last installed commit, and no hash check. AGENTS.md requires all three for any install, and E3 follows them. If someone has edited the live files in the meantime, the rollback silently overwrites that edit.
Evidence: docs/plans/2026-09-27-resume-and-handoff.md:100 (rollback) vs :72 (E3); AGENTS.md:19-22
Minimum revision: State that the rollback re-copy runs under E3's install rules: owner go-ahead, drift check first, and hash confirmation after.
Acceptance check: The Rollback section names the owner go-ahead, the drift check, and the hash check for the re-copy.

Headline: Probe A4 can dead-end; no stop condition covers it
Blocker: P2 — Two A4 outcomes have no next step:
- **The control shows a hand-off.** The plan says the probe then "doesn't count", but gives no fallback. AGENTS.md also allows "a planted bad case that it catches".
- **The test run lacks the four headings.** The only builder-status stop is "`spec-builder` returns anything but `STATUS: DONE`". A probe builder can return DONE and still omit the hand-off.

In both cases, AGENTS.md's rule that a pass counts only after the probe has been seen to fail cannot be met. The plan also never tells the main session to stop and tell the owner. So A4 cannot prove the claimed outcome, and nothing halts the work.
Evidence: docs/plans/2026-09-27-resume-and-handoff.md:86-90 (A4), :104 (stop conditions); AGENTS.md:55-57
Minimum revision: Add both cases to Stop conditions: the control shows a hand-off, and the test lacks any of the four headings. Alternatively, name the fallback (a planted bad case) for an invalid control.
Acceptance check: Stop conditions list both A4 failure modes, or A4 names a fallback control and the stop for a failed test run.

Headline: "Hand-off" already names the human-in-loop gate's trigger in CLAUDE.md
Blocker: P2 — In claude/CLAUDE.md, "builder hand-off" already means sending a step to a builder. That phrase triggers the human-in-the-loop gate ("Gate every builder hand-off for a human in the loop ... hand-offs to the builders"). E1 inserts "Keep every builder's hand-off" into the same file, with "hand-off" meaning the builder's report. Under the existing meaning, "point its brief at the latest hand-off" reads circularly: the brief is itself the hand-off. The reverse misreading is also possible. The gate could be read as governing report sections, which blurs a safety gate. This is global config loaded by every session.
Evidence: claude/CLAUDE.md:82-92 (existing meaning); docs/plans/2026-09-27-resume-and-handoff.md:55-59 (E1), :67 (E2), :29-41 (D2, D3)
Minimum revision: Rename the new concept, for example "handover notes" or "catch-up notes". Apply the rename consistently in D2, D3, E1, E2, A4, and the file name pattern `<plan>.handoff-N.md`. Leave the gate's existing term unchanged.
Acceptance check: E1 and E2's quoted text never uses "hand-off" for the report. A grep of the post-edit claude/CLAUDE.md shows "hand-off" only in the gate's meaning.

Files reviewed:
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\docs\plans\2026-09-27-resume-and-handoff.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\CLAUDE.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\spec-builder.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\builder.md and security-builder.md, via grep of lines 21 and 23 only
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\AGENTS.md
```
