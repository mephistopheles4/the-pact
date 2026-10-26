# A review comment opens with a human layer and folds its data

A posted review round opens with a layer for people: a title line with the verdict and what is for the owner, a signal table with one row per lens, one or more Mermaid diagrams chosen by the situation, GitHub alert boxes for decisions, and a count line. The Lens dispositions table, the crossed findings and the verbatim reports sit below in folds, the table byte for byte as before, so it can still be collected (#260). The poster refuses a fence left open, which would swallow the folds and the table (#401).

## Why

Posted rounds were walls of crossed tables and reports. The owner read them as data, not as a picture of the work, and decided from the table at the bottom. The table is the record a later round and a retrospective read; it is not meant for people. A layer on top lets a person see in seconds what is open, where it sits and what they must decide, and the table stays as it is.

## What was decided

- **The human layer may repeat the table,** and nothing reads it back. It is written last, from the final table: every count matches the table's rows, and every decision box is a row. The base line and the table stay the only record a follow-up reads.
- **Diagrams draw the situation.** A trust-boundary flowchart with findings pinned on the parts they touch, a sequence of a failure, a quadrant of open findings, a timeline across rounds, and others; more than one when the round needs them. One palette, translucent fills and solid borders, reads in light and dark themes. The fate colours moved from spec revision 4's, where decisions for the owner were red or orange, waiting yellow, and dismissed, noted and skipped white.
- **Today's withheld, escape and accepted-risk rules carry into the layer:** a withheld lens shows 🟡 and `withheld, see chat`, counts and the verdict word cover posted findings only, an escape shows only as a count or its placeholder, and an accepted risk is named by its class of path.
- **The poster adds `fence/unclosed`,** as a layout guard: a body that ends inside a fence, or a `mermaid` fence that runs into another fence or a fold's tag. The table check already read folds, so the folded table needed no change.

## What was weighed

- **One bold line and bullets above the folds** (the issue's first shape, spec revisions 1 and 2): the owner prototyped it on today's rounds and asked for pictures instead, because a short list still read as data.
- **A per-lens list on top:** it repeats the reports' structure; drawing the places where findings meet shows what the lenses found together.
- **The sensitive route** (spec revisions 5 and 6): the security pair asked for a poster check on Mermaid directives and a threat-model line. The owner declined the route ("401 is not sensitive", relayed by the lead), so only the fence check, a layout guard, was built; the label rules stay as text.
- **A sticky status comment edited each round:** a separate issue, #412, so a round's record is never edited.

Amends [ADR 0064](0064-review-crossings-by-template-and-judgment.md)'s review-comment template: one comment per round, the human layer first, and the verdict, crossings and reports in folds.
