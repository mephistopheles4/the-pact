# The Claude workflow, on request only

**2026-11-26.** V1 (PACT-101) let two Claude workflows in under an exact allow-list each. The review, `claude-code-review.yml`, then ran on every push to every pull request, cost money on each run, and posted nothing. At the owner's word ("Claude is already an app, shouldn't complicate this"), spec 0006 V2 keeps one workflow, `claude.yml`, run only when someone asks, with caps on each run. The work is on the sensitive route (authentication): the security pair reads the spec and the diff.

## What was built (PACT-113)

- **One workflow.** `claude-code-review.yml` is deleted, so nothing runs on a push or on opening a pull request. `claude.yml` answers `@claude` on an issue, a pull request's conversation, a review or a diff line, and on an issue opened or assigned with `@claude` in it. A run can answer, review (`@claude review`), commit, push and open a pull request. The guard, the triggers, the permissions, the federation IDs and `allowed_bots` are V1's, unchanged. Claude's own GitHub app stays the writer.
- **Caps.** `claude_args` sets `--model claude-sonnet-5-5 --max-turns 60 --max-budget-usd 5`. The job keeps its 30-minute limit, now held exactly, and gains a `concurrency` group per issue or pull request number that never cancels a run in progress.
- **What the action needs for the asks.** `fetch-depth: 0`, so a review's `git diff` finds a merge base. `--allowedTools` adds the inline comment tool and `Bash(gh pr create:*)`, which tag mode lacks.
- **The allow-list** (`gate/tests/workflow.test.mjs`). `claudeProblems` now holds one file. It adds `concurrency` to the job's keys and holds it exactly, holds the time limit at 30, holds `fetch-depth` at `0` and `claude_args` exactly. `folderProblems` refuses a file named `claude-code-review.yml` or `.yaml`, in any case. V1's allow-list for the review file and its bad cases go. Each refusal added or tightened has a bad case: a raised time limit, five concurrency plants, a shallow checkout, nine `claude_args` plants (a wider tool, a merge tool, any `gh` command, a raised or dropped spend cap, a raised turn cap, a dropped model, an added argument, a dropped `claude_args`), and the review file under three names.
- **The threat model.** "Code that runs" counts three workflows and names the Claude job's caps. Its residual line, a short form of spec W5 within the file's 3,050-word cap, says that text a run reads can steer it and the Claude app token it can read up to a merge on `main` (accepted), or leak that token or an Anthropic token publicly, past the run's caps; that a pull request's edited `claude.yml` runs on a review comment with its own steps, the repo's secrets and an Anthropic token, but no app token; and that until the owner pins and scopes the rule, any workflow of the owner's can mint an Anthropic token. V1's line on the unpinned review plugin goes with the review file.
- **Test round 1** (the security pair and the QA pair) found no high. Its fixes: the threat model and W5 now say who a leaked credential reaches, what an edited review-event copy gets, that a pull request body passes no mask, and GitHub's fork rule; W2.8 names debug-off as a rule; C6 and C8 gain the concurrency and fork checks; the tests gain a lowered time limit and the flow-list `pull_request_target` case, and the review-name cases plant a file that passes the common lockdown.

## For the owner

- **The Console steps** are on PACT-113 as a checklist: the CI workspace with a monthly limit and the `workspace:inference` scope, and the rule's pins (the repository ID, the four event names, and `claude.yml` on `main` or, for the two review events, on a pull request's merge ref). The pins can go in before merge; they stop the old review's runs at once.
- **One GitHub step.** Delete the unused `ANTHROPIC_API_KEY` Actions secret, which any workflow on a branch can read. The Claude GitHub app stays on all the owner's repositories; the action's security doc says a run's token is scoped to the one repository it runs in.
- **Accepted after Test round 1:** a steered run can leak its tokens to anyone, past the identity gate and the caps (a pull request body passes no mask); `gh pr create` stays.
- **Accepted after Test round 2:** a workflow a steered run plants on a branch with a review trigger, under any name, runs on anyone's review of that pull request after the run ends, with the repo's secrets and a write `GITHUB_TOKEN` if it asks; and a leaked app token can last up to an hour if the action's best-effort revoke fails.
- **No `execution_file`.** The repo is public and the file holds a run's whole transcript, unredacted, so it is never uploaded. Each run's cost and turns print in its job log.
- **The model:** Sonnet for every run, at the owner's word; the action takes it from the workflow, not from a comment.
- **The session's pick:** the merge-ref arm of the workflow pin, which C8 confirms from the first review-event run.

**Rolling back:** revert the merge. `gh workflow disable claude`, archiving the rule, or a low workspace limit each stops runs at once.

## Record

- The ticket: PACT-113 on Linear. The spec: `docs/spec/0006-claude-workflows-wif.md`, V2 revision 5.
