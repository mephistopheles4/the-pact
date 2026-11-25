# The rule table and the shared guard

**2026-11-25.** Spec 0007 puts the pact into Codex and Antigravity, which have no permission rules of Claude Code's kind. PACT-105 T3 builds S8: the guard rules as one table, the permission rules made from it, and for the other two harnesses a PreToolUse hook that runs a small guard (C11 to C16). The work runs at the thorough tier on the sensitive route.

## What was built

- **One table.** `GUARD_RULES` in `gate/install-core.mjs` holds each rule's id, decision, switch and command words. `CLEANER_DENY`, `CLEANER_ASK` and `STOP_DENY` are made from it, and a test holds their text to what it was, so Claude Code's rules don't move. The install writes the rules that are on to `~/.pact/guard/rules.json`; a commit that holds that file is refused.
- **The guard** (`claude/guard/guard.mjs`) reads a command's text and runs nothing. It tokenizes as `.claude/hooks/athanor-guard.mjs` does, once as Bash and once as PowerShell, and a match in either counts, since a harness doesn't say which shell it uses. A deny beats an ask.
- **The wrappers** (`codex.mjs`, `antigravity.mjs`) answer in the harness's shape and fail closed with a code from a fixed list. No answer carries text from the call or from an error. A command over 1 MiB, or input over 8 MiB, is refused as `size`.
- **The hook command** names `node`'s script by absolute path and clears `NODE_OPTIONS`. On Windows it starts `cmd.exe` by its full path, sets `NoDefaultCurrentDirectoryInExePath=1`, and refuses a path holding a character `cmd` would read.
- **The install** merges one hook per hooks file by key, keeps the person's hooks, records only the pact's entry, backs the file up, prints Codex's trust step when the entry is new or changed, and takes the entry and the files out when no rule is on or no harness takes them. Entries come out before the files they run are deleted. Seam A takes a `guard` harness part and holds `claude/guard/` to its three files.

## Left open

- **T4 and T5 probe the harnesses.** Nothing here has run inside Codex or Antigravity. Antigravity's docs name neither the shell its hooks run under on Windows nor what empty output means. The Windows command works under `cmd`. Under PowerShell (7 and 5.1) it doesn't: for a plain home path it prints the process environment to the hook's output ahead of the answer, which is then not valid JSON, and for a path with a space it fails to start. A harness that runs hooks under PowerShell would let the call through and receive the environment, so T5 settles the shell before any apply.
- **Speed bumps.** A command inside a nested shell string (`bash -c`, `pwsh -Command`) is not read, and neither are spellings the table's words don't cover.
- **Word budgets.** `docs/install.md` and `docs/reference.md` took the guard's text past their budgets, which were raised, with a follow-up issue to clean them up.
