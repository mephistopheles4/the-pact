# The poster refuses no path

**2026-10-22.** Sessions reported that the poster refused absolute paths. Since 2026-10-17 the temp folder on the owner's machine is a Dev Drive folder that names nobody, and `path/machine` refused every path under it, scratchpads and test output included. The owner asked for the check to go completely: the poster's whole rule, with the read before posting kept. Tier: quick; the owner declined the sensitive route.

## What was built (#364)

- **The poster** (`claude/tools/poster.mjs`) loses `path/machine` and its helpers, and no longer reads the home folder, user name or host name.
- **Its tests** (`gate/tests/poster.test.mjs`) lose the rule's ten table rows, its Windows case and #326's other-paths test; one test now shows that this machine's own home and temp folders, user name and host name post, beside a drive-letter path, a network share and another user's home. The gh-error test keeps its cover with a token.
- **`docs/poster.md`** and **`docs/reference.md`** say the scan refuses no path.
- **The threat model's R34** widens to any revealing path, on the owner's word in chat.
- **Regenerated:** `cloud-sessions/`, already in step.

## Decisions

- [ADR 0097](../adr/0097-the-poster-refuses-no-path.md): the poster refuses no path. Amends ADR 0086.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/364): the tier, the declined sensitive route and the claims.
