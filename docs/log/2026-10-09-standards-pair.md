# The standards pair joins move 4

**2026-10-09** — `conventions-lens` and `reader-lens` joined move 4 at the standard and thorough tiers. No reviewer left. This is ticket 6 of #35's spec, revision 7 (mephistopheles4/the-pact#101).

- **`conventions-lens`:** it lists the repo's written rules that apply to the change, quoted with where each is written, and reports each place the change breaks one.
- **`reader-lens`:** it walks each action the next reader must take from the text, and reports where a tell from its catalogue of ten would make them misread or stall.
- **Both read the diff** with `Read`, `Glob` and `Grep` only, on Opus at medium. Where both report overlapping lines, a convention break that also loses the reader shows first. See [ADR 0036](../adr/0036-the-standards-pair-judges-written-rules-and-named-tells.md).
- **Live since the install** of `b7007c5`. The rule probe's real run and the closing periodic review are still to come.

## What it set out to do

#35 splits review into lenses: reviewers that each ask one question from one angle. The QA pair, the spec pair and the security pair are in place. #101 adds the last pair on the roster: one lens for whether the change keeps the repo's written rules, and one for whether the owner can act on the text. Neither lens holds a shell or network tools, or guards the security route or the risk floor, so each is proved by use (AGENTS.md, "Testing a change to an agent or a rule").

## How it was built

- **Contracts first.** The owner gave question 2 for each lens in their own words, and chose Sample A as the target for both. `conventions-lens` judges written rules only, not habits the code shows. `reader-lens` keeps taste out: a carried catalogue of ten tells, and no tell, no finding.
- **Practice cases before any run:** 25 cases, K1 to K13 and R1 to R12, each with a reference report that must score PASS and bad reports that must score FAIL. The replay for `conventions-lens`, K1, is the risk-floor wording drift during #12. The scorer learned `tellOn`, which counts a tell only at the opening of its own finding's bullet, and `notCheckedHas`.
- **One swap commit,** `91fe2f0`. Move 4's gated clause names the pair, a new paragraph says how to dispatch it, and the reading-agents paragraph names the working folder.
- **Move 4 went round twice.** The QA pair, `unstated-lens` and the security pair read the swap, and then the fixes. Neither standards lens read its own arrival.
  - **Round 1** raised 16 findings, none `high`: no rule against quoting a secret, no bound on the folder a lens reads, a rule the change edits checked against its new text, and test gaps. All were fixed or taken in `75fd8d4` and `3528adc`.
  - **Round 2** raised 16 narrower findings. They were fixed in `daa93b1` and `d67e8dc`. One round 1 auto-take, "the standards pair takes no pick", decided something that was the owner's, and was reverted.
  - **At the stop after two rounds,** the owner went on to the dry run.
- **Configurable like every pact lens.** After main brought in #97 (ADR 0027), `8c0e6ae` added both lenses to the renderer's list and the install script's, classed plain. The security pair read that change and the later merge's carry-over into `gate/render-core.mjs` (#155); both were `clear`.

## What the checks showed

- **Reader parity, before the swap.** Seam A passed both files, and js-yaml 4.1.1 and yaml 2.8.3 read each frontmatter alike. The fresh-session check after install is still to come.
- **The rule probe, P-STD.** Its expected result was posted before any run. Control run 66 on the live pact failed as predicted: neither standards lens was dispatched. The real run after install is still to come.
- **Full suite on `b7007c5`:** 51 files, 2073 cases, 0 failures, 10 skips that are Windows platform limits. The no-loss compare passed. `b7007c5` kept two baseline test names that the swap had reworded, since the compare allows no rename.
- **Install.** The owner said "go ahead". `-Apply` from `b7007c5` exited 0, with every file verified. All nine lenses are installed, and no old reviewer is named outside the roster list's defining line and its test.
- **Bad reports.** Every bad report scores FAIL.

## What is still open

- **Reader parity after install:** a fresh session confirms the model and tools Claude Code loaded for both lenses.
- **P-STD's real run,** in the sandbox container (ADR 0015).
- **The closing periodic review** on #35, totals only, over the real lens reviews since the install.
- **`behaviour-lens` F1 from round 1:** neither lens has a practice case from real use. The first real standards review supplies one.
- **grimoire#227:** the head-chef relay script refused every command in the finishing session, so milestone reports went to the lead by message only.

## Record

Issue comments on mephistopheles4/the-pact#101:

- `6052370086`, `6054282378` — build records, checkpoints 0 and 1: the plan, the owner's contract answers, the cases and the swap.
- `6052486697` — P-STD's expected result, before any run.
- `6053889589` — P-STD control run 66.
- `6056204630`, `6056204940`, `6056291499`, `6056291816` — move 4 on the swap: the security pair, `unstated-lens`, the QA pair, and the claim list.
- `6056521205` — Lens dispositions for round 1.
- `6056779395`, `6056779735`, `6056780118` — round 2 on the fixes: the QA pair, the security pair, and the claim list.
- `6056993205` — Lens dispositions for round 2, and the stop after two rounds.
- `6059366098` — the owner's pick for round 1.
- `6062483822` — the first merge with main, and the security pair on `8c0e6ae`.
- `6080974517`, `6080976372` — the second merge, and the security pair on its integration change, with its dispositions.
- `6081164783` — the full suite, the no-loss compare and the dry run.
- `6081198909`, `6081205360`, `6081232113` — the install, the phase-end, and the filled disposition columns.
- Still to come: reader parity after install, P-STD's real run, and the closing periodic review on #35.
