# The intent sets the edge

PACT-60. The owner: "It seems like we tried to be so prudent that we didn't even finish the work." Rules tickets that said "only marked rows change" were read as lists of sentences, so sessions left unmarked text that served a cut intent and listed it as leftovers.

No new rule. The record rule in `claude/review.md` already puts the owner's ask and the session's read-back, the Understood intent, on every issue, ticket and spec. Its "The read-back" bullet now opens by saying the read-back sets the work's edge: a listed set of rows, files or items is where the work starts, and a limit in the owner's words, such as "only these rows", still lets in the edits they force; a change the read-back needs is in scope, named in the record as following from it; only a change for another purpose goes to the owner, or to the lead that started the session; acceptance is checked against the read-back, the corrected one after a correction, and a leftovers list it covers means the work isn't done. `docs/agents/issue-tracker.md` (Tickets as sub-issues) has each ticket name its read-back and says its list is a starting point. The row for Keep the record in `docs/rule-reasons.md` carries the reason. The rules file's word count doesn't change.

The regenerated `builder/scriptorium.html` and the cloud copy (`cloud-sessions/cloud-setup.sh`, `cloud-setup-wrapper.sh`) carry the new `claude/review.md` text; once this merges, the owner pastes the wrapper into the cloud environment's setup field again.

**Rolling back:** revert the merge, rerun the regens and reinstall from the dry run.

## Record

- The ticket: PACT-60 on Linear.
