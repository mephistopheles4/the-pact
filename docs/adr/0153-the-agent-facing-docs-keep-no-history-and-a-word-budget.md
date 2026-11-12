# The agent-facing docs keep no history and stay within a word budget

The repo's agent-facing docs (the files `gate/tests/doc-budget.test.mjs` lists) say what holds now. How a rule came to be (issue and ADR cites as history, "since X", "was retired", creation dates, dated decision trails) goes on the issue, or in an ADR or a dated log when one is owed, not in them. Each doc stays within a word budget, the smallest multiple of 50 above its size when the budget was set, so adding to a doc means cutting from it; raising a budget is a spec change. A doc that a session must read joins the list when it is added.

#548 cut the history from the docs and added the test. A rule that was stated in more than one doc now has one home: rollback lives in `docs/install.md`, the goal rules in `claude/CLAUDE.md`, the gate's test commands in `AGENTS.md`.

## Why

The docs had grown by accretion: each change added its issue number and a line on what it replaced, so a session read how a rule was reached before what to do. Both are cheaper to find in an ADR or a log, which already hold them. The rules file got the same treatment and a budget in [ADR 0129](0129-the-pact-keeps-only-what-no-other-guardrail-covers.md); a budget is what stops the history coming back.

## What was weighed

- **A test that fails on history phrases.** Not taken: the phrases are many and the cost of a false hit falls on every later edit; a budget is one number and a review reads for the rest.
- **Folding the history into one file in the docs.** Not taken: the ADRs and logs are that file.
- **Leaving rollback in both install docs.** Not taken: a rollback step in two places drifts.

## How this was decided

- **2026-11-12.** The owner asked, in a lead session's chat and relayed into #548, for one cleanup session per repo for this. The reading of what counts as history, the two docs that needed no cut (`docs/agents/domain.md` and `docs/agents/parallel-sessions.md`) added to the budget list and this ADR were the build session's own picks. Built by build-548.
