# Code scanning skips the gate's test files

**2026-10-11.** Code scanning moves from CodeQL default setup to a workflow the repo holds, `.github/workflows/codeql.yml`, which leaves the gate's test files out of the analysis (mephistopheles4/the-pact#239, built in #244). The test files plant bad cases on purpose and raised 19 of the 21 alerts that appeared when the repo went public on 2026-10-09. ADR 0058 records the decision.

## What it set out to do

The owner filed #239 from the Security tab: 21 open CodeQL alerts, 19 in `gate/tests/` and 2 in shipped code. The issue preferred a configuration that keeps the test-file alerts from coming back over dismissing them one by one. The spec (revision 3, signed off on 2026-10-11) cut the work into three tickets: this workflow and its guard (#244), the switch from default setup and the cleanup of the 19 (#245), and a private review of the 2 shipped-code alerts (#243).

## What was built

- **The workflow.** Four triggers (push to `main`, pull requests, a weekly schedule, a manual run), a top-level `contents: read`, and one `analyze` job holding `contents: read` and `security-events: write`. The job skips Dependabot's pull requests, whoever pushed to them last, runs a matrix of `actions` and `javascript-typescript`, and has three pinned steps: checkout on `gate.yml`'s commit, and `codeql-action` `init` and `analyze` on the v4.38.2 release commit. The inline configuration's only entry is `paths-ignore: gate/tests/*.test.mjs`, and results upload under default setup's categories. Its header says never to re-run it with debug logging while a shipped-code alert is open.
- **The guard.** `gate/tests/workflow.test.mjs` gains an exact allow-list for the CodeQL workflow at every level, with 57 bad cases, and a test that no file outside `gate/tests/` loads a file inside it, with 8 bad cases, a floor on the file listing, and a control that the words in a comment, a string or a pattern are not a load. The premise test reads code tokens, through the table module's tokenizer, which it now exports. The first 51 bad cases were seen to fail against stub checks; the 14 added at move 4 were each seen to fail with only their own rule deleted. One more bad case checks that another workflow asking for `security-events` still fails; its rule is the existing common lockdown, which is unchanged, like the `gate.yml` rules.
- **The docs.** ADR 0058, this entry, and three accepted risks in `docs/threat-model.md`, in a new section on code scanning: R26 (the test files aren't scanned), R27 (a pull request from a branch here runs its own copy of the workflow, with the write token, before review) and R28 (the workflow's token can change alerts on `main`).

## What was decided

- **Advanced setup, after all.** The build's check of GitHub's docs found that default setup can now take a configuration file that excludes paths, through the `github-codeql-config-file` repository property. That property is a custom property, an organization feature; this repo belongs to a personal account, and its custom-property endpoint returns 404. The head chef relayed the owner's choice to proceed as specced, and the ADR records the corrected premise.
- **The bad cases stay in loops.** The spec asked for `table()` rows, but a table needs a gate module with rule ids, and these checks live in the test file. The head chef relayed the owner's choice of the loop form.
- **The v4.38.2 pin.** The newest release, v4.38.3, was three days old. The older one had already cleared Dependabot's 14-day cooldown, which R28 cites.
- **Two keys beyond the spec's list.** The top-level `name`, held to `codeql`, and `fail-fast: false`, so one language's failure can't cancel the other's analysis.
- **Move 4's findings were taken.** The Dependabot skip now checks the pull request's author as well as the run's actor, because another account's push to a Dependabot branch starts a run under that account. The premise test now catches a load by a template with a substitution, a computed `require` and `createRequire`. R27 now says the first run of an edited workflow comes before review. The debug re-run rule is written where a person will see it.

## What comes next

Until #245 turns default setup off, GitHub refuses this workflow's uploads. So its two jobs fail at the upload on every pull request (#243's fix included), on the push to `main` after the merge, and on the weekly run. Only the `gate` check is required, so none of these blocks a merge. #245 then runs the workflow once by hand and compares the owner's scanned-file counts from before and after the switch. The 2 shipped-code alerts are reviewed under #243, and #239 records only their outcomes.

## Record

- The spec, revisions 1 to 3, the last signed off: mephistopheles4/the-pact#239 (comments 6111353258, 6111520855, 6111622682).
- Its reviews: round 1, the security pair (6111475788), the spec pair (6111475978), `unstated-lens` (6111476174) and the refused first cross, as a record (6111476459); round 2, the security pair (6111587409) and the spec pair (6111596534).
- Its Lens dispositions: 6111521021 and 6111622864.
- The owner's sign-off, as relayed: 6111701377. The plan's phase boundary: 6111732937.
- The build ticket, #244: the stop on the docs check and the loop form (6111790749), the pre-write checks (6112205556), and the acceptance claims (6111945238).
- Move 4's reports on #244: the standards pair (6112205787), `unstated-lens` (6112206021), the security pair, whose cross refused one headline (6112206193), and `integrity-lens` (6112206355). `behaviour-lens`'s report is held in the private advisory.
- Move 4's Lens dispositions on #244: 6112207826.
- The PR: #251, with its CodeQL run's step outcomes (comment 6111955701).
