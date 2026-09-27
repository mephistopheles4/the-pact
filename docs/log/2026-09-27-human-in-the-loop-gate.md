# The human-in-the-loop gate, five review rounds, and a probe that failed on its first run

**2026-09-27** — Builder hand-offs are now gated on needs that arise after dispatch ([ADR 0004](../adr/0004-gate-on-after-dispatch-needs.md)), and builders open with a status line that the main session relays verbatim when it is not DONE ([ADR 0005](../adr/0005-status-line-and-verbatim-relay.md)). The plan took five `plan-reviewer` rounds. The probe failed on its first run, in the session that had installed the change, and passed in a fresh one.

## What it set out to do

A subagent cannot reach the owner. When a task needs a human partway through, the agent can only stop and report, and nothing made the main session pass that on. The plan closed the gap at both ends: a gate before dispatch for the needs that can be foreseen, and a relay after dispatch for the ones that can't.

## What each review round caught

Every round found the same kind of fault: a rule that, read literally, fired on routine work. Each fix closed one case, and the next round found another.

1. **The relay fired on every read-only agent.** The escalation bullet said "an agent" omits its status line. Read-only agents carry none, and `plan-reviewer` must return `READY` with no other text, so every review would have halted the flow. Fixed by naming the three builders.
2. **Signal 1 blocked every hand-off to `builder`.** "An open decision left for build time" covered the local design decisions that `builder` exists to make. Fixed by limiting it to decisions that need the owner: product or scope choices, and architecture forks with codebase-wide consequences.
3. **Signal 3 blocked every auth change.** "Hard-to-reverse action", including auth changes, tripped on every step CLAUDE.md requires to go to `security-builder`, and none of the three ways to handle a trip fitted. **This round reframed the gate.** Patching one signal per round was not converging, so the gate's question became: will this step need the owner *after* dispatch? Anything settled at plan sign-off counts as handled, and writing code, auth code included, is not an irreversible action.
4. **The gate covered every agent.** It tripped on `plan-reviewer` before any sign-off existed, and on every checker, `scout` and `Explore` dispatch, since no plan gives those done-criteria. Fixed by scoping the gate to the three builders. After this round the owner chose "keep going".
5. **The gate re-fired on the re-task carrying the owner's answer.** An answer given in chat to a relayed `BLOCKED` was not plan sign-off, so on the literal wording the owner would be warned about the question they had just answered. Fixed by counting an explicit owner answer given later the same as sign-off.

The owner approved building after round 5 with its fix applied, with no sixth round. Two rounds without converging is already a stop signal in the pact, and the options it offered were keep going, a second opinion, or stop. Building a throwaway was not among them; that gap is [ADR 0008](../adr/0008-throwaway-after-two-paper-rounds.md).

## What was built

`c0c8179`, built from the exact text the plan gave for each edit:
- **`claude/CLAUDE.md`:** step 1 of "Implementing a change" asks for a "Needs a human" section in every plan; a new subsection holds the gate, its four signals, the warning form and the relay rule; and a builder's `BLOCKED`, `PARTIAL` or missing status line becomes the first stop signal.
- **The three builders:** each opens its final message with `STATUS: DONE | BLOCKED | PARTIAL — <reason>`.
- **`plan-reviewer`:** a missing "Needs a human" section, or an unhandled signal on a builder step, is a P2 blocker.

`result-checker` confirmed every edit was in place exactly as the plan gave it, and nothing else changed. The change was then installed into `~/.claude/`, and each live file's hash matched its repo copy.

## What the probes showed

The expected results were committed before the first run (`4ef48c8`).
- **P1:** `plan-reviewer`, given a copy of the plan with its "Needs a human" section deleted, should return `REVISE` naming the missing section.
- **P2:** `spec-builder`, given a mechanical task on a file that does not exist, should open with `STATUS: BLOCKED` and name the file, and change nothing.

**Run 1, in the session that did the install** (`71053bd`):
- **P1 passed on its written criteria, but proved little.** The brief had passed `plan-reviewer.md` and `CLAUDE.md` as evidence, and both contain the new rule, so the reviewer may have applied what it read rather than its own definition. There was also no control run, which the reviewer pointed out itself.
- **P2 failed.** `spec-builder` stopped, named the missing file and edited nothing, but its first line was a plain sentence, not `STATUS: BLOCKED`. The live agent file had the rule. **The likely cause, not confirmed,** is that the session had loaded agent definitions at startup, before the install, and never reloaded them.

**Run 2, in a fresh session started after the install** (`507a6ab`). The live and repo copies of both agent files were hashed first and matched.
- **P1 passed, with a control.** The copy with the section deleted drew `REVISE` naming it; the unchanged plan drew a bare `READY`. No evidence files were passed this time.
- **P2 passed.** The first line was `STATUS: BLOCKED`, naming the missing file, and nothing changed. So run 1's failure most likely came from stale agent definitions, not from the rule.

**The lesson went into `AGENTS.md`:** run a probe after installing, in a fresh session, and don't hand the agent the rule under test as evidence.

## What is still open

- **P1 still can't tell the reviewer's own definition from the plan's text.** The plan itself states the rule, and the reviewer cited it. A plan that doesn't describe the rule would separate the two.
- **Nothing enforces the relay.** A hook that checks the status line is deferred until the owner sees the main session swallow a report despite the rule.
- **Review by paper converged slowly.** Five rounds for one plan is the case [ADR 0008](../adr/0008-throwaway-after-two-paper-rounds.md) answers; the option itself is follow-up F1.

## Record

- `f2cee57` — verbatim: the plan at draft 6, and `plan-reviewer` rounds 1 to 5 (on drafts 1 to 5). Drafts 1 to 5 were never committed on their own.
- `c0c8179` — the build (no plan artefact), plus verbatim: the `result-checker` report on it.
- `4ef48c8` — verbatim: the probes' expected results, written before the first run.
- `71053bd` — verbatim: probe run 1, with both agents' reports.
- `507a6ab` — verbatim: probe run 2, with all three agents' reports.
