# integrity-lens points both ways

**2026-10-17.** `integrity-lens` only ever pointed toward more tests. The owner chose that it also asks whether each test earns its place, with cut-pointing findings that are low and never blocking alone. Tier: standard.

## What was built (#276)

- **The lens file** asks the widened question and reports three new kinds: a test that backs nothing, a duplicate test, and a cover that does not catch. Each finding says "points: strengthen" or "points: cut"; the cut list is an optional input.
- **The question widened everywhere:** the lens table in the rules file, Scriptorium's QA pair, the README and its figure, and the example block. `docs/reference.md` never quotes it and is unchanged.
- **The review procedure** gains one line: a cut finding on a test that guards a sensitive-work item is a security finding, never `auto`.
- **The contract** goes to 0.4.0, with the cries-wolf count leaving out a dismissal for a project rule the lens was not handed. The minus-one bullet in `docs/agents/gate-tests.md` follows.
- **Rebuilt:** `cloud-sessions/`, `builder/scriptorium.html` and the figures. No gate test was added or cut.

## Decisions

- [ADR 0084](../adr/0084-integrity-lens-points-both-ways.md): the cut kinds, and why backing is read from the test's own text.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/276)
- [The spec, revision 3](https://github.com/mephistopheles4/the-pact/issues/276#issuecomment-6243289991)
- [The spec pair's review of revision 1](https://github.com/mephistopheles4/the-pact/issues/276#issuecomment-6243227136)
