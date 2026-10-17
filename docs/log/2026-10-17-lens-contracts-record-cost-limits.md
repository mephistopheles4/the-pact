# The lens contracts record the Cost limits

**2026-10-17.** A follow-up from #289 (T4 of #278). Tier: quick.

## What was built (#304)

- **The contracts.** Each of the eight live lens contracts in `familiars/` gains a minor version, a version row and a dated Decided entry under question 10 for the "Cost limits and trade-offs" section #289 added to its lens file. `adversarial-lens` and `data-lens` gain a second entry for "The security bar, and accepted risks". The issue counted nine; `good-enough-lens` retired in #302, and `scout` has no such section.
- **No generator.** Nothing builds the lens files from the contracts, so the contracts stay a record kept by hand.
- **The cloud copy.** `gen.mjs` was rerun.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/304)
