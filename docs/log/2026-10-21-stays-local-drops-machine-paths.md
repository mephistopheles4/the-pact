# The stays-local list drops this machine's paths

**2026-10-21.** The rules file's poster bullet kept a lens report local when the poster refused it for a path of this machine's. The owner dropped that item from the list and asked for nothing in its place. Tier: quick.

## What was built (no issue)

- **The rules file's poster bullet** (`gate/render-core.mjs`) no longer names a path of this machine's among the refusals that keep a lens report local. The rest of the list, its wrap and the poster's `path/machine` rule are unchanged.
- **Its test** (`gate/tests/tools.test.mjs`) holds the new text byte for byte.
- **`docs/poster.md`** drops the same item in its two places.
- **Regenerated:** `cloud-sessions/`, `builder/scriptorium.html` and `builder/default-config/`, all already in step.

## Decisions

- No ADR. A refused report now falls to the bullet's "stop and tell me"; the review procedure's read before posting is unchanged.
