# Better errors, then cut

PACT-48, P7 T5 of the rules-cut plan. Adds next steps to five refusals, then cuts the doc rows those refusals now carry.

The poster prints one `NEXT:` line above `RESULT:` for each edit rule it refuses, for `secret/env` and `text/hidden`, and for a quoted post with neither `intent` nor `intent_skip`. A quoted create post now takes `intent_skip`, a one-line reason, in place of `intent`; the body shows it under `## Understood intent` as `Skipped: <reason>` with no read-back line, and an edit carries it as it carries `intent`. The test runner's `--skips` failure prints a `NEXT:` line that sends a skip to a reviewed edit of `gate/tests/windows-skips.txt` and an installer skip to the owner. The renderer's project refusal for a setting with no tightening direction says to remove the key and ask the owner to set it in the home configuration, and names the default; the auto-compact window's value error names 400000.

Then the cuts, each row as the lead's sheet marked it: r062, r065, r066, r078, r085 (rewritten), r094, r107, r137, r139, r147, r150 and r155.

Why: the owner's notes on these rows said each rule was safe to drop once the refusal said the same. Every new message has a test that fails without it.

Not done here: dropping `confirmed` and `pending` from the poster's `intent.status`. That follows the rule rewrite in P2 (r046). Until that rewrite, the poster accepts `intent_skip` on any quoted post but a decision, while `claude/review.md` still asks for a read-back: a session may skip one before the rule says when.

Also changed, outside the rows: `docs/poster.md` no longer says the `NEXT:` line is the only line that starts with `NEXT:`, because exit 2 now prints some. The skip reason takes no leading or trailing space, and a read-back item is told from a skipped one by the read-back line, so a reading that opens with "Skipped:" is never taken for a skip.

**Rolling back:** revert the merge. The rows come back with it and the refusals lose their `NEXT:` lines.

## Record

- The ticket: PACT-48 on Linear.
