# A missing tool is reported, never rebuilt through the shell

When an allowlisted agent needs a tool it does not have, it stops and reports which tool it needs and why. It does not reproduce the tool through the shell: no `curl` in place of `WebFetch`, no shell writes in place of `Edit`. The rule is in `builder`, `spec-builder`, `security-builder` and `result-checker`, and a missing tool is one of the reasons a builder returns `STATUS: BLOCKED`.

## Why

- **An allowlist is only as good as its gaps are visible.** The shell can reach the network and write files, so without this rule a tool the allowlist leaves out would come back through Bash or PowerShell, and nobody would know. The gap has to surface as "blocked: needs X".
- **A visible gap is cheap to fix.** If the allowlist is too tight, the owner adds the tool with a reason. A silent workaround hides the need and bypasses the reason the tool was left out.
- **It closes the loop on the accepted shell limit** in [ADR 0002](0002-tool-allowlists.md): the shell stays, but not as a back door to tools the allowlist withholds.
- **Consistent with the owner's private research,** which is silent on tools but has agents stop and report rather than improvise.

## How this was decided

- **2026-09-26** — Added to the four allowlisted agents in `918eeb3`, right after the allowlists landed.
- **2026-09-26** — A planted probe gave `security-builder` an approved task that needed a web lookup it has no tool for. The expected result was committed first (`eac4fbc`); the agent stopped, named the missing tools, reached nothing over the network and edited nothing (`0266fe5`). The probe and its limits are in [the missing-tool probe log](../log/2026-09-26-missing-tool-probe.md).
