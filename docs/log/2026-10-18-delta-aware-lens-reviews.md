# Delta-aware lens reviews

**2026-10-18.** #336. Lenses judged every round as if it were the first, so a re-run lost what had changed. Now every lens run is handed the base, the state before the work began, each finding carries its state against it, and only what the work introduced or worsened gates, with security findings keeping full weight. Tier: thorough, sensitive route; built on Opus at high, test-first, as one ticket.

## What was built

- **`claude/review.md`:** every lens run is handed the base, checked as an ancestor first; a follow-up is also handed the revision diff and only its own rows of the last Lens dispositions table, as `E` rows, with a withheld row's place line written by the session; restarts, full passes and the deletion of kept-local reports on the owner's word. The report template gives each finding, trade-off and accepted-risk line a state and an `E` link, adds Earlier findings and the by-lens table of the state words, and scopes the Verdict to `new` and `updated` findings and `unchanged` security ones. The review comment gains the base line, Notes and Earlier findings; a new section, Findings and their state, says how the session sorts. The Lens dispositions table gains the state-word sentence and `noted`.
- **The poster:** `DISPOSITIONS` gains the four state words and `noted`; a new rule, `table/state`, refuses a read row whose Finding cell doesn't start with a state word, unless the row is `skipped` or the cell is exactly "withheld, see chat", at the cell's line and column, with no cell text.
- **Docs:** `docs/poster.md`, `CONTEXT.md` (base, follow-up, full pass, and the table's entry), a dated "Decided" line under question 10 of each of the eight lens contracts, and the regenerated cloud sessions.
- **Tests: +3 −0,** in `gate/tests/poster-table.test.mjs`: C4 (the `table/state` bad and good cases, and a `skipped` row's Finding cell not read), C6 (the poster's state words equal `review.md`'s sentence) and C10 (a body breaking every `table/` rule, with a marker in each cell, gets refusals that hold no marker). Run before the rule existed, all three failed, and so did the fixtures test's new `table/state` counts; C10 was also seen to fail with one rule's refusal made to quote its line. Existing rows gained the lead word `new`, their pinned columns moved by four, and the `all-dash-row` plant's expected rules gained `table/state`, as the spec says. Two rows in `gate/tests/poster-prose.test.mjs` also gained the lead word, and one pinned column there moved by four.

## Decided at Build

- **The C7 counts matched** the spec's (30, 8, 2, 0, 13, 7, 1, 21, 0, 5, 3, in sorted order), with the two header-refused fixtures at 0.
- **`poster-prose.test.mjs` takes the lead word too.** The spec named only `poster-table.test.mjs`, but the prose test posts a Lens dispositions table, so its rows needed the same lead word and column move. No expected rule list changed, so it isn't one of the spec's stops; the QA pair reads it at Test.
- **Within a row, `table/state` is named first,** at the Finding cell, before the Lens and Disposition cells' refusals, so refusals read left to right.

## Changed at Test

- **The Test review** (all seven lenses, under the installed rules, on the owner's word) found nothing high. C10 was not met: one medium path each under V2 ("taken earlier" couldn't judge severity and failed open on an unknown class) and V8 (the base line was read with no author test, and git counts a commit as its own ancestor). Five mechanical findings were fixed on the session's call.
- **The owner took every pick,** and the spec was amended: the base is checked against the parent of the work's first commit, found from the work itself, and a base line counts only from a comment that counts; "taken earlier" reads severity from the review comment and fails closed; a withheld row never takes a state word, and the poster refuses one before the withheld text, with three more bad cases in the C4 test (seen to fail first); a secret's place line names its file only; kept-local reports are named for deletion at every hand-off; a missing state is `new`, and a lowered one goes to the owner; plus wording for `updated`, `absent`, restarts, overflow notes and the Rerun cell. Tests stay `+3 −0`.

- **The follow-up** (security pair, QA pair, reader-lens, on `05485a7`) found the first round's V2 and V8 paths absent, but left new mediums: a withheld finding's state could reach the record outside its Finding cell, "taken earlier" ignored an accepted risk eased at the same severity, and the poster's withheld check read the whole cell. It also found a defect the amendment brought in: after a merge from main, a restart's base failed the parent check. Having gone round twice, the session stopped; the owner chose to keep going, checked by a walk-through.
- **Amended again:** on a branch the base is the merge base derived at every round, restarting when a merge or rebase moves it; on the default branch it is exactly the parent of the work's first commit; at Design it is never older than the last recorded base. Nothing in the record gives a withheld finding's state, class or severity. "Taken earlier" also needs likelihood no higher and no accepted risk eased. The poster reads only what follows the lead state word, in any case or markup, with more C4 cases (seen to fail first, and each catching its broken version). Plus wording from the reader-lens. Tests stay `+3 −0`.
- **The second follow-up** (security pair and integrity-lens, on `5ce1666`) found V2 holding, but withheld metadata still leaking, through a continuing report and the verdict line, plus a stop defect: the first Test round compared its base with Design's. The owner chose to simplify and finish, with one last round.
- **Amended a third time:** each stage compares only with its own last base line, so Design to Test is a first round; on the default branch the base and the first commit are named to the owner before the first round's lenses run; at Design the last base must be an ancestor of the new one. The scattered withheld clauses became one coarse rule: a fixed row with one bare Disposition word, continuing reports kept local, and a verdict over posted findings only. The poster also refuses a withheld row whose Disposition is anything but one bare word, and the C4 test gained cases for other markup, a soft hyphen inside the word, quotes and the four Disposition shapes (seen to fail first). Tests stay `+3 −0`.

## Decisions

- [ADR 0090](../adr/0090-lens-findings-carry-their-state-against-the-base.md) — Lens findings carry their state against the base.

## Record

- [Owner decision: the sensitive route](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6252865675)
- [Spec, revision 1](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253131020)
- [Spec, revision 2](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253137727)
- [Design review, round 1: the spec pair](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253136686)
- [Design review, round 1: the security pair](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253137007)
- [Design review, round 1: Lens dispositions](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253137396)
- [Design review, round 2: the spec pair](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253528585)
- [Design review, round 2: the security pair](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253528957)
- [Design review, round 2: Lens dispositions](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253529396)
- [Spec, revision 3](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253529801)
- [Owner sign-off, revision 3](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253550049)
- [Spec amended at sign-off: C10](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253604935)
- [Lens dispositions, final: the owner accepted every open row](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253605302)
- [Ticket cut](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253685001)
- [Build state, at the Build-to-Test boundary](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6253849726)
- [Test review: the QA pair](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6254073725)
- [Test review: unstated-lens](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6254074071)
- [Test review: the standards pair](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6254074460)
- [Test review: the security pair](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6254074863)
- [Test review: Lens dispositions](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6254075227)
- [Spec amended after the Test review](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6254188375)
- [Test follow-up: the QA pair](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6254346650)
- [Test follow-up: reader-lens](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6254346957)
- [Test follow-up: the security pair](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6254347316)
- [Test follow-up: Lens dispositions](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6254347678)
- [Spec amended after the Test follow-up](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6254494167)
- [Second Test follow-up: integrity-lens](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6254611004)
- [Second Test follow-up: the security pair](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6254611425)
- [Second Test follow-up: Lens dispositions](https://github.com/mephistopheles4/the-pact/issues/336#issuecomment-6254611814)
