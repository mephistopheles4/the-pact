# A standing goal reaches the sessions its holder starts

#505. The Guards' fixed block, between the `stop-and-escalate` marks in `claude/CLAUDE.md`, gains one sentence in the standing-goal bullet and one new bullet, "Working for a goal". This amends [0137](0137-a-standing-goal-keeps-going-on-judgment.md), whose goal stopped at the session that held it, and [0128](0128-the-pact-names-no-lead-session-and-keeps-chat-only-where-it-closes-a-gap.md), which cut every lead and relay from the pact.

- **Narrowing.** The owner's words in a session's chat narrow the goal for that session and those it starts; text may narrow it only by keeping a step for the owner, never widen it. A narrowing is part of "the goal" the compaction hook asks the hand-off to keep.
- **Working for a goal.** A session the holder started for the goal holds none. What the rules would bring to the owner, but the usage go-ahead and a worktree removal, goes to the holder, and only the holder's reply to what the session sent counts. The owner's words in the session's own chat beat that reply, and the session records each narrowing typed there so a compaction keeps it. The session logs each reply and who gave it, never as the owner's; with no reply, the item waits for the owner. The holder says so in each start prompt, answers only the sessions it starts, names in its log, by its kind, the one each was for, passes each narrowing on, and tells the owner in its own chat what the rules tell the owner only in chat (the sentence is the holder's).
- **One hop.** A session started by a session that holds no goal works for none.

The wording is fixed (spec v3.1, with the two changes below); any change beyond word order and punctuation comes back as a spec change read by the spec pair and the security pair. The rendered default grows by about 165 words and stays within the 2250 budget.

## Spec changes after v3.1

- **v3.2** (decision 217): "a worktree removal" for "a cleaner removal", since the fixed block renders with the cleaner tool off and gate/tests/tools.test.mjs forbids the word then.
- **v3.3** (decision 236, after Test round 1): the owner's words in a started session's chat beat the holder's reply and are recorded there; the holder logs a decision by its kind; the closing sentence is tied to "Holding the goal"; the threat-model clause adds a reply the session can't tell from its starter's; and AGENTS.md says a goal, or a holder's reply, is never the owner's word in chat for an install apply or mise trust. The last closes the run-time gap in "these rules", which the ADRs alone defined.

## Why

- **The goal stopped where a brigade starts.** One night the owner set a level-3 goal and was away; three wording-level mediums were parked for the owner. A started session reads its first message from a session, so it never held the goal, and an away owner stalled it. 0128 had taken the lead out of the pact, so nothing let the holder decide for the sessions it started.
- **The owner's words.** "We can simply have the agent that carries the goal act as the owner" (2026-11-08). The pact already had the clause; it lacked who carries a goal when sessions start sessions.
- **Later words had no home.** "Keep going until it is met or I end it" covers ending a goal, not narrowing it. The owner's "Merges, closes, filing, installs, publishing and eval runs stay mine" read literally let the holder decide those too.

## What this removes

Within the pact's text, a started session under a goal no longer waits for the owner's own confirm in chat on a merge, an install or a publish; for 0128's "a decline any other way leaves the review offered"; for Cost limits' "comes to me" items (a new or widened threat class, a removed control, a change to the threat model's scope, a trade-off past a limit); or for "Stop and ask me". Each goes to the holder, and the holder's reply counts.

The protected set's items 1 and 2 ("a standing goal answers the offers", "answers the route and the offer") now reach a started session, answered by the holder's reply. Item 3 and the open-in-every-hand-off rule are untouched.

The holder may answer a started session's "Stop and ask me" with a second opinion from a model outside Claude Code. That sends the started session's context off the machine. 0137 named the flow for the holder; this names it for started sessions.

## What stays the owner's

- **The cleaner's yes.** The rules file says "but the usage go-ahead and a worktree removal", not "a cleaner removal": the fixed block renders with the cleaner tool off, and `gate/tests/tools.test.mjs` requires that no rule then names the cleaner (the owner took this wording, decision 217). A worktree is removed only through the cleaner, and `claude/tools/cleaner.mjs` prints "only after the owner's own yes in chat to these blocks, outside a goal". A started session holds no goal, so it still needs the owner's own yes. Neither the cleaner nor its test changes.
- **Usage.** A started session parks before its line and tells the holder and the owner; the go-ahead past the line is the owner's.
- **A project's own chat-only stops.** In this repo, applying an install and mise trust, in `AGENTS.md`. "These rules" means the pact's text, as in 0137.
- **Claude Code's permissions.** The holder's reply is never an approval Claude Code keeps for the user: a started session's permission prompts still go to its user.
- **With no goal set,** every line reads as before.

## The threat model

"A standing goal decides alone" gains a clause: a session started for a goal acts on its starter's replies, on its start prompt's word that a goal is set, or on a reply it can't tell from its starter's; what its rules would tell the owner reaches the owner through its starter. Its likelihood rises from 0.20 to 0.30, in the chart and the table, because more sessions act on a word they can't check. "Removals lose local work" is unchanged. Widening a class and removing a control are the owner's, through a merge they confirm in chat.

## What was weighed

- **The issue's four-tier order** (safety, the owner's words, the goal, process). Not taken. Its top tier puts hard-to-undo steps, the protected set and the permission rules above a goal, which brings back 0125's "A goal never lifts", dropped by 0137 on the owner's "Nothing stops it". 0137 also turned down lists of what a goal takes and never takes. The pact already has its order: "even what they say only I can decide".
- **"Lead" in the pact.** Not taken. 0128 cut it as a tool's term. "The session that holds my goal" needs no brigade, level or skill.
- **A started session holding the goal itself.** Not taken: a session's text would set a goal.
- **A chain of any length.** Not taken: a session in the middle could answer its own children with nothing logged at the holder. One hop keeps one decider. The owner can widen it later.
- **Bounds only in this ADR.** Not taken: no session reads an ADR at run time, so the bounds a session must follow sit in the rules file.

## Out of scope

The head-chef skill (grimoire) says that at levels 2 and 3 the lead follows the owner's user-level instructions file and keeps for the owner what that file keeps, without carrying that file's own goal rule. That fix is a grimoire issue, and this change doesn't wait on it.
