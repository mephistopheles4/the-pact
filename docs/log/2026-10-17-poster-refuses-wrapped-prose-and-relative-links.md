# The poster refuses wrapped prose and relative links

**2026-10-17.** The stacks repository retired its own poster, which reflowed hard-wrapped paragraphs and fixed repository-relative links before posting. The pact's poster does neither, so a body written in a repo file's style could land ragged or with a dead link and still read back `verified`. The owner chose that the poster refuses such a body instead of rewriting it. Tier: standard.

## What was built (#317)

- **Two checks** in `claude/tools/poster.mjs`, `proseCheck`, run after the content scan and the table check on the body only: `text/hard-wrap` and `link/relative`. Each refusal names the line and column, once per rule; a dry run runs them too.
- **The rules file's poster part** says "a table, wrap or link refusal on a line inside a lens report means its fence is too short". `cloud-sessions/` and `builder/scriptorium.html` were regenerated.
- **`docs/poster.md`** names both rules, how to fix each, and that `issue` has no `--parent`. The threat model's input-rules bullet gains one sentence naming both checks; no scope or accepted risk changed.
- **Tests** in `gate/tests/poster-prose.test.mjs`: a table with the passing shapes in its base and eleven must-refuse rows, two tests through `post`, one worst-case timing test.

## Decisions

- [ADR 0083](../adr/0083-the-poster-refuses-wrapped-prose-and-relative-links.md): refuse, don't rewrite.
- The Tests added limit was passed (16 added against 7 claims) and the owner accepted it.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/317)
- [The spec, revision 2](https://github.com/mephistopheles4/the-pact/issues/317#issuecomment-6242013729) and [its S5 correction](https://github.com/mephistopheles4/the-pact/issues/317#issuecomment-6242047066)
- [The spec pair's review of revision 1](https://github.com/mephistopheles4/the-pact/issues/317#issuecomment-6241989353)
- [The QA pair's review](https://github.com/mephistopheles4/the-pact/issues/317#issuecomment-6242584187), [the standards pair's](https://github.com/mephistopheles4/the-pact/issues/317#issuecomment-6242584570), [the unstated-lens review](https://github.com/mephistopheles4/the-pact/issues/317#issuecomment-6242584920) and [the security pair's](https://github.com/mephistopheles4/the-pact/issues/317#issuecomment-6242585211), each with its Lens dispositions table
