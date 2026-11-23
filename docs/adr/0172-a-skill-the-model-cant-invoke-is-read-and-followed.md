# A skill the model can't invoke is read and followed

Supersedes in part [ADR 0009](0009-hand-over-user-only-skills.md)'s hand-over and [ADR 0028](0028-the-moves-name-practices-a-person-binds-their-own-skills.md)'s binding convention (PACT-96, the owner's word). When the workflow names a skill the model can't invoke, because model invocation is off or a plugin skill is missing from the session's list, the agent finds the skill's `SKILL.md`, first in the user's skills folder, then in the installed plugins' `skills/`, reads it and follows it. It does not wait, does not stop at a checkpoint and does not end its turn with a hand-over line. A skill it can't find is said in one line, and the stage goes on. The rule is one paragraph in the pact's Workflow section.

## What changed

- **No hand-over.** The `▶ Your move: type /<skill> <argument>` line for a user-only skill is gone, and with it the ask-once exception and the split between a code span (the agent's) and a command (the owner's).
- **The pact is the executor.** The owner's workflow naming the skill is the consent to run it. The flag on the skill stays the author's choice for any session without that workflow.
- **A missing skill** is said in one line and the stage goes on, as before.
- **The preset's per-skill workaround goes.** `pstack:arena` no longer carries "read its SKILL.md from the pstack plugin and follow it" in its words: the rule covers it.

## Why

- **The harness blocks invoking such a skill.** Without a rule the stage stalls, or the skill is skipped without a word.
- **The owner wants no wait.** A hand-over line is a checkpoint the owner never wanted on a skill they named themselves.

## What it costs

A skill author who set `disable-model-invocation` to keep a skill from running unasked sees it run when the owner's workflow names it. The owner chose that by naming it, and a session with no such workflow is unchanged.
