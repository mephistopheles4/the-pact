# The cleaner stops a finished session, behind the stop switch

Superseded by [ADR 0176](0176-the-stop-switch-is-removed.md) (2026-11-26): no switch holds the cleaner's stop back. The rest of the stop, its tie to the folder and its order, still holds, as ADR 0176 restates.

The cleaner stops a finished background session in a worktree it removes, so one ask clears the session and its worktree (PACT-80). It extends [ADR 0124](0124-the-cleaner-removes-worktrees-with-fixed-commands-and-never-forces.md), which gave the cleaner fixed git commands, and [ADR 0148](0148-deny-rules-come-only-behind-a-switch-that-owns-them-and-records-them.md), which put the stop deny rules behind `session-stop-deny`.

- **Finished is the status file's word.** Kind `bg`, status `idle`, an 8-hex `jobId` that opens the `sessionId`, a positive whole `pid`, and a file named `<pid>.json`. Anything else is live. No shell and no `claude agents` call.
- **Tied to the folder.** A stop is offered only for one finished session whose pid is the one in the worktree's own lock, `claude session <folder> (pid <n>)`, and whose jobId and sessionId no other status file carries. A status file naming a worktree with another pid, a second finished session, a twin of another session's ids or no session lock keeps it in use. This stops a plant that leaves the status files and the lock as Claude Code wrote them; a plant that also rewrites the victim's own status file and the lock gets past it, since any process of the owner's can write both (`git worktree lock --reason`).
- **The order.** `remove` leaves a worktree git would refuse (yes path), reads the session and the switch again, runs `claude stop <jobId>` by absolute path with no shell, waits up to 15 s for the folder and the pid to let go, then removes as it did. The override's last read runs after the wait.
- **The switch holds the stop back.** While `Bash(claude stop *)` or `PowerShell(claude stop *)` is in `~/.claude/settings.json`'s `permissions.deny`, or that file is a link, not plain, not strict JSON or malformed in its `deny`, the cleaner stops nothing. No `claude` on an absolute `PATH` entry does the same.
- **The rules line names its command,** so a lead can run the cleaner from the owner's user-level rules.

## Why

- **The cleaner's stop is a child process,** which deny rules don't see. Without its own read of the switch, an owner who turned `session-stop-deny` on would have a stop control the cleaner walks around.
- **The switch is read from the file that acts,** `settings.json`'s deny list, so the control read is the control Claude Code applies; an owner's identical rule counts too. A doubt reads as on.
- **A folder-tied stop.** The status file is data a session or a plant can write; the lock is git's record of the pid that made the worktree. The tie raises the cost of pointing a stop elsewhere and does not close it.
- **Less friction,** the owner's words: one ask, not a stop and then a cleanup.

## What was weighed

- **`claude agents --json` for the state.** Not taken: it runs a child process whose output must be read, and the status file is read already.
- **Stopping any session in the folder.** Not taken: a busy or waiting session loses its turn. Idle stands in for finished and may be waiting on its lead; the conversation stays (`claude attach <id>`).
- **Stopping with the switch on.** Not taken: friction gives way to the owner's own stop control.
- **Several sessions in one worktree.** Not taken: the pid check ties one session to a lock, so the case is kept in use.

## How this was decided

- **2026-11-23.** Decided on PACT-80, Standard tier. Decisions 43 (the switch holds back the cleaner's stop) and 44 (the Test lens pairs) were the lead's picks, flagged for the owner to review.
