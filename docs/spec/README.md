# Specs

This folder holds the repo's specs in force, one file each: `<NNNN>-<slug>.md`. `NNNN` is four digits, the highest in the folder plus one, from `0001`; `slug` is lower-case letters, digits and hyphens. Whether a spec is in force is decided by the owner's rule, [the issue tracker doc](../agents/issue-tracker.md#linear) ("A spec counts only"), not by this file. Every file here is public, so a spec holds nothing a public record may not: no secret, personal detail, open security reason, weakness in others' software that is not yet public, or tracker id beyond a team key.

To add a spec: write the file, put its line at the top of "All specs" (and delete `None yet.` there if it is the first), and change nothing else. A line is one of:

- `- [<stem>](<stem>.md) — <one-line summary>`, `<stem>` being the file name without `.md`;
- `- history: [#<n>](<issue URL>) — <one-line summary>`, for a spec still on an issue; it names no file.

## Read these first

None yet.

## All specs

- [0005-clef-everywhere](0005-clef-everywhere.md) — Clef on Linux and Windows x64 and arm64 and on Intel Macs, run end to end in CI on the real server, with the keeper where setpriv is missing and a doc for anyone
- [0003-clef-macos](0003-clef-macos.md) — Clef on macOS arm64 with Metal, a keeper process and a keyed orphan sweep standing in for pdeathsig and /proc
- [0002-clef-runner](0002-clef-runner.md) — a pinned llama-server runner for Clef, as an opt-in pact tool, fetched by setup and run behind a loopback supervisor
- [0001-athanor-pact-tool](0001-athanor-pact-tool.md) — athanor as an opt-in pact tool, installed from npm at a pinned version, with one shared guard hook
