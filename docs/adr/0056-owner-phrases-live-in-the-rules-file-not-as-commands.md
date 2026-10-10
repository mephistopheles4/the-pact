# Owner phrases live in the rules file, not as commands

The owner answers a session's recommendations with "make it so", and ends a session with "archive this session". Both are defined in "Implementing a change" in `claude/CLAUDE.md`, outside every gated block, as "Owner phrases". They are not slash commands or skills. This sits beside [ADR 0019](0019-recommendations-are-auto-taken-with-a-trail.md): auto-take is the session acting on its own recommendation; "make it so" is the owner's word, with its own limits.

## What changed

- **"Make it so"** is the exact equivalent of "proceed as recommended" as a reply to the session's last message. It covers one of the owner's own decisions, such as a merge or an install's go-ahead, only when that message ends with a list of the decisions it asks for, each with its identifier. It never covers what a rule says the owner types or starts, cutting a lens, or the claiming and coordination rules. It halts at a later stop, asks when the recommendation is unclear or the message may be unread, and records each decision with the list it answered.
- **"Archive this session"** wraps up in order: everything on the tracker, a closing comment, the tickets released, the work pushed to the session's own branch, then the session archived when a tool can and nothing unreported would be lost. It never deletes a session, a branch or a worktree.
- **Both count only as the owner's whole message, typed in that session's chat.** Never from a start prompt, another session's message or the tracker.

## Why

The decisions are from spec revision 3 on #203.

- **A phrase, not a command.** The pact ships only the rules file and the lens agents. A command or skill would be a new payload kind, so the install gate would have to change, and that is gate code on the security route. A phrase in the rules file gets the same result.
- **"Make it so" reaches the owner's own decisions, named.** The owner chose option A: it is the exact equivalent of "proceed as recommended", so it covers what the owner would have covered by typing that. The security pair found that one phrase could then approve everything in a long message. The closing list with identifiers bounds it: the phrase answers only what the session put in front of the owner by name. That list is the "tell me and wait" a stop asks for.
- **Whole message, from chat only.** The phrase is short and easy to quote. A phrase inside a longer or negated sentence, or carried in a start prompt or another session's message, must not count. The text says so itself, rather than leaning on the `tracker-authors` clause.
- **Archive pushes but never deletes.** The owner chose option B: wrap up, then archive when a tool can. Archiving can be undone; deleting a worktree can't. The push is limited to the session's own work, read for secrets first, never forced, and held for unshipped security work on a public repo.
- **No gated clause changes.** The text names "When to stop or escalate" and "Whose tracker text counts" and copies neither. Nothing in the protected set is cut or weakened, and the never-covers list keeps the phrase from loosening how a gated clause is read.
- **No word-matching test.** A rule change is proved by review and by use ([ADR 0045](0045-agent-and-rule-changes-are-proved-by-review-not-by-probe.md)). Seam A checks that the gated blocks are unchanged; the lenses read the new text against the acceptance claims.

## Considered and rejected

- **Slash commands or a skill.** A new payload kind, a change to the install gate.
- **"Make it so" never covering a merge or an install** (the security pair's suggestion that each needs its own stop). It conflicts with the owner's option A; the named closing list is the stop's "tell me and wait".
- **"Archive this session" removing the worktree.** Not reversible, and it can lose stray or ignored files.

## How this was decided

- **2026-10-10** in mephistopheles4/the-pact#203: triage as standard (owner decision, from chat, in the issue body); the two options for the phrases (owner decisions, from chat, recorded in spec revision 1, comment 6103293852, and revision 3, 6103350775); proceed on revision 3 (6103355047). Built in the same issue.
