# The end-to-end ticket's leftovers

**2026-11-25.** Spec 0007 ends with T9, the run on the owner's machine (C26). That run waits for the owner's apply, so PACT-105 T9 first closes what T1 to T8 left, at the thorough tier on the sensitive route, with the lead session's picks flagged.

## What changed

- **Undo an apply** (`docs/install.md`). Step 5 could delete a hooks file that held the owner's own hooks, since the record names a hooks file even when the pact only merged into it. It now takes out the pact's hook alone, and deletes the file only if nothing is left. A hooks file's backup copy is read before it goes back. A full uninstall removes what the current record lists, so a guard added by a later apply goes too, and holds each of its paths to the bounds a backup's are held to.
- **The tree check** (`claude/review.md`) wraps each `scout` pass as well as each lens, and the rules file says so where an agent can't be held to its tools. When a copy or a restored git folder fails its hash, it stops: no more git runs there and nothing more is restored. A link put in a file's place counts as new.
- **The threat model** says that `~/.pact` is outside Claude Code's protected paths (an open gap), that Codex allows login shells by default and those routes weren't probed, what a stolen release key can do before the second tag ruleset exists, and how a bad tag is removed after a leak. Its cap rose to 4,200 words, and `docs/install.md`'s budget to 10,650.
- **Small fixes** left by T4, T5 and T7: test names that now cite a claim, one test reading agents through the payload helper, the builder's note naming the harness data its page holds, and wording in spec 0007 and two ADRs.
- **Logs** older than a month are folded into [`older.md`](older.md).

## Left open

- **The owner's acts** come before C26: the release app and its key, the two repository variables, the one-time removal, each apply and Codex's hook trust. The checklist and the real-model run's steps are on the work's record.
- **The security calls** the earlier tickets left to the owner stay as they were; none was built here.
