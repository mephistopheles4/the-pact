# Undoable installs

**2026-10-19.** #272. The install kept no backup: a first install replaced the person's rules file, an apply merged their `settings.json`, and the undo steps rested on a copy the person was asked to make by hand. Now every apply backs up what it replaces before its first write, and undo is a documented copy-back. The gate's tests lost their table framework and a sweep trimmed what only guarded a test helper. Tier: thorough, sensitive route; planned and built on Opus at high, test-first, in four tickets: T0 to T3.

## What was built

- **T1, plain loops (PR #345, merged first):** every former table row runs as a plain `test()` with the same assertions, and `tables.mjs` and `tables.test.mjs` are gone (ADR 0092). Tests: +0 −29.
- **T0, the threat model:** R47, the backups as plain copies on disk, reworded on the owner's word so it claims nothing about the Claude home folder's access; the R14 widening for a planted backup; R47's chart point (0.30, 0.55, "Guard closely") and at-a-glance row.
- **T2a, the backup:** `takeBackup` in `gate/install-io.mjs`, on injected file operations, after every check and before `CHECKS DONE`: a staging folder, each copy written exclusively with fsync and read back against the hash the plan read, the manifest last, a link test before and again before the rename, Unix modes `0700` and `0600`, and a clean-up by a walk that never follows a link. The runner memoises the plan's live reads for it, prints `BACKUP STARTED` and the backup's name, and names the backup in a refusal after the first write; the runner and the bootstrap name the staging folder when a run ends after `BACKUP STARTED` any other way. `pact/backups` joins the protected paths.
- **T2b, retention and docs:** `pruneBackups` after a verified apply: this run's, those named later, the ten newest and every one taken with no record stay. A pruning error is one warning. The dry run prints the `Backup:` line and counts staging folders and entries the prune leaves. `docs/install.md`'s step 3 now describes the backups, "Undo an apply" replaces the manual-copy undo, with its manifest checks; Rolling back gains two lines; the threat model gains the backups in what the pact puts on the machine and the data in reach, the crypto and data-migration sentences, and R13's corrected sentence.
- **T3, the sweep:** a one-off sweep under q3, ADR 0057's D2 set aside for #272 only. Two tests cut, both in `no-skill-names.test.mjs`. Everything else examined stays under the never-cut list (ADR 0093).
- **Tests in this PR: +15 −2.** T2's fifteen tests back C1 to C9 and C15 to C17 (3 of 2 past the limit, taken by the owner in q10), plus one assertion on an existing double-apply case for C18. Two existing tests changed: the agent-picks audit gained the new test file, and the poster-off case leaves `pact/backups` out of its listing, since the backup keeps a copy of the deleted poster by design.

## Decided at Build

- **One pull request for T0, T2 and T3,** by the owner's word, relayed by the head chef: each ticket its own commit, T2 split as T2a and T2b, as the cut allows.
- **R47 reworded,** by the owner's word, relayed: the backups get the same access as the Claude home folder they sit in, so they are exactly as exposed as the `settings.json` and rules file beside them. The confirmation gate (q11) and the stop for an unconfirmed folder are gone. The Unix modes stay (build q1, A).
- **The bootstrap reaches its 250-line budget exactly,** with the backup-started state in four added lines.
- **The sweep cut little,** because the never-cut list outranks the criteria: `agent-picks` is ADR 0034's pin, `gate-run.test` backs ADR 0032 and guards silent passes, and `pact-marks` pins the marks the renderer edits by.

## Decisions

- [ADR 0092](../adr/0092-gate-bad-cases-are-plain-test-loops.md) — Gate bad cases are plain test() loops.
- [ADR 0093](../adr/0093-installs-back-up-what-they-replace.md) — Installs back up what they replace.

## Record

- [The comment of 2026-10-12, what PR #274 changed](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6134067089)
- [Tier and route proposal](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6255433876)
- [Spec, revision 1](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6255783806)
- [Spec, revision 2](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6255960331)
- [Design review, round one: the spec pair](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6255973430)
- [Design review, round one: the security pair](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6255978531)
- [Spec, revision 3](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6256021551)
- [Spec, revision 4](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6256173546)
- [Design review, round two: the spec pair](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6256187398)
- [Design review, round two: the security pair](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6256187773)
- [Spec, revision 5](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6256534536)
- [Design review, round three: executability-lens](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6256537924)
- [The ticket cut](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6256541134)
- [The box of decisions, rebuilt](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6256883250)
- [T1 claimed](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6258604593)
- [T1 build done](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6259360621)
- [T1 Test review](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6259595405)
- [T1 integrity-lens follow-up](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6259695108)
- [T0, T2 and T3 claimed](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6259772109)
- [T3's cut list](https://github.com/mephistopheles4/the-pact/issues/272#issuecomment-6260202309)
