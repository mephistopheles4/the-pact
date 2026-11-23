# The cleaner stops a finished session

PACT-80. The cleaner removed a worktree only after its background session was stopped by hand, so clearing a finished session took two asks. It now reads a finished session from its status file (kind `bg`, status `idle`, a jobId that opens its sessionId, a positive pid, a file named `<pid>.json`), reads a worktree held by exactly one such session, whose lock is that session's own, as free, and on `remove` stops it with `claude stop <jobId>`, waits up to 15 s for the folder and the pid to let go, then removes as before. The report line gains `session stopped, `.

Nothing is stopped while the owner's `session-stop-deny` switch is on, read as `Bash(claude stop *)` or `PowerShell(claude stop *)` in `~/.claude/settings.json`'s deny list, with a link, a non-JSON file or a malformed list read as on; none is stopped when no `claude` is on an absolute `PATH` entry. The rules file's cleaner line now names the command, so a lead can run it from the user-level rules. [ADR 0169](../adr/0169-the-cleaner-stops-a-finished-session-behind-the-stop-switch.md) records the decision.

CI has no `claude` and no sessions, so its tests stub the process call. One real run waits for the owner's install: a throwaway `claude --bg -w <name>` session left idle, then `show` and `remove` with its tag.

**Rolling back:** revert the PR, run `node builder/default-config.mjs` and `node builder/build.mjs`, and reinstall through the dry run and the owner's apply. Nothing the cleaner wrote needs undoing: a stopped session resumes with `claude attach <id>`.

## Record

- PACT-80 spec revision 2 and Design round 1 (Linear comments)
- PACT-80 spec revision 3 and Design round 2, final (Linear comments)
- PACT-80 Test round 1 and Test round 2, final (Linear comments); PR #657
