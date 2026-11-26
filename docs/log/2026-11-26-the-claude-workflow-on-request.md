# The Claude workflow, on request only

**2026-11-26.** V1 (PACT-101) let two Claude workflows in under an exact allow-list each. The review, `claude-code-review.yml`, then ran on every push to every pull request, cost money on each run, and posted nothing. At the owner's word ("Claude is already an app, shouldn't complicate this"), spec 0006 V2 keeps one workflow, `claude.yml`, run only when someone asks, with caps on each run. The work is on the sensitive route (authentication): the security pair reads the spec and the diff.

## What was built (PACT-113)

- **One workflow.** `claude-code-review.yml` is deleted, so nothing runs on a push or on opening a pull request. `claude.yml` answers `@claude` on an issue, a pull request's conversation, a review or a diff line, and on an issue opened or assigned with `@claude` in it. A run can answer, review (`@claude review`), commit, push and open a pull request. The guard, the triggers, the permissions, the federation IDs and `allowed_bots` are V1's, unchanged. Claude's own GitHub app stays the writer.
- **Caps.** `claude_args` sets `--model claude-opus-5-5 --max-turns 60 --max-budget-usd 5`. The job keeps its 30-minute limit, now held exactly, and gains a `concurrency` group per issue or pull request number that never cancels a run in progress.
- **What the action needs for the asks.** `fetch-depth: 0`, so a review's `git diff` finds a merge base. `--allowedTools` adds the inline comment tool and `Bash(gh pr create:*)`, which tag mode lacks.
- **The allow-list** (`gate/tests/workflow.test.mjs`). `claudeProblems` now holds one file. It adds `concurrency` to the job's keys and holds it exactly, holds the time limit at 30, holds `fetch-depth` at `0` and `claude_args` exactly. `folderProblems` refuses a file named `claude-code-review.yml` or `.yaml`, in any case. V1's allow-list for the review file and its bad cases go. Each refusal added or tightened has a bad case: a raised time limit, five concurrency plants, a shallow checkout, nine `claude_args` plants (a wider tool, a merge tool, any `gh` command, a raised or dropped spend cap, a raised turn cap, a dropped model, an added argument, a dropped `claude_args`), and the review file under three names.
- **The threat model.** "Code that runs" counts three workflows and names the Claude job's caps. The residual line now says plainly that text a run reads can steer it, and the Claude app's token it can read (Workflows write included), as far as a merge on `main` or a leaking commit or post, accepted under the identity gate; that a review or diff-line comment runs the pull request's copy of `claude.yml`, which gets an Anthropic token but no write token; and that until the owner pins the rule, any workflow of the owner's that an allowed actor starts can mint an Anthropic token. V1's line on the unpinned review plugin goes with the review file.

## For the owner

- **The Console steps** are on PACT-113 as a checklist: the CI workspace with a monthly limit and the `workspace:inference` scope, and the rule's pins (the repository ID, the four event names, and `claude.yml` on `main` or, for the two review events, on a pull request's merge ref). The pins can go in before merge; they stop the old review's runs at once.
- **No `execution_file`.** The repo is public and the file holds a run's whole transcript, unredacted, so it is never uploaded. Each run's cost and turns print in its job log.
- **The session's picks:** Opus as the one model; the merge-ref arm of the workflow pin, which C8 confirms from the first review-event run.

**Rolling back:** revert the merge. `gh workflow disable claude`, archiving the rule, or a low workspace limit each stops runs at once.

## Record

- The ticket: PACT-113 on Linear. The spec: `docs/spec/0006-claude-workflows-wif.md`, V2 revision 5.
