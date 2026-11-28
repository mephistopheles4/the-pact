# Specs

This folder holds the repo's specs in force, one file each: `<NNNN>-<slug>.md`. `NNNN` is four digits, the highest in the folder plus one, from `0001`; `slug` is lower-case letters, digits and hyphens. Whether a spec is in force is decided by the owner's rule, [the issue tracker doc](../agents/issue-tracker.md#linear) ("A spec counts only"), not by this file. Every file here is public, so a spec holds nothing a public record may not: no secret, personal detail, open security reason, weakness in others' software that is not yet public, or tracker id beyond a team key.

To add a spec: write the file, put its line at the top of "All specs" (and delete `None yet.` there if it is the first), and change nothing else. A line is one of:

- `- [<stem>](<stem>.md) — <one-line summary>`, `<stem>` being the file name without `.md`;
- `- history: [#<n>](<issue URL>) — <one-line summary>`, for a spec still on an issue; it names no file.

## Read these first

None yet.

## All specs

- [0014-easy-asks](0014-easy-asks.md) — a closed list of two easy asks in the rules file, adding an opt-in tool that sends and holds nothing to the config and a Scriptorium rebuild with the installed kit, taken as checkpoints no one holds, a lead in Auto mode included; the install's apply stays the owner's
- [0011-coverage-hint](0011-coverage-hint.md) — an opt-in `coverage` tool: for each security finding, a decision model (local Clef by default, or Jev by the user's per-project choice) answers small questions per threat-model entry, and the round comment shows "likely covered", "unsure" or "no entry found" as a hint no rule acts on; with a delta on 0002 for full Clef
- [0010-agent-identity-guard](0010-agent-identity-guard.md) — cross-harness agent identity guard across Claude Code, Codex and Antigravity under agent-identity, with Antigravity overwrite + ask, plain-text repo-owner scoping, rendered startup guidance and --provider doc fixes
- [0009-beta-tags](0009-beta-tags.md) — a delta on 0007 S10: each green push to `main` tags a beta, `v1.<n>.0-beta.<k>`, and the legacy `-rc` tags are still read
- [0008-per-harness-models-and-efforts](0008-per-harness-models-and-efforts.md) — a delta on 0007: per-harness agent models and tier efforts in a harness description, rendered by the install and set in Scriptorium, with one page of the setup across harnesses
- [0007-harness-agnostic-pact](0007-harness-agnostic-pact.md) — the pact in a neutral home, `~/.pact`, rendered by one installer into Claude Code, Codex, Antigravity and a person's own harness, with one shared guard and tagged releases through `npx`
- [0006-claude-workflows-wif](0006-claude-workflows-wif.md) — the Claude GitHub workflows, authenticated through Workload Identity Federation, under an exact allow-list of their own
- [0005-clef-everywhere](0005-clef-everywhere.md) — Clef on Linux end to end without setpriv, on arm64 Linux and Windows and on Intel Macs, with CPU end-to-end runs in CI and a doc for anyone
- [0004-portable-toc](0004-portable-toc.md) — a portable table-of-contents script and its per-repo config, which grimoire, stacks and athanor adopt by choice
- [0003-clef-macos](0003-clef-macos.md) — Clef on macOS arm64 with Metal, a keeper process and a keyed orphan sweep standing in for pdeathsig and /proc
- [0002-clef-runner](0002-clef-runner.md) — a pinned llama-server runner for Clef, as an opt-in pact tool, fetched by setup and run behind a loopback supervisor
- [0001-athanor-pact-tool](0001-athanor-pact-tool.md) — athanor as an opt-in pact tool, installed from npm at a pinned version, with one shared guard hook
