# The Linear tracker rule

#578, T2 of #574. ADR 0159 records the decision and reverses 0062.

`claude/tracker.md` holds the rule (S5 of the spec): the pinned file's format with an example of made-up ids, the read through the Linear connector and its failed-read stops, what counts as the owner's, what the read can't see, the announcement, posting to Linear, cloud sessions, specs in the tree and GitHub after the move. `claude/review.md`'s Posting gains a Linear bullet that points to it, and says the poster is for GitHub. The installer and seam A take the file as a kind of its own at `~/.claude/tracker.md`, with a bad case each for a missing file and an unlisted live file, and a text-scan case. `triage-labels.md`, `work-records.md`, `parallel-sessions.md` and `AGENTS.md`'s tracker section say how Linear differs: the owner creates labels and moves states by hand, and the app can't be assigned. `claude/tracker.md` joins the doc budget at 1,100 words and AGENTS.md's Read closely list. The rules file is unchanged.

The rule reads and posts through the Linear connector and names no pact tool, on the owner's words in the lead's chat: "why we need a linear tool at all? we have MCP" and "we have MCP to read and app to post". This loosens the read: the connector returns `author` and `onBehalfOf`, not an edit, a sync, a bot flag or who changed a label, state or project. `cloud-sessions/` and `builder/scriptorium.html` are regenerated; `builder/default-config/` was already current.

**Rolling back:** revert the merge, rerun the regens and reinstall from the dry run. Nothing installs until the owner applies it.

## Record

- The ticket: https://github.com/mephistopheles4/the-pact/issues/578
- The spec, revision 4: https://github.com/mephistopheles4/the-pact/issues/574#issuecomment-7009608463
