# The gate's tests never need PowerShell

No file in `scripts/`, `gate/` or `cross/` is a PowerShell script, and no test starts `pwsh`. The full suite passes on a machine without PowerShell 7, and the Linux container run shows it: its image is plain Node 24, and `run.sh` refuses to run where `pwsh` is found.

- **The skill-flag check is Node.** `scripts/check-skill-flags.mjs` replaced `check-skill-flags.ps1`, with the same checks, output and exit codes. The flag line is still matched without regard to case, and a line still ends only at a line feed, as the PowerShell script read them. Before the `.ps1` was deleted, both ran on the same 22 inputs, CRLF and case variants among them, and gave the same output.
- **Shell commands are run in their POSIX form.** `pact-call.test.mjs` runs the pact's POSIX command for the cross script, and `run-guards.test.mjs` runs AGENTS.md's POSIX command for the runner, through Git's `sh` on Windows. The PowerShell forms are checked as text: present, through `$HOME`, clearing `NODE_OPTIONS`. The tests that ran them through `pwsh` are gone.
- **What stays, because it is not a dependency:**
  - the pact's shell rule for Windows sessions, and the PowerShell forms of the commands in the rules and in AGENTS.md: they tell a session how to run on the owner's machine;
  - the ask rules `PowerShell(*install.ps1*)` and `Bash(*nstall.ps1*)`: `PowerShell(...)` is Claude Code's tool name, and seam A requires them, so a rollback to an older commit's installer still asks;
  - the runner's rule that a test file naming `install.ps1` is in the install tier, and its two fixtures, which name it in a spawn call that never runs;
  - comments, and the old logs and ADRs;
  - `docs/install.md`'s rollback note: a commit from before #166 still needs PowerShell 7 to install itself.

## Why

- **One fewer tool to install.** PowerShell 7 was needed for a handful of tests only. A contributor on Linux or macOS needed it for nothing else, and the Linux image was built on Microsoft's PowerShell base for it.
- **A check that skips where its tool is missing is a check that can go unrun.** The PowerShell cases skipped or failed wherever `pwsh` was absent. Running the POSIX form everywhere, through a shell every supported machine has, keeps the case running.
- **The PowerShell form is still guarded.** A session on Windows copies it, so its text is checked for the two rules that matter: the full path through `$HOME`, and clearing `NODE_OPTIONS`. What is lost is proof that PowerShell itself reads the line as intended; that is accepted.

## How this was decided

- **2026-10-10**, the owner in `tickets-53`'s chat: "A, I think we should have zero PowerShell left", folded into mephistopheles4/the-pact#210, and built there.