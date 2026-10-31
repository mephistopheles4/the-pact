# A follow-up issue needs a trigger, or it stays a note

The default Cost limits row Follow-up issues counts issues filed from one review, each naming its trigger: an event or step that must not happen before it lands, such as a release, an install or a feature turned on. An issue with no trigger counts as past the limit, so the One rule sends it through At the limit to a note in the review's record, from the first one on. The limit of 2 stays for issues with a trigger, and the owner may still pick any note to file, as an override the One rule already allows (#444). The review procedure's overflow note gives "no trigger" as its reason text beside "issues overflow".

## Why

Review rounds, security rounds above all, kept ending in follow-up issues, each a narrower form of the same gap, filed because filing closes a round. Without a trigger nobody picks them up. A trigger keeps the ones that guard something real; the rest stay findable as notes.

## What was weighed

- **A second row, "untriggered follow-up issues", at a limit of 0.** Not taken: it would need its own definition, and as a cost no quality's Enough names, it would limit the review itself, a second counting rule. One row keeps both Enough cells (Functional suitability, Security) and the review procedure's references working.
- **The examples in the row.** Not taken: the builder caps Counted as at 160 characters, so the row carries the definition and this ADR the examples.
- **Something that raises a filed follow-up issue as its trigger nears.** Not built; a session reads the open issues before the step itself. Left as a note on #444.

A finding routed to a note is never dropped, and the security bar still holds for a security finding, whichever way it is routed.

## How this was decided

- **2026-10-31.** The owner agreed in a lead session's chat that a follow-up issue needs a trigger and that it belongs in a pact cost limit, relayed by the headchef into #444. Standard tier; the spec go on revision 2 was the lead's own pick under the owner's level-3 command, not the owner's words. Built by do-444.
