# security-reviewer on draft 2 (verbatim)

*Run 2026-09-26 against `2026-09-26-agent-names-and-allowlists.md`, draft 2. The harness flagged two instruction-shaped patterns in this report (settings-json, bypass-permissions); both are mentions inside findings, not instructions.*

## Security review: plan draft 2, agent names and tool allowlists

**Bottom line: nothing here blocks as a regression, and the tightening stops short in three cheap places.** Each proposed `tools:` line is narrower than today's `disallowedTools: Agent, Workflow`. Skill, ToolSearch, WebFetch and the browser are all inherited today. So no tool finding makes things worse than now, and I rate nothing High. The one new risk is the rename (finding 8).

**Fix before the build (cheap):**
- F1: drop `Skill` from builder.
- F2: drop `WebFetch` from result-checker.
- F8: add one routing line to CLAUDE.md.

**Owner disposition or a note in the plan:** F3, F4, F5, F6, F7, F9.

**What the plan gets right:** it excludes `Artifact`, which publishes shareable claude.ai pages (an exfiltration path). It also excludes `Monitor`, which can open WebSockets, plus `SendMessage` and all connectors. The docs confirm that `tools:` works as an allowlist and removes MCP tools that are not listed.

---

### F1. Skill on builder loads any skill, from any repo
- **Severity:** Medium. **Status:** confirmed from the docs. The fork-escape sub-point is a hypothesis.
- **Evidence:**
  - Plan line 34 grants `Skill` "to use tdd/diagnosing skills".
  - sub-agents.md, on `skills`: "Subagents can still invoke unlisted project, user, and plugin skills through the Skill tool."
  - sub-agents.md, on `tools`: "To preload Skills into context, use the `skills` field rather than listing `Skill` here."
  - So a repo's `.claude/skills/` becomes an instruction source for an agent that holds Write and shell.
  - skills.md says skills can carry `!` shell injection that runs at render time with no prompt (deny rules still apply). They can also register `hooks` that "keep running for the rest of the session".
- **Hypothesis:** a skill with `context: fork` plus `agent:` "starts a new subagent of the type set in the `agent` field". The docs do not say whether this works inside a subagent that lacks `Agent`. If it does, a skill naming `general-purpose` would get round the removed Agent tool and regain every connector.
- **Remediation:** remove `Skill` from builder. Add `skills: [<exact tdd skill name>, <exact diagnosing skill name>]` so they are preloaded.
- **Verify:** in the fresh session, builder's tool list has no `Skill`, and the preloaded skill text is in its context. Optional probe: before removing Skill, ask builder to invoke a test skill with `context: fork` and `agent: general-purpose`, then see whether a subagent spawns.

### F2. result-checker's WebFetch cannot reach local flows
- **Severity:** Low. **Status:** confirmed.
- **Evidence:**
  - Plan line 37 gives result-checker `WebFetch`, to drive "the affected flow".
  - The WebFetch tool description, as delivered in this session: "Fails on localhost and other hostnames without a dot". It also answers through "a small fast model", so it returns no raw HTTP.
  - So it cannot exercise a local dev server. Its only effect is bringing external content into an agent that has shell.
  - Plan line 34 also gives builder `WebFetch` and `WebSearch` with no stated reason.
- **Remediation:** drop `WebFetch` from result-checker. Local HTTP checks go through shell or the browser. For builder, state a reason in the plan, or drop them.

### F3. security-builder's web tools duplicate security-reviewer's job
- **Severity:** Low to Medium. **Status:** confirmed as a design mismatch. The injection risk is a hypothesis.
- **Evidence:**
  - Plan line 36 says: "Needs advisories for dependency remediation."
  - `C:\Users\mephi\WebstormProjects\the-pact\claude\agents\security-reviewer.md:3` already owns "dependency vulnerability evidence" before approval.
  - `C:\Users\mephi\WebstormProjects\the-pact\claude\agents\security-executor.md:11` requires "an approved, stable execution contract".
  - Advisory lookups therefore belong before approval, inside the contract. Pulling web content mid-build puts untrusted input into the agent that edits auth, secrets and crypto code.
- **Remediation:** remove `WebFetch` and `WebSearch` from security-builder. If it needs new advisory data, it stops and reports, as its body already says. Or the owner accepts the risk. Either way, record the decision.

### F4. The accepted shell limit is sound, but the plan should name its controls
- **Severity:** Low to Medium. **Status:** doc facts confirmed. The auto-mode point is an inference.
- **Evidence:**
  - **Sandbox:** sandboxing.md says "Native Windows is not supported." So the sandbox is no local control. In Linux cloud sessions it does cover "every Bash, PowerShell, or Monitor command", and subagents "use the same sandbox configuration".
  - **Deny rules:** permissions.md says "Bash permission patterns that try to constrain command arguments are fragile". It also says "A deny rule doesn't match the same program by path or inside `sh -c`". So deny rules for curl or Invoke-WebRequest shape behaviour but are no boundary.
  - **Auto mode (inference):** this subagent has `SubagentHandback`. tools-reference.md says that tool is "Provided only in auto mode". So the main session appears to run in auto mode, and its classifier is the control actually in place.
  - **bypassPermissions:** sub-agents.md says "A subagent runs in this mode only when the main conversation does." So the parent's mode decides.
  - **Browser pane:** desktop docs say domain allowlist checks apply "except in Auto and Bypass permissions modes". So the browser wildcard is another unprompted external channel inside the same accepted limit.
- **Remediation:** extend plan line 41 to say four things:
  - the accepted limit relies on the auto-mode classifier;
  - these agents must not run under `bypassPermissions`;
  - the browser wildcard falls under the same limit;
  - after each result-checker run, the orchestrator confirms `git status --porcelain` is unchanged. This backs up the prompt-only no-edit promise in `C:\Users\mephi\WebstormProjects\the-pact\claude\agents\verifier.md:25`.
- Optionally, name the sandbox as the enforceable control for cloud sessions.

### F5. Wildcard syntax is documented, but the server name is not
- **Severity:** Info. **Status:** confirmed.
- **Evidence:**
  - sub-agents.md: "`mcp__<server>` or `mcp__<server>__*` grants or removes every tool from the named server." So the "unverified" note on plan line 74 narrows to whether the server name is right.
  - The desktop docs never name the browser pane's server.
  - The pane uses "a clean browser profile ... with none of your saved logins". Claude in Chrome "shares your browser's login state". Granting Chrome tools would undo the connector removal.
- **Remediation:** in check 4, confirm that `Claude_Browser` is the exact server name in the fresh session's tool list. Also confirm that no Claude-in-Chrome tool appears for builder or result-checker.

### F6. ToolSearch's reach beyond the allowlist is undocumented
- **Severity:** Low. **Status:** hypothesis. No doc settles it.
- **Documented facts:**
  - tools-reference.md: ToolSearch "Searches for and loads deferred tools". Nothing is said about subagent scope.
  - sub-agents.md: `tools` is an allowlist, and in the `safe-researcher` example the subagent cannot "use any MCP tools".
- **Inference:** the allowlist is resolved when the subagent spawns, and ToolSearch searches only that resolved pool. This comes from the reporter's own analysis in GitHub issue #79728. No maintainer has confirmed it, and I did not reproduce it here.
- **External and not reproduced:**
  - #90085 claims subagents cannot reach deferred WebFetch. That is contradicted locally: WebFetch worked in this subagent, which has no ToolSearch.
  - Do not cite #85310 on allowlist scope. Its probe had no `tools:` line.
- **Related risk (Info):** #79728 reports that ToolSearch and MCP entries drop silently when the MCP server is unavailable at spawn. So one passing check 4 does not prove the grant is stable.
- **Remediation:** add a negative probe to check 4. Have builder and result-checker call ToolSearch for a connector tool name the main session reports (for example a Gmail tool) and for `Agent`. The check passes only if nothing loads.

### F7. `tools:` is not exhaustive; the harness adds extras
- **Severity:** Info. **Status:** confirmed locally.
- **Evidence:**
  - This agent's `tools:` line is `Read, Glob, Grep, WebSearch, WebFetch` (`C:\Users\mephi\WebstormProjects\the-pact\claude\agents\security-reviewer.md:6`). Yet this session also has `SubagentHandback` and `advisor`.
  - It also received MCP server instructions from Cloudflare Workers Observability, Claude Docs and Economic Index, while holding no MCP tools. So the allowlist removes tools but not instruction text that connectors inject.
  - Plan line 30 ("Everything not listed is unavailable") overclaims.
- **Remediation:** fix the wording. Keep check 4's forbidden list as specific names, as it is now, so harness-added tools do not cause a false failure.

### F8. A stale agent name can fall back to general-purpose
- **Severity:** Low to Medium. **Status:** hypothesis.
- **Scenario:** a dispatch names a deleted agent (`security-executor`). The likely recovery is the built-in `general-purpose` agent or `builder`. general-purpose inherits every connector and carries none of the security instructions.
- **Gaps in check 2** (plan line 81):
  - **Parallel sessions started before the swap.** CLAUDE.md supports them (wayfinder section), and plan line 71 confirms the agent list is fixed at session start. Whether dispatch uses a cached definition or re-reads the deleted file is unknown.
  - **Auto-memory** under `~/.claude/projects/*/memory` may still name the old agents.
  - **Project shadowing.** Project `.claude/agents/` (priority 3) overrides `~/.claude/agents/` (priority 4), per the sub-agents.md scope table. A generic name like `builder` is likelier than `executor` to collide with a repo's own agent.
- **Remediation:**
  - Add one line to CLAUDE.md step 2: "If a named agent is unavailable, stop and report. Never substitute another agent, especially for security work."
  - Swap the live files only when `mcp__ccd_session_mgmt__list_sessions` shows no other live session.
  - Add the memory directories to check 2.

### F9. Cloud sessions keep the connector-inheriting config
- **Severity:** Low. **Status:** confirmed.
- **Evidence:**
  - `C:\Users\mephi\WebstormProjects\the-pact\cloud-sessions\cloud-setup.sh:268` and `:306`, plus `cloud-setup-wrapper.sh:270`, `:308`, `:380` and `:418`, still write `disallowedTools`-only agents.
  - The scripts write their own CLAUDE.md (`cloud-setup.sh:189`), so the old names stay consistent there. Routing is fine; the tool exposure remains.
- **Remediation:** keep it out of scope, but state in the plan (Non-goals) that cloud sessions keep full connector inheritance until the cloud rewrite lands.

---

**Assumptions:**
- I did not read `~/.claude/settings.json` or the live `~/.claude/agents/`. Plan line 63 says the live agents match the repo copies.
- I could not see the fresh session's real tool names, so F5 and F6 need the empirical check.

**Files:**
- C:\Users\mephi\WebstormProjects\the-pact\docs\plans\2026-09-26-agent-names-and-allowlists.md
- C:\Users\mephi\WebstormProjects\the-pact\claude\CLAUDE.md
- C:\Users\mephi\WebstormProjects\the-pact\claude\agents\security-executor.md
- C:\Users\mephi\WebstormProjects\the-pact\claude\agents\security-reviewer.md
- C:\Users\mephi\WebstormProjects\the-pact\claude\agents\verifier.md
- C:\Users\mephi\WebstormProjects\the-pact\cloud-sessions\cloud-setup.sh

**Sources:**
- [Subagents docs](https://code.claude.com/docs/en/sub-agents.md)
- [Tools reference](https://code.claude.com/docs/en/tools-reference.md)
- [Skills docs](https://code.claude.com/docs/en/skills.md)
- [MCP docs](https://code.claude.com/docs/en/mcp.md)
- [Sandboxing docs](https://code.claude.com/docs/en/sandboxing.md)
- [Permissions docs](https://code.claude.com/docs/en/permissions.md)
- [Desktop docs](https://code.claude.com/docs/en/desktop)
- [Issue #79728](https://github.com/anthropics/claude-code/issues/79728)
- [Issue #90085](https://github.com/anthropics/claude-code/issues/90085)
- [Issue #85310](https://github.com/anthropics/claude-code/issues/85310)
