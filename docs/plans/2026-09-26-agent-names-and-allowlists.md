# Plan: plain agent names and tool allowlists

*Status: draft 4, approved by the owner to build after plan review round 2 (`.review-2.md`): both round-2 findings fixed, no third paper round. Earlier: `.review-1.md`, `.security-review-1.md`. Written 2026-09-26.*

## Intent

1. **Rename the agents to plain job titles** so a person reading `CLAUDE.md`, a routing decision or a transcript knows what each agent does without a glossary.
2. **Give the four agents that inherit every tool an explicit allowlist.** Today `executor`, `mech-executor`, `security-executor` and `verifier` get mail, drive, calendar, Cloudflare and Chrome connectors because they only deny `Agent` and `Workflow`. A builder that can send email is a risk with no upside.

## Decisions

### Names (owner chose "plain job titles", 2026-09-26)

| Old | New | Why |
|---|---|---|
| `scout` | `scout` | Already plain. |
| `Explore` | `Explore` | Must keep the exact name: that is what overrides the built-in agent. |
| `mech-executor` | `spec-builder` | It builds exactly to a spec. "Mech" was jargon. |
| `executor` | `builder` | The default builder, which makes local design calls. |
| `security-executor` | `security-builder` | Same family as `builder`, for security work. |
| `plan-verifier` | `plan-reviewer` | It reviews a plan; "verifier" collided with the post-build agent. |
| `security-reviewer` | `security-reviewer` | Already plain. |
| `verifier` | `result-checker` | It checks the built result. Ends the verifier/plan-verifier confusion. |
| `test-integrity-reviewer` | `test-reviewer` | Shorter; the description carries the detail. |

Filenames change to match `name:`. The docs say an agent is identified by `name:`, not by filename; matching them keeps the repo readable.

**The six renamed files** (the list the swap and Rollback steps use):

| Old file | New file |
|---|---|
| `mech-executor.md` | `spec-builder.md` |
| `executor.md` | `builder.md` |
| `security-executor.md` | `security-builder.md` |
| `plan-verifier.md` | `plan-reviewer.md` |
| `verifier.md` | `result-checker.md` |
| `test-integrity-reviewer.md` | `test-reviewer.md` |

`scout.md`, `Explore.md` and `security-reviewer.md` keep their filenames. They are edited in place where their bodies name an old agent, and are never deleted.

### Allowlists

`disallowedTools: Agent, Workflow` is replaced by `tools:` on these four. Unlisted tools are removed, including all MCP connectors, `Agent`, `Workflow`, `Monitor` and `Artifact`. The harness still adds a few tools of its own (for example `advisor`, and a hand-back tool), and connector instruction text can still appear in an agent's context without the connector's tools. The allowlist removes tools, not every trace of them.

| Agent | `tools:` | Why this shape |
|---|---|---|
| `builder` | Read, Write, Edit, NotebookEdit, Glob, Grep, Bash, PowerShell, Skill, WebFetch, WebSearch, ToolSearch, `mcp__Claude_Browser__*` | Verifies by exercising the change, which for UI work means the browser pane. `ToolSearch` loads the browser tools if they are deferred. `Skill`: accepted risk, see F1 below. `WebFetch` and `WebSearch`: it looks up library and API docs while building. |
| `spec-builder` | Read, Write, Edit, NotebookEdit, Glob, Grep, Bash, PowerShell | Mechanical work plus running tests. No web, no browser, no skills: a spec that needs them is mis-routed. |
| `security-builder` | Read, Write, Edit, NotebookEdit, Glob, Grep, Bash, PowerShell | No web: advisory lookups belong to `security-reviewer` before approval. No browser and no skills, to keep the security surface small. New advisory data needed mid-build → stop and report. |
| `result-checker` | Read, Glob, Grep, Bash, PowerShell, ToolSearch, `mcp__Claude_Browser__*` | Read-and-run: drives the affected flow, including UI, through shell or the browser. No `WebFetch`: it cannot reach localhost. Still no Write/Edit. |

**Bash and PowerShell both stay everywhere.** Without PowerShell, a builder on Windows falls back to Bash and breaks the owner's shell rule. Cloud sessions are Linux and need Bash.

**Known limit, accepted:** Bash and PowerShell can still write files and reach the network. The allowlist removes connectors and delegation; it is not a sandbox. The controls this limit relies on:
- **Auto mode's classifier** judges each shell call. On native Windows there is no sandbox, so the classifier is the control in place.
- **Never `bypassPermissions`.** A subagent runs in that mode only when the main session does, so the main session must not use it for these agents.
- **The browser is inside the same limit.** In auto mode the browser pane's domain checks do not apply, so `mcp__Claude_Browser__*` is another unprompted external channel.
- **`result-checker`'s no-edit promise is backed by a check.** After each `result-checker` run, the main session confirms `git status --porcelain` is unchanged.
- **In cloud sessions,** the sandbox covers Bash and PowerShell and applies to subagents, so it is an enforceable control there.

### Routing rule added to CLAUDE.md (F8)

One line in "Implementing a change", step 2: *"If a named agent is unavailable, stop and report. Never substitute another agent, especially for security work."* This stops a stale name from falling back to `general-purpose`, which has every connector and no security instructions.

## Security review dispositions (owner, 2026-09-26)

| # | Headline | Severity | Disposition |
|---|---|---|---|
| F1 | Skill on builder loads any skill, from any repo | Medium | **Accepted risk.** `builder` keeps `Skill`: it has it today, so this is no regression. Condition: probe P3 in check 4. If a skill can start a subagent from inside `builder`, the owner decides again. |
| F2 | result-checker's WebFetch cannot reach local flows | Low | **Fixed.** Dropped from `result-checker`. `builder` keeps web tools, with the reason recorded. |
| F3 | security-builder's web tools duplicate security-reviewer's job | Low–Medium | **Fixed.** Dropped from `security-builder`. |
| F4 | The accepted shell limit is sound, but the plan should name its controls | Low–Medium | **Fixed.** Controls named above, and the `git status` check is added. |
| F5 | Wildcard syntax is documented, but the server name is not | Info | **Fixed.** Probe P1 in check 4. |
| F6 | ToolSearch's reach beyond the allowlist is undocumented | Low | **Fixed.** Probe P2 in check 4. |
| F7 | `tools:` is not exhaustive; the harness adds extras | Info | **Fixed.** Wording corrected above; check 4 keeps a name-specific forbidden list. |
| F8 | A stale agent name can fall back to general-purpose | Low–Medium | **Fixed.** Routing line in CLAUDE.md; live swap gated on no other live session; memory folders added to check 2. |
| F9 | Cloud sessions keep the connector-inheriting config | Low | **Accepted as a non-goal**, recorded below. |

## Scope

**In:**
- `claude/agents/*.md` in the-pact: rename files, change `name:`, replace `disallowedTools` with `tools:` on the four, and update every cross-reference inside the bodies (for example "between mech-executor (low) and security-executor (high)", "that is verifier's job", "belongs to security-reviewer").
- `claude/CLAUDE.md` in the-pact: the agent names in "Implementing a change", plus the F8 routing line.
- **The repo copy is the source of truth.** Edits are made in the-pact, then `claude/CLAUDE.md` and `claude/agents/*.md` are copied over the live `~/.claude/` copies. The live files are never edited directly.
- `README.md`: the familiars-by-effort list and the Planned section.
- Live `~/.claude/agents/`: copy all nine repo agent files in, then delete exactly the six old files in the left column of "The six renamed files". Never delete `scout.md`, `Explore.md` or `security-reviewer.md`. **Deleting matters:** if old and new both load, two agents share a description and routing splits between them.
- **Gate on the live swap:** copy into `~/.claude/` only when `mcp__ccd_session_mgmt__list_sessions` shows no other live session. The repo changes do not wait for this.

**Out (non-goals):**
- **`cloud-sessions/` scripts.** They embed stale copies with the old names (13 hits each). **Cloud sessions keep full connector access for these agents until the cloud rewrite lands**, which replaces the scripts by cloning this repo.
- **agentic-sdlc evidence, briefs and reviews.** They are history and keep the names used at the time. Another session is working there; nothing in this plan touches it.
- **Renaming "brief".** Separate decision, owner still open.
- **Merging `scout` and `Explore`.** They overlap, but that is a design question, not a rename.
- **The skills `CLAUDE.md` names but that are not installed** (`explaining-technical-work`, `diataxis`). Separate task.

## Blast radius

*Filled from a search of each location, 2026-09-26:*

- the-pact: README (5), claude/CLAUDE.md (3), seven agent bodies (the six renamed files plus `security-reviewer.md`), cloud-sessions scripts (13 each, out of scope).
- Live `~/.claude/CLAUDE.md`: 4 hits. Live `~/.claude/agents/`: 18 hits in 7 files (the same bodies as the repo copies).
- Live `~/.claude/skills/`: no real hits; the matches are the generic word "executor" in the Cloudflare and skill-creator skills.
- `~/.claude/settings.json`: no `Agent(...)` permission entries (searched, not copied).
- stacks and grimoire: no hits.
- agentic-sdlc: hits exist, out of scope as history.

## Unhappy paths

1. **The agent list is fixed at session start.** The session that makes this change still sees the old names. Review this plan with `plan-verifier` under its old name. The new names are testable only in a fresh session.
2. **Old live files left behind.** Covered by the delete step; acceptance check 1 lists `~/.claude/agents/`.
3. **A missed cross-reference.** An agent body that still says "verifier" points the orchestrator at a name that no longer exists. Caught by acceptance check 2.
4. **Wildcard or server name wrong.** If `mcp__Claude_Browser__*` does not resolve, `builder` and `result-checker` silently lose the browser. Caught by check 4 (P1); fall back to listing the browser tools by name.
5. **An allowlist too tight.** A builder hits a missing tool mid-task. It reports blocked rather than guessing, by its own instructions. Fix by adding the tool, with a why.
6. **Cloud sessions.** `mcp__Claude_Browser__*` matches nothing in a cloud container. Harmless: the tool is simply absent.
7. **Another session starts during the swap.** It would load a half-swapped agent set. The swap is two quick steps (copy, then delete) and runs only after the live-session check.
8. **A project agent shadows a new name.** A repo's own `.claude/agents/builder.md` overrides the user-level `builder`. Accepted: that is the documented priority, and a project that defines its own builder means it.
9. **An MCP server is down when an agent spawns.** Its tools may drop silently from the allowlist. One passing check 4 does not prove the grant is stable; unhappy path 5 covers the symptom.

## Acceptance checks

1. `~/.claude/agents/` holds exactly the nine new filenames; `claude/agents/` in the-pact matches it byte for byte.
2. A grep for `mech-executor|security-executor|plan-verifier|test-integrity-reviewer|\bexecutor\b|\bverifier\b` over the-pact (excluding `cloud-sessions/` and `docs/plans/`), `~/.claude/CLAUDE.md`, `~/.claude/agents/` and `~/.claude/projects/*/memory/` returns nothing. Memory hits are updated to the new names or removed if stale.
3. `~/.claude/CLAUDE.md` and `claude/CLAUDE.md` are identical, and both contain the F8 routing line.
4. **Empirical, in a fresh session:** dispatch `builder`, `spec-builder`, `security-builder` and `result-checker`, each asked only to list the tools it has, exactly as named. Pass only if all of these hold:
   - **Every allowlisted tool is present.** Each report contains every tool named in that agent's `tools:` line, PowerShell and Bash included. A missing one fails the check.
   - **Nothing forbidden is present.** No report lists a Gmail, Drive, Calendar, Cloudflare, Claude-in-Chrome, `Agent` or `Workflow` tool.
   - **P1, browser tools only where intended.** `Claude_Browser` is the exact server name in the fresh session's own tool list. `builder` and `result-checker` list its tools; the other two do not.
   - **P2, ToolSearch cannot widen the allowlist.** `builder` and `result-checker` each call `ToolSearch` for a Gmail tool name the fresh session's main agent reports, and for `Agent`. Pass only if neither loads.
   - **P3, a skill cannot start a subagent from inside `builder`.** Run the fresh session in a scratch folder holding one test skill, `.claude/skills/fork-probe/SKILL.md`, with `context: fork` and `agent: general-purpose`, whose body asks for its tool list. `builder` invokes it. Pass if no subagent starts, or if the one that starts has no connector tools. If a subagent starts with connector tools, stop: F1's acceptance goes back to the owner. Delete the scratch folder afterwards.

   **If a tool is missing:** correct its spelling against the name the fresh session's main agent reports for that tool, then rerun this check. If `mcp__Claude_Browser__*` resolves to nothing, list the browser tools by name. If a tool still cannot be granted, stop and bring it to the owner; do not ship an agent short of PowerShell.
5. `plan-reviewer`, `test-reviewer`, `scout`, `Explore` and `security-reviewer` appear in the fresh session's agent list, and no old name does.
6. After the `verifier` run on this change, `git status --porcelain` in the-pact is unchanged.

## Rollback

The-pact is a git repo: `git revert` the commit, then copy `claude/agents/` and `claude/CLAUDE.md` back into `~/.claude/`. Then delete exactly the six files in the right column of "The six renamed files" from `~/.claude/agents/`. Never delete `scout.md`, `Explore.md` or `security-reviewer.md`.

## Cost

Plan review: `plan-verifier` rounds plus one `security-reviewer` run (done). Build: one `security-executor` run. Tool allowlists are access control, so the owner's rule routes the build there whatever its size (owner approved, 2026-09-26). Verify: one `verifier` run plus the fresh-session check (about six small dispatches, including the probes). Roughly ten subagent runs, two of them at high effort.

## Outcome (2026-09-26)

Acceptance checks 4 and 5 ran in a fresh session; the report is kept verbatim in `.check-4-5.md`. Check 5, the forbidden-tool check, P1, P2 on `builder` and P3 passed. Check 4 failed only because `LSP` and `TodoWrite` do not exist in this Claude Code build (the main session lacks them too), and `result-checker` receives no `ToolSearch` (it appears to be given only to agents with deferred tools).

**Owner decision:** remove `LSP` and `TodoWrite` from all four `tools:` lines, which changes no agent's actual tools, so it was edited directly without another security round. Keep `ToolSearch` on `result-checker`: harmless, and needed if its browser tools are ever deferred. **Known gap:** P2 could not be exercised on `result-checker`, since it had no `ToolSearch`. **F1 evidence:** a `context: fork` skill invoked from `builder` got `builder`'s tool set, not general-purpose's, so the accepted risk showed no hole in this run.