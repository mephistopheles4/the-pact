# Review diagrams pick their type by the reader's question

#432, standard tier, planned and specified by the 432 planner and designer, built by build-432, led by the headchef. The owner's words decided the questions; the lead relayed them.

A review of 44 recent diagrams found 38 flowcharts: the Diagrams table's first row fit every round, and "keep to forms you have seen render" favoured the type seen most. A prototype redrew one past diagram both ways, and the spec back-tested three past rounds: one gave a sequence, two kept a flowchart with a sentence saying why location was the point. The spec pair read two rounds; round 2 was declared final.

The build wrote one phrase-assertion test in `gate/tests/pact-call.test.mjs`, seen to fail first, then the text in `claude/review.md` (ADR 0123). A failed-render recovery by editing was dropped when the poster's `edit/record` rule showed it would refuse; the correction is a new comment. The measure, a tally of the next ten reviews, waits for the owner's yes.

## Record

- The plan and spec: https://github.com/mephistopheles4/the-pact/issues/432
