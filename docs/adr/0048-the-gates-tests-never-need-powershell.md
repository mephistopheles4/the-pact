# The gate's tests never need PowerShell

Superseded in part by [ADR 0052](0052-the-ask-rules-no-longer-guard-a-rollback-to-install-ps1.md) (2026-10-10): the "what stays" bullet on the ask rules that guard `install.ps1`'s apply step no longer holds; those rules are removed.

No file in `scripts/`, `gate/` or `cross/` is a PowerShell script, and no test starts `pwsh`. The full suite passes on a machine without PowerShell 7, and the Linux container run shows it: its image is plain Node 24, and `run.sh` refuses to run where `pwsh` is found.

- **The skill-flag check is Node.** `scripts/check-skill-flags.mjs` replaced `check-skill-flags.ps1`, with the same checks, output and exit codes. The flag line is still matched without regard to case, and a line still ends only at a line feed, as the PowerShell script read them. Before the `.ps1` was deleted, both ran on the same 22 inputs, CRLF and case variants among them, and gave the same output.
- **Shell commands are run in their POSIX form.** `pact-call.test.mjs` runs the pact's POSIX command for the cross script, and `run-guards.test.mjs` runs AGENTS.md's POSIX command for the runner, through Git's `sh` on Windows. The PowerShell forms are checked as text: present, through `$HOME`, clearing `NODE_OPTIONS`. The tests that ran them through `pwsh` are gone.
- **No standing test keeps it so.** The evidence is this change's one-time search of those folders and the Linux container run without `pwsh`. The owner chose not to add a test for it (2026-10-10, in chat): a later `.ps1` or `pwsh` start would be caught by review, or by the next container run.
- **The PowerShell forms are held word for word.** Since nothing runs them, `pact-call.test.mjs` and `run-guards.test.mjs` compare each documented command with its exact text, so a command chained before or after the call fails.
- **What stays, because it is not a dependency:**
  - the pact's shell rule for Windows sessions, and the PowerShell forms of the commands in the rules and in AGENTS.md: they tell a session how to run on the owner's machine;
  - the ask rules that guard `install.ps1`'s apply step: `PowerShell(...)` is Claude Code's tool name, and seam A requires them, so a rollback to an older commit's installer still asks. The same PR retired the two broad rules, `PowerShell(*install.ps1*)` and `Bash(*nstall.ps1*)`, for ADR 0049's eighteen apply-step rules;
  - the runner's rule that a test file naming `install.ps1` is in the install tier, and its two fixtures, which name it in a spawn call that never runs;
  - comments, and the old logs and ADRs;
  - `docs/install.md`'s rollback note: a commit from before #166 still needs PowerShell 7 to install itself.

## Why

- **One fewer tool to install.** PowerShell 7 was needed for a handful of tests only. A contributor on Linux or macOS needed it for nothing else, and the Linux image was built on Microsoft's PowerShell base for it.
- **A check that skips where its tool is missing is a check that can go unrun.** The PowerShell cases skipped or failed wherever `pwsh` was absent. Running the POSIX form everywhere, through a shell every supported machine has, keeps the case running.
- **The PowerShell form is still guarded.** A session on Windows copies it, so its text is checked for the two rules that matter: the full path through `$HOME`, and clearing `NODE_OPTIONS`. What is lost is proof that PowerShell itself reads the line as intended; that is accepted.

## How this was decided

- **2026-10-10**, the owner in `tickets-53`'s chat: "A, I think we should have zero PowerShell left", folded into mephistopheles4/the-pact#210, and built there.