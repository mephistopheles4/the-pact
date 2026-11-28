# Report folds on Linear

PACT-83. `claude/review.md`'s Posting section described one fold for a verbatim lens report: GitHub's details element. Linear shows HTML tags as text, so a report folded that way on a Linear record shows raw tags.

The bullet now names both places. On GitHub, the fold is a details element, as before. On Linear, it is a `+++ <lens>: <verdict>` line, the fenced `text` block, then a `+++` line, with no HTML. A post handed to another session takes the form of the place it will land, as for diagrams. The fence rule is unchanged: one backtick longer than the report's longest run, so nothing in a report renders.

No `docs/rule-reasons.md` row: that file covers the rules file, and `review.md` is not it. The cloud copy is regenerated. After merge, install from the dry run, and paste the new wrapper into the cloud environment's setup field by hand.

**Rolling back:** revert the merge, rerun `node cloud-sessions/gen.mjs`, reinstall from the dry run, and paste the reverted wrapper into the cloud environment's setup field.

## Record

- The ticket, with the render test, the checkpoints and the reviews: PACT-83 on Linear.
