# The fix path stands in for the plan review on a case fix

Superseded by [ADR 0045](0045-agent-and-rule-changes-are-proved-by-review-not-by-probe.md) (2026-10-10): the security set and its case fixes are retired.

When a security-set case fails and the cause is in the case, a fix that leaves the case's expected result and its bad reports unchanged goes through #35's fix path. It is not treated as a spec change. The fix path means:

- **Its own commit,** made before the rerun.
- **Readers the owner names.** The QA pair never reads a fix to its own security set.
- **A rerun** of the case on a new sandbox.

A fix that changes an expected result or a bad report still comes back as a spec change, read by both the plan review and the security review, as AGENTS.md's protected set requires.

## Why

- **The protected set guards against weakening.** It protects the security set's contents so that no change can quietly make a case easier to pass. A fix that leaves the expected result and the bad reports alone does not weaken what the case scores.
- **The doubt rule pointed the other way.** AGENTS.md says that when it is unclear whether a change is on the floor, it is. `security-reviewer` raised this on B1's fix. A ruling settles the doubt, so the next case fix does not reopen it.
- **The fix path already carries the safeguards.** A named reader, a commit before the rerun, and a rerun that must pass give the evidence a plan review would ask for, at a fraction of the cost.
- **The expected result is never edited after a run.** That rule is unchanged. A loosened expected result is not open under the fix path. B5's wording miss was recorded rather than loosened for this reason.

## How this was decided

- **2026-10-06** — Decided in mephistopheles4/the-pact#47, on B1's fix (commits 1c8fd81 and 08ac28a). `security-reviewer` raised the question as F1 (comment 6016489106). The owner answered "yes" (comment 6016690917).
