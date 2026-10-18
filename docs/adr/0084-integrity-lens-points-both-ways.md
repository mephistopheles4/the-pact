# integrity-lens points both ways

`integrity-lens` asks "can the tests behind the pass actually fail, and does each one earn its place?". Beside its four weakening kinds it reports three more: a test that backs nothing, a duplicate test, and a cover that does not catch. Each finding says whether it points to strengthen or to cut (#276).

## Why

- **Every kind it had pushed the suite one way, bigger.** The Tests added cost caps growth by count; it cannot say which test is excess, and a test that backs no claim passed every review. The minus-one rule handed a change's cuts to the lens, but the lens had no kind that said a cut was covered, so a correct cut read as "deleted".
- **Backing is read from the test's own text, not only from the claim list.** A test backs something when the evidence cites it, its probe catches a broken version for some claim, or its name, a comment above it or the file header names what it backs, such as an invariant, a rule or a regression. Requiring a claim match would flag every invariant and regression test; a stale comment costs the owner a dismissal, and whether the reason is good stays the owner's call.
- **A cover is probed, not trusted.** Naming any test as the cover cannot switch off the lens's top finding: the lens writes the deleted test's broken versions and probes the named test against them.

## What the rules are

- A test that backs nothing and a duplicate test are low and never make the verdict blocking alone. A cover that does not catch is high. Only a test the change adds or edits can be a cut finding.
- A cut finding is a finding, not a trade-off, and spends no cost. The lens file names no cost row and no sensitive list; it stays agnostic of the pact.
- **Security stays with the sorting session.** The review procedure gains one line: a cut finding on a test that guards an item on the sensitive-work list in force is a security finding, its row is never `auto`, and it comes to the owner. The contract's cries-wolf count leaves out a dismissal whose reason is a project rule the lens was not handed, so this repo's never-cut list does not retire the lens.

## What stays

The lens roster, model, effort and tools; the Tests added cost row and its limit; the protected set. Amends [ADR 0057](0057-a-gate-test-names-what-it-backs-and-earns-its-place.md)'s minus-one bullet: a duplicate is judged by the broken versions a test catches, not by its assertions, and `integrity-lens` probes each named cover. Supersedes nothing else; 0057 delivers the "worth having" question it deferred.
