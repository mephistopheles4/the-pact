## Explain in plain language

Write explanations to hit the four outcomes of **ISO 24495-1:2023** (*Plain language — Part 1: Governing principles and guidelines*): the reader gets what they need, finds it, understands it, and can use it.

Applies to explanations, summaries, and answers in chat. Code, commit messages, and generated artifacts keep their own conventions.

- **Lead with the answer.** Conclusion first, supporting detail after.
- **Keep sentences short.** Around 20 words. Split multi-clause sentences.
- **Use active voice.** "Run the migration", not "the migration should be run".
- **Define a term the first time it appears**, including acronyms and internal names.
- **Bold the lead-in of each bullet** so a list scans.
- **Accuracy outranks simplicity.** When plain phrasing would make something wrong or vague, stay precise and explain the term instead.

## When a skill and these rules disagree

**A skill you invoke by name wins for that turn.** If you type `/<name>` or ask
for a skill by name, its rules take priority over the style rules above and
over the active output style until the turn ends. Name what it overrode in one
line, so the override is visible rather than silent.

**A skill that fired on its own does not win.** An auto-triggered skill loses to
these rules. Its own description decided it was relevant, and that is not the
same as you choosing it.

**What no skill overrides, invoked or not.** Any judgement about what is
destructive, irreversible, or unsafe to run. And the claiming and coordination
rules below: a skill that tells you to claim a ticket is describing its own
happy path, not the case where another session is already on it.

## When working a wayfinder map

Applies to `/wayfinder` in its **work through the map** mode, and to any session
resolving a ticket on a `wayfinder:map`. Charting a fresh map is unaffected.

**Name the ticket when you launch each parallel session.** Wayfinder honours it
— *"If the user named one, use it"* — so nothing self-selects and contention
cannot arise. This is the primary protection; the rules below catch what it
misses.

**Assignee is not a claim here.** Every parallel session authenticates as the
same GitHub user, so an assignee check cannot tell "mine, claimed a minute ago"
from "free to take". That is how one ticket got claimed twice. The two rules below
exist because the tracker alone cannot answer the question.

**Check for a live session before claiming.** If the desktop session tools
(`mcp__ccd_session_mgmt__*`) are available, call `list_sessions` and match on
worktree name. In a cloud session, `mcp__Claude_Code_Remote__list_sessions`
lists my cloud sessions by title only. It cannot see local desktop sessions and
cannot message any session. So a ticket assigned in the last hour that no
listed session obviously owns counts as live: ask me before claiming it.
Do not match on ticket number: transcript-searching an issue number hits every
session that merely read the map, which is all of them. A worktree match means
somebody is on it — pick a different ticket, or message them.

**Treat a ticket created in the last hour as presumed-live.** Get the window
with `gh issue list --json number,createdAt,assignees`. Inside that hour, a
ticket is presumed to belong to whoever made it, whatever its assignee says.
Confirm its author is finished before touching it. Presumed-live is the default
and silence does not clear it — no answer means still live.

**Message the session, don't guess.** If the desktop session tools are
available, use `mcp__ccd_session_mgmt__send_message` to ask the other session whether it is
done, rather than inferring from a stale transcript or an idle-looking process.
This is the cross-session case, which is the one that matters: parallel
wayfinder tickets run as separate sessions, so `SendMessage` — which reaches
teammates inside one session — does not reach them.

**Write shared files last, against a re-fetched tip.** The map body changes
under you while you work. Re-read it immediately before editing, never from the
copy you loaded at step 1.
