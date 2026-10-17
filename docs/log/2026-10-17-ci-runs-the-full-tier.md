# CI runs the full tier

**2026-10-17.** #303, from #298. The `gate` workflow's Linux job runs the gate suite's `full` tier, so the six Linux-only tests in the install-tier files run before every merge. Tier: quick.

## What was built

- **The workflow.** `.github/workflows/gate.yml` runs `run.mjs full` in place of `fast`. Its lockdown, pinned actions and Node 24 are unchanged; the runner's cap of four stays.
- **The lockdown test.** `workflow.test.mjs` requires the step to run `full`, with bad cases for a workflow that runs `fast`, adds an argument, or drops the step.

## Decisions

- [ADR 0081](../adr/0081-ci-runs-the-full-tier.md).

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/303)
