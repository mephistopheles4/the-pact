# The read before posting looks for no path

**2026-10-23.** A session kept a lens report local because it held a home or temp folder path, though #364 had taken the path rule out of the poster: the review procedure's read before posting still listed such a path as a personal detail. The owner chose to drop paths from the read entirely and keep the user name, host name, email and secrets. Tier: quick; not on the sensitive-work list, and a path holding a user or host name is still caught.

## What was built (#368)

- **`claude/review.md`:** the read's personal-detail list loses "a home or temp folder path"; a path counts only for a user or host name it holds.
- **`docs/poster.md`** says what the read looks for.
- **The threat model's R34** widens again, on the owner's word in chat.
- **Regenerated:** `cloud-sessions/`.

## Decisions

- [ADR 0098](../adr/0098-the-read-before-posting-looks-for-no-path.md): the read before posting looks for no path. Amends ADR 0097.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/368): the tier and the claims.
