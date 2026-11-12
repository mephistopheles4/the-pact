# A pending read-back makes no work wait

#562, standard tier. ADR 0156 records the decision and amends 0155's read-back bullet.

`claude/CLAUDE.md` drops "; a pending read-back waits even then" from the Checkpoints wait line and "where checkpoints wait, a pending read-back" from the standing goal bullet. `claude/review.md`'s Posting merges the read-back's first two bullets into one that says no work waits on a pending read-back, at any seam, whatever the setting and with or without a standing goal; a correction sends the work back to the stage it touches, and after a merge, publish or install it is a new change. The later-confirm bullet gains one clause: an item left pending after a relayed answer stays pending and holds up no work. The relay rules are otherwise unchanged.

`gate/render-core.mjs`'s `checkpoint-stops` template and project line match. `CONTEXT.md`, `docs/rule-reasons.md` and `docs/poster.md` follow. `render-config.test.mjs`, `render-project.test.mjs` and `builder-install.test.mjs` take the new text, each with an absence check for the old clause that fails against base 28c615b; the drift bad case re-anchors on "or an intent or design question." No test is added. `builder/scriptorium.html` and `cloud-sessions/` are regenerated; `builder/default-config/` was already current.

**Rolling back:** revert the merge, rerun the three regens and reinstall from the dry run. Nothing installs until the owner applies it.

## Record

- The issue and spec (revision 4): https://github.com/mephistopheles4/the-pact/issues/562
- The owner's decision: https://github.com/mephistopheles4/the-pact/issues/562#issuecomment-6835827055
- The build hand-off: https://github.com/mephistopheles4/the-pact/issues/562#issuecomment-6836221711
- Head chef follow-up: https://github.com/mephistopheles4/grimoire/issues/618
