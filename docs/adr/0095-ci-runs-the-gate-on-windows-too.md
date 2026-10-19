# CI runs the gate on Windows too

The `gate` workflow has two jobs (#351, T1 of #348). `gate` runs on `ubuntu-24.04` as before. `gate-windows` runs the same two steps, the install dry run against an empty home and the `full` tier, on `windows-2025`, with a 45-minute limit. Both jobs passing on the reviewed head are the Test evidence, and the local Windows `full` run at Test stops. This amends [ADR 0081](0081-ci-runs-the-full-tier.md), which gave CI one job, and [ADR 0041](0041-a-required-ci-check-guards-main.md), which names one required check and gave "Linux only" as a reason.

## What the job is

- **Its steps match the Linux job's:** checkout pinned by SHA with `persist-credentials: false`, setup-node pinned by SHA on Node 24, the dry run, then `full`. Every action is pinned to the same commit as in `gate`, and the lockdown test holds the two equal (#351, F4).
- **Its run steps set `shell: bash`,** Git Bash on the runner, so the exact `env -u NODE_OPTIONS` lines the lockdown test requires run unchanged. pwsh, the runner's default, would not run them.
- **No matrix.** A matrix renames the required check `gate` to `gate (ubuntu-24.04)`, which would leave the required check never reporting. Each job keeps its own id and name.
- **No `if:` and no `continue-on-error`,** as for the Linux job (#310).
- **Its dry-run step also makes a real Claude folder** with a plain subfolder in the runner's throwaway home (the owner's q11), as the Linux container's image does, so the installer's guards against a project that is, or sits inside, the real Claude folder run on Windows in CI. Two unreadable-file cases still skip on the runner, whose elevated account reads past a deny on read (q10, q11).
- **Its full step checks its skips** (the owner's q2): it runs `full --skips gate/tests/windows-skips.txt`, and the runner fails a passing run unless it skipped exactly the tests that list names, by test file and name, printing each difference. The list was taken from one local PowerShell `full` run at the PR's head, a comparison and not evidence, and then from the job's own first runs. A new Windows skip is then a reviewed change to the list, and later pull requests need no local Windows run. A line added for a test that guards the installer's link, path or file handling is input validation, so the change matches the sensitive-work list and the skip goes to the owner (F7). A list line out of its shape refuses the run by its line number, so a file named by mistake is never echoed (D6).
- **One concurrency group for the file:** `gate-` and, on a pull request, its ref, else the commit. A newer push to a pull request cancels its older run of both jobs. Each push to `main` is its own group, so no run of this workflow cancels or replaces another on `main`, and every commit on `main` keeps its own result for the full run before an install and for a rollback to read. The group is repo-wide, so a run of another workflow that named it could still cancel one: a cancelled run on `main` is re-run before an install or a rollback reads it (#351, F3).

## The lockdown test

`gate/tests/workflow.test.mjs` now reads each job on its own, through the file's YAML reader, and holds the file to exactly the jobs `gate` and `gate-windows`, each on its pinned runner with a time limit, each running the dry run and `full` in the exact lines, no job on a matrix, `shell: bash` on the Windows job's run steps, every checkout keeping no token, and the concurrency group as written. Since the security pair's read (#351, F1) it also holds the file to an exact allow-list at every level, as `codeql.yml` is held: no `env`, `defaults`, container, services or other key, the triggers exactly as written (F2), four steps in order, checkout's only input `persist-credentials` and setup-node's only `node-version`, the dry-run step's text exactly, `shell` only on the Windows run steps, and each check named for its job id. No other workflow file may define a job or check named `gate-windows`, as for `gate`, and since F4 a trailing comment or a quoted key doesn't hide one. Each check has a bad case seen to fail by name. The problems a job's steps cause now name the job, so the four existing first-job cases expect "gate does not run …" where they expected "does not run …".

## Required on main

- **Two required checks,** `gate` and `gate-windows`, both with GitHub Actions as their expected source, and only `gate.yml` may define either name. The owner adds `gate-windows` to main's ruleset after its first green run on `main`; only the owner edits the ruleset. Until a read of the ruleset shows it, the threat model doesn't call `gate-windows` required; a follow-up docs PR records that read.
- **Rollback:** first the owner removes `gate-windows` from the ruleset's required checks, then the revert merges. In the other order the revert can't merge, since it deletes the job and the required check never reports, and the ruleset has no bypass.

## Test evidence and the push before Test

- **Both CI jobs on the reviewed head are the Test evidence.** The Test record cites both run links and names each run's commit, which must be the head.
- **The push comes before Test,** since CI runs only on a pull request or a push to `main`. Before any push, the session reads every commit it publishes for a secret, a personal detail or this machine's paths and names.
- **When the push waits** (the security pair's findings, q3): when the security pair is due or offered (the sensitive route, a list match or a flag), the branch is squashed to one commit and waits for the owner's answer to the offer and, when the pair runs, for its read; when the diff touches `.github/` or the lockdown test, the push waits for the pair's read or the owner's word, since a pull request runs the branch's own workflows, the CodeQL one with its write token, as soon as it opens (R27). Otherwise the push needs no ask, by the owner's q9 on #348.
- **A declined offer, and a later push** (q7): when the owner declines the pair's offer, the push goes on that answer; a decline that came only by relay stays open, as the pact says. A decline frees only the wait for the offer: a diff that touches `.github/` or the lockdown test still waits for the pair's read or the owner's word on the push itself (q9). The pair's report names the commit it read, and the push publishes exactly that commit; a later push that changes what the pair read waits for its follow-up read or the owner's word.

## Why

- **Nothing ran the suite on Windows before a merge** except a session on the owner's machine, so every Test, install and merge waited on a local Windows run (#348).
- **The repo is public,** so standard hosted runners cost no minutes, and ADR 0041's "Windows runners cost double" no longer applies. The cost is wall time: a pull request waits for the slower job.
- **A required Windows check** blocks a change that breaks Windows even when no one ran it locally.

## Known end of life

- **The image label retires.** GitHub retires a Windows image label in time. When `windows-2025` stops reporting, `gate-windows` never reports and blocks every merge. A spec change moves the label. Until then the label stays pinned, so the image a run uses is the one the lockdown test names.

## What was weighed

- **`windows-latest`.** Not taken: it moves without a change here, so a run's image could differ from the one reviewed.
- **Git Bash or PowerShell for the Windows steps.** Taken for now: Git Bash (`shell: bash`), by the owner's q1, who wasn't sure and asked for it to be recorded as a decision. Why: one set of exact lines across both jobs, which the lockdown test checks in each. The alternative is PowerShell, closer to how the owner installs the pact, since a step's shell sets `PATH` and `HOME` around `node`; it would need its own command lines and a second set of lockdown lines. **Revisit** when a Windows failure in CI doesn't reproduce under the owner's PowerShell, or a failure under the owner's PowerShell doesn't reproduce in CI.

## How this was decided

- **2026-10-19** on #348: spec revision 6, with D2 (`windows-2025`, pinned), D1 (required after its first green run on `main`), D4 (both CI jobs are the Test evidence, the owner's q3, landing with part 1 by q7) and q9 (the push and draft PR before Test). The owner's proceed was relayed by the head chef.
- **2026-10-19** on #351, each relayed by the head chef: no local Git Bash run, the local `full` in Docker instead; q1, `shell: bash` kept; q2, the committed skip list; q3, the security pair's four fixes (the push rule, the allow-list, the concurrency wording, the folder check); q4, the threat-model edits; q5, the push and the probe.
