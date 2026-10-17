# The gate lockdown refuses a skip, and the Linux-only tests can't skip on CI

**2026-10-17.** #310 and #311, from the QA pair's review of #303. Tier: quick.

## What was built

- **The lockdown test (#310).** `lockdownProblems` refuses an `if:` or a `continue-on-error` anywhere in the gate workflow, the job and its steps included, with a bad case for each key on the job and on a step, quoted keys and flow mappings included.
- **The Linux-only install tests (#311).** A new test helper, `skipUnlessLinuxCi`, with a test of its own, skips as before off CI but fails the test on Linux when `CI` is set. The root-account and `mkfifo` skips use it; the Windows skips can't fire on Linux and stay as they were.
- **Two tests now assert their titles (#311).** The signal test asserts the runner was staged before the signal; the mode test runs `--apply` on a 0664 settings file, asserts the file was merged, and asserts the mode is kept.

## Decisions

- None lasting; no ADR.

## Record

- [#310](https://github.com/mephistopheles4/the-pact/issues/310)
- [#311](https://github.com/mephistopheles4/the-pact/issues/311)
