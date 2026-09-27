# plan-reviewer, round 4 — verbatim

Reviewed: `2026-09-27-human-in-the-loop-gate.md`, draft 4. 2026-09-27.

```text
REVISE

Headline: Gate covers every agent, so it trips on pre-sign-off reviewer dispatches
Blocker: Rounds 1–3 are closed. Round 1: E2 (:119-126) and E3 (:133-136) scope the missing-status-line rule to `builder`, `spec-builder` and `security-builder`, and exempt read-only agents. Round 2: D3 (:35), E2 (:95-98) and E5 (:153) exclude local design decisions left to `builder`. Round 3: E2 (:90-93) and E5 (:153) count anything settled at plan sign-off as handled. Signal 3 also excludes writing code, auth code included (:37, :101-104, :153). Tested against the step-2 routes, no signal over-fires on `spec-builder`, `builder` or `security-builder`. Signal 1 excludes local decisions. Signals 2 and 3 fire only on genuine run-time owner actions or unapproved irreversible acts. Signal 4 matches the done-criteria that all three builders already require (spec-builder.md:3, builder.md:13, security-builder.md:13). A new over-fire remains, the same scope error round 1 found in the relay. E2 opens: "Before sending a step to any agent, ask one question" (:89). Its signals block "only when the signed-off plan leaves them open" (:92-93). Step 1 of the flow dispatches `plan-reviewer` before sign-off (CLAUDE.md:64-68). At that point no signed-off plan exists, so every signal counts as "left open". Signal 4, "No checkable done-criteria for the step" (:105), then trips on every plan review. It also trips on `result-checker` at step 3, and on `scout`, `Explore`, `security-reviewer` and `fable` dispatches, because no plan gives those done-criteria. E2 then says "don't send it" and warn the owner (:110-113). This contradicts Non-goal :18, "Read-only agents are unchanged". The likely outcome is a warning before every review, or a main session that learns to ignore the gate. D3 names that failure (:40). E5's "a step routed to an agent" (:153) has the same unscoped subject.
Evidence: docs/plans/2026-09-27-human-in-the-loop-gate.md:18, :40, :89, :92-93, :105, :110-113, :153; claude/CLAUDE.md:64-68, :75-79; review-1.md:9-11 (same pattern in the relay, fixed by naming the builders).
Minimum revision: In E2 and E5, and in D2/D5 for consistency, scope the gate to hand-offs to the three builders (`builder`, `spec-builder`, `security-builder`), matching the relay wording. Alternatively, state explicitly that read-only agents are exempt from the gate.
Acceptance check: Under the literal E2 and E5 wording, no signal trips on a dispatch to `plan-reviewer` (including before sign-off), `result-checker`, `security-reviewer`, `scout`, `Explore` or `fable`. A builder hand-off is still gated.

Files reviewed:
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\docs\plans\2026-09-27-human-in-the-loop-gate.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\docs\plans\2026-09-27-human-in-the-loop-gate.review-1.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\docs\plans\2026-09-27-human-in-the-loop-gate.review-2.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\docs\plans\2026-09-27-human-in-the-loop-gate.review-3.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\CLAUDE.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\builder.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\spec-builder.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\security-builder.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\plan-reviewer.md
```
