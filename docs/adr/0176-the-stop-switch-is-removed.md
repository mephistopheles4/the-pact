# The stop switch is removed

The `session-stop-deny` setting goes, with no stand-in (PACT-116). Supersedes [ADR 0169](0169-the-cleaner-stops-a-finished-session-behind-the-stop-switch.md), and [ADR 0148](0148-deny-rules-come-only-behind-a-switch-that-owns-them-and-records-them.md) in part. The owner never asked for it. Their words, in the lead's chat as the issue quotes them: "remove that, that was added by drift i never asked for"; and, relayed by the lead, in the PACT-116 comment "Decision (relayed): no security pair; remove the switch completely": "And I never asked for this tool, so please nuke it hard."

## What changed

- **No setting.** The renderer knows four settings; a configuration that still names the removed key is refused like any unknown one. It is not listed as retired, so no file but the history names it. The owner's configuration never set it.
- **No rules.** The eight deny rules on raw `claude stop`, `claude kill`, `claude daemon stop` and `claude respawn` leave the install, the guard's table, the builder page and the threat model's controls.
- **Old records are cleaned.** The eight strings stay as data (`RETIRED_DENY`): an install drops each one both recorded and still in `permissions.deny`, and records none. One the owner wrote, and so no record lists, stays. A `settings.json` that is not strict JSON is left alone, and the record keeps the rules until an install can read it. The list goes with the next change to the install record's format, or on the owner's call.
- **The cleaner's stop answers to no switch.** It stops a finished session before it removes the worktree whenever `claude` is found.

## What stays

- The cleaner's own deny and ask rules, behind the cleaner's switch and recorded, as ADR 0148 set them: a deny rule still comes only behind a switch that owns it.
- The rest of ADR 0169's stop: finished is the status file's word; the stop is tied to the folder by the session's own lock, with no twin; `remove` leaves a worktree git would refuse, reads the session again, runs `claude stop <jobId>` by absolute path with no shell, waits for the folder to be free, then removes. No `claude` on an absolute `PATH` entry means no stop.

## What it costs

- A raw stop, kill, supervisor stop or respawn from a session meets no deny rule of the pact's; the harness's own permissions are what stand before it.
- A `claude stop` deny rule the owner writes by hand, or an unreadable `settings.json`, no longer holds the cleaner's stop back. The cleaner's checks before a stop and each removal's checkpoint remain.
- The cleaner's tags no longer cover the switch, so a tag an older cleaner printed reads as changed: run `show` again.

## How this was decided

- **2026-11-26.** PACT-116, Standard tier. The owner ruled out the security pair on the spec, the diff and at Test, and accepted the removed control.
