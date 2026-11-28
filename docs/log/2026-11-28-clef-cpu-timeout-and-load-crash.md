# Clef's CPU timeout and the load-crash line

**2026-11-28.** PACT-93, the third ticket of [spec 0005](../spec/0005-clef-everywhere.md): U8 and U18. No spec round of its own: the ticket is cut from that spec.

## What was built

- **The forward timeout** is 180 s on a CPU backend and 60 s on a GPU.
- **A load crash** is recorded in `run.fail` with its stage and code, and `ensure` and `status` say a fixed line.
- **The size of the server build** in the `clef` tool's description, on the installer's WARN line and the Scriptorium page, reads about 12 to 38 MB, the range of the pins. [Spec 0002](../spec/0002-clef-runner.md) keeps the figure it was written with.

## What was removed before the merge

The ticket also built an end-to-end check with the real server: a workflow of its own with five CPU jobs, the script each job ran, its tests, its allow-list in `gate/tests/workflow.test.mjs`, a Test evidence rule and a decision record. The owner's words, relayed by the lead: "no jobs at all.... we already run a ci job, why do we need another???" All of it went, spec 0005 was amended to match, and no existing job changed. So no CI job runs the real server: the gate checks Clef with a stub.

It also built a public issue form for field reports, with its test, a "Field reports" section in `docs/clef.md` and a pointer to that section in the load-crash line. The owner's words, relayed by the lead: "a field report gives nothing to act on". All of it went, and spec 0005 was amended to match; the line points at `docs/clef.md`.

## Where the build differs from the spec's words

- **The failure record.** `run.fail` also holds the platform key, so the load-crash line names the build that ended: after a new setup it isn't said of the new one. `status` drops the line once a server is ready.
- **The doc.** U18's line points at `docs/clef.md`, so this change adds the load-crash line and the CPU wait there; the rewrite is the next ticket's.

## Record

- The ticket: [PACT-93](https://linear.app/mephistopheles4/issue/PACT-93/pact-85-t3-clef-end-to-end-in-ci-the-cpu-timeout-and-the-load-crash) on Linear.
- Test round 1 on `62e95db5`, with the four reports verbatim: PACT-93, [comment f1840f8c](https://linear.app/mephistopheles4/issue/PACT-93/pact-85-t3-clef-end-to-end-in-ci-the-cpu-timeout-and-the-load-crash#comment-f1840f8c).
- Test round 2, final, on `59e69295`, with the two reports verbatim: PACT-93, [comment 89ad81f8](https://linear.app/mephistopheles4/issue/PACT-93/pact-85-t3-clef-end-to-end-in-ci-the-cpu-timeout-and-the-load-crash#comment-89ad81f8).
- Test further read on `792c3f64`, the size label, with the two reports verbatim: PACT-93, [comment 0d2eb272](https://linear.app/mephistopheles4/issue/PACT-93/pact-85-t3-clef-end-to-end-in-ci-the-cpu-timeout-and-the-load-crash#comment-0d2eb272).
- The decision to remove the jobs: PACT-93, [comment 0f15e3c9](https://linear.app/mephistopheles4/issue/PACT-93/pact-85-t3-clef-end-to-end-in-ci-the-cpu-timeout-and-the-load-crash#comment-0f15e3c9).
- Test further read on `e9f38ed5`, the removal, with the two reports verbatim: PACT-93, [comment eef31f62](https://linear.app/mephistopheles4/issue/PACT-93/pact-85-t3-clef-end-to-end-in-ci-the-cpu-timeout-and-the-load-crash#comment-eef31f62).
- The decision to remove the field report: PACT-93, [comment 29fb994f](https://linear.app/mephistopheles4/issue/PACT-93/pact-85-t3-clef-end-to-end-in-ci-the-cpu-timeout-and-the-load-crash#comment-29fb994f).
- Test further read on `cce86ec5`, that removal, with the three reports verbatim: PACT-93, [comment 36f2f0d6](https://linear.app/mephistopheles4/issue/PACT-93/pact-85-t3-clef-end-to-end-in-ci-the-cpu-timeout-and-the-load-crash#comment-36f2f0d6).
