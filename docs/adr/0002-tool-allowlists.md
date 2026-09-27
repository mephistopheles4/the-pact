# Builders and checkers get explicit tool allowlists, not deny-lists

`builder`, `spec-builder`, `security-builder` and `result-checker` each carry a `tools:` line naming every tool they may use; anything unlisted, including every MCP connector, `Agent` and `Workflow`, is absent. `builder` gets file tools, both shells, `Skill`, web lookup, `ToolSearch` and the browser pane. `spec-builder` and `security-builder` get file tools and both shells only. `result-checker` gets read tools, both shells, `ToolSearch` and the browser pane, and no write tools. Bash and PowerShell stay on all four.

## Why

- **A deny-list leaks.** Before this, the four agents only denied `Agent` and `Workflow`, so they inherited mail, drive, calendar, Cloudflare and Chrome connectors. A builder that can send email is a risk with no upside, and every new connector would have joined silently.
- **Each tool has a stated reason.** `builder` keeps web lookup to read library and API docs, and the browser to exercise UI changes. `security-builder` has no web tools: advisory lookups belong to `security-reviewer` before approval, and new advisory data needed mid-build is a stop. `result-checker` has no `WebFetch` because it cannot reach a local server anyway.
- **Both shells stay.** Without PowerShell, a builder on Windows falls back to Bash, which fails silently there. Cloud sessions are Linux and need Bash.
- **It is not a sandbox, and says so.** A shell can still write files and reach the network. The allowlist removes connectors and delegation; the controls for the rest are the auto-mode classifier, never running these agents under `bypassPermissions`, a `git status` check after each `result-checker` run, and the sandbox in cloud sessions.
- **Consistent with the owner's private research,** which had queued this as next work and holds least privilege as a candidate rule.

## How this was decided

- **2026-09-26** — `plan-reviewer`'s first round ruled that an allowlist is access control, so the plan went through `security-reviewer` and the build through `security-builder`. The owner's dispositions of the nine security findings, and the fresh-session check of every agent's actual tools, are told in [the agent names and allowlists log](../log/2026-09-26-agent-names-and-allowlists.md). Built in `3828f29`.
- **2026-09-26** — The fresh-session check found `LSP` and `TodoWrite` in no agent and not in the main session either: this Claude Code build does not have them. The owner removed both from the four lines in `d0ae7f1`, which changes nothing any agent can do. `ToolSearch` stays on `result-checker`, though it was not granted in that run, in case its browser tools are ever deferred.
- **Accepted risk:** `builder` keeps `Skill`, which can load any skill from any repo. It had it before, so this is no regression. A probe found that a forked skill run from inside `builder` got `builder`'s tools, not wider ones.
