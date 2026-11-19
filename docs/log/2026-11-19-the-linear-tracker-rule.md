# The Linear tracker rule

#578, T2 of #574. ADR 0159 records the decision and reverses 0062.

`claude/tracker.md` holds the rule (S5 of the spec): the pinned file's format with an example of made-up ids, the named read and its failed-read stops, what counts as the owner's, the announcement and re-check, Posting to Linear, cloud sessions, specs in the tree and GitHub after the move. `claude/review.md`'s Posting gains a Linear bullet that points to it. The installer and seam A take the file as a kind of its own at `~/.claude/tracker.md`, with a bad case each for a missing file and an unlisted live file, and a text-scan case. `triage-labels.md`, `work-records.md`, `parallel-sessions.md` and `AGENTS.md`'s tracker section say how Linear differs: the owner creates labels and moves states by hand, and an app assignee is visibility only. `claude/tracker.md` joins the doc budget at 950 words and AGENTS.md's Read closely list. The rules file is unchanged.

The rule names `poster.mjs linear-read` and the poster's Linear surfaces, which T4 builds; until then nothing counts and nothing is posted. `cloud-sessions/` and `builder/scriptorium.html` are regenerated; `builder/default-config/` was already current.

**Rolling back:** revert the merge, rerun the regens and reinstall from the dry run. Nothing installs until the owner applies it.

## Record

- The ticket: https://github.com/mephistopheles4/the-pact/issues/578
- The spec, revision 4: https://github.com/mephistopheles4/the-pact/issues/574#issuecomment-7009608463
