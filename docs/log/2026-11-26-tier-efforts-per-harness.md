# Each harness sets its own tier efforts

**2026-11-26.** PACT-111, ticket T1 of [spec 0008](../spec/0008-per-harness-models-and-efforts.md).

## What changed

- **Descriptions.** A harness description may name an effort per tier cell (`tierEfforts`) and the efforts it takes (`efforts`). An own entry's tier keys go over the known ones one by one, and `null` drops one.
- **Codex.** Its Standard tier builds at medium, in the tiers table and the workflow's Build row. Test stays as the tables say. Claude Code renders as before.
- **Antigravity.** It takes low, medium, high and xhigh.
- **Agents.** A model holding `<effort>`, reached through a role, now takes the agent file's effort.

**What the gate bounds differently:**

- A field outside its shape refuses (`harness-shape`): the two new ones, an `agentModels` value holding `<effort>`, and a model holding it twice.
- An own tier key that finds no cell refuses (`tier-effort`). A known one warns, and the rules render without it.
- An agent whose effort a `<effort>` model can't take, or that sets none, refuses (`agent-effort`).
- The dry run warns on an `agentModels` key naming no pact agent, and on a table cell at an effort the harness doesn't take.

**Rolling back:** an installer from before this change refuses `tierEfforts` and `efforts` (`harness-field`). Remove both from every own entry first, as [spec 0008](../spec/0008-per-harness-models-and-efforts.md) D8 says.

## Left open

- The page can't set a model per agent or an effort per tier yet: ticket T2.

## Record

- PACT-111 on Linear: the spec's rounds and decision
- Ticket T1's pull request into `pact-105-codex-sol`
