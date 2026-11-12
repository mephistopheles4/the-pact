# The poster takes a strict JSON post with quote and intent

The poster takes every post as one JSON document, checks it against a strict schema, and refuses one that lacks a required field or carries an unknown one (#524). An issue, pull request, spec or decision can't be posted without the owner's quote and the session's read-back of it, so a reader can check the read-back against the words. Before this, the rule to quote the owner lived only in prose in `claude/review.md`, and nothing checked it. It constrains [ADR 0120](0120-the-poster-edits-signed-posts-with-a-reason-line.md) (edits keep the ask, and the poster carries the reason lines) and [ADR 0062](0062-this-repo-keeps-its-own-tracker-rule.md)'s mark (the poster renders it).

## What was decided

- **One JSON file per post (D1).** The command line is `<surface> --post <file> [--dry-run]` or `schema`, and nothing else. Every old option is refused `usage/unknown-option` on every surface, edits included. It is a hard switch, with no window where both forms work.
- **A strict schema (D2).** An unknown field anywhere, a wrong type, a pattern miss or an over-length value is refused.
- **A kind per create post (D3).** A fixed table ties each kind to its surfaces and to whether it carries a quote.
- **The quote and the read-back (D4, D7).** `quote` is 1 to 5 passages, each with a source (`chat`, `relayed` or `tracker`), the comment id for a tracker passage, and a date. The read-back has a status: `pending`, `confirmed` or `corrected`. A later confirmation or correction is a new `decision` comment, and the original is then edited to point at it.
- **The poster builds the body (D5).** It owns the signature line, the decision mark, the read-back line and the reason lines, so a `body_file` holds none of them.
- **A title is one line of 1 to 120 characters (D6).**
- **An edit keeps its item's ask byte for byte (D8).** Its read-back may change only by its status.
- **The threat model doesn't change (D9).** The fields are unverified, so the checks catch accidents and are not a control. "The record doesn't show who made a call" stays accepted.
- **A gate bad case for each refused shape, and the old tests ported (D10).**
- **Nothing installs until every ticket has merged (D11).** The poster and `review.md` switch together. Main was held by a branch, `chain-524`, and one pull request took it to main.
- **`confirmed` is for the session's own chat (D12).** A create post is `confirmed` only when every passage is from `chat`, and an edit to `confirmed` or `corrected` must cite a chat-marked `decision` comment the poster reads. It is an accident check: `source` is the session's own word.

Refinements:

- **R1.** The schema is one frozen object in `poster.mjs`, and `schema` prints it as JSON Schema. The install copies one file per tool, so a second file would change the gate's install code.
- **R2.** The body comes from a file the post names, `body_file`, in the post file's folder. A round comment runs to 45,000 characters, and one escaped JSON string is where a session's mistakes would land.
- **R3.** `when` is a date, with no time of day.
- **R4.** A decision gets `Owner decision, from chat.` only when every passage is `chat`; relayed or tracker words render as `Relayed owner words, not a decision mark.` This keeps ADR 0062's rule that only the session that heard the owner writes the mark.
- **R5.** One render order for every kind, so this repo's PR checkbox line opens the `body_file`, not the whole PR body.
- **R6.** `docs/rule-reasons.md` gains no row: it covers only the rules file, which doesn't change. This departs from #524's ask, and the reasons are here.
- **R7.** No caller of the poster outside this repo was found. One that appears before the install is updated in the same install window, and the install waits for it.
- **S3.6.** `JSON.parse` keeps the last of two duplicate keys. The poster accepts that: the scan and the read-back both read only what is rendered.

## Why

- **The owner wants provenance and intent protected by a callback,** as in aviation and the military: what was said, where and when, and what the session took it to mean, in a form a reader can check. A prose rule nobody checks leaves the paraphrase as the intent.
- **Strict, because a loose post is how the quote gets dropped.** A required field and a refused unknown field turn a forgotten quote into a refusal before anything is sent.
- **A hard switch, because the two forms can't coexist safely.** `review.md` and the poster install together, so a window where both work would let a session post the old way and skip the quote.
- **The poster renders the parts it owns,** so the ask, the read-back, the signature and the reason lines are the poster's and a session can't forge them in a body. It also lets ADR 0120's reason carry and the status comment's newest line (ADR 0144) work on the rendered body.

## What was weighed

- **Flags plus extra files.** Not taken: the quote, the read-back and the signer don't fit a flag, and each new option is another unchecked surface.
- **A separate schema file.** Not taken (R1): the install code copies one file per tool.
- **A body inline in JSON.** Not taken (R2): long Markdown as one escaped string is where mistakes land.
- **A window where both forms work.** Not taken: see Why.
- **Letting an edit change the quote.** Not taken (D8): a posted quote is the record. A misquote or a leaked span is the owner's to edit or delete by hand, and GitHub's history keeps the old text.

## What it costs

- **A post that quotes the words "owner decision" is uneditable,** because the edit check on the decision mark reads the quote too.
- **An older ask-shaped item can't be edited through the poster without losing its ask.** A body written before the switch that opens `## The ask` but has no read-back line, such as #524's own, isn't an ask item. An edit replaces it whole, so its ask can't be carried over. The lead took this in the Test round on the ask items (decision 102); the docs say it in one line.
- **Sessions already running at install** hold the old Posting text. They restart, or re-read `~/.claude/pact/review.md`, on their first `usage/unknown-option`.
- **Compatibility is broken on purpose.** Every caller breaks at once (D1). The only callers found are sessions reading the installed `review.md`, which switches with the poster. A reverted install restores the old command line.

## How this was decided

- **2026-11-11 and 2026-11-12,** on #524, spec revision 8, thorough tier. The sensitive route was declined by the lead's pick, with the security pair on the spec and on the code tickets. The proceed on r8, the ticket cut and the decisions above were the lead's picks under the owner's standing goal (level 3), and P6, P7 and P14 were the owner's, relayed by the lead. They are not the owner's own words, except where named.
- **The chain.** T1 (the input switch), T2 (ask items and the read-back) and T3 (the pact text, docs and records) each merged into `chain-524`, then one pull request takes it to main. Nothing is installed before that merge.
