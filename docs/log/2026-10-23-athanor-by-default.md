# Local gate runs go through athanor by default

**2026-10-23.** A session ran `changed` on the host while building, as `AGENTS.md` said, and skipped athanor. The owner wants athanor used by default. Tier: quick.

## What was built (#369)

- **`AGENTS.md`:** local runs go through athanor, `fast` while building and `full` after a rebase or merge and after a final change set; the host keeps `full` before an install, a quick `changed`, and any run athanor can't do.
- **`docs/agents/gate-tests.md`:** the same, in its build and Athanor sections.

## Decisions

- [ADR 0099](../adr/0099-local-gate-runs-go-through-athanor-by-default.md): local gate runs go through athanor by default. Amends ADR 0096.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/369): the tier and the claims.
