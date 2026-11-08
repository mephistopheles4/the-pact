# The status comment keeps only its newest reason line

#503. A status edit, `issue-comment-edit` signed exactly `status-<n>` with n the `--issue` value, drops the item's `Edited:` lines: its body holds no line that reads as a reason line, and the poster adds the newest, so the status comment shows the latest round and one reason line. Every other edit keeps the append-only rule. Pull request bodies are signed `Signed: pr-<n>`, n the issue the pull request works on, so any session can fix one through the poster, and a body already posted unsigned has an owner route. This constrains [ADR 0120](0120-the-poster-edits-signed-posts-with-a-reason-line.md), whose "What was weighed" turned down a status-comment exemption, and narrows one of the edit controls it names.

## Why

- **The status comment exists to show the current state** (#412). With every reason line kept, it grew by one line a round and never showed only the latest. The round comments stay the record, and nothing reads the status comment back.
- **The removed control is narrow, and the owner accepted it.** The append-only reason check is one of the edit's controls (0120). It goes for one exact label on one surface. The author, target, signature, record, decision and leak checks still run, the "in plain sight" part still runs on the composed body, and GitHub's edit history keeps every earlier version and its reason line. The owner said yes (decision 180, relayed by the lead, in the owner's words "Yes, take picks").
- **One shared label for pull request bodies.** An edit must pass the item's exact label (`edit/unsigned`), so a body signed with the opening session's label still blocked the lead on PR 502. A pull request's own number doesn't exist before it is created, and the poster can't add a signature afterwards, so n is the issue's number. With no issue, the session's own label (lead pick, decision 179).
- **The owner route is scanned and typed.** A session writes only the changed line, runs it through `issue-comment --dry-run` after the read before posting, and the owner types it on GitHub. A fix never goes in a squash message, which would be permanent history no scan reads (decision 180).

## Accepted

- **Stale read, beside R60.** The old kept-against-had comparison also refused a status body built from a read older than another session's edit. Now the last writer wins; `claude/review.md` says to read the comment and the round comments just before the edit. The residual is a stale summary, with the round comments still the record (decision 180).
- **Sibling pull requests.** Every pull request on one issue carries `pr-<n>`, so a wrong `--pr` among them passes `edit/unsigned`. This falls under the accepted "Who counts as you" case: the edit checks catch only accidents, and the edit's reason line shows on the page.

## What was weighed

- **Keeping every reason line** (0120 as it stood). Not taken: the comment can't show only the latest round.
- **Keeping the last k lines.** Not taken: no reader needs them, and GitHub's history keeps all.
- **An exemption for any label, or a status marker in the body.** Not taken: the narrowest form that meets the ask is one exact label on one surface.
- **A row in `docs/rule-reasons.md`,** as #503 asked. Not taken: that file covers the rules file only, and this rule lives in `claude/review.md` (decision 179).
- **A poster surface that signs an unsigned pull request body.** Not taken: the shared `pr-<n>` label makes it unneeded, and it would bypass `edit/unsigned`.
