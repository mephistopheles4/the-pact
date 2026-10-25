# The poster edits signed posts, with a reason line

The poster gains four edit surfaces, `issue-edit`, `pull-request-edit`, `issue-comment-edit` and `review-thread-reply-edit`, so a session that must fix its own post no longer reaches for plain `gh`, which skips the scans and the read-back (#413). Each edit needs `--reason` and `--signed`, replaces only the body with one `PATCH`, and sends the session's body with `Edited: <reason> (<label>)` after it.

## What it refuses

Before it sends, the poster reads the item. It refuses an item the `gh` login didn't write, one that isn't where the options say, one with no `Signed: <label>` or `Posted by <label>.` line for `--signed` or with another label's, a review record, a decision mark, an item holding a leak the content scan finds, and a new body that drops, changes, forges or hides a reason line. The record and decision checks read the item and the new body, on the content scan's normalised views and with emphasis, code-span and link marks folded, as the withheld check reads a table row (#392, #396).

The author, target, signature, leak and append-only reason checks are the edit's controls. The record and decision checks, and the reason lines' "in plain sight" part, are a best-effort backstop, on the owner's word (q12 (c), relayed): they guess at GitHub's rendering from the source text, two Test rounds showed each new reading opening a gap another closed, and the owner judged more of them not worth the friction. Where a reading regressed, the check keeps the stricter one. Their gaps are named in `docs/poster.md`, and reading GitHub's rendered page instead is #419.

## Why

- **The edit keeps counting.** In this repo the owner's account's text counts only when that account made its last edit (ADR 0062), and the poster edits as that account. So the checks guard, as a best-effort backstop, what must never move: the review record, which later rounds read, and the decision mark. Everything else a session signed stays editable, with the reason lines and GitHub's history as the control: a widening of R2 the owner accepted on 2026-10-25, relayed by the lead. A repo's own rule that a text is never edited still holds over this: here, a probe's expected result and its run records stay as posted after a run (`docs/agents/changing-rules.md`, A probe the owner asks for).
- **Shapes, not markers.** A record is known by the shapes the review procedure requires: a heading or a fold summary naming a lens, or the dispositions header row. Copying a shape onto a comment only stops its edits, and taking one off a record needs an edit the check refuses.
- **No bare-label signature.** A bare label line would let a session claim the last word of an owner-typed comment, such as a one-letter pick, as its signature. Only the two prefixed forms count, outside fences and quotes.
- **Append-only reasons, in plain sight.** A reason line a session could drop, forge or hide under an open comment or fold would be no record of the change.
- **A leak stays a leak.** An edit never removes text from GitHub's history, so an item holding a secret or a personal detail is refused, and the session tells the owner instead.

## What was weighed

- **Refusing edits to spec revisions too** (S10 q2 (b) on #413). Not taken: the owner accepted the widening instead.
- **Only the newest comment on its item** (q5 (b)). Not taken: fixing an older comment would send a session back to plain `gh`.
- **Checking the edit history after the `PATCH`** (q6 (b)), to catch a change between the read and the write. Not taken: both writers are the owner's account and the window is one round trip; accepted as R60.
- **An exemption for #412's sticky status comment.** Not built: #412 inherits the same checks, so its comment carries a `Signed:` line and keeps its reason lines.
