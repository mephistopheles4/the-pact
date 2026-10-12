# The moves as the owner's practices, and the rules file rewritten from a prototype

**2026-10-12.** #238 set out to fix the owner's most repeated correction: sessions read the moves as a pipeline Claude runs, one move after another. They are the owner's practices, there to keep human judgment in the loop. The rules file was rewritten from an approved prototype, in two tickets: T1, the thin gate and the new rules file (#261, PR #263), and T2, which grew into #262, the whole Scriptorium command, in three phases. #238 closed when #262's phase 1 landed (PR #271); this entry is written in phase 2's PR, which finishes the last ticket #238 cut.

## What it set out to do

The owner, from chat on #238: the rules text caused the misreading. Its words said "the moves are mine", but its structure said the opposite: "Four moves run, in order, at every seam", tiers defined as the set of moves the work goes through, and each move written as instructions to Claude with long procedures attached. The fix: the moves written as the owner's practices with no order, a short "How Claude helps", tiers as how much checking the work needs, procedures moved out, and prototype first when intent is unclear.

## What was built

- **The spec went through nine revisions.** Revisions 1 to 6 patched the old file. The owner then stopped the patching ("stop patching the rules file") and asked for a prototype of the whole file written fresh. Round 3 of that prototype was approved, and revisions 7 to 9 specified the build from it.
- **T1, #261 (PR #263): the thin gate and the new rules file.** The gate checks what can run and with what power, not the rules file's wording; two pinned blocks remain; the moves, "How Claude helps", the tier table and the Guards are the new text (ADR 0061).
- **Two side tickets** cleared the way: the cross script was dropped for a crossing template (#264, PR #269, ADR 0064), and the pact stopped setting ask rules (#265, PR #268, ADR 0063).
- **T2, #262 phase 1 (PR #271): lenses are offers.** The defaults sentence gave way to the offers paragraph; sensitive work is flagged with its why and the sensitive route recommended, with the security pair offered once more at Test; a Workflow section; the lens table became a roster (ADR 0065).
- **T2, #262 phase 2 (this PR): the parts and the builder.** The four parts Scriptorium builds became editable in a home configuration behind a security-defaults line; the builder page edits them on #143's prototype v3 canvas; the session usage limit joined the weekly one (#142, folded in) (ADR 0066).

## What the build found

- **Patching didn't converge.** Six revisions of edits to the old file kept its structure, and the structure was the problem. A fresh prototype read by the owner settled in three rounds what six revisions hadn't.
- **The owner skipped #238's three trial sessions** (from chat, 2026-10-11): the new rules are proved by use, and a march through the moves, or a missed nudge, in an ordinary session opens a rewording ticket.
- **Phase 2's canvas couldn't draw SVG links.** The page's own content check refuses any `scheme://` text, which an SVG element needs for its namespace. The links are drawn on a 2D canvas instead, with the same look, and the check stays as it was.

## Record

- The problem and the owner's framing: #238's body.
- The approved prototype and the owner's decision on it: mephistopheles4/the-pact#238 (comments 6113223073, 6113223446).
- The spec, revision 9, and its proceed: #238 (6113620527, 6113645106); its reviews and dispositions (6113466635, 6113494428, 6113552604, 6113594749, 6113594926, 6113620696).
- The hand-off naming T1 and T2: #238 (6113665486, 6113665625, 6113677757).
- The owner's decision to skip the trial sessions: #238 (6115126155); to close: #238 (6124654367).
- T1: #261, PR #263. T2: #262, its spec rev 4 (6123659870) with update 1 (6123794198) and proceed (6123821620); phase 1, PR #271, with its move-4 dispositions (6124562507); phase 2, this PR.
