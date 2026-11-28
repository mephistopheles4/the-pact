# Clef runs end to end in CI

**2026-11-28.** PACT-93, the third ticket of [spec 0005](../spec/0005-clef-everywhere.md): U7, U8 and U18. The security pair reads the workflow at Test, as the spec asks. No spec round of its own: the ticket is cut from that spec.

## What was built

- **The workflow,** `.github/workflows/clef-e2e.yml`: five CPU jobs, filtered by path, held to an exact allow-list by `gate/tests/workflow.test.mjs`.
- **The script,** `gate/tests/clef-e2e.mjs`, which each job runs, and `gate/tests/clef-e2e.test.mjs`, which shows each of its checks failing on a bad case.
- **The forward timeout** is 180 s on a CPU backend and 60 s on a GPU.
- **A load crash** is recorded in `run.fail` with its stage and code, and `ensure` and `status` say a fixed line.
- **The field-report form,** `.github/ISSUE_TEMPLATE/clef-field-report.yml`.
- **The Test evidence rule** in `AGENTS.md`, with [ADR 0179](../adr/0179-a-change-to-clef-is-tested-with-the-real-server-on-five-runners.md).
- **The threat model's** two workflow-lockdown lines count the new workflow. No control changes.
- **The size of the server build** in the `clef` tool's description, on the installer's WARN line and the Scriptorium page, reads about 12 to 38 MB, the range of the pins. [Spec 0002](../spec/0002-clef-runner.md) keeps the figure it was written with.

## Where the build differs from the spec's words

- **The token.** U7 and U18 name `run.json`'s token; `run.json` holds none. The script's writer guards the `run` id and `run.key`'s value.
- **The throwaway home.** U7 names `pact/config.json` and `pact/tools/clef.mjs`; they are under `.pact/` in the home, where the install now reads and writes.
- **The apply command.** The script reads the commit and the rendered hash from the printed line and runs the installer with them, with no shell between.
- **The failure record.** `run.fail` also holds the platform key, so the load-crash line names the build that ended: after a new setup it isn't said of the new one. `status` drops the line once a server is ready.
- **The doc.** U18's line points at `docs/clef.md`, Field reports, so this change adds that section and the CPU wait; the rewrite is the next ticket's.

## Record

- The ticket: [PACT-93](https://linear.app/mephistopheles4/issue/PACT-93/pact-85-t3-clef-end-to-end-in-ci-the-cpu-timeout-and-the-load-crash) on Linear.
- Test round 1 on `62e95db5`, with the four reports verbatim: PACT-93, [comment f1840f8c](https://linear.app/mephistopheles4/issue/PACT-93/pact-85-t3-clef-end-to-end-in-ci-the-cpu-timeout-and-the-load-crash#comment-f1840f8c).
- Test round 2, final, on `59e69295`, with the two reports verbatim: PACT-93, [comment 89ad81f8](https://linear.app/mephistopheles4/issue/PACT-93/pact-85-t3-clef-end-to-end-in-ci-the-cpu-timeout-and-the-load-crash#comment-89ad81f8).
- Test further read on `792c3f64`, the size label, with the two reports verbatim: PACT-93, [comment 0d2eb272](https://linear.app/mephistopheles4/issue/PACT-93/pact-85-t3-clef-end-to-end-in-ci-the-cpu-timeout-and-the-load-crash#comment-0d2eb272).
