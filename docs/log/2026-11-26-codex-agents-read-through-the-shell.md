# Codex agents read through the shell

**2026-11-26.** A gate change (PACT-105, spec 0007 S2 item 61), the lead session's pick, flagged for the owner.

## What changed

- **One line** now opens the instructions of every Codex agent file (`gate/harness-render.mjs`): it has no `Read`, `Glob` or `Grep` tool there, searches and reads with read-only shell commands instead, and doesn't stop at reading that way.
- In an end-to-end run the Codex `scout` had refused its job for lack of those tools. Its source also tells it to stop when a question needs a command.

## Left open

- A Codex agent is read-only by its instructions alone, as before.
