# Indexes for decision records and work logs

**2026-10-06** — `docs/adr/` and `docs/log/` each got a `README.md` with one line per file, so an agent can find a decision without opening every file. AGENTS.md's "Where work lives" points to both. A new test, `gate/tests/docs-index.test.mjs`, fails when a file is missing from its index or an index links a file that doesn't exist. Quick tier, built in one session (#79). No change to `claude/`, so nothing to install, and no new ADR.

## What the checks showed

- **Tests:** 620 gate tests pass. The new test was seen to fail once each way: a listed file removed, an unlisted file added.
- **QA pair:** the cross passed. `integrity-lens` was clear. `behaviour-lens` found one low finding: the test rejected `./` and `#section` link forms. Fixed in the same branch.
- **Owner:** accepted the work as done. "Changed my decision?" was recorded as no, decided from the session's summary without reading the reports. That raises a question for the first periodic review: what the measure means when the owner decides from a summary.

## Record

Comments on mephistopheles4/the-pact#79:

- `6020533176` — the cross section with both lens reports, verbatim.
- `6020533502` — the Lens dispositions table.
