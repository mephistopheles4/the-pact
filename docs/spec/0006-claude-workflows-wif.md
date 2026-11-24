# Spec: the Claude workflows, through Workload Identity Federation — V1

Status: draft on the PACT-101 branch, flagged for the owner's review. The
security pair reads it with the diff at Test (the session's pick, logged on
the issue). The spec counts once it is on `main`.

<!-- toc -->

- [W1 Objective](#w1-objective)
- [W2 Decisions](#w2-decisions)
- [W3 The allow-list (the gate's tests)](#w3-the-allow-list-the-gates-tests)
- [W4 The two files](#w4-the-two-files)
- [W5 Threat model](#w5-threat-model)
- [W6 Out of scope](#w6-out-of-scope)
- [W7 Trade-offs](#w7-trade-offs)
- [W8 Acceptance claims](#w8-acceptance-claims)

<!-- /toc -->

## W1 Objective

The Claude GitHub app's setup adds two workflows: `claude.yml`, which answers
`@claude` on issues, comments and reviews, and `claude-code-review.yml`,
which reviews each pull request. As set up, both read a stored
`ANTHROPIC_API_KEY` secret, ask for more than `contents: read`, pin actions
to tags and leave the token in the checkout, so the lockdown in
`gate/tests/workflow.test.mjs` refuses them. This spec lets the two files in,
with no secret, under an exact allow-list of their own, the way `codeql.yml`
has one.

## W2 Decisions

1. **Authentication is Workload Identity Federation.** Each run trades the
   job's GitHub OIDC token (audience `https://api.anthropic.com`) for a
   short-lived Anthropic token. The workflow files carry the federation rule,
   organization and service account IDs: identifiers, not credentials, written
   in the file so a reader sees which rule a run uses. Neither file sets
   `anthropic_api_key` or `claude_code_oauth_token`; either would take
   precedence over federation.
2. **The rule bounds who gets an Anthropic token, and it lives in the Claude
   Console.** It matches by a CEL condition on the repository owner's account
   ID, the subject prefix, the audience and an allow-list of actor account
   IDs. Nothing in the repo names who is on that list. The rule does not bound
   the GitHub write token: the action gets that through a separate OIDC
   exchange (audience `claude-code-github-action`) that never references the
   rule. Who gets it rests on the job guard, the action's own actor check
   (write access, or `allowed_bots`) and Anthropic's workflow validation
   (vendor behaviour, unverified here).
3. **The job guard is a control.** Each job runs only when the
   triggering author's association is `OWNER`, `MEMBER` or `COLLABORATOR`,
   or the author's login is one of the owner's three agent apps
   (`mephistos-homunculus[bot]`, `mephistos-euphorion[bot]`,
   `mephistos-wagner[bot]`; an owner's decision) (and, for `claude.yml`, the
   text holds `@claude`). The action refuses a bot actor unless `allowed_bots`
   names it, so each file sets `allowed_bots` to exactly those three names,
   without the suffix, which the action strips from both sides, and never `*`. The review job also
   runs only for a pull request whose head is a branch of this repo. A pusher
   can edit the guard on a branch, and the rule still holds for the Anthropic
   token; the write token's other checks are the action's and Anthropic's.
4. **The GitHub token stays read-only.** Each job's `permissions` grant reads
   and `id-token: write`, nothing else. The action's writes (comments,
   branches, reviews) go through the Claude GitHub app's installation token,
   which the action mints from the same OIDC token. `main`'s ruleset, with no
   bypass actor, keeps that token's pushes off `main`.
5. **Pins.** `actions/checkout` is pinned to `gate.yml`'s commit, and
   `anthropics/claude-code-action` to a full commit SHA, both kept current by
   Dependabot. Each checkout sets `persist-credentials: false`.

## W3 The allow-list (the gate's tests)

`workflow.test.mjs` reads `claude.yml` and `claude-code-review.yml` with
their own allow-list instead of the common lockdown. For each file it refuses:

- a top-level key other than `name`, `on`, `permissions` and `jobs`; a name
  other than the file's own;
- triggers other than the file's own, listed in W4, with their event types;
  `pull_request_target` and `workflow_run` in any form;
- top-level `permissions` other than exactly `contents: read`;
- a job other than the file's one job; a job key outside `if`, `runs-on`,
  `timeout-minutes`, `permissions` and `steps`; a runner other than
  `ubuntu-24.04`, or no time limit;
- job permissions other than the file's exact set in W4;
- a job `if` that is not the file's guard, as W4 writes it;
- steps other than `actions/checkout` then `anthropics/claude-code-action`,
  each pinned to a full commit SHA, checkout's pin equal to `gate.yml`'s;
- a checkout input other than `fetch-depth` and `persist-credentials`, or
  `persist-credentials` other than `false`; a step's `with` that is not a map;
- an action input outside the file's list in W4, the federation IDs missing,
  or an ID that is not the file's own exact value (`fdrl_`, a UUID, `svac_`);
  an `allowed_bots` that is not exactly the three apps (never `*`); a guard
  that admits another login;
- any `secrets.`, `github.token`, `github['token']` or `GITHUB_TOKEN`; a `run:` step; an
  `env:` at any level; a YAML anchor, alias, merge key or flow mapping;
  uploading or caching the workspace; a job or check named `gate`,
  `gate-macos` or `gate-windows`.

Every other workflow file keeps the common lockdown, unchanged. Each refusal
has a bad case it is seen to catch, in the style of the CodeQL allow-list's.

## W4 The two files

| | `claude.yml` | `claude-code-review.yml` |
| --- | --- | --- |
| Name | `claude` | `claude-code-review` |
| Triggers | `issue_comment` [created], `pull_request_review_comment` [created], `issues` [opened, assigned], `pull_request_review` [submitted] | `pull_request` [opened, synchronize, ready_for_review, reopened] |
| Job | `claude` | `claude-review` |
| Job permissions | `contents`, `pull-requests`, `issues`, `actions`: read; `id-token: write` | `contents`, `pull-requests`, `issues`: read; `id-token: write` |
| Guard | per event: `@claude` in the text, and the author's association in the list or the author's login one of the three apps | head repo is this repo, and the pull request author's association in the list or the author's login one of the three apps |
| Action inputs | the three federation IDs, `allowed_bots`, `additional_permissions` (`actions: read`) | the three federation IDs, `allowed_bots`, `plugin_marketplaces`, `plugins`, `prompt`, `claude_args` |

The guard text is held exactly, as the files on this branch write it. `actions: read` stays in `claude.yml` so Claude can read CI results on pull requests.

## W5 Threat model

`docs/threat-model.md`'s Code that runs names the two files and their
allow-list beside `codeql.yml`'s. A residual line says what is accepted:

- a run that an allowed actor triggers reads issue, comment and pull request
  text from anyone, and that text can steer what Claude writes through the
  app's token, short of `main`;
- a session holding an agent app's key can start a run that spends Anthropic
  tokens and writes through the Claude app's token, short of `main`;
- the review plugin is fetched from its marketplace at run time, unpinned;
- a comment by an allowed bot that merely contains `@claude` starts a run;
- the rule pins no ref or workflow, so any workflow on any branch of any of
  the owner's repos that an allowed actor starts can mint an Anthropic token;
  the rule bounds who, not what the run does. The service account's scope
  (workspace, role) is the owner's to confirm.

## W6 Out of scope

Inline comment classification (it needs an API key, and is skipped under
federation). A per-collaborator service account. Running the workflows in
other repos; the rule already covers them, and each repo brings its own files.

## W7 Trade-offs

Reach against convenience: the action keeps the app's write token, which
`@claude` needs to act; the GitHub token stays read-only; the rule's actor
list bounds who gets an Anthropic token, and the job guard, the action's actor
check and Anthropic's workflow validation bound who gets the write token. The
driver: cheaper to reverse. Deleting the rule, or the two files, stops every
run.

## W8 Acceptance claims

- C1. `workflow.test.mjs` passes on the two files as this branch writes them,
  and the common lockdown still passes on every other file.
- C2. Each refusal in W3 has a bad case, and each bad case fails on its plant.
- C3. Neither workflow reads a secret or sets a credential input
  (`anthropic_api_key`, `claude_code_oauth_token`, `github_token`); the
  two workflow files hold none of those names.
- C4. CI's three jobs pass on the reviewed head.
- C5. After merge, an `@claude` comment by an allowed actor gets an answer,
  and the Console's authentication history shows the exchange matched the
  rule (the owner checks; the review workflow first runs on the next pull
  request, since the action needs the file on `main`).
