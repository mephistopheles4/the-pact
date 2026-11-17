# Hard stops take the owner's words, typed or spoken

**2026-11-17.** #567, quick tier. The pact asked for the owner's "typed words" at a hard stop. The owner decided in chat that voice mode counts too and that no new rule is wanted: the word "typed" comes out wherever a rule asks for confirmation, and judgment decides the rest. [ADR 0158](../adr/0158-a-hard-stop-waits-for-the-owners-own-words-typed-or-spoken.md) records it.

## What was built

The word came out of the rules file's Hard stops bullet, `CONTEXT.md`, `docs/rule-reasons.md` (the row also records the trade-off: the owner's voice can't be told from another's, and the poster's record is mitigation), `docs/threat-model.md`, `/scry`, `docs/poster.md`'s `chat` source and review.md's Checkpoint log. The pins in `builder-install.test.mjs` and the `stop-ask` eval criteria follow, and `cloud-sessions/` and `builder/scriptorium.html` are refreshed. Nothing is added; commands the harness can tell as typed keep the word.

The five logs older than a month are folded into [`older.md`](older.md).

**Rolling back:** revert the merge and regenerate; a full rollback follows [Roll back to an older version](../install.md#roll-back-to-an-older-version). Nothing installs until the owner applies.

## Record

- The ask and decision: https://github.com/mephistopheles4/the-pact/issues/567#issuecomment-6918207087
