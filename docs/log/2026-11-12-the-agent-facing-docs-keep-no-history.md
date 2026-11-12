# The agent-facing docs keep no history

#548, standard tier. The lead, holding the owner's goal, asked for the cleanup of provenance: history that crept into the repo's agent-facing docs (issue and ADR cites as history, "since", "was retired", dated trails) when each doc should say what holds now.

The history is cut from `CONTEXT.md`, `AGENTS.md`, `docs/rule-reasons.md`, `docs/reference.md`, `docs/install.md`, `docs/poster.md`, `docs/cleaner.md` and the docs under `docs/agents/`. Every instruction in force stays. Rollback has one home, `docs/install.md#roll-back-to-an-older-version`, in the order the steps run: four checks, the keys and settings to take out at the current commit, then the checkout. The protected-set text in `AGENTS.md` keeps its cites, and "Running the gate's tests" is left to another issue.

`gate/tests/doc-budget.test.mjs` gives each of those docs a word budget and fails a doc one word past it, so adding to one means cutting from it. A budget is the smallest multiple of 50 above the doc's size when it was set; raising one is a spec change. `AGENTS.md` names the rule, and ADR 0153 records why.

No `claude/` file changed, so there is no install.

**Rolling back:** a revert PR; the budgets and the cuts come out together.

## Record

- The ask: https://github.com/mephistopheles4/the-pact/issues/548
- The spec: https://github.com/mephistopheles4/the-pact/issues/548#issuecomment-6822584568
- The mapping: https://github.com/mephistopheles4/the-pact/issues/548#issuecomment-6822796931, with its addendum https://github.com/mephistopheles4/the-pact/issues/548#issuecomment-6823697859
- Test round 1: https://github.com/mephistopheles4/the-pact/issues/548#issuecomment-6823687991
- Test round 2, final: https://github.com/mephistopheles4/the-pact/issues/548#issuecomment-6823690127
