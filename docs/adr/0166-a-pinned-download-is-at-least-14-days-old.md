# A pinned download is at least 14 days old

PACT-65 (T3 of spec 0002, [`docs/spec/0002-clef-runner.md`](../spec/0002-clef-runner.md), S2 pick 4). It constrains every later pin PR for `clef`.

## Decision

Each file `clef` fetches, the model included, is pinned in `claude/tools/clef.mjs` only when it is at least 14 days old, counted per pinned file: each release asset by its `digest`, `created_at` and `updated_at`, and the model from the Hugging Face Hub's own record of the pinned file's last change, the `lastCommit` date the tree API returns for that file at the pinned commit (a server time for a `huggingface_hub` upload; a commit pushed with git carries a date its pusher chose, and the Hub shows no field for the route). The record says how the commit was uploaded when its title or message shows it, and goes to the owner as a checkpoint when the route is git or not shown. It also shows the pinned commit is on the repo's `main` branch with a `ggml-org` member as author, since a community pull request's commits sit in the same repo. A pin PR changes only the pin table and the files list, its record cites each file's age, and the security pair fetches the Hub's tree and `main` commits itself and compares them with the record, as it reads any change to the table. The tool checks size and sha256 at setup and verify; the age is held at review, not at run time.

## Why

The tool downloads a program and a model and runs them with the owner's rights, and a fresh upload has had no time to be caught if it is bad. The spike used a build under an hour old. The first server pin is b12211 (2026-11-08), and the first model pin's file last changed on 2026-10-25, so both are already old enough.

## Consequences

- A pin bump waits 14 days after the upstream release, a security fix upstream included.
- After a bump is applied, `ensure` reports `not-set-up` with `pin-changed` (`status` shows the old tag) until `clef stop` then `clef setup --yes` run ([clef.md](../clef.md)).
- The threat model's class "What you install and CI run" names the pinned llama.cpp build and decision model; the age rule and the review of each pin PR are among its controls.
- **Rollback:** revert the pin PR, then a dry run, the apply, and on each machine `clef stop` then `clef setup --yes`.
