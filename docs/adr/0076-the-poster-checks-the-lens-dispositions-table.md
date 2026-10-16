# The poster checks the Lens dispositions table

Where the owner turns the poster on, its pre-post scan checks the shape of any Lens dispositions table in the body against the review procedure's template, and refuses a table that drifts, with nothing sent (#280, T2 in #285). Before it posts, the poster also asks GitHub who owns the repo, and refuses when that owner isn't the `gh` login.

## What changed

- **The trigger.** A table is checked when a header cell reads `Disposition`, ignoring case and `**`, under an earlier line naming "Lens dispositions". A table with no such label, or no such column, such as an escape or gap table, is left alone.
- **What it reads.** Every line outside a fence, folds included. A fence is read as CommonMark defines it: a run of three or more backticks or tildes, indented by at most three spaces, closed by a run of the same character at least as long; a backtick run whose info string holds a backtick opens none; a fence that never closes runs to the end. So a lens report in the review procedure's fold, whose fence is one backtick longer than any run inside it, stays closed to the check.
- **The rules.** `table/header`: a header other than exactly `| Finding | Lens | Disposition | Rerun |`, case and spacing aside; its rows are then not read. `table/cells`: a row with another cell count, or an empty Lens cell. `table/disposition`: a cell not starting with `fixed`, `taken`, `dismissed`, `skipped` or `open`, in lower case and unmarked, then the cell's end or a non-letter. `table/skipped`: `skipped` not followed by `, because`. `table/auto`: ` (auto` not followed by `:`, `)` or `, reversed`. The words live in one exported constant, which a test holds equal to the review procedure's.
- **What it leaves alone.** The reason text, an empty Finding cell, the Rerun cell, the Auto-takes list, and any table the trigger doesn't reach. The secret scan is unchanged and still reads the whole body, folds and fences included.
- **The output.** Each refusal names its rule, line and column, never a cell, and every place a rule is broken is named. The check is one pass over the lines with no pattern that can backtrack without bound.
- **The owner lookup.** After the login read and the owner-by-name check, the poster reads the repo through `gh` and refuses with `owner/github` when the owner GitHub returns differs from the login, matched exactly. A read that fails or names no owner ends `unavailable`, with nothing sent. GitHub follows a renamed or transferred repo, so a name the login once owned can never carry a post to its new owner.
- **The review procedure** gives the exact header row and the words, `open` among them for a finding the owner hasn't settled yet. Escape and gap rows go in a table of their own with no Disposition column. It says a tool may check the table, that a table no tool checked is unchecked, and that a retrospective reads every table tolerantly. It names no tool.
- **The rule part** gains T2's text: a refused table is fixed in place and posted again, never folded, relabelled or moved, and no lens reruns for it; a refusal inside a lens report means its fence is too short. It also gains three clauses the owner settled after #284's review: a file is deleted once its post ends, whatever the result; every scratch file left is deleted before the session ends; a file's location goes to the owner in chat only.

## Why

- **The drift was real.** Since the cross script went (ADR 0064), the main session fills the table by hand. A throwaway check over the 11 tables the owner's account posted from 2026-10-12 refused 7 of them. A table that drifts breaks nothing at once, but a later retrospective (#260) would miscount in silence. The 11 tables are fixtures, each reduced to its label line and table with every unread cell a placeholder, and each gives the result the spec recorded.
- **It differs from the cross script.** The cross script parsed every lens report and refused on their shape, which sent sessions back to rerun lenses (ADR 0064). This check reads only the table the main session wrote, never a lens's words, so a refusal sends the session back to fix its own table and never to rerun a lens.
- **It sits with ADR 0069.** That ADR moved the gate away from checks on the shape of text. This check is not in the gate: it runs only in the poster, only for people who turn the poster on, and the owner asked for it. Like the poster's other scans, it is a backstop for accidents, not a guard.
- **No per-table "checked" mark.** A mark the session writes proves nothing, and one the poster added would change the text it was handed. The review procedure's "unchecked" sentence tells a retrospective what it can't know.

## What was weighed

- **Reading lens reports too.** Not taken: that is the cross script's failure, and a refusal could then only be cleared by editing a verbatim report or rerunning a lens.
- **Checking the Auto-takes list or tables with no leading pipe.** Deferred: neither has drifted in the record, and both would widen what the check reads.
- **Reporting each rule once per body,** as the secret scan does. Not taken: a table is fixed row by row, so every broken row is named.

Amends [ADR 0074](0074-pact-tools-are-opt-in.md), whose poster rule part now carries T2's text.
