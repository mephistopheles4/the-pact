# Tests added counts tests that pin how, not what

#497, standard tier, built by pact-497. The owner's words came relayed by backlog-head-chef; the spec's proceed was recorded on the issue as an owner decision from chat.

The default rules file's Tests added row now reads, in "Counted as": "Tests that earn no claim: none backs one, it repeats one that already does, or it pins how the work is done rather than what it does." It replaces "Tests beyond one per acceptance claim". The limit (`2 per change`) and "At the limit" are unchanged, so two such tests still pass free in a change; moving the default to `0` is a separate decision. The builder's default (`builder/parts.mjs`) carries the same line, and `cloud-sessions/` and `builder/scriptorium.html` were regenerated. `builder/presets/ultra-code.json` keeps its old row.

`integrity-lens` gained one report kind for a test that pins how the work is done: exact wording or source text, file layout, wall-clock timing, a vendor's internals, the platform's choices. It joins the kinds that point to a cut and never block on their own. The lens was at 291 of its 300 words, so other lines were trimmed to fit; the budget stays at 300 (it now stands at exactly 300). The trim changes no scope: the three cut-pointing kinds still apply only to tests the change adds or edits (ADR 0084), a test needs a reason in its own text to escape "backs nothing", and the first Test round caught a first trim that had loosened both. One line of the report shape, "Each finding gives its kind.", went.

The owner's own configuration replaces cost-limits, so this change to the default does not reach their install until they edit their config.

## Record

- The ask and the starting text: https://github.com/mephistopheles4/the-pact/issues/497
