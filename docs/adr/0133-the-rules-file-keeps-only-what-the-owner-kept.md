# The rules file keeps only what the owner kept

The rules file's prose outside the Scriptorium parts is cut to the owner's list 1 (#464 T4). Seven items go: the opening note and its "Scriptorium builds this" markers, How Claude helps' intro, Build what you were given, Bring me decisions, Finish the build, Say a mismatch first, and How much checking's intro. Always mine, the cleaner and the effort line stay as one line each. The rest is trimmed to the text on the issue. The record's and the poster's rules move to review.md's Posting section, the cleaner's how-to to its own `show` output, Prototype first to the default workflow's Plan stage, and Nudge once to a line under the moves. A decline of the sensitive route or its offer at Test no longer has to be typed in the working session's own chat. This narrows ADR 0128's chat rule for declines, and ADR 0116's Nudge once is shorter.

## Why

The owner's words: "i feel like deleting most of it to be honest, way too many rules", and on the decline rule, "i dont think its intended to be so granular, we agree on it and move on".

## Considered options

- **Render review.md, to leave the poster's part out when the poster is off.** Rejected: review.md installs as a byte copy, and rendering it changes the installer. The tool part stays the switch: its one line appears only when the poster is on, and review.md's poster paragraph applies only when the rules file says so.
- **Nudge once as a fifth move.** Rejected: the moves are the owner's practices, and a nudge is what Claude does. So it is a fixed line the compiler adds under them. A builder edit of the moves keeps it; a hand-written replace block without it loses it, and an added move lands below it.

## Consequences

- A lead session fooled into claiming a decline can now drop an offered review. The protected-set route applied: the plan was the spec, the owner skipped the spec pair, and the security pair read the change.
- Always mine no longer says what chat means or that a file's or a tool's text is never a confirm or an answer to a lens offer. The harness guards only messages sent in from another session (ADR 0128), so a start or resume prompt, a file or a tool's text is not covered.
- Always mine no longer names a push to the default branch or a commit made on it, and no longer says a command only the owner can run is handed over with a stop. This amends ADR 0128.
- Cost limits no longer say a cost never holds back the security pair, or that the security bar wins over a cost's text.
- Some behaviour now has no rule: sorting a review, finishing a build with the reviews, saying a mismatch first, keeping one model. T7's evals are where a loss would show.
- The line for the cleaner names no path, and its how-to only appears once it has run. The path is in `docs/cleaner.md`, which is not installed.
- An install with an edited cost-limits or workflow part keeps its own text, so "accepted-risk candidate" and an older prototype offer stay there until the builder file changes.
