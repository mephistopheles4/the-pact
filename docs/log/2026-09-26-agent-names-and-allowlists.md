# Plain agent names, and allowlists that were checked against the real tools

**2026-09-26** — The agents got job-title names ([ADR 0001](../adr/0001-plain-agent-names.md)), and the four that inherited every tool got explicit allowlists ([ADR 0002](../adr/0002-tool-allowlists.md)). The review rounds, the security review and the owner's calls are in the plan and its reviews, kept verbatim in the commits listed under Record. At the time, the reviewing agents still ran under their old names, `plan-verifier` and `verifier`, and the kept files say so.

## What it set out to do

Two things. First, rename six agents so a reader could tell each one's job from its name: `mech-executor`, `executor`, `security-executor`, `plan-verifier`, `verifier` and `test-integrity-reviewer` became `spec-builder`, `builder`, `security-builder`, `plan-reviewer`, `result-checker` and `test-reviewer`. Second, stop four agents inheriting every connector. `executor`, `mech-executor`, `security-executor` and `verifier` only denied `Agent` and `Workflow`, so they could reach mail, drive, calendar, Cloudflare and Chrome.

## What each review round caught

**Round 1 (`plan-verifier`, draft 1): two blockers.**
- **An allowlist is access control.** The pact sends anything touching auth through `security-reviewer` on the plan and `security-builder` for the build, whatever its size. The plan had done neither, and routed the build to the mechanical builder.
- **The check could not see a dropped tool.** It tested only that forbidden tools were absent. A misspelled `PowerShell` in a `tools:` line would drop silently and the check would still pass, leaving a Windows builder on Bash.

**Security review (draft 2): nine findings, nothing High.** Every proposed allowlist was narrower than before, so no finding was a regression. The owner's dispositions: `Skill` stays on `builder` as an accepted risk, conditional on a probe; `WebFetch` leaves `result-checker`, since it cannot reach a local server; web tools leave `security-builder`, since advisory lookups belong to `security-reviewer` before approval; the plan names the controls the accepted shell limit relies on; three probes join the check (the browser server's exact name, whether `ToolSearch` can widen an allowlist, and whether a skill can start a wider subagent); and CLAUDE.md gains a routing line: if a named agent is unavailable, stop rather than substitute another. Cloud sessions keeping the old config was accepted as a non-goal.

**Round 2 (`plan-verifier`, draft 3): two blockers.**
- **Seven files to delete, but only six renamed.** The live swap said to delete "the seven old ones". The seventh file with an old-name hit was `security-reviewer.md`, whose name does not change, so following the step could have deleted the security gate itself. Rollback had the same flaw. The fix was one explicit list of the six renamed files, used by both steps.
- **Two copies of CLAUDE.md that could never match.** The check required the live and repo copies to be identical, but they already differed in unrelated text. The fix named the repo copy as the source of truth, copied over the live one.

The owner approved building after round 2 with both findings fixed, without a third paper round.

## What was built

`3828f29` renamed the six files, replaced `disallowedTools` with `tools:` on the four agents, updated every cross-reference in the agent bodies and in `claude/CLAUDE.md`, added the routing line, and updated the README. The build went through the security route. The repo-side check (`verifier`, draft 4) confirmed the six renames, the four `tools:` lines token for token, and no stale name anywhere in scope. It raised three advisories; the one that mattered, that the README should say cloud sessions still carry the old names and full connector access, was fixed before the commit.

## What the fresh-session check showed

A fresh session dispatched each of the four agents and asked only for its tool list.

- **Every name loaded, and no old one did.**
- **Nothing forbidden appeared** on any agent: no mail, drive, calendar, Cloudflare, Chrome, `Agent` or `Workflow` tool.
- **The browser server's name was right.** `builder` and `result-checker` each got the browser pane's tools; the other two got none.
- **`ToolSearch` did not widen `builder`.** Asked to load a mail tool and `Agent`, it found neither.
- **A forked skill got `builder`'s tools, not wider ones.** A test skill declaring a general-purpose agent, invoked from inside `builder`, ran with `builder`'s own tool set.
- **The allowlist check failed, and the failure was the plan's.** `LSP` and `TodoWrite` were missing from all four agents, and from the main session too: this Claude Code build does not have them. `result-checker` also had no `ToolSearch`, probably because the harness gives it only to agents with deferred tools.

The owner removed `LSP` and `TodoWrite` from the four lines in `d0ae7f1`. That changed nothing any agent could do, so it went in without another security round. `ToolSearch` stays on `result-checker`, in case its browser tools are ever deferred.

## What is still open

- **`ToolSearch` was never probed on `result-checker`.** It had no `ToolSearch` in the run, so the widening probe could not be exercised there.
- **The forked-skill result is one run.** It showed no hole in the accepted `Skill` risk; it does not prove there is none.
- **An allowlist grant may not be stable.** A tool can drop silently if its server is down when the agent starts. One passing check does not prove otherwise.
- **Cloud sessions keep the old names and full connector access** until the cloud setup is rewritten to clone this repo.
- **The test skill used by the fork probe was left installed at user level** for the owner to delete; the checking session was told not to touch skill files.

## Record

- `3828f29` — the build, plus verbatim: the plan at draft 4, `plan-verifier` rounds 1 and 2 (on drafts 1 and 3), the security review (on draft 2), and the repo-side `verifier` check. Drafts 1 to 3 were never committed on their own.
- `d0ae7f1` — the `LSP`/`TodoWrite` removal, plus verbatim: the fresh-session check report, and the plan's outcome section.
