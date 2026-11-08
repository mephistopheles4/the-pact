# No read looks for this machine's paths

**2026-11-08.** The owner asked to remove every rule that treats a path on this machine as something to check for or keep out of a post or a push. #368 had done this for the read before posting, and #464 T2 brought it back. Tier: quick; not on the sensitive-work list.

## What was built (#506)

- **`claude/review.md`:** the read before posting looks for a secret or a personal detail, and no longer for a path on this machine.
- **`AGENTS.md` and `docs/agents/gate-tests.md`:** the read of commits before a push loses this machine's paths and names.
- **`docs/rule-reasons.md`** says why no read looks for a path, naming #368, so the next rewrite sees it.
- **Regenerated:** `cloud-sessions/` and `builder/scriptorium.html`; `builder/default-config/` needed no change.

## Decisions

- [ADR 0143](../adr/0143-no-read-looks-for-this-machines-paths.md): no read looks for this machine's paths. Amends ADR 0095 and ADR 0098.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/506).
