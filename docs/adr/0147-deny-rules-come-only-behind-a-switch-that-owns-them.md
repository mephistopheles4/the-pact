# Deny rules come only behind a switch that owns them and records them

The pact adds a deny rule to `permissions.deny` in `settings.json` only behind a switch that owns it, and records each rule it adds so turning the switch off removes only those (#439). It extends [ADR 0124](0124-the-cleaner-removes-worktrees-with-fixed-commands-and-never-forces.md), which put the cleaner's deny rules behind the cleaner. Two rules of that kind are now in play:

- **`claude rm *` joins the cleaner's switch.** `CLEANER_DENY` holds eighteen rules, the sixteen git rules plus `Bash(claude rm *)` and `PowerShell(claude rm *)`, recorded under `cleanerDeny`. The cleaner is how worktrees go, and `claude rm` deletes a session's worktree with whatever is left in it, which git's keeps don't bound.
- **`claude stop *` gets a switch of its own,** the user setting `session-stop-deny`, `true` or `false`, off by default. On, the install adds `Bash(claude stop *)` and `PowerShell(claude stop *)` and records them under `stopDeny`. Off, it removes only rules both recorded and on that fixed list; a rule the owner wrote stays. Each plan filters its record by its own list, so one switch never touches the other's rules. A project may not set it.

## Why

- **A switch, because the pact can't tell what is installed.** Whether Brigade runs here is unknown to the installer, and a deny rule that blocks a tool's raw command for someone who doesn't use the tool is a cost with no gain (the reason ADR 0124 kept the cleaner's rules out of the overlay). An owner who runs Brigade turns the switch on.
- **Off by default.** An install that doesn't run Brigade stays exactly as it was.
- **Recorded, so removal is exact.** Without the record, turning the switch off would either leave the rules or take the owner's identical rule with them.
- **Suffix only.** Command, subcommand, then ` *`. A mid `*` matches any text, spaces included, so `claude * stop *` would catch a session start whose prompt holds the word "stop".
- **A speed bump, not a gate.** A flag before the subcommand, a path-qualified or wrapped call and other spellings get past, with the classifier behind them, which an installed mod can bypass.

## What was weighed

- **The rules in the overlay.** Not taken, as in ADR 0124.
- **`claude stop` rules always on.** Not taken: Brigade's `stop_background_session` runs `claude stop` from the mod's own process, which permission rules don't see. That is assumed, not measured, so the owner who turns the switch on has a way out (switch off, apply) written in the install doc.
- **The owner's own `claude stop` and `claude rm`.** Run from a separate terminal, outside Claude Code. Whether Claude Code's `!` shell mode honours deny rules is unmeasured.

## How this was decided

- **2026-11-08.** Decided on #439, spec revision 3, standard tier, the security pair on the spec and again at Test. The proceed, the placement and the rule shape were the lead's picks under the owner's level-3 goal, not the owner's words. The threat-model lines that widen "Removals lose local work" and add a class wait for the owner's confirm at merge.
