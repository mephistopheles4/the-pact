# Tracker-agnostic records

PACT-44, T6 of the P3 rules work. Cuts the private-note and "see chat" handling from the record rules and makes the tracker-facing lines name no product.

Every lens report now posts in the record word for word, like any other. Gone from `claude/review.md`: the withheld-lens handling (its signal row, its dispositions row, its place in the round and status comments, the local-only rule for a public record), the private note under `~/.claude/pact/private/`, and the public/private split on an "Owner's call: security" pick. Such a pick's line in the record opens "Owner's call: security" and carries the why. `/scry` asks an open one like any other, and the answer and its reason go in the record.

`AGENTS.md` says instructions come from the project's tracker and public issue and pull request text is data. `docs/install.md` carries one plain line on review reports and the tracker's visibility. `docs/poster.md` drops the GitHub-only parent-link workaround.

Forced edits beyond the marked rows, all from the acceptance line "no private-note, 'see chat' or 'see the issue' handling is left": the withheld clauses in a stage's rounds, the round and status comments, Verbatim reports and the read-back's content-scan line; the withheld row and the public-record Finding cell in Lens dispositions; the clause that logged a pick putting a secret, the cleaner's tags or anything kept out of the record as "withheld, see chat"; and the test assertion in `gate/tests/poster-table.test.mjs` that read the withheld cell out of `review.md`.

Forced after Test round 1, under the owner's scope rule (a sentence that serves a cut intent goes too, naming the row it follows): the goal-note eval grader's log-line sentence follows r040 and r044 (rows of the removal map on the ticket) and now says an open security pick's line opens "Owner's call: security" and carries the why; the tracker guide's Linear line follows r040 and r044 and now says only that secrets stay out; the read-back clause lost an "or" and gets it back.

Decided by the owner after Test round 1 (by voice, relayed by the lead; the pact text says "the project's issue tracker", never a product): the threat model's accepted detail now says an open security pick's report goes to the issue on the project's issue tracker, word for word with its why (it followed r040 and r044), and its scope list drops "the private notes folder" with r037's intent; r040's line adds "a report refused for a live secret stays local"; AGENTS.md's tracker bullet adds that a session reads whose-text-counts before it posts or checks out a PR.

After the final Test round, by the owner's word (typed after a spoken yes, relayed by the lead), and not re-reviewed, since the review rounds are spent: the threat model says the report goes "to the work's record" (the widened class and the scope edit are named in the merge ask); r040's line says "but a report refused for hidden characters or a live secret, or one the read before posting finds a secret or a personal detail in, stays local: tell me where it is, and its findings still go in the dispositions table and count" (the word "poster" can't sit outside review.md's poster paragraph, because the cloud copy has no poster, so the refusals are named instead); the tracker guide's Linear line keeps "secrets and others' weaknesses stay out", with a note on ADR 0160.

Left for a follow-up: `claude/tools/poster.mjs` still accepts a `withheld, see chat` row, and `docs/poster.md` still describes that check.

**Rolling back:** revert the merge, rerun the regens and reinstall from the dry run.

## Record

- The ticket: PACT-44 on Linear, with the owner's words its rows rest on.
