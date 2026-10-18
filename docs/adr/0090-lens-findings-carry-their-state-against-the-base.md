# Lens findings carry their state against the base

Every lens run is now handed the base, the state before the work began, and each finding says how it stands against it: `new`, `updated` or `unchanged`, and on a follow-up `absent` (#336, spec revision 3, signed off by the owner on 2026-10-18). Only `new` and `updated` findings, and `unchanged` security findings, gate. The rule lives in `claude/review.md` and its report template; no lens file changes.

## What changed

- **The base.** Every run is handed the commit the work started from, by its short hash, and the request. At Design it is the commit the spec was drafted against; at Test, the merge base of the work's branch with the default branch at the first round. The session checks it is an ancestor before handing it, and a base that fails is a stop. The review comment's first line names the base and the revision or head reviewed, so later rounds read both from there.
- **A follow-up** is any later run of a lens on the same kind of input in the same piece of work. It is still dispatched fresh and alone, and is also handed the revision diff and only its own rows of the last Lens dispositions table, numbered `E1`, `E2` and on. A withheld row goes with a place line the session writes, never the report. It accounts for each `E` row under Earlier findings, as `absent` with evidence or as holding.
- **Restarts and full passes.** A changed intent, a moved base, or a last table with no state words makes the next run a first round again, carrying `open` rows. A full pass, in which every finding gates whatever its state, runs only on the owner's ask; the session offers it once when a review has a high `noted` finding.
- **The verdict.** A lens's verdict is blocking when a finding is high and `new` or `updated`, or high, `unchanged` and a security finding by the security pair's class or marked `security?`. The session's own security sort can raise the review's verdict to blocking.
- **Sorting.** The session writes the state words itself. An `unchanged` finding that isn't a security finding becomes `noted`, a sixth Disposition word, which never blocks and which the owner may file. An `unchanged` security finding keeps full weight and is never `auto`. An `absent` security finding stays `open` until the owner takes the fix. A continuing finding stays "taken earlier" only when its `E` row was `taken` without `auto`, it is no more severe, and it is not newly a security finding.
- **The table.** A Finding cell starts with its state word, except a `skipped` row's and a withheld row's, whose cell is exactly "withheld, see chat" so the tracker doesn't learn whether the held-back item sits at the base. The poster refuses a read row without one as `table/state`, at the cell's line and column, quoting no text, and accepts `noted`. The header stays fixed.

## Why

- **Each round was judged as if it were the first.** In #183 T2 a round-2 lens raised a path it had rated low in round 1 again as a fresh medium, with no link to round 1, and the real news, that the revision made the path easier, was lost. Another said it couldn't compare with earlier rounds, which it wasn't handed.
- **The owner's decisions, in chat on 2026-10-18:** the baseline is the state before the work, not the previous round; it applies to all lenses and lives in the review procedure; an `unchanged` finding that isn't a security finding becomes a note; and all four parts the brainstorm found: SARIF's state words, gating on `new` and `updated` only, a re-run as a Fagan-style follow-up, and an escape for old debt.
- **A lead word, not a column.** A `State` column would stop all eleven recorded fixtures at `table/header` and break every reader of the fixed header (ADR 0076). A lead word inside the Finding cell keeps the header and the fixtures' row checks, and a column can be added later.

## Worked examples

- **An unmarked high `unchanged` finding the session sorts as security.** The reader-lens reports a high `unchanged` finding with no `security?` mark: a sentence at the base tells sessions to paste a token into the record. Its verdict is findings, since the finding is neither new nor marked. The session, holding the threat model, sorts it as a security finding (it exposes a secret). The review's verdict is raised to blocking, marked beside the reader-lens's own verdict with the finding, and its row is `open`, with reason text starting `security:`, never `auto`.
- **An `E` row taken at low, continued at medium.** Round 1's adversarial-lens row `E2` was `taken` at low, on the owner's word. On the follow-up the lens reports the same path at medium, continuing `E2`, because the revision made it easier. It is more severe than `E2`, so it doesn't stay "taken earlier": it comes to the owner again, naming `E2` and what changed.

## What stays

- **Fresh and alone.** A follow-up is never resumed and never shown another lens's report; that is why it gets only its own rows.
- **The lens files and the protected set.** Every lens's own gating rule still holds (spec S10): a trade-off never blocks on its own, the security bar and accepted risks are unchanged, and a deferral of work that guards security or data sits in the spec's own text, so it is always `new`.
- **ADR 0008.** A follow-up is still a paper round, and the stop after two still holds.
- **The threat model.** Its sentences on the table check stay accurate: the state word is part of the table's shape. Two accepted-risk candidates from the Design review (the poster doesn't pair a state with a Disposition word; a read-only lens takes the session's word on the base) are the owner's to record after merge, in a separate change.

## What was weighed

- **A `State` column.** Not taken, as above.
- **Notes outside the table.** Not taken: every finding's fate stays in one table.
- **Handing a follow-up the whole last table.** Not taken: other rows carry another lens's headlines, which "fresh and alone" keeps out.
- **An automatic full pass after two follow-ups.** Not taken: the Guards' stop and ADR 0008 already handle that point.

Amends [ADR 0061](0061-the-thin-gate-two-pinned-blocks-and-the-review-file.md) and [ADR 0076](0076-the-poster-checks-the-lens-dispositions-table.md).
