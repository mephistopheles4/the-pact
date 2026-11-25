# The pact moves to a neutral home

PACT-105, ticket T1 of [spec 0007](../spec/0007-harness-agnostic-pact.md). The pact's own files moved from `~/.claude/pact/` and `~/.claude/.pact-install.json` to `~/.pact/`, with the record at `~/.pact/install.json` and the hand-offs in `~/.pact/handoffs/`. `~/.claude` keeps only what Claude Code reads there: the rules file, the agents, the commands and `settings.json`. The pact text and `review.md` changed in their paths alone.

The installer, the renderer and seam A take a list of harnesses, described in `harnesses/known.json` and under the configuration's `harnesses` key. `--home` takes the place of `--claude-home`. The record lists every file and settings entry by harness, and the dry run reports drift by harness, so a changed pact entry in `settings.json` now stops `--apply`. Only the `claude-md` format is built: for Codex and Antigravity the dry run warns and writes nothing.

Nothing reads the old paths. An install from before the move needs the one-time removal in [install](../install.md#before-the-first-install-into-pact). Two things stay where they were: the clef tool's `~/.claude/pact-clef/`, and a project's `.claude/pact-config.json`.

The claim tests found two faults before review, both fixed here: on Linux and macOS a harness's existing file read as inside a git work tree, and no settings entry was ever recorded.

**Rolling back:** [Roll back to an older version](../install.md#roll-back-to-an-older-version): empty the install list and apply first, move the configuration back, then run the older commit's installer.

## Record

- PACT-105 spec 0007 and its Design rounds (Linear comments)
- PR #673, ticket T1: build and Test records
