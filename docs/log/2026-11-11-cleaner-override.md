# The cleaner forces only on an override tag

#523, thorough tier, built from spec revision 5 in two tickets on one branch (PR 530). The sensitive route was declined by the owner through the lead; the security pair runs at Test.

The cleaner (`claude/tools/cleaner.mjs`) no longer only refuses. For a worktree whose only keeps are soft (changed or untracked files, commits found nowhere else on a branch, a lock that isn't a stopped session's), `show` prints a WARNING block with counts, every file listed, an undo line and a 16-hex override tag over the worktree's full facts. `remove --override <folder>=<tag>[,...]` then reads once more and passes `--force` to git once for that worktree. Hard keeps (in use, a link or pointer that names elsewhere, submodule data, edits git is told not to check, a name or read the cleaner can't trust, commits on a detached head, every `--recoverable` keep) get no tag. The three git pins now apply on every call. The cleaner never passes `-f`, `-D` or `--delete`.

Ticket 2: the install adds two ask rules (`Bash(*cleaner.mjs*remove*--override*)` and its `PowerShell` twin) to `permissions.ask` while the cleaner is on, records them under `cleanerAsk`, and removes only those on turn-off; a `settings.json` that isn't strict JSON draws a `WARN:` naming both. The builder page shows them, and the install docs, `docs/cleaner.md`, `docs/reference.md` and the threat model say so. [ADR 0151](../adr/0151-the-cleaner-forces-only-on-an-override-tag.md) reverses 0124's "Never forces" and supersedes 0063 in part.

Recorded in the PR: the override reads run after the existing `status --ignored` read (not before it); a `branch -d` failure after a forced removal prints `left, the folder is gone, overridden: <parts>` with the branch-stays and undo lines and counts as left; one existing test fixture moved (a POSIX file named with a colon now sits in its own worktree, since the climb-out guard withholds a tag for a name holding `:` or `\`).

The merge widens an accepted threat class and loosens git's refusals, so it waits for the owner's confirm in chat. The install apply and the first override run are the owner's, in the owner's chat.

**Rolling back:** turn the cleaner off and apply at the new commit first (an older installer leaves the ask rules), then a revert PR merged on the owner's confirm in chat once CI's two jobs pass on its head; then the normal dry run and the owner's apply.

## Record

- The ask: https://github.com/mephistopheles4/the-pact/issues/523
- Spec revision 5: https://github.com/mephistopheles4/the-pact/issues/523#issuecomment-6811653817
- Draft PR: https://github.com/mephistopheles4/the-pact/pull/530
