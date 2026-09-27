# plan-reviewer, round 3 — verbatim

Reviewed: `2026-09-27-human-in-the-loop-gate.md`, draft 3. 2026-09-27.

```text
REVISE

Headline: Signal 3 blocks every required security-builder hand-off for auth changes
Blocker: Rounds 1 and 2 are closed. For round 1, E2 (plan :103-109) and E3 (plan :117-118) limit the missing-status-line rule to `builder`, `spec-builder` and `security-builder`, and E2 exempts read-only agents. For round 2, signal 1 in D3 (:33), E2 (:86-89) and E5 (:136) now excludes local design decisions left to `builder`. The same over-fire remains on signal 3, "hard-to-reverse action: publishing, data migrations, auth changes". CLAUDE.md step 2 requires every auth change to go to `security-builder` (CLAUDE.md:71-74), so that step always trips signal 3. E2 and E5 accept only three ways to handle a tripped step. "Kept in main session" breaks "Never substitute another agent, especially for security work" (CLAUDE.md:74). "Split off" does not apply, because the auth change is the step itself. "Resolved now" cannot be met when `plan-reviewer` runs, because the owner signs off only after reading `plan-reviewer`'s findings (CLAUDE.md:64-68; plan E1 :71-76). Read literally, E5 gives every auth, data-migration or publish plan a P2 REVISE, and E2 says "don't send it". D3 (:38) says the gate only "moves that check earlier", which implies owner sign-off counts as handling. That intent is not carried into the text that ships in E2 or E5. Round 2 blocked signal 1 on the same pattern: intent stated in D3 but missing from E2 and E5.
Evidence: docs/plans/2026-09-27-human-in-the-loop-gate.md:35, :38, :91, :94-96, :100-101, :136; claude/CLAUDE.md:64-68, :71-74, :85-86; claude/agents/security-builder.md:3.
Minimum revision: In E2 and E5, and in D2/D3 to match, state that the owner's approval, recorded at plan sign-off, counts as handling for signals 2 and 3. Once the plan is signed off, the step may be delegated, for example to `security-builder`.
Acceptance check: Take a plan that routes an auth change to `security-builder` and whose "Needs a human" section says "owner approves at plan sign-off". Under the literal E5 wording, it draws no P2. Under the literal E2 wording, the main session may send it after sign-off without the warning.

Files reviewed:
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\docs\plans\2026-09-27-human-in-the-loop-gate.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\docs\plans\2026-09-27-human-in-the-loop-gate.review-1.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\docs\plans\2026-09-27-human-in-the-loop-gate.review-2.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\CLAUDE.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\builder.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\spec-builder.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\security-builder.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\plan-reviewer.md
```
