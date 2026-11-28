# Clef runs end to end in CI

**2026-11-28.** PACT-93, the third ticket of [spec 0005](../spec/0005-clef-everywhere.md): U7, U8 and U18. Sensitive route, as the spec sets it. No spec round of its own: the ticket is cut from that spec.

## What was built

- **The workflow,** `.github/workflows/clef-e2e.yml`: five CPU jobs, filtered by path, held to an exact allow-list by `gate/tests/workflow.test.mjs`.
- **The script,** `gate/tests/clef-e2e.mjs`, which each job runs, and `gate/tests/clef-e2e.test.mjs`, which shows each of its checks failing on a bad case.
- **The forward timeout** is 180 s on a CPU backend and 60 s on a GPU.
- **A load crash** is recorded in `run.fail` with its stage and code, and `ensure` and `status` say a fixed line.
- **The field-report form,** `.github/ISSUE_TEMPLATE/clef-field-report.yml`.
- **The Test evidence rule** in `AGENTS.md`, with [ADR 0179](../adr/0179-a-change-to-clef-is-tested-with-the-real-server-on-five-runners.md).
- **The threat model's** two workflow-lockdown lines count the new workflow. No control changes.

## Where the build differs from the spec's words

- **The token.** U7 and U18 name `run.json`'s token; `run.json` holds none. The script's writer guards the `run` id and `run.key`'s value.
- **The throwaway home.** U7 names `pact/config.json` and `pact/tools/clef.mjs`; they are under `.pact/` in the home, where the install now reads and writes.
- **The apply command.** The script reads the commit and the rendered hash from the printed line and runs the installer with them, with no shell between.
- **The doc.** U18's line points at `docs/clef.md`, Field reports, so this change adds that section and the CPU wait; the rewrite is the next ticket's.

## Record

- The ticket: PACT-93 on Linear. The pull request holds the Test review.
