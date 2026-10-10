# A required CI check guards main

A GitHub Actions workflow, `.github/workflows/gate.yml`, runs the gate on every pull request and every push to `main`. A ruleset makes its check, `gate`, required on `main`.

- **What it runs,** on Ubuntu with the current Node LTS:
  - the Node install's dry run against an empty temp home;
  - the gate suite's `fast` tier.
- **How it is locked down:**
  - a read-only token (`permissions: contents: read`);
  - no secrets, and no `pull_request_target`;
  - each action pinned by its full commit SHA, to a release at least two weeks old;
  - the checkout keeps no credentials (`persist-credentials: false`);
  - no artifacts uploaded.
- **Dependabot** proposes action updates, held back 14 days after a release.
- **The ruleset on `main`:**
  - the `gate` check is required, with GitHub Actions as its expected source, so a status posted through the API under the same name doesn't count;
  - branches must be up to date before merging;
  - pull requests only, with no deletion, no force-push and no bypass.
- **Every workflow file is gate code,** and so is `.github/dependabot.yml`. A change to one takes the security route. Every workflow file keeps the same lockdown, and only `gate.yml` may define a job or check named `gate`; `workflow.test.mjs` holds the folder to both.

## Why

- **`main` can't hold a pact that fails its own gate.** Before this, only move 4's convention ran the suite before a merge.
- **A pull request runs the workflow as the pull request has it.** So the check binds only while the workflow file is unchanged. A pull request that edits `gate.yml` must be read as a change to the gate.
- **Linux only.** Windows runners cost double, and the install's Windows paths are tested on the owner's machine.

## Limits

- **The ruleset isn't owner-only against sessions.** Sessions use the owner's GitHub login, so one whose token can manage the repo could edit or disable the ruleset. The ask rules make a `gh` command that names rulesets or branch protection prompt. That is a speed bump, not a lock: a call built at run time gets past it.
- **It doesn't stop a local clone on another branch from installing.** That is the install-time check's job.
- **It runs `fast`, not `full`:** the install tier runs at move 4, on the owner's machine.

## How this was decided

- **2026-10-09:** #153's spec, S11 and D2, signed off in revision 6. Built in #166 (PR #201). The lead turned on the required check at the owner's word.
