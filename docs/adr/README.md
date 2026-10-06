# Decision records

One line per ADR: what it decided, and when to read it. Open the file for the reasoning.

- [0001](0001-plain-agent-names.md) — **Plain agent names.** Agents are named for their job. Read when naming or renaming an agent.
- [0002](0002-tool-allowlists.md) — **Tool allowlists.** Agents list the tools they may use, not the ones they may not. Read when changing an agent's `tools:` line.
- [0003](0003-missing-tool-is-reported.md) — **A missing tool is reported.** An agent stops and names the tool; it never rebuilds it through the shell. Read when an agent lacks a tool.
- [0004](0004-gate-on-after-dispatch-needs.md) — **Gate on after-dispatch needs.** Builder hand-offs were gated on needs that arise after dispatch (builders since retired by 0010). Read for the history of move 3.
- [0005](0005-status-line-and-verbatim-relay.md) — **Status line and verbatim relay.** Builders opened with a STATUS line; BLOCKED was relayed word for word. Read for the history of verbatim relay.
- [0006](0006-root-agents-md.md) — **Root AGENTS.md.** This repo's rules live in AGENTS.md; CLAUDE.md only imports it. Read before adding a repo rule.
- [0007](0007-only-decisions-are-committed.md) — **Only decisions are committed.** Plans and reviews live on the issue; the tree keeps ADRs and logs. Read when deciding where a record goes.
- [0008](0008-throwaway-after-two-paper-rounds.md) — **Throwaway after two paper rounds.** Two review rounds without READY open the option of a throwaway build. Read when a plan review stalls.
- [0009](0009-hand-over-user-only-skills.md) — **Hand over user-only skills.** The model ends its turn with a `▶ Your move` line instead of running the skill. Read when a move reaches a user-only skill.
- [0010](0010-build-in-the-main-session-with-process-tiers.md) — **Main-session builds and process tiers.** Builds run in a watched main session; work gets a tier up front. Read for why builder agents retired and how tiers began.
- [0011](0011-one-model-per-session.md) — **One model per session.** Sessions split at phase boundaries and never switch model. Read when planning sessions or models.
- [0012](0012-reports-for-two-readers.md) — **Reports for two readers.** Reading agents write For the owner, then For the session. Read when writing or changing a reviewer's report format.
- [0013](0013-effort-follows-the-tier.md) — **Effort follows the tier.** One effort value per tier and phase, copied by triage. Read when setting a session's effort.
- [0014](0014-evidence-in-proportion-to-the-cost-of-being-wrong.md) — **Evidence in proportion.** A planted probe only on the security floor; proof by use otherwise. Read before testing a rule or agent change.
- [0015](0015-practice-runs-in-an-isolated-container.md) — **Practice runs in a container.** Real practice runs happen in a sandbox that never holds the checkout. Read before running a practice case or probe.
- [0016](0016-each-lens-opens-with-a-red-step.md) — **Each lens opens with a red step.** A lens writes how each claim could be wrong before it looks at evidence. Read when writing or changing a lens.
- [0017](0017-lens-files-ship-unsealed.md) — **Lens files ship unsealed.** The QA-pair lenses are plain files in `claude/agents/`. Read when changing where a lens lives.
- [0018](0018-fix-path-stands-in-for-the-plan-review.md) — **Fix path for case fixes.** A security-set case fix that keeps its expected result goes through #35's fix path, not a spec change. Read when a security-set case fails.
