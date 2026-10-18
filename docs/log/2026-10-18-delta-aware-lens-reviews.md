# Delta-aware lens reviews

**2026-10-18.** #336. Lenses judged every round as if it were the first, so a re-run lost what had changed. Now every lens run is handed the base, the state before the work began, each finding carries its state against it, and only what the work introduced or worsened gates, with security findings keeping full weight. Tier: thorough, sensitive route; built on Opus at high, test-first, as one ticket.

## What was built

- **`claude/review.md`:** every lens run is handed the base, checked as an ancestor first; a follow-up is also handed the revision diff and only its own rows of the last Lens dispositions table, as `E` rows, with a withheld row's place line written by the session; restarts, full passes and the deletion of kept-local reports on the owner's word. The report template gives each finding, trade-off and accepted-risk line a state and an `E` link, adds Earlier findings and the by-lens table of the state words, and scopes the Verdict to `new` and `updated` findings and `unchanged` security ones. The review comment gains the base line, Notes and Earlier findings; a new section, Findings and their state, says how the session sorts. The Lens dispositions table gains the state-word sentence and `noted`.
- **The poster:** `DISPOSITIONS` gains the four state words and `noted`; a new rule, `table/state`, refuses a read row whose Finding cell doesn't start with a state word, unless the row is `skipped` or the cell is exactly "withheld, see chat", at the cell's line and column, with no cell text.
- **Docs:** `docs/poster.md`, `CONTEXT.md` (base, follow-up, full pass, and the table's entry), a dated "Decided" line under question 10 of each of the eight lens contracts, and the regenerated cloud sessions.
- **Tests: +3 −0,** in `gate/tests/poster-table.test.mjs`: C4 (the `table/state` bad and good cases, and a `skipped` row's Finding cell not read), C6 (the poster's state words equal `review.md`'s sentence) and C10 (a body breaking every `table/` rule, with a marker in each cell, gets refusals that hold no marker). Run before the rule existed, all three failed, and so did the fixtures test's new `table/state` counts; C10 was also seen to fail with one rule's refusal made to quote its line. Existing rows gained the lead word `new`, their pinned columns moved by four, and the `all-dash-row` plant's expected rules gained `table/state`, as the spec says.

## Decided at Build

- **The C7 counts matched** the spec's (30, 8, 2, 0, 13, 7, 1, 21, 0, 5, 3, in sorted order), with the two header-refused fixtures at 0.
- **Within a row, `table/state` is named first,** at the Finding cell, before the Lens and Disposition cells' refusals, so refusals read left to right.

## Decisions

- [ADR 0090](../adr/0090-lens-findings-carry-their-state-against-the-base.md) — Lens findings carry their state against the base.

## Record

- [Owner decision: the sensitive route](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6252865675)
- [Spec, revision 3](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253529801)
- [Owner sign-off, revision 3](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253550049)
- [Spec amended at sign-off: C10](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253604935)
- [Design review, round 2: Lens dispositions, final](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253605302)
- [Ticket cut](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253685001)
