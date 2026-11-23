# A pinned download is at least 14 days old

PACT-65 (T3 of spec 0002, [`docs/spec/0002-clef-runner.md`](../spec/0002-clef-runner.md), S2 pick 4). It constrains every later pin PR for `clef`.

## Decision

Each file `clef` fetches, and the model, is pinned in `claude/tools/clef.mjs` only when it is at least 14 days old, counted per pinned file: each release asset by its `digest`, `created_at` and `updated_at`, and the model from the later of its commit date and the first date a record of this repo saw its sha256. A pin PR changes only the pin table and the files list, its record cites each file's age, and the security pair reads it like any change to the table. The tool checks size and sha256 at setup and verify; the age is held at review, not at run time.

## Why

The tool downloads a program and a model and runs them with the owner's rights, and a fresh upload has had no time to be caught if it is bad. The spike used a build under an hour old. The first pin is b12211 (2026-11-08) and the model's age counts from 2026-11-22, so the first pin record is dated 2026-12-06 or later; that delays the ticket that first runs Clef on the owner's machine to then.

## Consequences

- A pin bump waits 14 days after the upstream release, a security fix upstream included.
- After a bump is applied, `ensure` reports `not-set-up` with `pin-changed` (`status` shows the old tag) until `clef stop` then `clef setup --yes` run ([clef.md](../clef.md)).
- The threat model's class "What you install and CI run" names the pinned llama.cpp build and Clef model; the age rule and the review of each pin PR are among its controls.
- **Rollback:** revert the pin PR, then a dry run, the apply, and on each machine `clef stop` then `clef setup --yes`.
