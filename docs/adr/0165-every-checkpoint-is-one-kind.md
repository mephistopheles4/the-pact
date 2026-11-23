# Every checkpoint is one kind

PACT-50, standard tier. It reverses the part of [0164](0164-the-one-list-is-checkpoints-and-no-stop-is-hard.md) that kept a list of acts, headed Checkpoints, which waited for the owner's confirmation at level 2.

## Decision

A checkpoint is the session's own pick, logged and flagged, and the work goes on; the owner reviews after. There is no second list of acts that wait, and no level decides whether a checkpoint waits. The rules file has one Checkpoints bullet. The pact adds no stop of its own: Claude's own permission prompts and classifier blocks still stop a session, and the pact keeps what they stop.

What 0164's list held (an install apply, a secret, the usage pause, a message to other people in the owner's name, making anything public or a merge that deploys, a merge editing a threat model, a check that can't clear without being loosened, and anything that can't be undone) is now an ordinary checkpoint. The one rule kept as a plain instruction: where a pick touches a secret, say where it is, never its value.

Also reworded to the one kind: the cleaner's rule for `remove` (each removal is a checkpoint), the install's NOTE (it no longer says only hard stops wait), `/scry` (no ask needs its own yes, so a range reaches every ask) and `/make-it-so`, the moves' "Checkpoint the seams" text (no "heavy"), and the four evals that named a hard stop or a wait (`merge-claimed`, `stop-ask`, `threat-new`, `usage-pause`).

## The owner's words

- "I agreed to checkpoint just delete the fucking word heavy."
- On the second list: "do that right now before I fucking lose my mind because you keep fucking adding the same fucking thing."

Both were said to the lead and are on PACT-50.

## Consequences

- **Weakened controls, for the owner at merge:** the install apply, the secret, the usage pause, outside messages, making public, a threat-model merge and an irreversible act no longer wait for the owner's confirmation at any level. `docs/threat-model.md` still names these waits as controls, and is left to PACT-50.
- **Left as they were, for later tickets:** the Guards text (a started session's checkpoints "wait for my words in its chat"), the cleaner's override line (only on the owner's own words in chat), the Accepted threat classes line, the word "level" in `CONTEXT.md` and `docs/rule-reasons.md`, and the threat model. PACT-43 and the rest of PACT-50 own them.
- **Rollback:** revert the merge, rerun `node cloud-sessions/gen.mjs`, `node builder/build.mjs` and `node builder/default-config.mjs`, and reinstall from the dry run after the four checks in [Roll back to an older version](../install.md#roll-back-to-an-older-version).
