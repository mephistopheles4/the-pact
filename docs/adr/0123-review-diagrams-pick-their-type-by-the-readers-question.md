# Review diagrams pick their type by the reader's question

`claude/review.md`'s Diagrams paragraph now starts from a sentence, not a situation (#432):

- **The sentence first.** Before picking a type, the session writes the one sentence the diagram must explain: what the owner needs to understand to decide, or to trust the result. It is the diagram's heading and follows the labels rule. If no diagram can answer it, none is drawn.
- **A table keyed by the question,** in this order: how it failed or works (sequence), how the state changes (state), what to weigh (quadrant, only when the lenses give both axes), what happened across rounds (timeline), what the data holds (ER), what a spec's structure or claims cover (flowchart or mindmap), and where it sits (flowchart, last, only when location is the point).
- **Fate colours on flowcharts only.** Other types carry none; the signal table and boxes carry fate.
- **An open security finding** stays pinned by part and class on a flowchart whatever the question, and its heading names the part and class, never the steps of its path. A fixed one is drawn as any fixed finding.
- **The types are the ones the table names.** "Keep to forms you have seen render" is gone. A diagram GitHub can't draw still shows as an error box. When the owner sees it on reading, who then tells the posting session, or that session sees it on opening the posted page, the session posts a correction comment: a flowchart under a sentence asking where it sits (none when the failed diagram was already a flowchart), a line naming the round, and its signature. It is an exception to one comment per review round, beside the size rule's parts, and not a review record.

This amends the diagram bullet of [ADR 0117](0117-a-review-comment-opens-with-a-human-layer-and-folds-its-data.md), "Diagrams draw the situation", and adds an exception to that ADR's one comment per review round.

## Why

Of the last 44 diagrams in review comments across the owner's three repos, 38 were flowcharts. The old first row, findings across parts, fit every round, nothing asked what the reader needed explained, and "forms you have seen render" favoured the type seen most. A back-test of three past rounds under the new text gave one sequence and two flowcharts that now say why location is the point.

## What was weighed

- **Colour on every type.** Not taken (q2): it needs a styling rule per type, unseen on GitHub, and is cheaper to add later.
- **Drawing a sequence for an open security finding.** Not taken (q3, q4): the repo is public, so an open finding is pinned by part and class.
- **Editing a failed diagram through the poster.** Not possible: the poster refuses an edit to a review record (`edit/record`), so the correction is a new comment (q10).
- **A poster check on diagram types or headings.** Out of scope; the measure is a tally of the next ten reviews, filed after merge on the owner's yes.

## How this was decided

- **2026-10-29.** Decided on #432, spec revision 4, standard tier. q1, q2, q5, q6, q8, q9, q10 and q11 were the owner's words, relayed by the lead; q3 and q4 were the owner's decision from chat. The measure's home was the lead's pick at level 2.
