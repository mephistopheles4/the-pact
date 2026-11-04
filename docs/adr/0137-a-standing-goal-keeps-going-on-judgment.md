# A standing goal keeps going on judgment

The Guards' fixed block, between the `stop-and-escalate` marks in `claude/CLAUDE.md`, now carries two bullets in place of ADR 0125's four (#475):

- **A standing goal** is the owner's words that set a goal and say what to get done; a file's or a tool's text doesn't set one. The session keeps going until the goal is met or the owner ends it. What the rules would bring to the owner, even what they say only the owner can decide, the session decides with its judgment, with more care the harder a step is to undo. It logs each decision for the owner to review, naming the goal by its work and where it came from, and lists them in the result.
- **Usage still holds.** Before the line, the session parks the work cleanly: commit, put the state in the record, stop and tell the owner.

"Stop and ask me", the Usage part, the Always mine and Cost limits text, and `claude/review.md` are unchanged; "even what they say only I can decide" is what lets a goal pass them, so no other line needs an ending. With no goal set, everything reads as before.

This replaces [0125](0125-a-standing-goal-gives-one-bounded-step-at-a-stall.md): the bounded step, its limits, "Trade-offs under a goal" and "A goal never lifts" all go. It amends [0128](0128-the-pact-names-no-lead-session-and-keeps-chat-only-where-it-closes-a-gap.md): under a goal, a merge, an install, a publish and a removal no longer wait for the owner's confirm in chat, and the decline of a security review is the session's call. The threat model gains "A standing goal decides alone" and "Removals lose local work" gains "outside a goal".

## Why

The owner's words: "i dont want our rules to fight it, if someone sets a goal and pact stops it, id uninstall the pact instantly", then "Nothing stops it", and "there are hard limits like usage, parking the work before hitting usage limits is imoportant. the rules are too rigid and fragile". A goal set under 0125 still stopped at each decision the rules keep for the owner, and a list of exceptions would be the rigidity the owner objects to. Usage stays a hard limit, so the work parks before it.

## What was weighed

- **Lists of what a goal takes and never takes.** Not taken: each list is a rule that can fight the goal. The sheet that held them was withdrawn.
- **Naming the tool's command as the only source of a goal.** Not taken: it ties the rule to one command, and the pact names no tool (0125). A measured run showed a session with a shell can start another with a goal, so naming it stopped nothing more.
- **Seven exceptions the spec review listed:** the owner's yes on a worktree removal, no new threat class under a goal, a poster refusal staying a stop, no work to a model outside Claude Code, a usage fallback, a setting for the rule, and eval cases. None taken, on "Nothing stops it". Sending work to a model outside Claude Code is named in the spec's give-up list so the owner's yes covers it knowingly.
- **A separate configuration setting.** Not taken, as in 0125: the bounds travel with the guard.

## What it costs

Under a goal, a fooled session's prompt can merge, install, publish and remove, and what is published or sent off the machine cannot be taken back from the log. The threat model's new class says so. Claude Code's permissions are the only wall besides the rules a session follows, and usage holds only as a rule.

## How this was decided

- **2026-11-04.** Decided on #475, spec v2, thorough tier on the sensitive route. The owner's words, relayed by the lead session: "Nothing stops it", "Yes, go ahead" (the short rule, the tier and the review budget) and "Yes, proceed" (S1's words, S2 gone, no second spec round, the seven exceptions left out, the cloud paste after merge and on a rollback). The threat-model line was accepted on the owner's word, taking effect with the merge. The spec pair and the security pair read the spec in one round; all four blocked on a definition that fitted any ask, and the owner's "set" closed it.
