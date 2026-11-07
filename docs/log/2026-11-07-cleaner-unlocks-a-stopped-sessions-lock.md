# The cleaner unlocks a stopped session's lock

#492, standard tier, built by pact-492 from spec revision 1. The owner's go-ahead came in chat through backlog-head-chef ("proceed on spec revision 1, without the spec pair"); the spec pair did not run.

`claude --bg -w <name>` locks the worktree it makes, and the cleaner never forces, so twelve stopped sessions' worktrees were left for `claude rm`. The cleaner now reads the lock's reason. A reason that is exactly `claude session <folder> (pid <digits>)`, with the worktree's own folder name compared as built text, is a *session lock*. A running session is already kept as "in use" through its status file before any lock is read, so a session lock on a candidate is a stopped session's.

`show` says `locked by a stopped session; remove unlocks it` for a session lock and still says `locked, git will refuse` for any other. The tag covers the lock's reason, so a lock added, dropped or changed after `show` reads as changed. `remove` runs `git worktree unlock` and then the same unforced `git worktree remove`; if git refuses (changed or untracked files, a submodule), the cleaner locks the worktree again with the same reason, and adds `the lock was not put back` if that fails too. The reason and the pid are never printed.

This loosens one promise in `docs/cleaner.md`: "a lock is left" became "a session lock is unlocked and any other lock is left". ADR 0124's "never forces" holds, since unlocking passes no force flag, so no ADR was written.

The cleaner's how-to lost its third line, and `docs/cleaner.md` its Brigade section: both named the Brigade mod's `clean_up` and `/brigade done`, which grimoire #516 removed. A lead had read that line and told the owner to type `/brigade done`. The `--recoverable` flag stays as it was; only its Brigade wording in the code comment went.

## Record

- The ask, the spec and the owner's go-ahead: https://github.com/mephistopheles4/the-pact/issues/492
