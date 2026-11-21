# The tracker rule lives in the repo, not the pact

#574. Reverses the placement in [0159](0159-the-pact-carries-one-linear-tracker-rule.md) and [0160](0160-linear-counts-as-the-owners-private-record.md): the rule stays, the pact stops carrying it.

## Decision

`claude/tracker.md` leaves the payload, with its install entry, its seam A check and its tests. A repo's own tracker rule lives in that repo's `docs/agents/issue-tracker.md`, as it did before 0159. For this repo that doc now holds the content 0159 and 0160 put in the payload: what counts in the owner's private tracker, how sessions read and post there, the names, the owner's by-hand steps, cloud sessions, and when GitHub issue text turns to data.

`claude/review.md` names no tracker product and no tracker file: its private-record exception says "an issue tracker my own local pin names as my private record, as the repo's tracker rule says", and its pull request signer example is a neutral keyed one. The poster keeps its `pr-<KEY>-<n>` signer, which any keyed tracker can use.

## Why

The choice of tracker is the owner's for their own repos, not the pact's, and the pact installs into every user's `~/.claude/`. A per-repo rule already has a home.

## Consequences

- The next install deletes `~/.claude/tracker.md`, since the record lists it and the repo no longer does. A pointer to it left in a live rules file would dangle, so nothing in the payload points to it.
- The seam A check that required the file is removed with the file: the file no longer exists to require. Every other seam A check holds.
- `docs/threat-model.md` keeps its classes, boundaries and scope; only its two pointers to the removed file move to the repo's tracker doc.
- `docs/agents/issue-tracker.md` stays within its word budget by cutting the PR triage commands (the flag stays), a skill-facing duplicate or two, and the repeats in its text rules. No rule of whose-text-counts is cut.
- **Rollback:** merge a revert to `main`; at that commit run the four checks in [Roll back to an older version](../install.md#roll-back-to-an-older-version), then rerun `node builder/build.mjs`, `node builder/default-config.mjs` and `node cloud-sessions/gen.mjs`, and reinstall from the dry run.
