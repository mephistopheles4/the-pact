# Why each rule is in the pact

The pact states only what nothing else covers (#450). Each rule in the rules
file, as rendered from the default configuration with both pact tools on, has
a row here naming the gap it covers that no other guardrail does: not Claude
Code's harness, and not the pact's own threat model, poster, cleaner, gate or
hooks. A rule nobody can write a row for is a duplicate and goes. A rule the
threat model names as one of its controls never counts as covered by it,
since the threat model relies on it. `gate/tests/rule-budget.test.mjs` holds
this table and the rules file one to one.

A rule is each `##` section, and each paragraph or list item that opens with
bold text, named by that text. The renderer's configuration notice is not a
rule. A plain paragraph or a table row has no row of its own: its section's
row carries its reason, and review checks it (`AGENTS.md`, Reviewing a change
here). Where a row says "the owner's", the gap is that no tool can know the
owner's own choice.

This file is never installed.

| Rule | Gap no other guardrail covers |
| --- | --- |
| The moves | The owner's own practices. No tool knows how the owner works. |
| Sense the work | Sizing, and a bug traced before any fix, are the owner's practices, not a tool's. |
| Think before doing | An intent clear enough to defend. No check can test that. |
| Checkpoint the seams | It weighs hand-offs and decisions, not only tool actions, by how hard each is to undo. The harness's confirm-first rule covers tool actions only. |
| Stay the owner | What counts as evidence: checks that could have failed. A passing check is all a tool reports. |
| How Claude helps | The owner's pace and lead. The harness knows neither. |
| Build what you were given | Start an approved spec test-first at once. The harness has no idea of an approved spec. |
| Prototype first | The owner's way of shaping a spec. No tool chooses a throwaway over a plan. |
| Nudge once | How much to remind the owner of a dropped move. Nothing else knows the moves. |
| Bring me decisions | How a review is sorted for the owner. No tool sorts findings. |
| These decisions are always mine | The owner's map of decisions. The harness defers to durable authorization, and this list is that authorization's limits. A command only the owner can run is handed over and waited on: the harness says how to hand it over, not to wait. |
| Finish the build | Offering the reviews the work calls for. The harness may run tests, but it knows no review roster. |
| Keep the record where the project keeps it | State for the next session and the owner. Compaction keeps a summary inside this session only. |
| Post through the poster | When to use the tool, and what it can't check: the scratch folder, deleting the file after, not working around a refusal. |
| Clean up through the cleaner | It ties a removal to the owner's yes, which the cleaner can't tell (threat model R63). |
| Say a mismatch first | Fit of tier and model to the work. No tool judges it. |
| How much checking | The tiers, the sensitive route, and the effort line. A session is told its model but not its effort. |
| Workflow | The owner's stages and which lens goes where. No tool sequences the work. |
| Lenses | The lens roster: the owner's choice of reviewers, which no tool holds. |
| Lenses are offers | The protected set: offers, and declines kept open. |
| Before you run a lens or post to the record, read the pact's review procedure | Points to the procedure, which no tool loads. |
| Qualities | The owner's quality list, with the lens that checks each. No tool measures them. |
| Trade-off points | What a spec must record about trade-offs. No tool reads a spec. |
| Business drivers | Which driver decides, and the default when none is written. No tool weighs a trade-off. |
| Cost limits | What review may spend, and what happens at each limit. The harness meters usage, not review. |
| One rule | No finding is dropped silently at a limit. Nothing else routes findings. |
| The security bar | When a security fix is due. No tool weighs a fix's cost against its risk. |
| An empty limit | Who decides an unset limit. Nothing else would. |
| A security finding | The definition the sorter uses. The classifier judges actions, not findings. |
| The sensitive-list check | What the security lenses check in the threat model. The threat model can't check itself. |
| Accepted risks | Who records a risk, and where. The threat model holds the record, and this rule says how it is written. |
| Detail | What an accepted-risk entry may say. No tool reads an entry before it is written. |
| Threat-model revision | Nothing else re-reads an accepted risk once it is recorded. |
| Guards | The stops the owner keeps, beyond the harness's confirm-first. |
| Stop and ask me | A fixed stop that holds where the harness would take a durable authorization. The threat model names it as the control in R23 to R25. |
| A standing goal | What counts as the owner's standing goal, and what can never set one: a file, memory, a tool's signal, starting a skill. Claude Code has no notion of a goal, and its rule on other sessions' messages covers only one of those sources. |
| The bounded step | One step in place of stopping, under a goal, at a stall. No tool or harness behaviour gives a step past the stop. |
| Trade-offs under a goal | The step outranks the cost limits, but a trade-off still comes to the owner. Nothing else holds the pact's review economics. |
| A goal never lifts | The stops and owner decisions a goal leaves standing. Only the pact holds them. |
| Usage | A pause on weekly usage. The harness has no such pause. |
