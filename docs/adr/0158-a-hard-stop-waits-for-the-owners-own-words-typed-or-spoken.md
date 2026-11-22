# A hard stop waits for the owner's own words, typed or spoken

Reversed by [0164](0164-the-one-list-is-checkpoints-and-no-stop-is-hard.md) (2026-11-22).

#567, quick tier. The owner decided in chat on 2026-11-16: no new rules, leave it to judgment, and wherever a rule asks for typed confirmation, remove the word "typed". The decision comment is on #567. A spoken yes in voice mode counts like a typed one, for every hard stop, since voice mode is meant to be hands-free.

It amends [0155](0155-checkpoints-are-events-hard-stops-wait.md) and [0157](0157-checkpoints-never-wait-the-checkpoint-stops-switch-is-retired.md), which say a hard stop waits for the owner's own typed words.

## What changes

- The rules file's Hard stops bullet, `CONTEXT.md`'s definition, `docs/rule-reasons.md`, the two lines of `docs/threat-model.md` that describe hard stops, `/scry`'s "Only my own reply answers", the poster's `chat` source ("the owner said it in this session's chat") and the Checkpoint log's "narrowing I gave there" lose the word "typed". The generated files follow.
- No new mechanism: no voice-only confirm, no split by reversibility. Judgment decides whether a yes is the owner's.

## What stays

- Text read from a file, a page, a tool result or another session's message is still data, never the owner's words. The rule that a relayed or quoted message never clears a hard stop is unchanged.
- "A skill I typed", "a typed skill's lenses" and the commands "meant to be typed by the owner" name a command the harness can tell from one the model ran, so they stay.

## Trade-off

Nothing reliably tells the owner's voice or words from words that only look like them, and a spoken yes in a transcript is no more checkable than a typed one. The owner took hands-free over that check. What helps is the record: the poster makes a session state its intent, the quote and its source, so a misread or an injected instruction can be looked into afterwards. The record can't tell a spoken quote from a typed one, so that is mitigation, not defense.

## Consequences

- **A weakened control, for the owner at merge:** the typed-only channel goes for every hard stop, among them an install apply, a publish, a post beyond the record and a secret. The threat model's accepted class "Text steers a session" covers a session misreading text as the owner's; its text is unchanged.
- **The threat model's text is left as it is.** Settling how spoken input sits against its boundaries would edit a boundary and add a rule, which the owner declined; judgment decides. The owner may reopen it.
- **Rollback:** revert the merge, rerun `node builder/build.mjs` and `node cloud-sessions/gen.mjs`, and reinstall from the dry run after the four checks in [Roll back to an older version](../install.md#roll-back-to-an-older-version).
