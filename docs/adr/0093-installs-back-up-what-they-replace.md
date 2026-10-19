# Installs back up what they replace

Since #272 every `--apply` to the Claude home folder first copies what it will replace into a dated backup under `~/.claude/pact/backups/`, and refuses, changing nothing, if it can't. Undo is a documented copy-back from that backup. The install had no backup, and its undo steps rested on a copy the person was asked to make by hand.

## The backup

- **When.** After every check has passed and the review output is written, and before `CHECKS DONE`. So a backup that fails still ends in "Nothing was changed.", and the never-cut tests that a refused install wrote nothing hold. A backup after `CHECKS DONE` would break them, so the timing is forced, not chosen.
- **What.** A copy of each file the plan overwrites or deletes, `settings.json` when the apply writes it, and the install record when there is one, each at its home-relative path, and `manifest.json`, written last. The manifest (`pact-backup-1`) lists each copy with its SHA-256 and size, and each path the apply adds, a `settings.json` or record it creates included, as `absent`, so a copy-back also removes them. Each copy is compared with the hash the plan read, memoised for the run, and a file that changed while the install ran refuses.
- **Where.** `pact/backups/<UTC time to the millisecond>Z-<short commit>`, with a free suffix `-02` to `-99` when the name is taken; names sort by time. `pact/backups` is a protected path, so no install record can make the install write or delete there.
- **Fail closed.** It builds in a staging folder made with an exclusive create, writes each file exclusively with fsync and reads it back, link-tests the path before and again before the rename, and checks the name is free before renaming. On any failure it removes only what it made, by a walk that never follows a link, and refuses with "Nothing was changed."; if that removal fails, the refusal names the staging folder instead. A run that ends after `BACKUP STARTED` any other way, by a throw, a timeout, a crash or a signal, says the same in the runner and the bootstrap.
- **Modes.** On Linux and macOS every backup folder is `0700` and every file `0600`, and a mode found wider refuses. On Windows nothing is set: a backup takes the Claude home folder's access list, as the `settings.json` beside it does, so it is no more exposed than that file (R47). No claim is made that the folder is owner-only.

## Retention

After an apply verifies, and only then, the install prunes old backups. It keeps this run's, every backup named after it, the ten newest of the rest, and every backup whose manifest lists the record as `absent`, which is each taken with no install record before it, a first install over the person's own files included. It removes the rest, each manifest last, and never touches an entry it doesn't recognise as a backup. A pruning error is one warning, and the run still passes.

## The sweep exception

For #272 only, the owner set aside [ADR 0057](0057-a-gate-test-names-what-it-backs-and-earns-its-place.md)'s D2, "no sweep of the existing suite" (q3): a one-off sweep cut tests that only guard another test or a test helper, restate the harness or the model's judgment, or are minus-one duplicates. The never-cut lists outranked those criteria, together with the issue's keep list, the controls the threat model names and the tests that back an ADR in force. The sweep cut six tests, all in `no-skill-names.test.mjs`; its list is on the issue. D2 stands for all other work.

## Why

- **The owner's request** on #272: make the install undoable instead of trying to prevent every bad install. A copy the installer takes itself is always there; a manual one is not.
- **Bounded copies of the person's keys.** Each backup can hold `settings.json`, which can hold API keys, unencrypted. Copying it only when the apply writes it, owner-only modes on Unix and the prune's bound keep the spread small; the rest is accepted as R47. Encrypting the copies would need a key in reach of the same account, so it guards nothing a reader of the account couldn't undo (q9).
- **Every backup taken with no record is kept,** not only the oldest, so a planted older entry can't push out the real first-install backup (q8).

## Considered and rejected

- **An `--undo` command.** Deferred until a real copy-back shows what it needs.
- **Skipping the backup on a no-op apply.** Every apply rewrites the record, so a backup always matches what the apply did; skipping would be a new guard.
- **An access list set on Windows,** or a confirmation that the Claude home folder is owner-only. The owner chose to inherit (q2), and later dropped the confirmation gate and any claim about the folder (2026-10-19).

## How this was decided

- **2026-10-18** on #272: spec revision 5, its threat-model texts and the ticket cut, approved by the owner on the sensitive route and relayed by the head chef, with the owner's answers q1 to q16.
- **2026-10-19:** by the owner's word, relayed by the head chef, T0, T2 and T3 shipped as one pull request, and R47 was reworded: the backups get the Claude home folder's access, with no claim that the folder is owner-only and no confirmation gate. The Unix modes stay (q1 of the build). This ADR amends in part ADR 0057 (D2, for #272 only).
