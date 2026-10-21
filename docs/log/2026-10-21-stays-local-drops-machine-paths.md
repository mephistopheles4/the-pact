# The stays-local list drops this machine's paths

**2026-10-21.** The rules file's poster bullet kept a lens report local when the poster refused it for a path of this machine's. The owner dropped that item from the list and asked for nothing in its place. Tier: quick.

## What was built (no issue)

- **The rules file's poster bullet** (`gate/render-core.mjs`) no longer names a path of this machine's among the refusals that keep a lens report local. The rest of the list keeps its words, rewrapped, and the poster's `path/machine` rule is unchanged.
- **Its test** (`gate/tests/tools.test.mjs`) holds the new text byte for byte.
- **`docs/poster.md`** drops the same item in its two places.
- **Regenerated:** `cloud-sessions/`, `builder/scriptorium.html` and `builder/default-config/`, all already in step.

## Decisions

- No ADR. In practice little changes: the bullet still keeps local a report refused for a personal detail, and the review procedure's read before posting, unchanged, still counts this machine's home or temp folder path, user name and host name as one.
