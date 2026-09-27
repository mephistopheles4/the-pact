# result-checker, step 5 — verbatim

Checked: commit `4ed79b7` (builder pass 1) against `2026-09-27-adr-and-log.md`, draft 3. 2026-09-27. The main session ran A4 and A4a on the same content before the commit: both clean.

**Verdict: CONFIRMED.** Commit 4ed79b7 on branch docs/adr-and-log completes step 4 of the plan in docs/plans/2026-09-27-adr-and-log.md. Every step-4 acceptance condition I was asked to check passes. I found no P0–P2 issue. Four advisories follow, all P3 or P4 and none blocking.

I checked the commit itself. The worktree HEAD is 4ed79b7141bf0dd2faa66d9a73219293c4c1be3d and `git status --porcelain` is empty. I did not open any `*.private.md` file or anything outside the worktree, and I did not run A4 or A4a: those belong to the main session.

## Acceptance conditions

| Condition | Evidence | Result |
|---|---|---|
| **A1** | `docs/adr/` holds 0001–0008. They match the D4 rows in order: plain names, allowlists, missing tool reported, the pre-dispatch gate, status line and verbatim relay, root AGENTS.md, only decisions committed, throwaway after two rounds. Each ADR follows D2: the title states the decision, then one paragraph stating it, then "Why", then "How this was decided". None has a "Superseded by" line, which D2 makes optional. ADR 0008 says in bold that `claude/CLAUDE.md` does not offer the throwaway yet, and names follow-up F1. Its "Why" section says the gate plan went five paper rounds for that reason. I confirmed the ADR's "three options" wording against `claude/CLAUDE.md` as it was at f2cee57, when the rounds ran, and against today's copy. Neither mentions a throwaway. | PASS |
| **A2 (step 4)** | The three log entries exist under the D5 names. Each follows D3: a title, then prose on what the work set out to do, what each review round caught, what was built, what the probes showed and what is still open, then a closing **Record** list. All 17 short commit IDs (SHAs) cited in the logs and ADRs resolve with `git cat-file -e`. I checked every Record claim with `git show --stat` and by reading the files. 3828f29 holds the build, the plan at draft 4 (its status line says draft 4), review-1, review-2, security-review-1 and verify-1. d0ae7f1 holds the removal of the two tools this build lacks, the check-4-5 report and the plan edit. f2cee57 holds the plan at draft 6 and reviews 1–5. c0c8179 holds the build and verify-1. 4ef48c8, 71053bd and 507a6ab each hold one stage of the probe file, and 507a6ab has three agent reports. 918eeb3 holds the rule in four agent files and no artefact. eac4fbc and 0266fe5 hold the expected result, then the result. `git log --all` on the old plan files confirms that no earlier drafts were committed. | PASS |
| **A3 (step 4)** | `docs/tests/` is gone. `git ls-files docs/plans` lists only `2026-09-27-adr-and-log.md`, `.review-1.md` and `.review-2.md`. The full-path diff (`git diff --name-only`) deletes every `docs/plans/2026-09-26-*` file, every `docs/plans/2026-09-27-human-in-the-loop-gate*` file and both `docs/tests/` files. | PASS |
| **A5** | I checked links at the commit, not on disk, because Windows file lookups ignore case. For every tracked `docs/**/*.md`, `AGENTS.md` and `README.md` at 4ed79b7, I joined each relative link to its file's folder, removed `#anchor` parts and tested it with `git cat-file -e 4ed79b7:<path>`. That test is case-sensitive, sees only tracked files and also works for folder links. All 36 links resolve except the two `CONTEXT.md` links in AGENTS.md, which A5 exempts. No reference-style links or `href=` links exist. | PASS |
| **A6** | `git diff --name-only 4ed79b7~1 4ed79b7` lists only `AGENTS.md` and paths under `docs/`. Nothing in `claude/` changed. | PASS |
| **D8** | The AGENTS.md diff has two hunks, one in "Where work lives" and one in "Testing a change to an agent or a rule". `docs/plans/` now appears only in code formatting, twice, and the old link is gone. `docs/adr/` and `docs/log/` are linked. Probe records go into the log entry once the work finishes. The rule to commit the expected result before running a probe is kept. The seen-to-fail rule is present ("A probe's pass counts only once the probe has been seen to fail — a control run, or a planted bad case that it catches."). No other section changed. The run-1 sentence became "most likely failed", which keeps the source's hedge. | PASS |
| **Faithfulness** | I compared the ADRs and logs with these files in history: the agent-names plan at 3828f29 and d0ae7f1; its review-1, review-2, security-review-1 and verify-1 at 3828f29; its check-4-5 report at d0ae7f1; the gate plan and reviews 1–5 at f2cee57; verify-1 and the diffs at c0c8179; the missing-tool probe at 0266fe5; the gate probe at 507a6ab; the ADR/log plan's review-1; and CLAUDE.md at 804e25a. The review contents, the owner's calls, the probe setups and results, the "install hashes matched" claim (in the 4ef48c8 header), the deletion of the probe branch (no such branch now exists) and the leftover fork-probe skill all match their sources. The hedges survive: "likely cause, not confirmed" appears in ADR 0005 and the gate log, "most likely" in the gate log and AGENTS.md, and "probably" for the missing ToolSearch. Each ADR's comparison with the owner's private research matches the C2 table, and ADR 0006 correctly makes no such claim. I found no invented facts. The four wording issues are below. | PASS, with advisories |

## Advisories (non-blocking)

**1. ADR 0004 says every review round found a gate over-fire, but round 1 was about the relay.**
- **Priority:** P3. **Confidence:** high.
- **Evidence:** `docs/adr/0004-gate-on-after-dispatch-needs.md`, first bullet under "How this was decided": "Each round found one more routine hand-off the gate blocked". But `git show f2cee57:docs/plans/2026-09-27-human-in-the-loop-gate.review-1.md` is about the missing-status-line relay firing on read-only returns, not the gate.
- **Expected:** wording that covers both, as ADR 0008 and the gate log do ("the relay on every read-only return, then the gate on…").
- **Actual:** it says every round was about the gate.
- **Recheck:** reread that bullet against review-1.

**2. ADR 0006 says root CLAUDE.md holds the import line "and nothing else", but it also holds a heading and an HTML comment.**
- **Priority:** P3. **Confidence:** high.
- **Evidence:** `docs/adr/0006-root-agents-md.md`, opening paragraph. `CLAUDE.md` at 804e25a and at HEAD has a `# CLAUDE.md — the-pact, for Claude Code` heading and an explanatory `<!-- … -->` comment around `@AGENTS.md`.
- **Expected:** for example, "a heading, one `@AGENTS.md` import line and an explanatory comment, and no rules".
- **Actual:** "one `@AGENTS.md` import line and nothing else".
- **Recheck:** compare the ADR sentence with `Get-Content CLAUDE.md`.

**3. The agent-names log says no security finding was a regression, but the review named one new risk from the rename.**
- **Priority:** P4. **Confidence:** medium.
- **Evidence:** `docs/log/2026-09-26-agent-names-and-allowlists.md`, under "Security review (draft 2)": "Every proposed allowlist was narrower than before, so no finding was a regression." The security review at 3828f29 says nothing blocks as a regression and no tool finding makes things worse. It also says "The one new risk is the rename (finding 8)".
- **Expected:** "no tool finding was a regression; the one new risk was the rename (F8)".
- **Actual:** a blanket "no finding".
- **Recheck:** read the security review's "Bottom line" paragraph.

**4. ADRs 0007 and 0008 name the pass-2 log file in code formatting, so A5 will not check it.**
- **Priority:** P4. **Confidence:** high.
- **Evidence:** Both ADRs refer to `docs/log/2026-09-27-adr-and-log.md` in backticks, not as a link. That is correct at step 4, because the file does not exist yet.
- **Expected:** at step 7, those references match the fourth log entry's real filename. Pass 2 could also turn them into links.
- **Actual:** A5 at step 7 would not notice a mismatch, because they are not links.
- **Recheck:** at step 7, run `git ls-files docs/log` and compare with both ADR references.

## Out of scope, not evaluated
- **A4 and A4a** (the private-term search and the ignore check on the private file) belong to the main session, per the plan and the brief.
- **End-state checks** (all four A2 entries, A3-end, and A5 again) belong to step 7.

## Relevant paths
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\docs\plans\2026-09-27-adr-and-log.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\docs\adr\ (0001–0008)
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\docs\log\ (three entries)
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\AGENTS.md
- C:\Users\mephi\WebstormProjects\the-pact\.claude\worktrees\elegant-mayer-18e899\CLAUDE.md
