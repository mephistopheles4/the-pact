# Long reference docs carry a generated table of contents

PACT-78, standard tier. It amends [0153](0153-the-agent-facing-docs-keep-no-history-and-a-word-budget.md): a doc's word budget now counts the doc without its table of contents.

## Decision

In this repo, each tracked Markdown reference doc of over 100 lines, not counting its table, carries a table of contents. The table sits between `<!-- toc -->` and `<!-- /toc -->`, just before the doc's first H2. `docs/toc.mjs` writes it from the doc's H2 and H3 headings and links each heading by its GitHub anchor. `gate/tests/toc.test.mjs` fails while a table is missing or stale, and while a file that isn't covered holds one. The word budgets and the threat model's cap count each doc without its table.

Left out: `docs/log/`, `docs/adr/` and `gate/tests/fixtures/`. Also left out are the files sessions load whole: the rules file (`claude/CLAUDE.md`) with its cloud copy, `AGENTS.md` (which `CLAUDE.md` imports), `claude/agents/` and `claude/commands/`. And `README.md`, written for people.

This is this repo's own choice. It sets no rule for other repos, and the pact text carries none.

## Why

- **The source.** Anthropic's [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) (read 2026-11-23): "For reference files longer than 100 lines, include a table of contents at the top. This ensures Claude can see the full scope of available information even when previewing with partial reads." It gives the reason: Claude "might use commands such as `head -100` to preview content rather than reading entire files." That is the only threshold the sources give, and no published evaluation stands behind it.
- **Files loaded whole don't get a partial preview.** Claude Code [loads each CLAUDE.md and its imports whole](https://code.claude.com/docs/en/memory) (read 2026-11-23), and a triggered skill's SKILL.md is read whole. The stated reason doesn't apply to them, and a table there would cost every session context.
- **Docs for people.** The sources are silent on them, so this leans to less. GitHub renders its own outline for a README.
- **Generated, so it never drifts.** A table written by hand goes stale with the first renamed heading. The check catches that in CI, and the script fixes it.

## What it constrains

- A heading change in a covered doc needs `node docs/toc.mjs` in the same change.
- Anchors follow GitHub's rules as `docs/toc.mjs` computes them. The test checks every in-repo anchor link into a covered doc against them.

## What was weighed

- **Every file over 100 lines, including those loaded whole.** Not taken: see Why. Adding one back is one line in `EXCLUDED`.
- **The table inside the word budgets.** Not taken: the issue asked for the table to be left out, so a long doc isn't pushed to cut text to fit its own table.
