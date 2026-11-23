# Review diagrams on Linear

PACT-79. Review records moved to Linear, and the review comments posted there stopped carrying diagrams. The only diagram block `claude/review-diagrams.md` described was GitHub's `<div align="center">` wrapper, and nothing said whether Linear draws Mermaid. A session could read Linear as a place that can't draw diagrams and leave them out.

The block bullet now names both places. On GitHub, the div wrapper stays as it was. On Linear, the `mermaid` fence goes alone, with no HTML around it. A test comment on PACT-79 posted both forms. The owner's screenshot showed that both draw, and that Linear shows the div tags as literal text above and below the diagram. A post handed to another session, as a cloud session hands its posts to its starter, takes the form of the place it will land. The no-diagram bullet now says GitHub and Linear both draw diagrams. No render-failure fallback was added: ADR 0138 keeps the correction comment cut.

The poster is unchanged. Its `fence/unclosed` check never sees a Linear post, so an open fence there goes uncaught. That is reported as an accepted-risk candidate, not built.

No `docs/rule-reasons.md` row: that file covers the rules file, and `review-diagrams.md` is not it. The cloud copy is regenerated. After merge, install from the dry run, and paste the new wrapper into the cloud environment's setup field by hand.

**Rolling back:** revert the merge, rerun `node cloud-sessions/gen.mjs`, reinstall from the dry run, and paste the reverted wrapper into the cloud environment's setup field.

## Record

- The ticket, with the render test, the spec and its reviews: PACT-79 on Linear.
