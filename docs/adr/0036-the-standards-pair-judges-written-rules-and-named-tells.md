# The standards pair judges written rules and named tells, not taste

The standards pair, `conventions-lens` and `reader-lens`, reads the diff at move 4 at the standard and thorough tiers. Each lens may report only against something it can point to.

- **`conventions-lens` reads written rules only.** It lists the repo's written rules that apply to the change, quoted with where each is written. It reports each place the change breaks one, including a copy of a rule that no longer matches its source. A habit the code merely shows is not a rule. A repo with no written rules gets `inconclusive` with "no written rules found", never `clear`.
- **`reader-lens` reads against a carried catalogue of ten tells.** It walks each action the next reader must take from the text, and reports where a tell would make them misread or stall. No tell, no finding. Each finding's bullet opens with its tell.
- **Both hold `Read`, `Glob` and `Grep` only,** and run on Opus at medium. Neither is a security-set lens, so each is proved by use, not by a security set.
- **Where both report overlapping lines,** a break of the written rules also loses the reader. That crossing shows first.

## Why

- **They are the owner's words for the two questions.** For `conventions-lens`: "Making sure that things were done the same way the team usually expects to do things, by upholding the written rules in the code and the way the code is written and broken down into modules." The owner chose written rules only. For `reader-lens`: "[It] look[s] at if everything makes sense together, kind of like a proofreader would read something", and "Can we frame this more around cohesion and understanding? For example, something similar to the humanizer skill for code."
- **A finding needs a source the owner can check.** A rule quoted with its place, or a named tell, lets the owner judge a finding without trusting the lens's taste. Taste would turn every review into an argument about preference.
- **The replay shows the rule-copy case is real.** The risk floor's wording drifted during #12: `a1f0d41` (#15) widened the floor, and the plan reviewer's restated copy stayed stale until `da76567` (#17). Practice case K1 plants that diff.

## How this was decided

- **2026-10-08** — Decided in mephistopheles4/the-pact#101, at the contract interviews. The owner's answers are recorded in comment 6054282378; the contracts were confirmed in `da1f150`, and `reader-lens`'s cases were reworked around the tells in `1257d22`, before any run. The swap is `91fe2f0`.
