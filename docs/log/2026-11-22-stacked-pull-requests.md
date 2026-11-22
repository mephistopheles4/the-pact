# Stacked pull requests

PACT-40. Replaces a wait with a rule; raises one doc budget.

`docs/agents/parallel-sessions.md` said a ticket that depends on another waits for its PR to merge, so work paused on every merge. It now has a "Stacked pull requests" section: the next ticket branches from the previous ticket's branch and opens a draft PR with that branch as its base; a change lower in the stack means the tickets above rebase; the PRs merge bottom first, and each one above gets its base set to `main` and a rebase onto `main` without the merged commits (the merges are squashes, so a plain rebase replays them); each PR keeps its own Test evidence on its own head, taken again after a rebase. Two chains had been stacked this way on 2026-11-22 (the-pact 614 and 616, and three PRs in grimoire).

The doc went from 278 to 399 words, so its budget in `gate/tests/doc-budget.test.mjs` goes from 300 to 400. A budget raise is a spec change under `AGENTS.md`. No spec was written for it: the lead session approved the raise, citing the owner's standing direction in its chat that caps are soft, and PACT-39 drops the budgets. The lead's approval is not the owner's word. The owner then confirmed the raise, by voice in the lead's chat on 2026-11-22, and the lead relayed it: "Yeah, go for it." Their standing view is that caps are soft, with a ticket. This session did not hear it in its own chat, so it is a relayed confirmation.

The Test round's reader lens also suggested rules the ticket did not ask for: what to do when the ticket depended on has no PR yet, when a ticket depends on two open PRs, and when a stacked draft leaves draft. They are left out.

**Rolling back:** revert the merge. The wait rule returns with it.

## Record

- The ticket: PACT-40 on Linear.
