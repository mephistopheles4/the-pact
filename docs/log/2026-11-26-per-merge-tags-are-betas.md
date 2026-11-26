# Per-merge tags are betas

**2026-11-26.** The owner asked about the release candidate tags made on every merge. The per-merge tags are renamed from `-rc` to `-beta` ([spec 0009](../spec/0009-beta-tags.md), PACT-117). Both lanes stay: a tag on every green merge, and a stable release the owner promotes by hand.

## What changed

- **The release job** tags `v1.<n>.0-beta.<k>`. `-rc` tags don't count toward `<k>`.
- **Promote, the bootstrap and the install** read `-beta` and the legacy `-rc`. Within a minor, every `-rc` ranks below every `-beta`, and every `-beta` below the stable release. This is not semver's order.
- **The workflow allow-list** names the renamed job and step. No check or plant is added or dropped.
- **The docs and the threat model** say beta. The accepted risk is the same.

## The owner's step

The tag creation ruleset's exclusion changes from `refs/tags/v1.*.0-rc.*` to `refs/tags/v1.*.0-beta.*`, just before the merge (spec 0009 S9).

## Rolling back

Revert the merge, and restore the `-rc` exclusion just before it. `-beta` tags already made stay, and old code ignores them.

## Record

- The ticket: PACT-117 on Linear. The spec, the owner's relayed decisions, the spec rounds and the Test record are its comments.
