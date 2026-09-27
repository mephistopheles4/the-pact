# plan-reviewer, round 1 — verbatim

Reviewed: `2026-09-27-adr-and-log.md`, draft 2 (`c115eee`). 2026-09-27.

```text
REVISE

Headline: A5 fails on a pre-existing link to a lazily-created file
Blocker: A5 requires every relative link in `docs/`, `AGENTS.md` and `README.md` to resolve to a file in the tree. `AGENTS.md` already links `CONTEXT.md` twice, and that file does not exist. `docs/agents/domain.md` says `CONTEXT.md` is created lazily, so its absence is intended. The link at line 62 sits in "Domain docs", outside the two sections D8 lets the builder edit. As written, A5 cannot pass unless the builder goes beyond the plan's scope.
Evidence: AGENTS.md:33 and AGENTS.md:62 link `CONTEXT.md`. The root file listing has no `CONTEXT.md`. docs/agents/domain.md:11 ("created lazily"). Plan lines 102 (D8 scope) and 136 (A5).
Minimum revision: Scope A5 to links this work adds or changes, or name declared-lazy targets (`CONTEXT.md`) as exempt.
Acceptance check: A5's wording excludes the `CONTEXT.md` links, or limits itself to links changed by this work. A check run on the build commit can then pass without editing "Domain docs".

Headline: Final state after step 6 has no acceptance check
Blocker: D5 lists this work's own log entry, `2026-09-27-adr-and-log.md`. The Order section has the main session write it at step 6, after `result-checker` has run at step 5. The same step deletes this plan and its reviews, then fast-forwards `main`.
- **A2 at step 5.** A2 fails because the D5 entry does not exist yet, or it is quietly judged against a partial list.
- **A3 describes the wrong state.** It describes the step-5 tree, not the end state, where `docs/plans/` should track nothing.
- **Nothing re-checks the last commit.** After step 6, nobody re-runs A2, A4 or A5.
- **The riskiest file gets no privacy search.** The final log narrates the coherence check against the private research, so it is the entry most likely to leak. It gets no A4 search and no owner privacy read before `main` moves.
- **A link breaks at the end.** Deleting the last plan also breaks the `docs/plans/` link at `AGENTS.md:29`, unless D8 removes it.
- **The main session does the writing.** Step 6 is a write in the main session. `claude/CLAUDE.md:62` routes non-trivial work away from the main session, and the plan does not justify the exception.
Evidence: Plan line 65 (D5 entry), 127 (step 6), 131-137 (acceptance defined only for the step-5 state), 114 (owner privacy read tied to step 5 only). AGENTS.md:29. claude/CLAUDE.md:62.
Minimum revision: Add end-state acceptance that runs after step 6 and before the fast-forward:
- **A2** covers the final log.
- **A3 end state:** `docs/plans/` tracks nothing.
- **A4 and A5** re-run on the final tree.
- **Owner privacy read** of the final log entry.
Also, either route the final log to a builder, or state why the main session writes it.
Acceptance check: The plan names a check step after step 6 that lists A2, end-state A3, A4 and A5, plus an owner privacy read of the final log. The fast-forward is conditional on that step.

Headline: Plan never bars checkers from opening or quoting private terms
Blocker: A4 depends on the private term list in the gitignored `.private.md` file. The plan keeps review and checker findings verbatim in committed files, and the owner has refused any history rewrite, so a leak into a committed findings file becomes permanent once the repo is pushed. Line 114 implies the main session runs A4, but never says so. Nothing stops the builder or `result-checker` from opening the `.private.md` file, or from naming its terms in output that gets committed verbatim. There is also an evidence gap. The builder must read the 2026-09-26 plan, which carries the research folder name, to write its log. Nothing confirms that the private term list includes that name, so A4 might not catch it being copied forward.
Evidence: Plan line 21 (verbatim findings kept in a file), 115 (no history rewrite; the folder name appears in the plan added by `3828f29`), 114 (A4 run implied, not assigned), 134 (A4). claude/CLAUDE.md:79 (`result-checker` findings kept verbatim). Gap: this review did not open the `.private.md` file, per instruction, so whether the term list covers the folder name is unverified.
Minimum revision:
- **Who runs A4.** State that only the main session opens the `.private.md` file and runs A4.
- **Instructions to the other agents.** Tell the builder and `result-checker` not to open it, and not to name its terms in any output.
- **Coverage.** Confirm the private term list includes the research folder name.
Acceptance check: The plan text assigns A4 and private-file access to the main session alone. The builder and `result-checker` dispatch instructions contain the prohibition. The main session reports, without quoting the term, that the term list covers the research folder name.
```
