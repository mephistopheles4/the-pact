# Owner phrases

**2026-10-10**: two owner phrases join "Implementing a change" in `claude/CLAUDE.md`: "make it so" and "archive this session" (mephistopheles4/the-pact#203). The owner answers a session's recommendations in three words instead of retyping them, and ends a session without walking it through the hand-off. See [ADR 0056](../adr/0056-owner-phrases-live-in-the-rules-file-not-as-commands.md).

- **The rules file.** A new "Owner phrases" paragraph sits after the hand-off rule, outside every gated block. "Make it so" means "proceed as recommended"; it reaches the owner's own decisions only from a closing list that names each one with its identifier, and never what a rule says the owner types or starts. "Archive this session" checks the tracker, posts a closing comment, releases the tickets, pushes the session's own work, then archives when a tool can and nothing unreported would be lost. The archive steps are bullets, not a numbered list, because seam A reads a numbered line in "Implementing a change" as a move.
- **No gate code changed.** Seam A's canonical texts are untouched, and its "every canonical text equals its block" test still passes. No test matches the new words: a rule change is proved by review and by use (ADR 0045), so the lenses read the text against the acceptance claims C1 and C2.
- **The docs.** `CONTEXT.md` defines "owner phrase" beside auto-take. The threat model's R24 notes that the phrases count only from the session's own chat, which bounds the phrases but not a start prompt that spells out an action.
- **The cloud copy** is regenerated, so the owner pastes the cloud wrapper again after the merge. The builder page was already up to date: it carries the moves, not this paragraph.

## How it got there

The triage session filed the request as standard, with both phrases in one piece of work. In the plan session the owner chose what each does: "make it so" is the exact equivalent of "proceed as recommended" (option A), and "archive this session" wraps up, then archives when a tool can (option B). The cloud-copy regeneration put the build on the security route, so the security pair read revision 1. Its findings bounded the phrase: whole message only, from chat only, a named closing list for the owner's decisions, a never-covers list, a scoped and unforced push. `unstated-lens` read revision 2 and added a push step outside a worktree, a record home for chat-only work, and no archive while unreported files would be lost. The owner proceeded on revision 3.

## Record

Issue comments on mephistopheles4/the-pact#203:

- **Triage:** the issue body and 6089872802.
- **Spec:** revision 1 6103293852; security pair on it 6103325746. Revision 2 6103331500; `unstated-lens` on it 6103346603. Lens dispositions 6103350689. Revision 3 6103350775.
- **Plan phase finished, proceed on revision 3:** 6103355047.
