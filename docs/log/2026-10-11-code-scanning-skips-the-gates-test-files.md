# Code scanning skips the gate's test files

**2026-10-11.** Code scanning moves from CodeQL default setup to a workflow the repo holds, `.github/workflows/codeql.yml`, which leaves the gate's test files out of the analysis (mephistopheles4/the-pact#239, built in #244). The test files plant bad cases on purpose and raised 19 of the 21 alerts that appeared when the repo went public on 2026-10-09. ADR 0058 records the decision.

## What it set out to do

The owner filed #239 from the Security tab: 21 open CodeQL alerts, 19 in `gate/tests/` and 2 in shipped code. The issue preferred a configuration that keeps the test-file alerts from coming back over dismissing them one by one. The spec (revision 3, signed off on 2026-10-11) cut the work into three tickets: this workflow and its guard (#244), the switch from default setup and the cleanup of the 19 (#245), and a private review of the 2 shipped-code alerts (#243).

## What was built

- **The workflow.** Four triggers (push to `main`, pull requests, a weekly schedule, a manual run), a top-level `contents: read`, and one `analyze` job holding `contents: read` and `security-events: write`. The job skips Dependabot's pull requests, runs a matrix of `actions` and `javascript-typescript`, and has three pinned steps: checkout on `gate.yml`'s commit, and `codeql-action` `init` and `analyze` on the v4.38.2 release commit. The inline configuration's only entry is `paths-ignore: gate/tests/*.test.mjs`, and results upload under default setup's categories.
- **The guard.** `gate/tests/workflow.test.mjs` gains an exact allow-list for the CodeQL workflow at every level, with 46 bad cases, and a test that no file outside `gate/tests/` loads a file inside it, with 5 bad cases. Each of those 51 was run against stub checks and seen to fail before its rule existed. One more bad case checks that another workflow asking for `security-events` still fails; its rule is the existing common lockdown. The common lockdown and the `gate.yml` rules are unchanged; any other workflow that asks for `security-events` still fails.
- **The docs.** ADR 0058, this entry, and three accepted risks in `docs/threat-model.md`: R26 (the test files aren't scanned), R27 (a pull request carries its own copy of the workflow and its guard) and R28 (the workflow's token can change alerts on `main`).

## What was decided

- **Advanced setup, after all.** The build's check of GitHub's docs found that default setup can now take a configuration file that excludes paths, through the `github-codeql-config-file` repository property. That property is a custom property, an organization feature; this repo belongs to a personal account, and its custom-property endpoint returns 404. The head chef relayed the owner's choice to proceed as specced, and the ADR records the corrected premise.
- **The bad cases stay in loops.** The spec asked for `table()` rows, but a table needs a gate module with rule ids, and these checks live in the test file. The head chef relayed the owner's choice of the loop form.
- **The v4.38.2 pin.** The newest release, v4.38.3, was three days old. The older one keeps the first pin inside Dependabot's 14-day cooldown, which R28 cites.
- **Two keys beyond the spec's list.** The top-level `name`, as in `gate.yml`, and `fail-fast: false`, so one language's failure can't cancel the other's analysis.

## What comes next

The pull request's own CodeQL run analyses both languages and fails at upload, because default setup is still on; the push to `main` after merge fails the same way. #245 turns default setup off and runs the workflow, with the owner's before-and-after scanned-file counts. The 2 shipped-code alerts are reviewed under #243, and #239 records only their outcomes.

## Record

On #239: the spec's revisions 1, 2 and 3, the first and second rounds of the spec pair, the security pair and `unstated-lens`, the refused first cross posted as a record, the Lens dispositions for both rounds, the owner's sign-off as relayed, and the plan's phase boundary. On #244: the build's stop and the decisions relayed on it, the acceptance claims, and the move-4 reviews with their Lens dispositions.
