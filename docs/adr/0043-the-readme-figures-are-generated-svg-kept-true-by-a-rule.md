# The README's figures are generated SVG, kept current by a test and true by a rule

The README's three explanation figures (four moves, process tiers, review lenses) are SVG files generated from one source each in the repo. `docs/img/build.mjs` renders each source in `docs/img/src/` as a light and a dark file, and the README picks one with `<picture>` and `prefers-color-scheme`. A test fails while a committed SVG differs from its source. No test checks the figures' words against the rules; a rule in `AGENTS.md` does.

- **One source, two schemes.** Each figure is a plain JavaScript module of boxes, lines and text, with every text line written out. The colours are tokens, copied once into `docs/img/src/tokens.mjs`, each a hex value and an opacity for light and for dark.
- **Text stays text.** The SVGs use `<text>` in one monospace stack, with no font embedded, so a diff shows a changed word. The generator measures each line at its widest, 0.6 em a character plus 15% slack plus its letter spacing, and fails a line too wide for its box.
- **Self-contained.** No style sheet, script, foreign object or outside link. Each light SVG paints its own paper, so it stays readable on a dark page in a viewer that ignores the colour-scheme switch.
- **Kept current by a test.** `gate/tests/readme-figures.test.mjs`, in the `fast` tier, compares each committed SVG with `render()`'s output and names the command that fixes it. It also checks that every image the README shows exists.
- **Kept true by a rule.** `AGENTS.md`'s "Keep the README in step with the rules" asks a change to the tiers, the lenses, the models, the risk floor or the roster to update the figure sources, their alt text and "Text of FIG." blocks, the README prose and `docs/reference.md` in the same PR.
- **The hero is a picture, not a figure.** The illustration at the top is one image file for both schemes, kept on its own light paper in dark mode. It is not generated.

## Why

- **The owner's call.** On #202 the owner chose SVG from one source over image exports, and a rule over a test for the words.
- **Exports can't be regenerated or reviewed.** A PNG exported from a design canvas changes as a binary blob. A source in the repo changes as text, renders the same on every run, and anyone with Node can rebuild it.
- **A test is cheaper than discipline, for staleness.** ADR 0038 weighed this for the cloud copy. Here too a fast test catches a source edited without a rebuild, which costs nothing to check.
- **A content test would be too brittle for words.** The figures' words are a summary of `claude/CLAUDE.md`. A test that matched them against the rules would fail on every rewording of either, and pass a figure that is wrong in a way no pattern names. Review against a written rule catches more for less.

## Accepted limits

- **The words can drift.** Nothing fails when a rule changes and the figure doesn't. The rule and the reviewers are the only guard.
- **The font varies by reader.** IBM Plex Mono shows only where it is installed; elsewhere the system's monospace face does. The 15% slack keeps every line inside its box in the faces the stack names, not in every face a reader could set.
