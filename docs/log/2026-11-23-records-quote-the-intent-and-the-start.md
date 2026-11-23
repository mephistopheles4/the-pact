# Records quote the intent and the start

PACT-77. Records quote whatever started a task, so a session's own note could read like the owner's ask: PACT-72 began as a session's follow-up and was built overnight. The owner: "I think the quoting rules should say to capture the words verbatim that kicked off the intent, and also capture the verbatim that started the task directly. I think that would make it more accurate so we both know what happens."

An issue, ticket, spec and pull request now carry two exact quotes of the owner: the words that started the intent and the words that started this task. In the poster's post file each passage of `quote` has a `role` (`intent`, `start`, or `both` for one passage that did both). When no owner words are behind one of them, `intent_none` or `start_none` says so in one line, and nothing is quoted for it. The poster refuses a post that fills a side with neither or with both, and a passage with no `role`. With both sides reasoned, `quote` may be left out. The body ends each source line with its role and shows a reason as `No owner words for the intent: <reason>` or `No owner words for the start: <reason>`; a body file may not write either line. A `decision` keeps its one `quote` and takes none of the new fields. An item posted before the roles has no role line, and an edit carries what the item holds, byte for byte, as before.

Changed: the Posting section of `claude/review.md`, the poster's schema and checks (`claude/tools/poster.mjs`), `docs/poster.md`, and the poster's tests (`poster-quotes.test.mjs` is new; the older poster tests give their issue, pull request and spec posts a role through `poster-roles.mjs`). No other rule changed; the rules file is untouched.

**Rolling back:** revert the merge and reinstall from the dry run. An item posted with a role line can't be edited through an older poster, which reads it as an ask item with a changed quote; post a new comment instead.

## Record

- The ticket: PACT-77 on Linear.
