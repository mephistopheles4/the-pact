# CI runs the full tier

The `gate` workflow runs the gate suite's `full` tier, not `fast` (#303). This supersedes the line of [ADR 0041](0041-a-required-ci-check-guards-main.md) that says "It runs `fast`, not `full`: the install tier runs at move 4, on the owner's machine."

## Why

- **Six tests ran nowhere before a merge.** Four in the install-node tests and two in the install-project tests run only on Linux, and they sit in install-tier files. Windows skips them, and CI ran only `fast`, so no run before a merge reached them (measured for #298, 2026-10-17).
- **CI is the container run.** The owner closed #298, a local Linux container, with that reason: the hosted Linux job is where Linux-only tests belong.

## What stays

- The runner's cap of four files at once ([ADR 0029](0029-the-gate-suite-runs-capped-on-the-current-node-lts.md)), and every part of the workflow's lockdown in ADR 0041.
- The lockdown test now requires the step to run `full`, and shows it catching a workflow that runs `fast` or drops the step.

## What was weighed

- **A second step for the install tier alone.** Not taken: the runner has no install-only tier, and `full` is one step with one result line.
