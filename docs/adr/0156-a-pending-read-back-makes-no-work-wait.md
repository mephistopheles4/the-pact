# A pending read-back makes no work wait

#562, standard tier. The owner said a read-back was never meant to make anything stop: a session reads it back and goes on. Under the `checkpoint-stops` default (on), the rules file still held "a pending read-back waits even then" in the Checkpoints wait line, "where checkpoints wait, a pending read-back" in the standing goal bullet, and `review.md`'s second read-back bullet made work wait at each seam, a standing goal included. This decision cuts all three, under both values of the setting, and keeps the read-back as a record.

It amends [0155](0155-checkpoints-are-events-hard-stops-wait.md)'s read-back bullet, which kept the wait where checkpoints wait.

## What changes

- **The rules file.** The Checkpoints wait line ends after "an intent or design question." The standing goal bullet says "Under it, no checkpoint waits." The renderer's template and project line for `checkpoint-stops` match.
- **`review.md`.** The read-back's first two bullets become one: a pending read-back makes no work wait, at any seam, whether or not checkpoints wait and with or without a standing goal. The session posts it `pending`, logs the intent it went ahead on and goes on; the owner confirms or corrects it later. A correction sends the work back to the stage it touches; once the work is merged, published or installed, it is a new change, and the session says what can't be undone.
- **Relay.** A relayed `decision` still carries no mark and never confirms a read-back; an item left `pending` after a relayed answer stays `pending` and holds up no work.
- **Copies.** `CONTEXT.md`, `docs/rule-reasons.md`, `docs/poster.md`, the pins in three gate tests, and the generated files (`builder/scriptorium.html`, `cloud-sessions/`).

## Considered options

- **List each pending read-back in every report, so one reply can confirm several.** Left out: nothing waits on one now, the record keeps each `pending` line, and the confirm audit found every read-back ask came back unchanged.
- **Keep the wait under a standing goal only.** Rejected by the owner: a read-back never makes work wait.

## Consequences

- **A session may build on an intent the owner later corrects.** The cost is rework, bounded by the go-back-on-correction rule; a merge keeps its own checkpoint or hard stop.
- **The head chef's own text** ("confirmation of intent the file asks for") is grimoire's, filed as mephistopheles4/grimoire#618.
- **Nothing installs until the owner applies it.** The merge and the install apply are the owner's hard stops.
- **Rollback:** revert the merge, rerun `node builder/build.mjs`, `node builder/default-config.mjs` and `node cloud-sessions/gen.mjs`, and reinstall from the dry run, after the four checks in [Roll back to an older version](../install.md#roll-back-to-an-older-version).
