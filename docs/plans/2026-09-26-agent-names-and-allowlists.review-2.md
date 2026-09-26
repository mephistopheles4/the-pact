# plan-verifier on draft 3 (verbatim)

*Run 2026-09-26 against `2026-09-26-agent-names-and-allowlists.md`, draft 3 (round 2).*

REVISE

Headline: Live delete step says seven files; only six are renamed
Blocker: P2. The rename table changes six filenames: mech-executor, executor, security-executor, plan-verifier, verifier and test-integrity-reviewer. But the swap step says "copy the new files in, then delete the seven old ones". The seventh file with an old-name hit is security-reviewer.md (line 13 names `security-executor`), and its name does not change. So an executor following the step would either stall on the contradiction or delete the live security-reviewer.md, which is the security gate itself. Rollback has the same flaw. It says "delete the new filenames there" after copying back. Check 1 defines nine "new filenames", and three of them (scout, Explore, security-reviewer) are unchanged, so rollback would delete files it just restored. The blast radius line "six agent bodies" also contradicts ":87 18 hits in 7 files" and the repo grep, which finds seven bodies.
Evidence: C:\Users\mephi\WebstormProjects\the-pact\docs\plans\2026-09-26-agent-names-and-allowlists.md:14-24 (six renames), :72 ("delete the seven old ones"), :86 ("six agent bodies"), :87 ("7 files"), :107 (nine new filenames), :123 (Rollback "delete the new filenames there"); C:\Users\mephi\WebstormProjects\the-pact\claude\agents\security-reviewer.md:13 (the seventh body with a hit).
Minimum revision: Add one explicit old-to-new list of the six renamed filenames. Reference it from both the live delete step and Rollback. Correct the body count at :86.
Acceptance check: The swap delete step and Rollback each name exactly six files to delete. Neither list includes scout.md, Explore.md or security-reviewer.md.

Headline: Check 3 needs identical CLAUDE.md copies; they differ beyond names
Blocker: P2. Check 3 requires the live ~/.claude/CLAUDE.md and the repo claude/CLAUDE.md to be identical. Scope authorizes only agent-name edits plus the F8 line in both. The two copies already differ in unrelated text. The repo copy says "That is how gate G36 in stacks got claimed twice." The live copy, as loaded in this session, says "That is how G36 got claimed twice." Applying only the in-scope edits leaves the files different, so check 3 cannot pass. The plan also does not say which copy wins, and this is a strict-contract security-executor build.
Evidence: C:\Users\mephi\WebstormProjects\the-pact\claude\CLAUDE.md:106 versus the live ~/.claude/CLAUDE.md "Assignee is not a claim here" paragraph (read from session context, not from disk); plan C:\Users\mephi\WebstormProjects\the-pact\docs\plans\2026-09-26-agent-names-and-allowlists.md:70 (scope) and :109 (check 3).
Minimum revision: State which copy is the source of truth, for example "the repo copy replaces the live copy". Add that sync to Scope, or relax check 3 to "identical apart from the recorded difference".
Acceptance check: Scope names the source-of-truth copy and the direction of the sync. Check 3 can pass using only in-scope edits.

Round-1 status: both round-1 blockers are closed. The security-review dispositions are recorded (:52-64), and the build routes to security-executor (:127). Check 4 now requires every allowlisted tool and names the fallback (:111, :117).
