# Long docs carry a generated table of contents

PACT-78, standard tier.

## Decision

Each tracked Markdown file of over 100 lines, its table not counted, carries a table of contents between `<!-- toc -->` and `<!-- /toc -->`, just before its first H2. `docs/toc.mjs` writes it from the H2 and H3 headings, linking each by its GitHub anchor, and `gate/tests/toc.test.mjs` fails while one is missing or stale, or while a file that isn't covered holds one. The word budgets and the threat model's cap count a doc without its table.

Left out: `docs/log/`, `docs/adr/`, `gate/tests/fixtures/`, the rules file (`claude/CLAUDE.md`) with its cloud copy, and `claude/agents/` and `claude/commands/`.

## Why

- **Long docs were hard to navigate.** None of the long docs had a table, and Anthropic's guidance for reference files asks for one over 100 lines.
- **Generated, so it never drifts.** A table written by hand goes stale with the first renamed heading; a check catches that in CI, and the script fixes it.
- **The rules file, agents and commands are loaded whole.** A table there adds context to every session in every repo, and the rules file is rendered, budgeted and copied to the cloud, for no navigation gain to a reader that loads it all.

## What it constrains

- A heading change in a covered doc needs `node docs/toc.mjs` in the same change.
- Anchors follow GitHub's rules as `docs/toc.mjs` computes them; the test checks every in-repo anchor link into a covered doc against them.

## What was weighed

- **Every file over 100 lines, the rules file included.** Not taken: see Why. Adding it later is one line in `EXCLUDED`.
- **The table inside the word budgets.** Not taken: the issue asked for it to be left out, so a long doc isn't pushed to cut text for its own table.
