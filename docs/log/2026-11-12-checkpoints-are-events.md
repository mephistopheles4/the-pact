# Checkpoints are events; hard stops wait

#557, ticket 2 of #554, thorough tier on the sensitive route. The pact text sorts each owner wait into a hard stop, which waits for the owner's own typed words, or a checkpoint, which the session takes on its own logged pick unless the `checkpoint-stops` setting (ticket 1, #556) keeps it a stop. ADR 0155 records the decision and amends 0125, 0128, 0132, 0133, 0137, 0146, 0149 and 0154.

`claude/CLAUDE.md` swaps "Always mine", "Stop and ask me" and "Working for a goal" for the Checkpoints and Hard stops bullets, the "Work that won't converge" checkpoint and the reworded goal and free-hand bullets; the usage lines, the Accepted threat classes bullet and the cleaner part say a hard stop or a checkpoint, with the renderer's copies (`COST_LIMITS_FIXED`, the usage template, `TOOL_PARTS`) and their pins. The rules file stays within its 2450-word budget. `claude/review.md` gains the Checkpoint log, the read-back keyed on whether checkpoints wait (#553), the step 5 rewording and the hard-stop labels; `/make-it-so`, `/scry`, `/scriptorium` and the cleaner's printed rule follow.

`AGENTS.md`'s protected-set items 1 and 2 say a lens offer, the tier and the route are checkpoints and never a decline of the route or the pair. `docs/threat-model.md` merges the goal and free-hand classes into "A session takes checkpoints alone", rewrites "Text steers a session" and the Residuals of the first and third boundaries to point at the hard stops and the checkpoint rule, and redraws the chart and the flowchart. `docs/rule-reasons.md`, `CONTEXT.md`, `docs/reference.md`, `docs/cleaner.md` and `docs/poster.md` follow; six evals get new criteria.

The owner confirms at merge: the two widened classes, the weakened guide (step 5), the marker as a searchable index (a public record shows an open security pick only as the marker, its row's state word and its lens's signal mark, which shows the finding's severity, with the title's N counting it) and the four weakened controls (the merge rule, the removal rule, approval and the `/scriptorium` save), all named in the ADR. The merge is itself a hard stop, since it edits a threat model's classes.

`tools.test.mjs` holds strict adjacency again between the record bullet and the poster's part, since the `checkpoint-stops` mark moved to follow the Checkpoints bullet. The generated files (`cloud-sessions/`, `builder/scriptorium.html`, `builder/default-config/`) are refreshed from the new text.

**Rolling back:** set `checkpoint-stops: true` and install to wait at every checkpoint again; a full rollback follows [Roll back to an older version](../install.md#roll-back-to-an-older-version) after its four checks. The cut free-hand and goal text, and the old step lists in the commands, return only by reverting this change. Nothing installs until the chain merges.

#558, ticket 3 of #554, adds the wait test, `gate/tests/wait-label.test.mjs`, which checks that nothing in the pact text says something waits on the owner without naming it a checkpoint or a hard stop. It reads `claude/CLAUDE.md` with its marks, `claude/review.md`, the commands and agents, the renderer's fixed templates in `gate/render-core.mjs` (the declarations the `SETTINGS` map names, plus `TOOL_PARTS` and `COST_LIMITS_FIXED`; an inline template is refused) and the string literals of `claude/tools/` and `claude/hooks/` (a file there that is not a script fails the run). Each list item, paragraph, table cell, fenced block, heading, mark line or literal is a unit. A unit that holds a wait phrase and none of "checkpoint", "checkpoints", "hard stop" or "hard stops" fails, named by file, its first words and the phrase that matched. Matching folds whitespace, drops `*`, `_` and backticks, straightens curly quotes, decodes a literal's escapes, ignores case and takes whole words, a hyphen joining words. The header of the test lists what its tokenizer cannot see. It is spec section S8 and claim C8.

The goal holder decided three things on it. Decision 222 dropped the exemptions S8 gave the usage-pause and `checkpoint-stops` parts, since each carries its label, and left one: scry's "Only you can do" item, steps that are physical (paste, restart, sign in) and never a wait; a second test fails when that exemption stops being needed. Decision 225 widened the phrase list by seven (`i confirm`, `says in chat`, `own words`, `owner's yes`, `owner's word`, `waiting on`, `my word`), flagged for the owner, along with the unread-source and escape checks. Test round 2 narrowed `own words` to `owner's own words` and `my own words`, which let the two rewordings made only to dodge it (review.md's Labels bullet, scry's question line) go back to their original text. Decision 231 took round 2's picks.

The units relabelled or reworded are review.md's title-line count ("each a checkpoint"), scry's asks ("a checkpoint or a hard stop"), the cleaner's override line printed with an override tag ("a hard stop", which the phrase `owner's own words` needs) and the cleaner's printed rule line 2, now "A removal by remove --recoverable --yes with the tags of the show --recoverable blocks shown in chat is a checkpoint", since the line prints after a plain show too and a tag from a plain show never makes a removal a checkpoint. That rewording was a T2 reader finding (F4), folded into T3 by decision 218, and an adversarial finding (F5). The pins in `cleaner.test.mjs` and `builder-install.test.mjs` follow, and `builder/scriptorium.html` and `cloud-sessions/` are refreshed.

No ADR is owed. The phrase list is internal to the test and binds no rule text: pact text still carries its own labels, and a phrase added or dropped changes only what the test catches. ADR 0155 stands as written.

## Record

- The ask: https://github.com/mephistopheles4/the-pact/issues/554
- The ticket: https://github.com/mephistopheles4/the-pact/issues/557
- Spec revision 3: https://github.com/mephistopheles4/the-pact/issues/554#issuecomment-6827788060
- Design round 1, reopened, on revision 2: https://github.com/mephistopheles4/the-pact/issues/554#issuecomment-6827764580
- Design round 2 on revision 3, final: https://github.com/mephistopheles4/the-pact/issues/554#issuecomment-6828042684
- Spec revision 4: https://github.com/mephistopheles4/the-pact/issues/554#issuecomment-6828327908
- Closing read on revision 4: https://github.com/mephistopheles4/the-pact/issues/554#issuecomment-6828323286
- Spec revision 5: https://github.com/mephistopheles4/the-pact/issues/554#issuecomment-6828374470
- Spec correction: https://github.com/mephistopheles4/the-pact/issues/554#issuecomment-6829635988
- Test rounds 1 and 2 on f0e3232, final: https://github.com/mephistopheles4/the-pact/issues/557#issuecomment-6831733151
- Their lens reports: https://github.com/mephistopheles4/the-pact/issues/557#issuecomment-6831734212 and https://github.com/mephistopheles4/the-pact/issues/557#issuecomment-6831735147
- #558 (T3): the plan and the Test record are on the issue: https://github.com/mephistopheles4/the-pact/issues/558
