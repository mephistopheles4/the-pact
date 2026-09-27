# plan-reviewer, round 2 — verbatim

Reviewed: `2026-09-27-resume-and-handoff.md`, draft 4 (`7ea2865`). 2026-09-27.

```text
REVISE

Headline: A4 probe record would commit handover notes to repo
Blocker: P2. AGENTS.md requires every probe run to be recorded in `docs/plans/` with the agent's report verbatim, and the repo will be public. The A4 test run is designed so that report ends with the four handover-note headings. That conflicts with this plan's non-goal ("Notes are never committed … in any project") and with E1's "Never save them in a repository". The plan does not say which rule wins, so the main session meets the conflict at run time. The **Touched** heading will likely hold absolute home-directory paths. Home paths in committed files are why security round 1 was kept out of git.
Evidence: docs/plans/2026-09-27-resume-and-handoff.md:20 (non-goal), :102-103 (E1 "never save them in a repository"), :186-188 (A4 test expects all four headings), :7 and :172 (home paths kept out of committed files); AGENTS.md:43-46 and :57 (records committed in docs/plans/, report verbatim); README.md:29 (repo will be public)
Minimum revision: State how the A4 record handles the notes in the test run's report. For example, record which headings are present and redact their content. Or name an owner-approved exception with its privacy check.
Acceptance check: A4, or the probe record rule in the plan, says what the committed record contains for the handover-note headings. That text does not contradict the non-goal at :20 or E1.

Headline: Tainted-notes control cannot work for a later session
Blocker: P2. R3's fix is marked "Fixed". It rests on the main session asking the owner before quoting notes from a builder that read untrusted content. But the saved file keeps only the four headings, and nothing records whether the writing builder read untrusted content. E2 does not ask builders to state it. The Intent and D3 name a later session as a reuse case. There the provenance is gone, so the main session cannot tell tainted notes from clean ones. Even in the same session it sees only the final message. The claimed security disposition therefore cannot be carried out as written. Only `builder` has web tools, so this gap sits on the web-derived path that R3 targeted.
Evidence: docs/plans/2026-09-27-resume-and-handoff.md:15 (later session as reuse case), :57 and :99 (save only the four headings), :61 and :104-107 (ask before quoting tainted notes), :115 (E2 asks for no provenance statement), :161 (R3 marked Fixed); claude/agents/builder.md:6 (WebFetch, WebSearch, browser tools)
Minimum revision: Record provenance with the saved notes. For example, E2 requires a one-line statement on untrusted or web content read, and E1 saves it with the headings. Or set a default in D3 and E1: notes of unknown provenance, or from `builder`, count as tainted.
Acceptance check: E1 and E2's quoted text either carry a provenance statement that is saved with the notes, or state the tainted-by-default rule. D3's reuse bullets match that text.

Round-1 blockers are closed:
- **Verbatim leak.** Closed. Notes stay local, E2 has the writer-side test, and D4/E1 and the unhappy paths cover the keeper.
- **Rollback install rules.** Closed at plan :205.
- **A4 dead-ends.** Closed by the stops at :213-214.
- **"Hand-off" meaning.** Closed. The report is renamed "handover notes", A1 checks the term, and E1's only use of "hand-off" is in the gate's meaning.

Files reviewed (repo-relative): docs/plans/2026-09-27-resume-and-handoff.md, docs/plans/2026-09-27-resume-and-handoff.review-1.md, docs/plans/2026-09-27-resume-and-handoff.security-review-2.md, claude/CLAUDE.md, claude/agents/spec-builder.md, claude/agents/builder.md and security-builder.md (lines 6, 21 and 23 via grep), AGENTS.md, README.md, .gitignore, docs/adr/0008-throwaway-after-two-paper-rounds.md.
```
