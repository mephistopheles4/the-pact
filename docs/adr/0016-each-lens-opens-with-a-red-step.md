# Each lens opens with a red step

Each lens starts from the spec and the claim list, and writes down how each claim could be wrong before it looks at the evidence:

- **`behaviour-lens`** writes how the work could be wrong before it runs anything. This is its artifact's first column, "How it could be wrong".
- **`integrity-lens`** writes the broken versions of the code that each claim's tests ought to catch, before it reads the tests. Its red step comes first in its report.

Each lens then checks against those failure points, and assumes the work may be wrong until the evidence shows otherwise.

## Why

- **Same-model reviewers are overconfident.** The owner's research input, arXiv 2602.06948 (*Agentic Uncertainty Reveals Agentic Overconfidence*), found that a fresh-context reviewer on the author's own model rated the work far likelier to succeed than it was. Telling the reviewer to find problems first calibrated best.
- **Seeing the work first anchors the reviewer.** In the same study, reviewers that saw the patch first anchored on how plausible it looked. Writing the failure points before reading the change works against that.
- **It is a contract detail, not a change to the spec.** Revision 7 of #35's spec already says what each lens does before it judges. The red step sits inside that, so it needed no spec change.
- **It is judged by use.** The study is a preprint, and its method comparisons have overlapping confidence intervals. The owner took it as a direction to try, not as proof.

## How this was decided

- **2026-10-05** — Decided in mephistopheles4/the-pact#47. The orchestrator relayed the research as input, not a decision (comment 6001717445). The owner chose the red step ("go with tha"), and the build took it as a contract detail (comment 6003969495).
