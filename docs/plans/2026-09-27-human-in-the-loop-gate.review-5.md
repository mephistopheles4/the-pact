# plan-reviewer, round 5 — verbatim

Reviewed: `2026-09-27-human-in-the-loop-gate.md`, draft 5. 2026-09-27.

```text
REVISE

Headline: Gate re-fires when a builder is re-tasked with the owner's answer
Blocker: Rounds 1–4 are closed. Round 1: E2 (:124-131) and E3 (:139-140) scope the missing-status-line rule to `builder`, `spec-builder` and `security-builder`, and exempt read-only agents. Round 2: signal 1 excludes local design decisions left to `builder` (D3 :37, E2 :100-103, E5 :158). Round 3: anything settled at plan sign-off counts as handled, and writing code, auth code included, is not an irreversible action (D2 :31, D3 :39, E2 :95-96 and :106-109, E5 :158). Round 4: the gate covers the three builders only, and read-only dispatches are never gated (D2 :29, E2 :90-93, E5 :158). I traced each read-only dispatch in the flow: plan-reviewer before sign-off, security-reviewer, result-checker, scout, Explore and fable. None trips the gate or the relay. First hand-offs to the three builders do not over-fire either. One builder dispatch still over-fires: the re-task that this plan itself creates. Non-goal :17 says "Stopping is how it asks; the main session re-tasks it with the answer." That re-task is a hand-off to a builder, so the gate runs on it. The gate treats a need as handled only if plan sign-off settled it. E2 :95-98 says "Anything I settle at plan sign-off … is handled" and signals block "only when the signed-off plan leaves them open". E5 :158 says "Need the plan settles for owner sign-off … = handled". D2 :31 says "Sign-off happens before any dispatch." An answer the owner gives in chat to a relayed `BLOCKED` is not plan sign-off. On the literal wording, the signed-off plan still leaves that decision open. Re-tasking `builder` after it reports an architecture fork (builder.md:17) therefore trips signal 1 again. A run-time approval given in chat trips signal 2 the same way. The owner answers the question, then gets a `⚠ Needs a human` warning about the question they just answered. D3 :42 and Unhappy paths :188 name this failure: the gate fires until the owner learns to wave it through. It is the same kind of scope error as round 4, now on the relay-to-re-task path.
Evidence: docs/plans/2026-09-27-human-in-the-loop-gate.md:17, :31, :42, :95-98, :115-118, :158, :188; claude/agents/builder.md:17; claude/agents/spec-builder.md:17
Minimum revision: In E2 and E5, and in D2 for consistency, count an explicit owner answer or approval given after dispatch (for example, in reply to a relayed `BLOCKED` or to a gate warning) as handled, the same as plan sign-off. The alternative is to require that such an answer be recorded in the plan before the re-task, and to say so.
Acceptance check: Under the literal E2 and E5 wording, re-tasking a builder with the owner's answer to its `BLOCKED` report trips no signal. A first hand-off whose owner decision is still open is still gated.

Files reviewed:
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\docs\plans\2026-09-27-human-in-the-loop-gate.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\docs\plans\2026-09-27-human-in-the-loop-gate.review-1.md through .review-4.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\CLAUDE.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\builder.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\spec-builder.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\security-builder.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\plan-reviewer.md
```
