# verifier on the repo-side build (verbatim)

*Run 2026-09-26 against the staged changes for draft 4. Live swap and fresh-session checks not yet run.*

**Verdict: CONFIRMED** for the repo-side slice. I found no P0–P2 issues. Acceptance checks 1, 4 and 5 (the live `~/.claude` swap and the fresh-session probes) are **unevaluated by design**, as the brief asked. That includes whether `mcp__Claude_Browser__*` resolves. I made no changes to git state. `git diff` is empty, so the working tree matches the index.

## Conditions checked

1. **Six renames, via git renames: pass.** `git diff --cached -M --summary` shows exactly six renames:
   - `executor.md` → `builder.md` (69%)
   - `plan-verifier.md` → `plan-reviewer.md` (99%)
   - `verifier.md` → `result-checker.md` (76%)
   - `security-executor.md` → `security-builder.md` (69%)
   - `mech-executor.md` → `spec-builder.md` (86%)
   - `test-integrity-reviewer.md` → `test-reviewer.md` (91%)

   `scout.md`, `Explore.md` and `security-reviewer.md` keep their filenames. `scout.md` and `Explore.md` are unchanged. `security-reviewer.md` is modified in place. `claude/agents/` now holds exactly these nine files.
2. **Each `name:` matches its filename: pass.** I checked all nine.
3. **Allowlists, and model/effort unchanged: pass.**
   - The four `tools:` lines match the plan's Allowlists table token for token:
     - `builder`: 15 entries, ending in `ToolSearch, mcp__Claude_Browser__*`.
     - `spec-builder` and `security-builder`: the same 10 entries each.
     - `result-checker`: 9 entries.
   - No `disallowedTools` remains in any agent file (`Select-String` found nothing).
   - Model and effort match HEAD on all nine files. All are `opus`. Effort is low for scout, Explore and spec-builder. It is medium for builder, plan-reviewer, result-checker and test-reviewer. It is high for security-reviewer and security-builder.
4. **Check 2's grep: pass.** I ran it two ways, excluding `cloud-sessions/` and `docs/plans/`:
   - `git grep --cached -P` over the index returned nothing (exit 1).
   - `Select-String` over the working tree also returned nothing.
   - A case-insensitive search for `verifier|executor` over `README.md` and `claude/` also returned nothing.
   - The cloud scripts still hold 17 hits each, which is out of scope.
5. **`claude/CLAUDE.md`: pass.**
   - Lines 68–69 contain both sentences: "If a named agent is unavailable, stop and report." and "Never substitute another agent, especially for security work."
   - The new names appear in steps 1–3 of "Implementing a change".
   - The diff touches only those lines, with no unrelated edits.
6. **Body cross-references and wording: pass.**
   - Every agent name referenced in a body exists among the nine: `spec-builder`, `security-builder`, `security-reviewer`, `result-checker`.
   - Beyond renames, the only body wording changes are the role nouns the grep forced. For example, "Primary implementation executor" became "Primary implementation builder", and "new verifier session" became "new result-checker session".
   - `security-builder` gains exactly one sentence: "No web tools by design: new advisory data needed mid-build → stop/report."
   - `git diff --cached --check` is clean.
7. **README: pass.** The familiars-by-effort list uses the new names with the effort tiers intact. The "Tool allowlists" bullet is removed from Planned.

## Advisories (non-blocking)

**A1. The README understates how far behind cloud sessions now are.**
- Priority P3. Confidence medium.
- Evidence: `README.md` lines 31–35 list the changes the `cloud-sessions/` copies predate. The list does not mention the renames or the allowlists. Meanwhile, the Planned section drops "Tool allowlists", and the cloud scripts still carry the old names with connector-inheriting config (17 hits each).
- Expected: a reader should learn that cloud sessions keep the old names and full connector access. The plan records this as non-goal F9.
- Actual: a reader could conclude that allowlists now apply everywhere.
- Recheck: see whether the Status list names the renames and allowlists as cloud gaps. The plan's README scope does not require this, so it is optional.

**A2. A README bullet outside the plan's stated scope was renamed.**
- Priority P4. Confidence high.
- Evidence: `README.md` line 35 changed from "the `test-integrity-reviewer` agent" to "the `test-reviewer` agent". The plan's README scope names only the familiars list and the Planned section. The edit is needed for check 2's grep to pass. The cloud scripts contain neither name, so "cloud copies lack this agent" stays true under the new name.
- Expected: no new wording beyond renames.
- Actual: a rename only, and still accurate. Nothing misleading.
- Recheck: none needed.

**A3. The plan and its review files are untracked.**
- Priority P4. Confidence high.
- Evidence: `docs/` is untracked (`??`). The plan's Rollback step says "`git revert` the commit", which would not cover these files.
- Expected: the owner decides whether to commit them. Nothing requires it.
- Actual: they are untracked.
- Recheck: `git status` at commit time.

## Relevant paths
- Plan: `C:\Users\mephi\WebstormProjects\the-pact\docs\plans\2026-09-26-agent-names-and-allowlists.md`
- Agent files: `C:\Users\mephi\WebstormProjects\the-pact\claude\agents\` (nine files)
- Global instructions: `C:\Users\mephi\WebstormProjects\the-pact\claude\CLAUDE.md`
- README: `C:\Users\mephi\WebstormProjects\the-pact\README.md`
