# Builder hand-offs are gated on needs that arise after dispatch

Before the main session hands a step to `builder`, `spec-builder` or `security-builder`, it asks one question: will this step need the owner after it is dispatched? Anything the owner settled at plan sign-off (a decision, an approval, done-criteria) is handled, and so is an explicit answer the owner gives later in chat. Only four signals block, and only when neither settles them: an owner decision left for build time, an owner-only action during the build, an irreversible action the agent would take itself that nobody approved, and no checkable done-criteria. On a trip, the main session does not send the step; it warns in a fixed form, names the options with a recommendation, and waits. Read-only agents are never gated. Every plan carries a "Needs a human" section, and `plan-reviewer` treats a missing one, or an unhandled signal, as a blocker.

## Why

- **A subagent cannot reach the owner.** When a task needs a human partway through, the agent can only stop and report. Catching the foreseeable cases before dispatch saves a wasted run.
- **Sign-off already settles most needs.** Sign-off happens before any dispatch, so an answer given there travels with the agent. The broad question, "does this step involve the owner?", blocked routine hand-offs: `builder`'s own design calls, and every auth change CLAUDE.md sends to `security-builder`.
- **Builders only, and later answers count.** Even on the narrower question, an unscoped gate tripped on every reviewer dispatch, and a gate that honoured only sign-off re-fired on the re-task carrying the owner's answer. Hence the scope and the "explicit answer given later" clause.
- **Narrow signals keep the warning meaningful.** A gate that fires on everything teaches the owner to wave it through. Four named signals are the whole list.
- **The warning waits for the owner.** Which way forward to take is the owner's call, as with every other stop.
- **Consistent with the owner's private research,** which is silent on a pre-dispatch gate but rests on the same premise: an agent cannot pause mid-run, so it stops and reports with its question.

## How this was decided

- **2026-09-27** — Planned over five `plan-reviewer` rounds. Each round found one more rule that, read literally, fired on routine work: round 1 the relay on every read-only return, then rounds 2 to 5 the gate on one more routine hand-off each. Round 3 reframed the gate around needs that arise after dispatch. The rounds and the reframe are told in [the human-in-the-loop gate log](../log/2026-09-27-human-in-the-loop-gate.md). The plan and all five reviews are in `f2cee57`.
- **2026-09-27** — Built in `c0c8179` (CLAUDE.md, the three builders, `plan-reviewer`). A probe run in a fresh session showed `plan-reviewer` returning `REVISE` on a plan with its "Needs a human" section deleted, and `READY` on the unchanged plan (`507a6ab`).
- **Deferred:** a hook that enforces the gate, until the owner sees the main session skip it despite the rule.
