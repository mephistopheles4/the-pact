# The agent identity switch takes any Node

PACT-35. Loosens a check the log of #603 added.

On Windows the install no longer requires `C:\Program Files\nodejs\node.exe` for the agent-identity switch. `identityNodeOk` in `gate/install-core.mjs` now takes any absolute path to a program called `node` or `node.exe`, with no quote or line break, the same rule as off Windows. The `identity-node` refusal stays for a Node that fails it, and its text drops the folder. The Program Files tests, and the ones that pinned `SystemRoot` and `ProgramFiles` handling, are cut or rewritten to the one rule, and the install tests no longer plant a platform into the installer's copy.

Why: the folder rule guarded only against something on the owner's machine rewriting the Node that mints tokens. `docs/threat-model.md` puts the machine out of scope, and the helper script, the gitconfig and `NODE_OPTIONS` stayed writable anyway. The rule came from a pick relayed by the lead, not the owner's words. The owner then said, by voice in the lead's chat on 2026-11-22: "Yes, drop it. And this clearly breaks the class of a trusted machine. And you clearly did not look at the threat model." It also refused the owner's mise Node, so setup could not run.

The threat model needs no new accepted class, and its agent-app text names no Program Files control. `docs/agent-identity.md` and ADR 0162 drop the folder; after any change of Node path, not only off Windows, run setup again.

**Rolling back:** revert the merge. An install that then finds a Node outside `C:\Program Files\nodejs` refuses with `identity-node`, so run the install under that Node first.

## Record

- The ticket: PACT-35 on Linear.
