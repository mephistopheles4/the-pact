# Spec: the Claude workflows, through Workload Identity Federation — V1

Status: draft on the PACT-101 branch, flagged for the owner's review. The
security pair reads it with the diff at Test (the session's pick, logged on
the issue). The spec counts once it is on `main`.

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
2. **The rule is the control, and it lives in the Claude Console.** It matches
   by a CEL condition on the repository owner's account ID, the subject prefix,
   the audience and an allow-list of actor account IDs. Nothing in the repo
   names who is on that list.
3. **The job guard is defence in depth.** Each job runs only when the
   triggering author's association is `OWNER`, `MEMBER` or `COLLABORATOR`
   (and, for `claude.yml`, the text holds `@claude`). The review job also
   runs only for a pull request whose head is a branch of this repo. A pusher
   can edit the guard on a branch; the rule still holds.
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
  `persist-credentials` other than `false`;
- an action input outside the file's list in W4, the federation IDs missing,
  or an ID that does not have its prefix's shape (`fdrl_`, `svac_`, a UUID);
- any `secrets.`, `github.token` or `GITHUB_TOKEN`; a `run:` step; an
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
| Guard | per event: `@claude` in the text, and the author's association in the list | head repo is this repo, and the pull request author's association in the list |
| Action inputs | the three federation IDs, `additional_permissions` (`actions: read`) | the three federation IDs, `plugin_marketplaces`, `plugins`, `prompt`, `claude_args` |

The guard text is held exactly, as the files on this branch write it.

## W5 Threat model

`docs/threat-model.md`'s Code that runs names the two files and their
allow-list beside `codeql.yml`'s. A residual line says what is accepted:

- a run that an allowed actor triggers reads issue, comment and pull request
  text from anyone, and that text can steer what Claude writes through the
  app's token, short of `main`;
- the review plugin is fetched from its marketplace at run time, unpinned;
- a branch pushed by an allowed actor can change the files and mint an
  Anthropic token in its run; the rule bounds who, not what the run does.

## W6 Out of scope

Inline comment classification (it needs an API key, and is skipped under
federation). A per-collaborator service account. Running the workflows in
other repos; the rule already covers them, and each repo brings its own files.

## W7 Trade-offs

Reach against convenience: the action keeps the app's write token, which
`@claude` needs to act; the GitHub token stays read-only and the rule's actor
list bounds who can start a run. The driver: cheaper to reverse. Deleting the
rule, or the two files, stops every run.

## W8 Acceptance claims

- C1. `workflow.test.mjs` passes on the two files as this branch writes them,
  and the common lockdown still passes on every other file.
- C2. Each refusal in W3 has a bad case, and each bad case fails on its plant.
- C3. Neither file reads a secret, and the repo holds no `ANTHROPIC_API_KEY`
  reference.
- C4. CI's three jobs pass on the reviewed head.
- C5. After merge, an `@claude` comment by an allowed actor gets an answer,
  and the Console's authentication history shows the exchange matched the
  rule (the owner checks; the review workflow first runs on the next pull
  request, since the action needs the file on `main`).
