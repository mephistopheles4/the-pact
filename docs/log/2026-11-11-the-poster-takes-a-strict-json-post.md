# The poster takes a strict JSON post with the owner's quote and the read-back

#524, thorough tier, cut into three tickets that each merged into the branch `chain-524` (T1 #529, T2 #532, T3 #535), then one pull request takes the branch to main. Nothing is installed before that merge. The sensitive route was declined by the lead's pick; the security pair read the spec and the code tickets.

The ask, in short: the pact is supposed to quote the owner on everything they say, so the poster gets a field for the user quote and another for the understood intent, a signer and a proper title, and takes a strict JSON document, so provenance and intent are protected by a callback.

**The poster.** Every surface takes one JSON post, `<surface> --post <file> [--dry-run]`, or `schema`, and nothing else; every old option is refused `usage/unknown-option` with one fixed `NEXT:` line. The post is checked against a strict schema, and each create post names a `kind`. An issue, pull request, spec or decision carries `quote` (1 to 5 passages, each with its source, date and, for a tracker passage, the comment the poster reads) and `intent` (the session's read-back, `pending`, `confirmed` or `corrected`). The poster renders the ask, the read-back, the signature and the reason lines itself, from a `body_file` the post names, and the owner's quote skips the prose check. An edit of an item that opens with the ask keeps it byte for byte, and may move the read-back from pending to confirmed or corrected by citing a chat-marked `decision` comment that the poster reads and checks. T1 built the input switch and every surface, T2 the ask items and the read-back, and T3 the text below.

**The pact text.** `claude/review.md`, Posting, tells a session to give each issue, ticket, spec, decision and pull request the owner's ask in `quote` with its read-back in `intent`, adds the read-back procedure (read it back in chat before posting, post `confirmed` only on the owner's yes, a relay or a goal holder's reply never confirms, work waits on a pending read-back at each seam, and a `[left out]` span for words the scan refuses), and rewrites the poster item for the JSON post and a `body_file`. The status comment's `body_file` holds neither the signature nor `Edited:` lines. `docs/poster.md` is rewritten for the post fields, the kinds, the read-back and the edits; `AGENTS.md`, `docs/agents/work-records.md` and the PR template now open the PR's `body_file` with the checkbox line, and the poster adds the signature. The rules file doesn't change, so `docs/rule-reasons.md` gains no row (R6); the reasons are in [ADR 0151](../adr/0151-the-poster-takes-a-strict-json-post-with-quote-and-intent.md), which constrains ADR 0120 and ADR 0062's mark. The threat model doesn't change: the fields are unverified, so the checks catch accidents and are not a control.

**Sessions already running at install** still hold the old Posting text. They restart, or re-read `~/.claude/pact/review.md`, on their first `usage/unknown-option`.

**One limit carried from T2:** an older ask-shaped item, one that opens `## The ask` but has no read-back line, such as #524's own body, can't be edited through the poster without losing its ask. The docs say so in one line (`docs/poster.md`, Edits).

**After the install**, three steps stand open (C15): one `--dry-run` per surface from the documented examples, `node poster.mjs schema` exiting 0, and one live `issue-comment` of kind `note` on #524 that ends `verified`. #524 closes only after that result is posted there.

**Rolling back:** revert the chain's PR, then reinstall through the dry run and the owner's apply, after the four checks in [Rolling back](../agents/install.md#rolling-back). A reverted install restores the old command line and the old Posting text together. Posts already made keep their ask blocks.

## Record

- The ask: https://github.com/mephistopheles4/the-pact/issues/524
- Spec revision 8, final: https://github.com/mephistopheles4/the-pact/issues/524#issuecomment-6811529961
- Design round 1: https://github.com/mephistopheles4/the-pact/issues/524#issuecomment-6810845518
- Design round 2: https://github.com/mephistopheles4/the-pact/issues/524#issuecomment-6811078295
- Design round 1, reopened: https://github.com/mephistopheles4/the-pact/issues/524#issuecomment-6811332479
- Design round 2 (final): https://github.com/mephistopheles4/the-pact/issues/524#issuecomment-6811486024
- T1 Test round 1: https://github.com/mephistopheles4/the-pact/pull/529#issuecomment-6812266920
- T1 Test round 1, the security reports (continued): https://github.com/mephistopheles4/the-pact/pull/529#issuecomment-6812267523
- T2 Test round 1: https://github.com/mephistopheles4/the-pact/pull/532#issuecomment-6812772683
