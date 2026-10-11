# Owner phrases

**2026-10-10**: two owner phrases join "Implementing a change" in `claude/CLAUDE.md`: "make it so" and "archive this session" (mephistopheles4/the-pact#203). The owner answers a session's recommendations in three words instead of retyping them, and ends a session without walking it through the hand-off. See [ADR 0056](../adr/0056-owner-phrases-live-in-the-rules-file-not-as-commands.md).

- **The rules file.** A new "Owner phrases" paragraph sits after the hand-off rule, outside every gated block. "Make it so" means "proceed as recommended"; it reaches the owner's own decisions only from a closing list that names each one with its identifier, and never what a rule says the owner types or starts. "Archive this session" checks the tracker, posts a closing comment, releases the tickets, pushes the session's own work, then archives when a tool can and nothing unreported would be lost. The archive steps are bullets, not a numbered list, because seam A reads a numbered line in "Implementing a change" as a move.
- **No gate code changed.** Seam A's canonical texts are untouched, and its "every canonical text equals its block" test still passes. No test matches the new words: a rule change is proved by review and by use (ADR 0045), so the lenses read the text against the acceptance claims C1 and C2.
- **The docs.** `CONTEXT.md` defines "owner phrase" beside auto-take. The threat model's R24 notes that the phrases count only from the session's own chat, which bounds the phrases but not a start prompt that spells out an action.
- **The cloud copy** is regenerated, so the owner pastes the cloud wrapper again after the merge. The builder page was already up to date: it carries the moves, not this paragraph.

## How it got there

The triage session filed the request as standard, with both phrases in one piece of work. In the plan session the owner chose what each does: "make it so" is the exact equivalent of "proceed as recommended" (option A), and "archive this session" wraps up, then archives when a tool can (option B). The cloud-copy regeneration put the build on the security route, so the security pair read revision 1. Its findings bounded the phrase: whole message only, from chat only, a named closing list for the owner's decisions, a never-covers list, a scoped and unforced push. `unstated-lens` read revision 2 and added a push step outside a worktree, a record home for chat-only work, and no archive while unreported files would be lost. The owner proceeded on revision 3.

## What the reviews found

Seven lenses read the result: the QA pair, `unstated-lens`, the standards pair and the security pair. Every cross passed, with no rerun. `integrity-lens` found no weakened check; `behaviour-lens` was inconclusive only because its own full run hit its time limit, and the session's full run passed. Every finding was a wording gap, and every one was fixed but one.

- **"Make it so" was tightened.** The owner's decisions sit in one named "decision list", which comes last except for a `▶ Your move` line. A merge goes through only at the named head commit, and stops if the head moved. A stop's recommended option that is an owner decision still needs the list. A recommendation from a report is restated with its source. The stale case names a background report, and the record leaves out the rendered hash.
- **"Archive this session" was tightened.** The push takes only the tracked changes the session made, reads every unpushed commit as well as the staged change, and stops on a secret, saying where, never what. The phrase is not the word that releases unshipped security work. Archiving stops and asks when the tool would remove a folder that still holds stray or ignored files. The assignee comes off every issue the session assigned itself to, unless another live session is on it, and `AGENTS.md`'s assignee rule now says the same.
- **The docs.** ADR 0056 names ADR 0055 and why the phrases sit beside it. `docs/reference.md` lists both phrases, so the owner can find them outside the rules file. The spec said the threat model wouldn't change; the build added one R24 note, and `conventions-lens` checked it and the `CONTEXT.md` entry as in step.
- **Dismissed: does "make it so" weaken the gated stop clause?** `conventions-lens` asked whether calling the decision list the stop's "tell me and wait" changes the clause, which would need the spec pair. The clause's text is unchanged, the owner still makes the pick by typing the phrase, and the session never picks; the owner chose that at sign-off, after the security pair read it. The owner can still ask for the spec pair.

## Record

Issue comments on mephistopheles4/the-pact#203:

- **Triage:** the issue body and 6089872802.
- **Spec:** revision 1 6103293852; security pair on it 6103325746. Revision 2 6103331500; `unstated-lens` on it 6103346603. Lens dispositions 6103350689. Revision 3 6103350775.
- **Plan phase finished, proceed on revision 3:** 6103355047.
- **Build:** draft PR #226 and the first full run, 6103670404.
- **Move 4:** QA pair 6103670619, `unstated-lens` 6103670911, standards pair 6103671109, security pair 6103671511; Lens dispositions 6103691176.
