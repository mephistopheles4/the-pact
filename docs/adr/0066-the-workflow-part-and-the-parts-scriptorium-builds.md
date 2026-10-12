# The workflow part, and the four parts Scriptorium builds

The rules file gains four open parts a home configuration may edit: `tiers`, `sensitive`, `workflow` and `lenses`. The workflow table takes over the lens table's "where it fits" column (#143's option A), so the lens table is a roster of questions, the tier table keeps the models, and the workflow table joins the two. The default graph lives in one module, `builder/parts.mjs`, and the builder page edits it on #143's prototype v3 canvas (#262, phase 2). The 5-hour session usage limit joins the weekly one as a setting (#142, folded into this phase).

## What changed

- **Four open marks** in `claude/CLAUDE.md`, each flush against its default and under an italic *Scriptorium builds this* mark, with a line under the title that says what the mark means. The offers paragraph, the Workflow section's sentence and the "Small work" paragraph sit outside every part, so no edit reaches them.
- **The gate** adds the four marks to the renderer's `OPEN_MARKS` and `EDITABLE` and to the install's `EDIT` line pattern. A project configuration still edits no part (rule `project-edit`). The block refusals (a comment opener, an `@` import) apply to the four as to every part.
- **The security-defaults line.** An edit to any of the four gets one dry-run line, before every other warning, naming the parts and saying whether the configuration changed since the last install. It points by part name, never by block file. It is the install-time control; nothing refuses an edit, since the owner's own configuration may narrow a part (adversarial F6). Narrowing prose in a move part shows only as that part's ordinary warning (adversarial F7, R30).
- **`builder/parts.mjs`** holds the default data, the compiler and the builder's checks, with no imports. `build.mjs` imports it to check a builder file and to run each changed part through the renderer, and copies its source into the page, so the page and the check compile with one compiler. The default data compiles byte for byte to the four parts' text; `build.mjs` refuses to build when it doesn't, and a test holds them together.
- **The builder file** gains `tiers`, `sensitive`, `workflowGraph` and `lenses`, each optional. The roster's key is the owner's q13 (A): without it a roster edit could not be saved and reloaded. The `workflows` key stays for schema 1, labelled "Setups" on the page.
- **The builder's checks:** a stage with two default ways on, and default ways on in a circle, are refused; one lens of a pair alone on an offer is a finding; the content policy and the one-line and length caps cover every text field of the four parts. These are builder checks, not install-time controls: a block written by hand skips them.
- **The page** keeps v3's canvas, its run-it-through pulse and its tour, as a Workflow step after the moves. It is rendered through the page's text-only helper, and the links are drawn on a 2D canvas, because the page's content check refuses the address an SVG element needs. A part is saved as a `replace` edit only when its compiled text differs from the pact's, so an untouched page raises no security-defaults line. A save to a folder also writes the four keys into that folder's `builder.json`.
- **`usage-pause-session`** (#142): a whole number from 0 to 100, filled from a fixed template into an empty part after the weekly line. Unset, the render is byte for byte what it was. A project may only set it tighter, and with no user value any project value is tighter. The builder's Settings dialog holds both limits.

## Why

- **Option A** (the owner's decision on #262): one table per question. The lens table and the workflow table had repeated each other's agents column.
- **One module for the graph:** a second compiler, in the page or in a test, would drift from the first. Copying the module's source into the page keeps one.
- **A pointer, not a refusal:** the parts are the owner's to change, and a refusal on wording would be the parser the thin gate gave up (ADR 0061). The line makes the change impossible to miss in the dry run.
- **The canvas kept:** the owner's "the prototype was sooooo good, we need to keep it and polish it", relayed by the head chef (D7 withdrawn).

## What it leaves open

- A part edited by hand, or a builder file edited outside the page, skips the builder's checks. The dry run's line and the owner's reading of the rendered parts are the control.
- Any part, moves included, can carry narrowing prose; only an edit to the four raises the security-defaults line (R30).
- The QA pair at every build is no longer in the protected set: it is the default workflow's, editable behind the line (adversarial F7, R21).
