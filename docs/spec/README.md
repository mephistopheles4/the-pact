# Specs

This folder holds the repo's specs in force, one file each: `<NNNN>-<slug>.md`. `NNNN` is four digits, the highest in the folder plus one, from `0001`; `slug` is lower-case letters, digits and hyphens. Whether a spec is in force is decided by the owner's rule, [the issue tracker doc](../agents/issue-tracker.md#linear) ("A spec counts only"), not by this file. Every file here is public, so a spec holds nothing a public record may not: no secret, personal detail, open security reason, weakness in others' software that is not yet public, or tracker id beyond a team key.

To add a spec: write the file, put its line at the top of "All specs" (and delete `None yet.` there if it is the first), and change nothing else. A line is one of:

- `- [<stem>](<stem>.md) — <one-line summary>`, `<stem>` being the file name without `.md`;
- `- history: [#<n>](<issue URL>) — <one-line summary>`, for a spec still on an issue; it names no file.

## Read these first

None yet.

## All specs

- [0001-athanor-pact-tool](0001-athanor-pact-tool.md) — athanor as an opt-in pact tool, installed from npm at a pinned version, with one shared guard hook
