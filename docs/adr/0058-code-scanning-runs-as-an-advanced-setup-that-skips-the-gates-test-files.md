# Code scanning runs as an advanced setup that skips the gate's test files

The repo went public on 2026-10-09, and CodeQL default setup raised 21 alerts. 19 sit in the gate's test files, `gate/tests/*.test.mjs`. They flag patterns the tests use on purpose, such as a string `replace` that changes only the first match, to plant one bad case. Code scanning now runs from a workflow the repo holds, `.github/workflows/codeql.yml`, whose configuration leaves those test files out of the analysis (#239, built in #244).

## The decision

- **Exclude, don't dismiss.** Dismissing the 19 one by one closes today's alerts, but every new test that plants a bad case the same way raises a new one. Each needs a person to triage it, and a stream of noise trains the owner to dismiss without reading. An exclusion stops the stream at its source.
- **The narrowest pattern.** Only `gate/tests/*.test.mjs` is left out. The test runner, the shared helpers and the fixtures under `gate/tests/` stay in the scan, so an alert there still comes back. GitHub's path rules allow `**` only at the start or end of a pattern, or between slashes, so this single-star pattern is the narrowest one that covers the test files.
- **Same coverage otherwise.** The workflow analyses the same two languages as default setup, `actions` and `javascript-typescript`, with the default query suite and threat model, and uploads under default setup's categories (`/language:<language>`), so its results replace default setup's.

## Why advanced setup

Default setup's settings dialog offers only the languages, the query suite, the runner and, for some languages, the threat model. GitHub's docs also describe a configuration file for default setup, set through the `github-codeql-config-file` repository property, which can exclude paths. That property is a custom property, which an organization defines. This repo belongs to a personal account, and the repository's custom-property endpoint returns 404 for it, so the route isn't open here. The spec assumed default setup takes no configuration at all; the build found the property route, and the head chef relayed the owner's choice to proceed with advanced setup on that evidence (#244).

## Why the configuration is inline

The configuration sits in the workflow's `config` input, not in a separate file. Every file in `.github/workflows/` is already gate code, held by `gate/tests/workflow.test.mjs` and on the security route. A separate file would need its own place in `AGENTS.md`'s list of gate code and its own guard.

## The guard

The common lockdown every workflow keeps allows only `contents: read`. The CodeQL workflow needs `security-events: write` to upload results, so it is held to an exact allow-list of its own: every level holds only the keys the spec names, with the values it sets, and no YAML anchor, alias, merge key or flow mapping. Its checkout is pinned to `gate.yml`'s commit, and `init` and `analyze` to one `codeql-action` release commit. Any other workflow that asks for `security-events` still fails the common lockdown. A second test checks the premise of the exclusion: no file outside `gate/tests/` loads a file inside it, by a static import, a dynamic `import()` or a `require()`.

Two keys go beyond the spec's list, by the build's reading: the top-level `name`, as in `gate.yml`, and `fail-fast: false` on the matrix, so one language's failure can't cancel the other's analysis. The bad cases stay in the file's loop form rather than `table()` rows: a table needs a gate module with rule ids, and these checks live in the test file itself. The head chef relayed the owner's choice of this form (#244).

## Why Dependabot's pull requests are skipped

The job runs only when `github.actor` is not `dependabot[bot]`. A Dependabot pull request that bumps `checkout` or `codeql-action` would otherwise run the new action version with the write token before the owner has read it. With the skip, a new version first runs on the push to `main`, after the owner's review and merge. The cost: a Dependabot pull request shows no code-scanning result. The owner accepted this default at sign-off.

## Accepted risks

Three, recorded in `docs/threat-model.md` as R26 to R28:

- **R26. The test files aren't scanned.** They take no outside input: they read the repo and write temp folders, and CodeQL's JavaScript queries look for untrusted input reaching a sink. This holds only while nothing shipped imports them, which the premise test guards.
- **R27. A pull request that edits the workflow or its guard carries its own copy of both.** The guard catches an accident, not a deliberate edit; the owner's review and merge are the control. That pull request's own code-scanning result is not evidence for it.
- **R28. The workflow's token can read every open alert and change or dismiss alerts on `main`.** Its exposure is bounded by pinned GitHub-owned actions, Dependabot's 14-day cooldown and the Dependabot skip.

## The lighter route, not taken

Dismiss each of the 19 as "used in tests" through the API, with a one-line reason. No workflow, no write permission, and no change to the gate. New alerts in tests would keep arriving. It stays the fallback, and the rollback in #239's spec returns to default setup.

## The two shipped-code alerts

Two of the 21 alerts sit in shipped code. They are reviewed under #243, and #239 records only "reviewed" and each outcome. Their details are held in a private draft security advisory.
