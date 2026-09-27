# plan-reviewer, round 1 — verbatim

Reviewed: `2026-09-27-human-in-the-loop-gate.md`, draft 1. 2026-09-27.

```text
REVISE

Headline: Missing-status-line escalation fires on every read-only agent return
Blocker: E3 adds the stop-and-escalate bullet "an agent reports `BLOCKED` or `PARTIAL`, or omits its status line". That bullet covers every agent. But the Non-goals exempt read-only agents from the status line: scout, Explore, plan-reviewer, security-reviewer, test-reviewer and result-checker. plan-reviewer is also required to return "`READY` and no other text", so it can never carry a status line. Read literally, every read-only return is a "protocol miss" that halts work and waits for the owner. That includes every plan-reviewer READY and every result-checker verdict. E2's relay sentence "On `BLOCKED`, `PARTIAL`, or no status line, show me the agent's report verbatim" has the same ambiguity. CLAUDE.md says no skill overrides these stops, so the main session cannot reason its way past the over-fire. The rule would either stall the whole flow or teach the main session to ignore the relay. Both outcomes defeat D7's stated purpose.
Evidence: docs/plans/2026-09-27-human-in-the-loop-gate.md:18 (read-only agents get no status line), :100-105 (E2 relay text), :113 (E3 bullet says "an agent"); claude/agents/plan-reviewer.md:21 ("`READY` and no other text"); claude/CLAUDE.md:48-52 (stops cannot be overridden by skills).
Minimum revision: Limit the E3 bullet and the E2 relay sentence to the three builder agents (builder, spec-builder, security-builder). For example, say "a builder reports ... or omits its status line", matching D6's scope.
Acceptance check: The revised E2 and E3 text names the builder agents, or says "builder", as the subject of the missing-status-line rule. No clause of E2 or E3 treats a plan-reviewer, result-checker, scout, Explore, security-reviewer or test-reviewer return without a status line as a protocol miss or an escalation trigger.

Files reviewed:
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\docs\plans\2026-09-27-human-in-the-loop-gate.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\CLAUDE.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\builder.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\spec-builder.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\security-builder.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\claude\agents\plan-reviewer.md
```
