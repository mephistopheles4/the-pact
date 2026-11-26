# The trusted machine

**2026-11-26.** The owner, by voice, relayed by the lead session: "I would like to make an audit for the over-engineered things that we built in order to protect against the machine and the processes and agents running on them. So we could cut them all." PACT-105, spec 0007 S2 items 63 to 69, [ADR 0175](../adr/0175-the-machine-is-trusted-and-guards-catch-mistakes.md). It loosens controls.

## What changed

- **The audit.** Every guard in the gate, the tools, the hooks, the review procedure, the agents and the threat model was sorted by what it defends against: outside input, an honest mistake, or the owner's own machine turning hostile. The last kind went, or shrank to the plain check that catches a mistake.
- **The tree check** catches a lens's mistakes. Its output no longer has to stay out of files a lens can write, and its second run may be read again; a lens that forges it is the machine's, accepted, which closes the open medium in the lead's decision 152.
- **The install** keeps its temp-then-replace write and its checks on the clone, and loses its race, swap, re-hash, file-mode and preload checks.
- **Clef** takes no caller token: any program on the machine may call it. `Host` and `Origin` still keep web pages out.
- **The cleaner** loses its folder-identity re-check before a forced removal, its hooks-folder re-check and its refusal of a linked sessions folder. **The poster** loses its read re-check, and **the hand-off hook** its owner-only folder mode.
- **No rule keeps the owner's user name or home path out of a post.** The home-path test, the install docs' masking lines and that half of the post-read eval went, with no replacement.
- **Codex's agent files** say to read with shell commands that only read files, with no word on `git`.
- **`tierEfforts`** (spec 0008) is deleted (decision 163).
- **The threat model** names the owner's programs and agents as the machine's, trusted, and drops the hostile-agent lines and the open gaps that start and end on the machine.

## Kept

Whose words count, the deny and ask rules, the pin checks, the poster's quote and edit checks, lenses as plain subagents, and `gh-app`'s refusals of `auth`, `extension`, `alias`, `config` and a leading flag (decision 165).

## Left open

- clef-pilot, outside this repo, read the token from `run.json`; the supervisor now ignores one it sends.
- The Codex end-to-end run reads the real `~/.agents`: a known test limit, with no fix.

## Record

- PACT-105: the audit table (comment signed cut-105).
