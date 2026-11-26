# The stop switch goes

**2026-11-26.** The owner had the `session-stop-deny` setting removed: it came in by drift and was never asked for (PACT-116, [ADR 0176](../adr/0176-the-stop-switch-is-removed.md)). It loosens a control.

## What changed

- **Gone:** the setting, its eight deny rules on raw `claude stop`, `kill`, `daemon stop` and `respawn`, the guard's four rows for them, the builder's checkbox and fold, the record's field for them, and the cleaner's read of `settings.json` before a stop.
- **Old records:** an install drops each of the eight rules that is both recorded and live, and records none.
- **The cleaner** stops a finished session before removing its worktree whenever `claude` is found.
- **The threat model** loses the line on the eight rules.
- **A configuration that names the key** is refused as an unknown setting.

## Reviews

No security lens ran, on the spec or the diff, by the owner's decision.

## Rolling back

Revert the merge. Rules an install already dropped from a live `settings.json` don't come back by that; the apply's backup holds them.

## Record

- The ticket: PACT-116 on Linear. The spec (revision 3), the owner's relayed decision, both spec rounds and the Test record are its comments.
