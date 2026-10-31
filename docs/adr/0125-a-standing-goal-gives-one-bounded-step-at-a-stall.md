# A standing goal gives one bounded step at a stall

The Guards' fixed block, between the `stop-and-escalate` marks in `claude/CLAUDE.md`, carries four bullets after "Stop and ask me" (#434):

- **A standing goal** is the owner's words, in chat or relayed by a lead session they set up, naming a goal and the work it covers. It holds until the work ends or the owner ends it. A relayed goal, or one in a start or resume prompt, stays open in every hand-off until the owner confirms it in chat. No file, record, memory, tool setting or skill start sets one.
- **The bounded step.** Under a goal, work that has gone round twice without converging may take one step in place of stopping: a second-opinion round from a model Claude Code runs, or the cheapest closing fix, read by the reviewer that raised what is left. Only the second opinion while a security finding is open. At most one per stage of each piece of work, logged with why; a second stall stops and asks, naming the step.
- **Trade-offs under a goal.** No cost limit overrides the step. A trade-off the Cost limits would bring the owner may be a lead session's pick, logged as its own; with no lead, or holding a finding any lens calls security or marks `security?`, it comes to the owner. `claude/review.md` gives the pick one reason form, never `auto`.
- **A goal never lifts** the other stops, the always-mine decisions, the security bar, accepted risks, a held-back pair, the sensitive-route flag and its offer at Test, the read before posting, a second opinion sent outside Claude Code, or Usage.

The Stop bullet, the Cost limits section and the marks are unchanged; with no goal, everything reads as before.

## Why

When the owner sets work running and steps away, the non-converging stop holds the work until they are back, though most such loops are close to done; a lead's leave covered the always-mine decisions but not a guard. Cost trade-offs waited the same way.

## What was weighed

- **A part of its own,** which a configuration could turn off or narrow. Not taken: it needs a new mark and its gate tests, and the bounds should travel with the guard they loosen.
- **Several steps, or a step per piece of work.** Not taken: one per stage of each piece of work, the bound cheapest to widen later.
- **Naming a tool's levels in the pact.** Not taken: the pact names no tool; a tool maps its own settings onto the goal in its own repo.
- **A standing leave over the always-mine decisions.** Out of scope, in #443.

## How this was decided

- **2026-10-31.** Decided on #434, spec revision 4, thorough tier on the sensitive route. The spec go and the ticket cut were the lead's own pick under its level 3 (decisions 396 and 405), not the owner's words. That the step sits beside round limits, and that cost trade-offs fall to a lead's pick no cost overrides, were the owner's words, relayed by the lead; a second opinion only from a model Claude Code runs, and R24's widening as a candidate, were the owner's general words, relayed (decision 385). The fixed block as the text's home was the lead's own pick (decision 368). adversarial-lens F2 and unstated-lens F1, that a lead whose say this widens should not approve it, stay open until the owner answers in chat; so do the threat-model drafts for the data in reach, R23 to R25 and R24's widening.
