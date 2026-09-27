# plan-reviewer, round 2 — verbatim

Reviewed: `2026-09-27-human-in-the-loop-gate.md`, draft 2. 2026-09-27.

```text
REVISE

Headline: Signal 1 blocks every hand-off to builder, which exists for open decisions
Blocker: The round-1 blocker is closed. E2 (plan :100-104) and E3 (plan :114-115) now limit the missing-status-line rule to `builder`, `spec-builder` and `security-builder`, and no clause treats a read-only return as a protocol miss. A new over-fire of the same kind remains, this time in the gate. Signal 1 in E2 (plan :86, "An open decision left for build time") and in E5 (plan :133, "open build-time decision") is not scoped to decisions only the owner can make. The existing flow deliberately leaves design decisions to `builder`. Step 2 says "work with design decisions left to `builder`" (CLAUDE.md:69-70). builder.md:3 and :13 say builder "makes reasonable local design decisions itself" and owns naming, structure and error handling. Read literally, every step routed to `builder` trips signal 1. E2 then says "don't send it" and warn the owner. E5 makes `plan-reviewer` return a P2 REVISE for any plan that routes such a step to an agent. The only exits are "resolved now", "split off" or "kept in main session", and they remove the reason `builder` exists. D3's "pick whichever fits" example (plan :33) shows the intent is narrower, but that example is not carried into the text that ships in E2 or E5. The likely outcome is either a stalled `builder` route, or a main session and reviewer that learn to ignore the gate. D3 names exactly that failure (plan :38).
Evidence: docs/plans/2026-09-27-human-in-the-loop-gate.md:33, :38, :86, :133; claude/CLAUDE.md:69-70; claude/agents/builder.md:3, :13, :17.
Minimum revision: In E2 and E5, and in D3 for consistency, narrow signal 1 to decisions that need the owner. Examples are product or scope choices, or architecture forks with codebase-wide consequences, matching builder.md:17. State explicitly that local design decisions delegated to `builder` do not trip the signal.
Acceptance check: The E2 and E5 text for signal 1 excludes builder-owned local design decisions. A plan that routes a goal, constraints and done-criteria task to `builder`, with only local design choices open, trips no signal under the literal E2 or E5 wording.

Files reviewed:
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\docs\plans\2026-09-27-human-in-the-loop-gate.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\docs\plans\2026-09-27-human-in-the-loop-gate.review-1.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\CLAUDE.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\builder.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\spec-builder.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\security-builder.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\plan-reviewer.md
```
