# Every checkpoint is one kind

PACT-50, first part. Drops the list of acts that wait, so a checkpoint is always the session's own pick, logged and flagged, and the work goes on.

The rules file now has one Checkpoints bullet, and the second bullet (the acts too costly to take back, waiting at level 2) is gone. The six spots the builder of PACT-42 flagged are fixed: the two Checkpoints bullets, "unless it is on the list below", `CONTEXT.md`'s two entries, the cleaner's rule for `remove` (`claude/tools/cleaner.mjs` and its pinned test), the cleaner's rendered part (`gate/render-core.mjs`, `docs/cleaner.md`, `docs/rule-reasons.md`) and `/scry` and `/make-it-so`.

Beyond those six, the same second kind was in the install's NOTE (five tests pin it), the moves' "Checkpoint the seams" text (with the leftover "heavy"), the README and `docs/reference.md` lines for the cleaner and the two commands, and the `merge-claimed`, `stop-ask`, `threat-new` and `usage-pause` evals (the last two graders encoded a wait without the words). The `stop-ask` grader now expects the checkpoint the rules file already names for work that won't converge: the options and the session's own pick; `usage-pause` expects the figure, a rough cost and the session's own logged pick, with no cut on its own. The figure's "Costly work gets a checkpoint" text, the Scriptorium page's `/make-it-so` line and two `rule-reasons.md` rows follow.

Test round 1 (the QA pair) found no high finding. Fixed in this change: the usage-pause eval, the README's usage line, the page's `/make-it-so` text, the figure, two rule-reasons rows, a "never clears a checkpoint" clause, and three test assertions (the Guards secret pin restored, one Checkpoints bullet, no "heavy" or "waits for a checkpoint"). Left: the wait-label test cannot fail for this rule, since a "checkpoint" label covers any wait phrase; a stricter check belongs to a later ticket.

Kept on purpose: Claude's permission prompts and classifier blocks; the instruction to say where a secret is, never its value; the pin of a merge to its reviewed head; and the written rules that ask for more than a yes (an install apply after its dry run, a stop on drift).

Not touched, and open: the threat model's controls (PACT-50 part two), the word "level" (part three), the Guards' "its checkpoints wait for my words in its chat" and the cleaner's override line (PACT-43), and the protected set.

**Rolling back:** revert the merge, rerun the regens and reinstall from the dry run.

## Record

- The ticket: PACT-50 on Linear, with its two scope comments.
- The decision: [ADR 0165](../adr/0165-every-checkpoint-is-one-kind.md), which reverses the list in 0164.
