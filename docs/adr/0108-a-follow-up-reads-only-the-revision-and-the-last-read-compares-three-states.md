# A follow-up reads only the revision, and the last read compares three states

A lens's follow-up on a diff or a result now reads only the revision: the revision diff, its own `E` rows, and the files those touch, at the base and the head (#389, spec revision 6, built on the owner's answers relayed by the lead). The last round before the owner accepts the work is a closing read: a full first round that compares the base, the approved spec and the head. The rules live in `claude/review.md`; no lens file changes.

## What changed

- **The scoped follow-up.** Every lens's follow-up on a diff or a result is scoped, the security pair's included. It is still dispatched fresh and alone. It is handed the base by its short hash, the revision diff, derived with git at every round, its `E` rows, the scope, and the names of the files the whole change touches; never the whole diff from the base. A file the revision touches stays in scope even when a withheld row sits in it. The scope bounds every step of the lens's own prompt; a claim run may touch what it needs, never a withheld row's file for a lens that can reach the web. When the revision diff can't be derived, as after a squash, the lens runs a restart, which carries the `open` rows. The lens checks that its scope holds every file the revision diff touches and every `E` row's file, and a gap makes its verdict inconclusive. It writes "scoped follow-up: the rest of the change was not read" first under Not checked, with a count and no file names, and what lies outside its scope doesn't make the verdict inconclusive.
- **What stays a full read.** A first round, a restart, a full pass, a follow-up on a spec (told to focus on what changed and on its `E` rows), and, where a repo's push rule waits on the security pair, the pair's follow-up that releases the push, which is still handed its `E` rows and carries the `open` ones. A scoped report never releases a push, and this repo's push sentences in `AGENTS.md` and `docs/agents/gate-tests.md` now say "a full read, never a scoped follow-up".
- **Withheld rows.** A lens that can reach the web gets no file for a withheld row in its scope. A scoped follow-up never marks a withheld row `absent`; only a full read or the owner's word closes it. Every file written for the scope, a diff or a copy, is deleted when the round closes, and nothing is written for a withheld row's file.
- **The closing read.** At Test, the last round before the owner accepts the work, by merge or otherwise, is a closing read for every lens that ran at Test, in every repo. It compares the base, the approved spec (the revision the owner approved, else the one the last Design base line names) and the head; with no spec or ticket, the base, the request and the head. Each lens reports Spec drift by its own question, which holds over its own stay-out for that section. The closing read names its head, and a later commit needs a new one. A first Test round on the final head can be the closing read. A kept-local report's spec-drift items stay out of the review comment's table and go to the owner in chat.
- **The owner's word** names which full read it asks for: a restart, which gates by state, or a full pass, which gates every finding.

## Why

- **A follow-up cost what a first round did.** On one day of brigade work, 100 first rounds averaged about 80k tokens and 57 follow-ups about 78k: a follow-up re-read the whole change against the base. The state words and the `E` rows worked; the re-read was the cost.
- **The owner's answers, relayed by the lead on 2026-10-24:** every lens scopes its follow-ups, the security pair included (q1); the push-releasing security read stays full (q5); a spec follow-up stays a full read, focused on what was fixed (q8); and the last read compares before, specified and after, because work can start as one thing, be specified as another and be built as a third (q9).

## What stays

- **Fresh and alone,** from [ADR 0090](0090-lens-findings-carry-their-state-against-the-base.md): a follow-up is never resumed and never shown another lens's report.
- **The state words, the `E` rows and the posting rules,** unchanged.
- **The lens files.** No lens file changes; `review.md`'s scope rule bounds their steps on a scoped follow-up.
- **The threat model.** R23, R27 and the hook paragraph keep their meaning, since the read that releases a push stays full. The matching wording for R42, whose trust in the session's word now also covers the revision diff, the head and the scope, goes to the owner as a decision, never applied in the same review.

## What was weighed

- **Scoping only some lenses.** Not taken: the owner chose every lens (q1), with the push read and the closing read as the full reads.
- **A scoped spec follow-up.** Not taken: a spec has no git head and no base side, so the owner kept it a full read (q8).
- **An optional closing read.** Not taken: offered only, it left the last read before merge scoped in repos with no push rule (q9).

Amends [ADR 0090](0090-lens-findings-carry-their-state-against-the-base.md).
