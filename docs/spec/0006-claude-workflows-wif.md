# Spec: the Claude workflows, through Workload Identity Federation — V2

Status: V2 revision 5, draft on the PACT-113 branch, on the sensitive route:
the security pair reads it and the diff. V1 (PACT-101) let two workflows in;
V2, at the owner's word, keeps one, `claude.yml`, run on request only, with
caps. The spec counts once it is on `main`.

<!-- toc -->

- [W1 Objective](#w1-objective)
- [W2 Decisions](#w2-decisions)
- [W3 The allow-list (the gate's tests)](#w3-the-allow-list-the-gates-tests)
- [W4 The file](#w4-the-file)
- [W5 Threat model](#w5-threat-model)
- [W6 Out of scope](#w6-out-of-scope)
- [W7 Trade-offs](#w7-trade-offs)
- [W8 Acceptance claims and the owner's checklist](#w8-acceptance-claims-and-the-owners-checklist)

<!-- /toc -->

## W1 Objective

The Claude GitHub app's setup adds two workflows: `claude.yml`, which answers
`@claude`, and `claude-code-review.yml`, which reviewed every pull request.
V1 let both in with no stored key, under an exact allow-list of their own in
`gate/tests/workflow.test.mjs`. The review then ran on every push to every
pull request, cost money on each, and posted nothing. V2:

- deletes `claude-code-review.yml`, so nothing runs on a push or on opening a
  pull request;
- keeps `claude.yml` as the one way to ask Claude for work: an `@claude`
  comment on an issue, a pull request's conversation, a review or a diff
  line, or an issue opened or assigned with `@claude` in it. A run can
  answer, review ("`@claude review`" is a request in the text like any
  other), commit, push and open pull requests;
- bounds each run's model, turns, spend, time and overlap;
- leaves the Console steps to the owner, as a short checklist on the issue.

The same change refreshes the threat model and the spec's table of contents,
and adds a dated log, since it changes the gate.

## W2 Decisions

1. **Authentication to the Claude API stays Workload Identity Federation.**
   Each run trades the job's GitHub OIDC token (audience
   `https://api.anthropic.com`) for a short-lived Anthropic token. The file
   carries the federation rule, organization and service account IDs:
   identifiers, not credentials. It sets no `anthropic_api_key`,
   `claude_code_oauth_token` or `github_token`, and reads no secret.
2. **The rule bounds who gets an Anthropic token, and it lives in the Claude
   Console.** Beside V1's owner, subject-prefix, audience and actor checks,
   the owner's checklist (W8) pins the repository ID, the four event names
   and the workflow: `claude.yml` on `main` for issue events, and
   `claude.yml` on a pull request's merge ref for the two review events,
   which run the file from that ref. The rule targets the CI workspace,
   whose monthly spend limit bounds the total, with the scope
   `workspace:inference`.
3. **Who can start a run.** The job guard is V1's: each event's text holds
   `@claude`, and its author's association is `OWNER`, `MEMBER` or
   `COLLABORATOR`, or its login is one of the owner's three agent apps
   (`mephistos-homunculus[bot]`, `mephistos-euphorion[bot]`,
   `mephistos-wagner[bot]`). `allowed_bots` names exactly those three, since
   the action refuses an unlisted bot actor. A session that wants a review
   posts `@claude review` as an agent app or the owner's account.
4. **Claude's own GitHub app stays the writer.** The action trades the same
   OIDC token for the Claude GitHub app's installation token, and Anthropic's
   exchange checks that the workflow file matches the one on the default
   branch, so a branch's edited copy gets no write token. The job's own
   `GITHUB_TOKEN` stays read-only. No new app, key or environment.
5. **The action's defaults hold the tools.** Tag mode, which the action picks
   for a mention, gives Claude its file tools, edits in the checkout, its
   commit and push wrappers, the tracking comment and, on a pull request,
   the CI tools. `claude_args` adds only what the asks need and tag mode
   lacks: the inline comment tool, for a review's line comments, and
   `gh pr create`, to open a pull request. Both the inline comments and the
   tracking comment pass the action's `redactSecrets` mask.
6. **Caps per run.** `claude_args` sets `--model claude-opus-5-5` (one model
   for answers, reviews and code), `--max-turns 60` and
   `--max-budget-usd 5`; the job has a 30-minute time limit and a
   `concurrency` group per issue or pull request number that never cancels a
   run in progress. GitHub keeps one pending run per group, so a third ask
   while one runs replaces the second. `--max-budget-usd` is Claude Code's
   own estimate, passed through by the action; C6 checks it.
7. **Full history in the checkout.** `fetch-depth: 0`, so a review's
   `git diff` against the base finds a merge base; with a shallow checkout it
   fails once `main` has moved. `persist-credentials: false` stays.
8. **No transcript, no debug.** The action's `execution_file` holds every
   message of a run, unredacted, and this repo is public, so the file is
   never uploaded. Debug logging is never turned on for this file: it prints
   the transcript into the public log. Each run's cost, turns and duration
   print in its result line.
9. **Pins.** `actions/checkout` is pinned to `gate.yml`'s commit, and
   `anthropics/claude-code-action` stays at V1's commit; Dependabot keeps
   both current.
10. **Dropped from round 2's list, at the owner's word:** the egress-firewall
    runner, `dontAsk` with exact tool lists and deny rules, a narrower app of
    the owner's own, and CODEOWNERS. None is needed for the action to work.

## W3 The allow-list (the gate's tests)

`workflow.test.mjs` reads `claude.yml` with its own allow-list instead of the
common lockdown. It refuses:

- a top-level key other than `name`, `on`, `permissions` and `jobs`; a name
  other than `claude`;
- triggers other than W4's, with their event types; `pull_request_target`
  and `workflow_run` in any form;
- top-level `permissions` other than exactly `contents: read`;
- a job other than `claude`; a job key outside `if`, `runs-on`,
  `timeout-minutes`, `concurrency`, `permissions` and `steps`; a runner
  other than `ubuntu-24.04`; a time limit or a `concurrency` other than W4's;
- job permissions other than W4's exact set;
- a job `if` other than V1's guard, held exactly;
- steps other than `actions/checkout` then `anthropics/claude-code-action`,
  each pinned to a full commit SHA, checkout's pin equal to `gate.yml`'s;
- checkout inputs other than exactly `fetch-depth: 0` and
  `persist-credentials: false`; a step's `with` that is not a map;
- an action input outside W4's list, or a value other than W4's: the
  federation IDs, `allowed_bots` (never `*`), `additional_permissions` and
  `claude_args` included;
- `secrets` in any form, `github.token`, `github['token']` or `GITHUB_TOKEN`;
  `anthropic_api_key`, `claude_code_oauth_token` or `github_token`; a `run:`
  step; an `env:` at any level; a YAML anchor, alias, merge key or flow
  mapping; uploading or caching anything; a job or check named `gate`,
  `gate-macos` or `gate-windows`.

The gate also refuses a workflow file named `claude-code-review.yml`. V1's
allow-list for that file goes with it. Every other workflow file keeps the
common lockdown, unchanged. Each refusal added or tightened (the exact
`fetch-depth`, `concurrency` and `claude_args`, `secrets` in any form, the
review file's name) has a bad case it is seen to catch.

## W4 The file

| | `claude.yml` |
| --- | --- |
| Triggers | `issue_comment` [created], `pull_request_review_comment` [created], `issues` [opened, assigned], `pull_request_review` [submitted] |
| Job | `claude`, `ubuntu-24.04`, 30 minutes |
| Concurrency | group `claude-${{ github.event.issue.number \|\| github.event.pull_request.number }}`, `cancel-in-progress: false` |
| Job permissions | `contents`, `pull-requests`, `issues`, `actions`: read; `id-token: write` |
| Guard | V1's, unchanged: per event, `@claude` in the text, and the author's association in the list or the login one of the three apps |
| Action inputs | the three federation IDs, `allowed_bots`, `additional_permissions` (`actions: read`), `claude_args` |

`claude_args`, held exactly:
`--model claude-opus-5-5 --max-turns 60 --max-budget-usd 5 --allowedTools "mcp__github_inline_comment__create_inline_comment,Bash(gh pr create:*)"`.

## W5 Threat model

`docs/threat-model.md`'s Code that runs names the one file, its allow-list,
the rule's pins and the caps, and drops the review file. Its residual lines
become:

- a run that an allowed actor starts reads issue, comment and pull request
  text from anyone, and that text can steer what Claude does with the Claude
  app's token. That token carries what the app holds, Workflows write
  included, and a steered run can read it from its own environment. So text
  a run reads can steer a commit, a push to any branch but `main`, a
  workflow file on a branch, a pull request, and a merge on `main`, which
  needs no approval. The owner accepts this under the identity gate (W2.3);
- a steered run can post what it can read, in a shape `redactSecrets` does
  not know, or push it in a commit, unmasked and reachable by its ID after
  the branch goes; the tracking comment's edit history keeps earlier text;
- a session holding an agent app's key can start a run; a comment by an
  allowed actor that merely contains `@claude` starts one;
- a pull request review or diff-line comment runs the pull request's own
  copy of `claude.yml`, so a writer's branch can change what that run does.
  Anthropic's workflow validation refuses it the write token, but the rule
  still grants an Anthropic token, bounded by the workspace's monthly limit.

V1's lines on the review's `gh` shell and the unpinned plugin go with the
review file. The line on the rule's missing ref pin goes once C8 shows the
pins.

## W6 Out of scope

Inline comment classification (it needs an API key, and is skipped under
federation). Commit authorship. A per-collaborator service account. Other
repos. Claude Approvals and the managed Code Review, which need a Claude Team
or Enterprise plan.

## W7 Trade-offs

- **Simplicity against reach.** The owner's driver: "Claude is already an
  app, shouldn't complicate this." One file on the Claude app's token, held
  by the identity gate, instead of round 2's controls. A run can do what the
  Claude app can, a merge on `main` included (W5). Cheaper to reverse: a
  spec change adds any dropped control back, and W8's kill switch stops
  runs.
- **Autonomy against cost.** Any allowed actor may ask at will, each run on
  Opus with up to $5 and 60 turns; the workspace's monthly limit bounds the
  total.
- **A record against publishing it.** Keeping `execution_file` would publish
  every run's transcript (W2.8). Keep none.

## W8 Acceptance claims and the owner's checklist

Before merge:

- C1. `workflow.test.mjs` passes on `claude.yml` as this branch writes it,
  with no `claude-code-review.yml`, and the common lockdown passes on every
  other file.
- C2. Each refusal W3 adds or tightens has a bad case, and each bad case
  fails on its plant.
- C3. `claude.yml` reads no secret and sets no credential input.
- C4. CI's three jobs pass on the reviewed head.
- C5. The owner's checklist is on the issue.

After merge:

- C6. An `@claude` question from the owner on an issue gets an answer; an
  `@claude` ask for an edit lands as a commit on a `claude/` branch with a
  pull request opened; `@claude review` on a pull request from the owner and
  from an agent app posts a review, with inline comments where it finds
  something. Each run's result line shows success and its turns and cost
  under the caps. If the CLI refuses `--max-budget-usd`, the flag comes out
  (a spec change).
- C7. A push to a pull request and opening one start no run.
- C8. The Console's authentication history shows each exchange matched the
  pinned rule, including a review-event run's workflow ref.

The owner's checklist, kept on the issue: confirm why runs fail today; the
CI workspace with a monthly limit, the service account in it, the rule
targeting it with the `workspace:inference` scope; the rule's pins (W2.2),
which can go in before merge; then merge and C6 to C8. The kill switch:
`gh workflow disable claude`; archive the rule; set the workspace limit low;
take this repo off the Claude GitHub app. Rollback: revert the pull request.
