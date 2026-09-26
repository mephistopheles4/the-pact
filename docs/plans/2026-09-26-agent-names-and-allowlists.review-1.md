# plan-verifier on draft 1 (verbatim)

*Run 2026-09-26 against `2026-09-26-agent-names-and-allowlists.md`, draft 1.*

REVISE

Headline: Tool allowlists are authorization; security-reviewer pass missing
Blocker: P2. Restricting which tools an agent may call is authorization (access control). CLAUDE.md sends "anything touching auth" through `security-reviewer` on the plan, then `security-executor`, whatever its size. The plan's own intent frames the change as risk reduction ("A builder that can send email is a risk"), and it changes the tool surface of `security-executor` itself. The plan records no security-reviewer findings or dispositions. It also routes the build to a "spec-builder-shaped run", which is today's `mech-executor`, not `security-executor`. Readiness cannot be judged without these dispositions.
Evidence: C:\Users\mephi\WebstormProjects\the-pact\claude\CLAUDE.md:66-68 (auth routes through security-reviewer, then security-executor); C:\Users\mephi\WebstormProjects\the-pact\claude\agents\plan-verifier.md:13 (security-sensitive units need completed security-reviewer findings before readiness); plan C:\Users\mephi\WebstormProjects\the-pact\docs\plans\2026-09-26-agent-names-and-allowlists.md:8, :36, :92 (intent, the security-executor allowlist, and build routing to spec-builder). The plan contains no security-reviewer section.
Minimum revision: Run `security-reviewer` on the plan, covering the four allowlists and the accepted Bash/PowerShell limit. Record its findings and a disposition for each in the plan. Change the Cost/build routing to `security-executor`, or record the owner's explicit decision that this change is not auth-sensitive, with the reason.
Acceptance check: The plan has a security-reviewer findings section with a disposition per finding. Its build step names `security-executor` or cites the owner's recorded exemption.

Headline: Check 4 cannot detect silently dropped allowlisted tools
Blocker: P2. The plan claims each of the four agents keeps a specific tool set, and says PowerShell must stay because losing it breaks the owner's shell rule. Acceptance check 4 tests only that forbidden tools are absent and that browser tools are present on two agents. A misspelled or unresolvable name in a `tools:` line, such as PowerShell, LSP or TodoWrite, would drop silently and check 4 would still pass. Two examples of how this can happen: a tool-name mismatch, or a deferred tool on `spec-builder` or `security-builder`, which have no `ToolSearch`. The builder would then fall back to Bash, the silent-failure mode the owner's rule exists to prevent. The check therefore cannot prove the claimed "retained tools" outcome.
Evidence: plan :34-37 (the allowlists), :39 (PowerShell must stay everywhere), :83 (check 4 asserts only absences plus browser presence).
Minimum revision: Extend check 4 so that each dispatched agent's reported tool list must contain every tool named in its `tools:` line, at least PowerShell and Bash. Name the fallback if one is missing.
Acceptance check: Check 4 text requires the report of each of the four agents to include every allowlisted tool, and treats a missing one as a failure.
