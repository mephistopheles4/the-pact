# The pact keeps only what no other guardrail covers

Amends [ADR 0056](0056-the-rules-keep-only-what-judgment-and-the-harness-cannot-cover.md): its keep that proposes a fresh session past about half the window is cut.

A rule stays in the rules file only if its reason names a gap that no other guardrail covers: not Claude Code's harness, and not the pact's own threat model, poster, cleaner, gate or hooks. A rule the threat model names as one of its controls never counts as covered by it: the threat model relies on it. `docs/rule-reasons.md` holds each rule's reason, one row per rule, and `gate/tests/rule-budget.test.mjs` holds the table and the rules file one to one. The same test holds the rules file, rendered from the default configuration with both pact tools on, and each agent file to a word budget. Each budget is the smallest multiple of 50 above the file's size after the #450 cuts, so adding a rule means cutting one; raising a budget is a spec change.

The scan behind it (#450) cut the read-only line from five lenses and from `scout`, which the tools list already holds, and the "past half the context window" hand-off, which worked against Claude Code's own compaction. It kept, and named, the lines that overlap the harness but cover a gap of their own: the cleaner's "never remove a worktree another way" (R63), "Stop and ask me" (R23 to R25), the sign-in sentence's stop, and the two security lenses' read-only lines. The same change adds the threat-model revision to Cost limits. A session proposes one each month after its `Last revised:` line, or after ten accepted risks; a future-dated line counts as none, and a change other than a revision that writes it is a finding. A decline counts when the owner gives it in chat, and is noted with its date. A fold, a drop or a re-read keeps each entry's label, date, source, any part marked not accepted and what it says is left unguarded; drops rest on the scope as it stood before the revision; a risk the re-read finds grown is raised in full. Scope and accepted-risk edits follow Accepted risks, or the project's own rule.

## Why

A line that restates the harness costs words in every session, and where it disagrees with the harness it confuses the auto-mode classifier. The owner asked for the scan after grimoire did the same for head-chef, then asked that the text not grow back: a budget, and a reason for every rule that overlaps no other guardrail. The revision stands in for the owner's word that #443 removes from accepted risks: nothing else re-reads an accepted risk once it is recorded.

## What was weighed

- **Reasons as comments beside each rule, stripped by the renderer.** Not taken: the renderer and the builder would both change, for text no session loads. A docs table, held in step by a test, costs no session a word.
- **"A little under the size after your cuts".** Read literally, the budget would fail CI on the day it lands. The budget sits just above the size after the cuts instead; the cuts make the headroom.
- **The security lenses' read-only lines.** Kept: in `data-lens` the sentence runs into a carried rule on the protected set, and in `adversarial-lens` the fetch-for-evidence limit is a promise, not a tools-list check.
- **The revision bringing every fold and drop to the owner.** Not taken: the owner asked to cut the decision fatigue around accepted risks. The fold sentence guards what the record says instead, and a scope edit follows the rule in force, which still brings it to the owner.

## Notes, not built

- Tests pin outcomes, not phrases: a test that pins a rule's words makes a cut sticky.
- Rerun the scan on each Claude Code release; a release can take over a rule.
- `claude/review.md` and the agents have no reasons table yet. The agents' reasons live in their contracts' "Held by" lines.

## How this was decided

- **2026-10-31.** The owner asked for the scan in a lead session's chat, relayed by the headchef into #450, and widened it with the budget, the reasons and the no-overlap test (decision 441 and the owner's words, relayed), and with the periodic revision (decision 451, the owner's words, relayed). The reasons' home, the scope split with #443, the budget reading, the revision's guards, the security pair's read at Test and the spec go on revision 3 were the lead's own picks under the owner's level-3 command (decisions 450, 452, 457, 461 and 463), not the owner's words. At Test, the lead's picks widened the revision rule from the security pair's and the standards pair's findings, and raised the rules-file budget to 4,000 as a spec change (decisions 488 and 491). Built by do-450.
