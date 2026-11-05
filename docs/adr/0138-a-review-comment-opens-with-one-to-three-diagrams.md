# A review comment opens with one to three diagrams

`claude/review.md`'s "One review comment per round" bullet now opens the comment with a title line, 1 to 3 Mermaid diagrams and a count line, written last from the final Lens dispositions table (#478). A new Diagrams section holds the rules:

- **Every comment has 1 to 3 diagrams.** A round with few findings or none still gets one, drawing how the change works now or what the spec covers. A place that can't draw them gets the title and count lines as plain text.
- **The sentence first, then the type.** The session writes the one sentence the diagram must explain, as its heading, and the type follows from a seven-row table: sequence, state, quadrant, timeline, ER, mindmap or flowchart, and a flowchart for location only.
- **A flowchart is never the default.** A comment holds at most one, used only when no other row answers the sentence.
- **The templates return:** the type table, the pin palette (fate colours on flowcharts only) and the centred block.
- **Carried rules:** labels are the session's own words with no link or directive, an open security finding is shown by part and class and never as the steps of its path, and a withheld lens stays out of the diagrams and the counts.

The signal table, alert boxes, fate emoji, verdict line, crossed-findings fold, the fold around the table, the render-failure correction comment and the size-split rule stay cut. The poster is unchanged: its `fence/unclosed` check still guards the diagram fences.

This supersedes in part [ADR 0117](0117-a-review-comment-opens-with-a-human-layer-and-folds-its-data.md), whose human layer #466 cut, and [ADR 0123](0123-review-diagrams-pick-their-type-by-the-readers-question.md), whose sentence-first rule and type table come back here with the flowchart limit. Both stay as the record.

## Why

#466 cut the review procedure to a minimal one, and with it every diagram rule. The owner: "i just want to be able to see 1 to 3 diagrams per review comment that way i can quickly understand what the review is saying", and that the old rules "always produced one diagram and it was a flow chart like 90% of the time". ADR 0123 had put the flowchart last in its table and it still won, so a table alone did not stop the habit; the at-most-one and only-when-nothing-else-answers rules do.

## What was weighed

- **The diagram alone, or the diagram with the title and count lines only.** The owner's words ask for the diagrams; the title and count lines give each round the same opening shape for about 100 words.
- **The signal table and alert boxes.** Not taken: the owner is "ok with the rules" and asked only for diagrams.
- **A zero-diagram case for a small round.** Not taken: the owner wants diagrams generously, so a small round draws how the change works.
- **An eval case for the flowchart rule.** Not taken: the owner asked "why do we need evals?". A tally of the next ten reviews after merge is the measure, if the owner asks for it.
- **Showing an open security finding as a sequence.** Not taken, as in ADR 0123: the post is public, so it is shown by part and class.

## What it costs

About 440 more words in `review.md`, read before a lens or a post and not loaded by every session; the rules file is unchanged. The verbatim report in the same comment may still hold the steps of a security path, which the threat model's "Posts are public" covers, so the label rule only keeps them out of the picture.

## How this was decided

- **2026-11-05** on #478, standard tier, specified and built by pact-478, relayed by backlog-lead. The owner's words came by relay, with "Yes, proceed", "mermaid can render in the chat btw" and "why do we need evals?" on spec revision 2.
