# The spec pair and unstated-lens replace the plan reviewer

**2026-10-07** — `executability-lens`, `good-enough-lens` and `unstated-lens` replaced the plan reviewer in one direct swap. This is ticket 4 of #35's spec, revision 7 (mephistopheles4/the-pact#99).

- **The spec pair:** `executability-lens` asks whether the spec can be built and run as written. `good-enough-lens` asks what could be cut or deferred. They read every thorough spec at move 2, as a tension pair: where both call one section, the owner settles it.
- **`unstated-lens`:** it asks what was missed. It reads specs and results at the standard and thorough tiers.
- **The risk-floor block** moved from the plan reviewer to `executability-lens` in the same commit.
- **Live since the install** of `8f52487`. The security set then ran: six of six pass.

## What it set out to do

#35 splits review into lenses: reviewers that each ask one question from one angle. #47 brought in the QA pair. #99 retires the reviewer that read specs. It also had to prove its security-set lenses: each guards the risk floor or the security route, so each gets real runs after install (AGENTS.md, "Testing a change to an agent or a rule").

## How it was built

- **Contracts first.** Each lens's contract was drafted with every rule of the outgoing reviewer marked kept, moved or dropped, with a reason. Question 2 is in the owner's words:
  - `executability-lens`: "make sure that the program actually executes from end to end as [specified]" on the target environment. Read at spec time, by the owner's choice. See [ADR 0021](../adr/0021-executability-is-judged-at-spec-time.md).
  - `good-enough-lens`: "the lens that we use when we are over engineering ... compare likelihood and impact".
  - `unstated-lens`: "it checks for what we missed".
- **Targets from best practice.** The owner had no samples and asked for best practice. Each target is Sample A: ARID's drafted steps, a likelihood-and-impact table after YAGNI's costs, and a requirements traceability matrix. Each stays an open question until use.
- **Practice cases before any run.** There are 35 cases, each with a reference report that must score PASS and bad reports that must score FAIL. The scorer, `gate/tests/practice-score.mjs`, learned:
  - the spec point, and a lens scored alone;
  - the spec pair's extra banned headline words;
  - three new rules.

  A new test holds every scored phrase to the lens text, word for word: the lesson of #81.
- **One swap commit,** `f91def4`. Move 4 then ran on it, read by the QA pair, `security-reviewer`, and the outgoing reviewer reading the diff as text.
- **Four rounds on the sign cases.** The QA pair and `security-reviewer` found that a sign case could pass a lens that missed its planted sign. After two stops, the owner chose to drop the "quiet sections" rule and score the sign inside its own finding. See [ADR 0022](../adr/0022-a-sign-case-scores-the-sign-in-its-own-finding.md). Round 4 found nothing blocking.
- **Main merged before install,** including #108's eight apply-guard ask rules. The dry run showed none removed.

## What the checks showed

- **Reader parity.** It held before the swap: seam A, js-yaml and yaml read each lens file alike. After install, a fresh session listed each lens with Read, Glob and Grep, and the live hashes equal the repo's. The model Claude Code loads is not shown, so the model rests on the frontmatter.
- **Install.** The owner said "install". `-Apply` from `8f52487` exited 0, with every file verified.
- **P-SPEC, the rule probe of the gated move-4 clause.**
  - **Control, run 47:** on the live pact before install, it failed results 1 and 5, as planned: no `unstated-lens`.
  - **Real run, run 48:** after install, results 1 to 5 and 7 held.
  - **Result 6:** showing the cross section failed in both runs, as it did in #47's probe. The owner chose "count it". Result 6 became its own issue, #117.
- **The security set:** six of six pass. Each run was interactive, in a fresh session in the sandbox container, with the lens on Opus. Its expected result was committed before any run.
  - **49 (E4):** an unannounced `-Apply` scored `sign 3`.
  - **50 (E6):** security work with no security read scored `sign 5`.
  - **51 (E7):** an auth change on the standard tier scored `sign 6`.
  - **52 (E8):** a spec with no Needs a human section was caught.
  - **53 (G1):** input validation offered for deferral was marked "risk floor: not deferrable", with no finding on it.
  - **54 (U1):** an off-route listener drew a security-route question.
- **Tooling.** A run script, `C:\Users\mephi\scratch\run-secset.ps1` (local), set each run up and cleared it after. Each run was still interactive, as the probe rule requires.

## The periodic review

It closed the ticket on #35, totals only, over 12 real lens reviews from the four repos the owner named:

- **The QA pair:** `behaviour-lens` had 23 findings with 2 dismissed, and `integrity-lens` 55 with 4 dismissed.
- **`unstated-lens`:** 1 real report.
- **The spec pair:** no real use yet.
- **Escapes and auto-takes:** one confirmed escape, and 73 auto-takes, none reversed.
- **Signals:** none fired.

The owner kept all five lenses, unchanged ("yup agreed"): "we have to build tacit knowledge together and encode it, thats why we need empirical testing, trial and errors."

## What is still open

- **#115:** AGENTS.md and ADR 0018 still route a protected-set change to "the plan review", whose reviewer this swap retired.
- **#117:** with no tracker, sessions point at the cross section's file instead of showing it.
- **The targets:** each is an open question until real spec reviews show it works.

## Record

Issue comments on mephistopheles4/the-pact#99:

- `6026781219` — what #47's periodic review means for this ticket.
- `6026988971`, `6027448589`, `6035589998` — build record, checkpoints 1 to 3: contracts, cases, the owner's words, the go and the swap.
- `6027389546`, `6027398783` — P-SPEC's expected result, before any run, and its correction.
- `6035776229` — move 4, the QA pair through the cross script.
- `6035860739`, `6035861023` — verbatim: the outgoing reviewer and `security-reviewer` on the swap.
- `6035861281` — the owner's pick, C2, a match.
- `6035966625` — Lens dispositions for move 4.
- `6036068766`, `6036403325`, `6036659730` — verbatim: `security-reviewer`, rounds 2 to 4.
- `6036070433`, `6036403609` — the two stops, and the owner's choices.
- `6036724781` — move 4 converged; Auto-takes.
- `6037033486` — the dry run after merging main with #108.
- `6037088890` — the owner's answers: isolation, dispositions, confirmed rows, #115.
- `6037124374` — the install.
- `6037159532` — reader parity after install.
- `6036348828`, `6037533600`, `6037556061` — P-SPEC's control run, real run, and the owner's "count it".
- `6037628140`, `6037661755`, `6039321690`, `6039414353`, `6039433752`, `6039528342` — the security set, runs 49 to 54, verbatim reports.

Issue comments on mephistopheles4/the-pact#35:

- `6039666370` — the closing periodic review: the measures and the proposals.
- `6039781449` — the owner's decision.
