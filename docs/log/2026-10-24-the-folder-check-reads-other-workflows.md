# The folder check reads other workflows

**2026-10-24.** Two low follow-ups from the security pair's Test read of #351. The lockdown test's YAML reader splits lines on a line feed alone, so another line break could hide a key from it (#356), and the folder check found a second `gate` or `gate-windows` job by matching lines, which other spellings got past (#357). Tier: quick.

## What was built (#356, #357)

- **Line breaks** (`gate/tests/workflow.test.mjs`, `folderProblems`): every workflow file, `gate.yml` included, is refused when it holds a carriage return not followed by a line feed, a control character other than a tab or a line feed (the C0 and C1 ranges and delete, next line among them), a line separator or a paragraph separator.
- **Other workflows:** every file but `gate.yml` is read with the same YAML reader; a file it can't read is refused, and so is a job whose id or `name` equals a required check name, or whose `name` holds an expression. The line match from #351 stays beside it.
- **The security pair's read** (F1, H1, H2): a job name is compared trimmed and in lower case, so a block-scalar name such as `|-` and `gate` reads as `gate`; a job id in another case counts too; and a workflow file whose extension is in another case is read.
- **The QA pair's read:** the C1 control range is refused too, and the folder reader takes its listing, so the upper-case extension is tested through it.
- **The tests:** twenty-one bad cases, each failing on a broken version of its check, and one control that a CRLF line ending and a tab are no stray break.

## Decisions

- The line match stays, so a quoted job id, which the reader refuses as unreadable, still reports the gate name.
- No ADR.

## Record

- The issues: [#356](https://github.com/mephistopheles4/the-pact/issues/356), [#357](https://github.com/mephistopheles4/the-pact/issues/357).
