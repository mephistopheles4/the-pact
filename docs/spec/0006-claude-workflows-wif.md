# Spec: the Claude workflows, through Workload Identity Federation — V2

Status: V2 revision 2, draft on the PACT-113 branch, on the sensitive route:
the security pair reads it and the diff. V1 (PACT-101) let the two files in;
V2 makes the review run on request only and adds the controls PACT-103's
round 2 listed. The spec counts once it is on `main`.

<!-- toc -->

- [W1 Objective](#w1-objective)
- [W2 Decisions](#w2-decisions)
- [W3 The allow-list (the gate's tests)](#w3-the-allow-list-the-gates-tests)
- [W4 The two files](#w4-the-two-files)
- [W5 Threat model](#w5-threat-model)
- [W6 Out of scope](#w6-out-of-scope)
- [W7 Trade-offs](#w7-trade-offs)
- [W8 Acceptance claims](#w8-acceptance-claims)
- [W9 The owner's checklist](#w9-the-owners-checklist)

<!-- /toc -->

## W1 Objective

The Claude GitHub app's setup adds two workflows: `claude.yml`, which answers
`@claude`, and `claude-code-review.yml`, which reviews a pull request. V1 let
both in with no stored key, under an exact allow-list of their own in
`gate/tests/workflow.test.mjs`. The review then ran on every push to every
pull request, cost money on each, and posted nothing. V2:

- runs the review only when the owner or an agent app asks for it in a pull
  request comment that starts with `@claude review` or `@claude code review`;
- bounds each run's turns, model, spend and overlap;
- runs Claude in `dontAsk` mode with an exact tool list and deny rules in
  both files;
- writes to GitHub through an app of the owner's own with only Contents,
  Issues and Pull requests, whose key only a run from `main` can read, and
  takes this repo off the Claude GitHub app;
- posts the review only through the action's masking comment tools, from a
  procedure kept in the repo, on a runner whose outbound traffic is held to a
  list of hosts;
- puts CODEOWNERS on the files that control Claude;
- leaves the Console and GitHub settings steps to the owner, as an ordered
  checklist on the issue.

The same change refreshes the threat model, `docs/reference.md` (which
names the two asks and who may post them, for a session that wants a
review) and the spec's table of contents, adds `.claude/ci/` to AGENTS.md's
read-closely list, since it steers a run, and adds a dated log, since it
changes the gate.

## W2 Decisions

1. **Authentication to the Claude API stays Workload Identity Federation.**
   Each run trades the job's GitHub OIDC token (audience
   `https://api.anthropic.com`) for a short-lived Anthropic token. The files
   carry the federation rule, organization and service account IDs:
   identifiers, not credentials. Neither file sets `anthropic_api_key` or
   `claude_code_oauth_token`. The rule and the service account keep their IDs;
   the rule targets the CI workspace alone, so no workspace input is needed.
2. **The rule lives in the Claude Console and bounds who gets an Anthropic
   token.** After the owner's checklist (W9) it also pins the subject to the
   `claude` environment, the workflow to one of the two files on `main`, the
   event names, the repository ID and the `workspace:inference` scope. A run
   from any other branch, file or event gets no Anthropic token.
3. **The review runs on request only.** `claude-code-review.yml` runs on
   `issue_comment` [created] and nothing else, never on push or open. Its
   guard: the comment is on a pull request, its body starts with one of the
   two asks (GitHub's `startsWith`, which ignores case), and its author is the
   owner (association `OWNER`) or one of the owner's three agent apps by login
   (`mephistos-homunculus[bot]`, `mephistos-euphorion[bot]`,
   `mephistos-wagner[bot]`). A session that asks Jev whether a pull request
   needs a review posts the comment as an agent app or the owner's account,
   so it needs no other door. Collaborators cannot ask. On a fork's pull
   request the action itself refuses the run (V1's head-repo guard can't be
   written for a comment event, whose payload has no head).
4. **One comment never starts both files.** `ASK` is
   `(startsWith(github.event.comment.body, '@claude review') ||
   startsWith(github.event.comment.body, '@claude code review'))`. The review's
   guard requires it. `claude.yml`'s `issue_comment` arm requires that the body
   contains neither ask anywhere (`MENTIONS_ASK`, the same two strings under
   `contains`). So a comment that starts with an ask starts only the review;
   one that holds an ask elsewhere, or after a leading space, starts neither;
   any other `@claude` comment starts only `claude.yml`. An ask on an issue
   that is not a pull request starts nothing.
5. **`claude.yml` answers only issues and conversation comments.** Its
   triggers drop to `issue_comment` [created] and `issues` [opened,
   assigned]. `pull_request_review` and `pull_request_review_comment` runs
   take the workflow file and the environment check from the pull request's
   merge ref, so the pull request's own copy of the file would run; the rule's
   pin to `main` (W2.2) and the environment (W2.7) would refuse them anyway.
   Its guard keeps the V1 association list (`OWNER`, `MEMBER`,
   `COLLABORATOR`) or the three apps.
6. **Claude runs in `dontAsk` mode with an exact tool list and deny rules.**
   Each file's `claude_args` sets `--permission-mode dontAsk`, its own
   `--allowedTools` and a `--disallowedTools` list (W4); a tool outside the
   effective list is denied, not reviewed. The lock-down no longer rests on
   `allowed_bots` turning off auto mode. `allowed_bots` stays, exactly the
   three apps, because the action refuses an unlisted bot actor. The deny
   list keeps reads off the runner's secrets: `/proc`, the runner's temp
   folder (where the identity token and the Anthropic token cache sit),
   `/tmp` and the home folder, and denies `ps`, `env` and `printenv`. The gate
   also refuses a `permissions` key in `.claude/settings.json`, which the run
   loads from the base branch and which could widen the list.
7. **Writes go through the owner's own app, not the Claude GitHub app.** The
   Claude GitHub app holds Workflows, Actions and hooks write besides what the
   action needs, and GitHub lets no installation accept less. The owner's
   agent apps don't fit either: each holds `workflows: write`, and their keys
   sit with sessions. So the owner creates one new app with Contents, Issues
   and Pull requests write (Metadata read), no webhook, installed on this
   repo only, and takes this repo off the Claude GitHub app (W9): while that
   app stays installed, a run's OIDC request credentials could be traded for
   its token. Each job uses the GitHub environment `claude`, whose deployment
   branches are `main` only, and which holds the app's private key as the
   secret `CLAUDE_APP_PRIVATE_KEY` and its client ID as the variable
   `CLAUDE_APP_CLIENT_ID`. A step pinned to `actions/create-github-app-token`
   mints an installation token, narrowed per file (W4), and hands it to the
   action as `github_token`; the action then skips its own exchange for the
   Claude app's token. The mention's token holds no Pull requests permission,
   so it can neither open nor merge a pull request; the review's holds no
   Contents write. The token is masked, and revoked when the job ends. Both
   files' events run from `main`, so the environment admits them; a workflow
   pushed to another branch gets neither the key nor, by W2.2, an Anthropic
   token. With no Workflows permission, the app's token cannot push a
   workflow file.
8. **The review follows a procedure kept in the repo.** The review's `prompt`
   is fixed text, with no expression in it, that points Claude at
   `.claude/ci/review.md`: a file, not a slash command, because tag mode adds
   the prompt to its own as custom instructions, where a command would not
   run. `track_progress: 'true'` makes the action run in tag mode on the
   comment: it posts a tracking comment, checks out the pull request's head,
   and restores `.claude/` and the other config paths from the base branch,
   so the procedure and the repo's hooks come from the base branch. The
   fetched code-review plugin and its marketplace go.
9. **The review posts only through masked tools.** It holds no `gh`, and its
   only Bash rules are two exact `git diff` commands. It posts its summary by
   updating the tracking comment
   (`mcp__github_comment__update_claude_comment`) and its findings as inline
   comments (`mcp__github_inline_comment__create_inline_comment`). Both run
   each body through the action's `redactSecrets`, which masks GitHub,
   Anthropic, AWS and Slack token shapes and JWTs. The git wrappers tag mode
   adds are denied, so the review cannot commit or push.
10. **Outbound traffic is held to a list.** Both jobs run on
    `ubuntu-24.04-firewall`, GitHub's egress-firewall runner, with
    `.github/egress-firewall.yaml` in `mode: enforce`. The runner reads the
    policy from the run's ref, `main` for every event these files take, and
    needs `contents: read`, which each job holds. The list holds only what the
    steps fetch or call (W4); GitHub's defaults add `github.com`,
    `codeload.github.com` and GitHub's own blob and Actions hosts. A host a run
    needs and the firewall blocks is added by a spec amendment the owner signs
    off; `log` mode is never the fix. The runner is a technical preview: W7
    names the trade.
11. **Caps per run.** Each file sets `--model`, `--max-turns` and
    `--max-budget-usd` in `claude_args`, a time limit, and a job-level
    `concurrency` group per issue or pull request number that never cancels a
    run in progress. GitHub keeps one pending run per group, so a third ask
    while one runs replaces the second. `--max-budget-usd` is Claude Code's own
    estimate, passed through by the action unparsed; C8 checks it.
12. **No transcript is kept as an artifact.** The action's `execution_file`
    holds every message of the run, tool results included, unredacted. This
    repo is public, so an artifact is downloadable by anyone signed in to
    GitHub, and keeping the file would publish everything a run read. The
    run's cost, turns and duration already print in the job log's result
    line, and the Console's usage by service account keeps the rest (W9).
    Debug logging is never turned on for these two files: it prints the whole
    transcript into the public log.
13. **CODEOWNERS** names the owner, `@mephistopheles4`, for
    `/.github/workflows/`, `/.github/egress-firewall.yaml`,
    `/.github/CODEOWNERS` and `/.claude/`. `main`'s ruleset does not require
    code owner review, so the file requests the owner's review and blocks
    nothing until the owner turns that on (W7, W9). A ruleset beyond `main`
    cannot restrict paths here: push rulesets, the rules that restrict file
    paths, are for private and internal repositories, and bypass lists need an
    organization.
14. **Pins.** `actions/checkout` is pinned to `gate.yml`'s commit;
    `actions/create-github-app-token` to v3.3.0's commit
    (`64ab729a6294000f5aa4a4bc0b73d1f32bc45510`, more than 14 days old);
    `anthropics/claude-code-action` stays at V1's commit. Dependabot keeps
    them current. Each checkout sets `persist-credentials: false` and
    `fetch-depth: 0`, so `git diff` against the base finds a merge base.

## W3 The allow-list (the gate's tests)

`workflow.test.mjs` reads `claude.yml` and `claude-code-review.yml` with
their own allow-list instead of the common lockdown, and reads
`.github/egress-firewall.yaml`, `.claude/ci/review.md` and
`.claude/settings.json`. For each Claude file it refuses:

- a top-level key other than `name`, `on`, `permissions` and `jobs`; a name
  other than the file's own;
- triggers other than the file's own, with their event types;
  `pull_request_target` and `workflow_run` in any form;
- top-level `permissions` other than exactly `contents: read`;
- a job other than the file's one job; a job key outside `if`, `runs-on`,
  `timeout-minutes`, `environment`, `concurrency`, `permissions` and
  `steps`; a runner other than `ubuntu-24.04-firewall`; a time limit, an
  `environment` or a `concurrency` other than the file's own;
- job permissions other than the file's exact set;
- a job `if` other than the file's guard, held exactly as W4 writes it;
- steps other than `actions/checkout`, then `actions/create-github-app-token`
  with `id: app`, then `anthropics/claude-code-action`, each pinned to a full
  commit SHA, checkout's pin equal to `gate.yml`'s; a step key other than
  `uses` and `with`, and `id` on step 2;
- checkout inputs other than exactly `fetch-depth: 0` and
  `persist-credentials: false`; app-token inputs other than the file's exact
  set; a step's `with` that is not a map;
- an action input outside the file's list, or a value other than the file's
  own, the federation IDs, `allowed_bots`, `prompt` and `claude_args`
  included;
- `secrets` anywhere but the app-token step's `private-key`, and there
  anything but `${{ secrets.CLAUDE_APP_PRIVATE_KEY }}`; `github.token`,
  `github['token']` or `GITHUB_TOKEN`; `anthropic_api_key` or
  `claude_code_oauth_token`; a `github_token` other than
  `${{ steps.app.outputs.token }}`;
- a `run:` step; an `env:` at any level; a YAML anchor, alias, merge key or
  flow mapping; uploading or caching anything; a job or check named `gate`,
  `gate-macos` or `gate-windows`.

Every other workflow file keeps the common lockdown, tightened in two ways
now that the repo holds a secret: it refuses `secrets` in any form (an index
or `toJSON(secrets)`, not only `secrets.`), and a job `environment`.

`.github/egress-firewall.yaml` must hold exactly W4's text, read as keys:
`mode: enforce`, `allow` the W4 hosts in that order, no other key.
`.claude/ci/review.md` must exist and open with no front matter (a first line
of `---`, which could grant tools). `.claude/settings.json` must hold no
`permissions` key.

Each refusal added or tightened has a bad case it is seen to catch, in the
style of the CodeQL allow-list's.

## W4 The two files

| | `claude.yml` | `claude-code-review.yml` |
| --- | --- | --- |
| Name, job | `claude`, `claude` | `claude-code-review`, `claude-review` |
| Triggers | `issue_comment` [created], `issues` [opened, assigned] | `issue_comment` [created] |
| Runner, time limit | `ubuntu-24.04-firewall`, 30 minutes | `ubuntu-24.04-firewall`, 15 minutes |
| Environment | `claude` | `claude` |
| Concurrency | group `claude-${{ github.event.issue.number }}`, `cancel-in-progress: false` | group `claude-review-${{ github.event.issue.number }}`, `cancel-in-progress: false` |
| Job permissions | `contents`, `pull-requests`, `issues`, `actions`: read; `id-token: write` | `contents`, `pull-requests`, `issues`: read; `id-token: write` |
| App token (`permission-*`) | `contents`, `issues`: `write` | `contents: read`; `issues`, `pull-requests`: `write` |
| Action inputs | the three federation IDs, `allowed_bots`, `github_token`, `claude_args` | the three federation IDs, `allowed_bots`, `github_token`, `track_progress`, `prompt`, `claude_args` |

The app-token step's inputs: `client-id: ${{ vars.CLAUDE_APP_CLIENT_ID }}`,
`private-key: ${{ secrets.CLAUDE_APP_PRIVATE_KEY }}`, and the `permission-`
inputs above. The token covers this repository alone, the step's default.

**Guards,** written as a block scalar, one arm per line, held exactly. With
`OK(f)` the V1 association check for author `f` (`OWNER`, `MEMBER`,
`COLLABORATOR` or one of the three apps):

```
claude.yml:
(github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude') && !contains(github.event.comment.body, '@claude review') && !contains(github.event.comment.body, '@claude code review') && OK(comment)) ||
(github.event_name == 'issues' && (contains(github.event.issue.body, '@claude') || contains(github.event.issue.title, '@claude')) && OK(issue))

claude-code-review.yml:
github.event.issue.pull_request && (startsWith(github.event.comment.body, '@claude review') || startsWith(github.event.comment.body, '@claude code review')) && (github.event.comment.author_association == 'OWNER' || contains(fromJSON('["mephistos-homunculus[bot]","mephistos-euphorion[bot]","mephistos-wagner[bot]"]'), github.event.comment.user.login))
```

`OK(f)` is V1's text:
`(contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.f.author_association) || contains(fromJSON('[<the three apps>]'), github.event.f.user.login))`.

**The deny list** both files share, `DENY_READS`:
`Read(//proc/**),Read(//home/runner/work/_temp/**),Read(//tmp/**),Read(~/**),Bash(ps:*),Bash(env:*),Bash(printenv:*)`.

**`claude_args`,** each held exactly:

- `claude.yml`: `--permission-mode dontAsk --allowedTools
  "Edit(./**),Write(./**),Bash(git status),Bash(git diff),Bash(git diff --stat),Bash(git log --oneline -20)"
  --disallowedTools "<DENY_READS>"
  --model claude-sonnet-5-5 --max-turns 60 --max-budget-usd 5`.
- `claude-code-review.yml`: `--permission-mode dontAsk --allowedTools
  "mcp__github_inline_comment__create_inline_comment,Bash(git diff origin/main...HEAD),Bash(git diff --stat origin/main...HEAD)"
  --disallowedTools "<DENY_READS>,Bash(git add:*),Bash(git commit:*),Bash(git push:*),Bash(git rm:*)"
  --model claude-opus-5-5 --max-turns 40 --max-budget-usd 5`.

**The effective tools.** Tag mode adds its own to each list: `Glob`, `Grep`,
`LS`, `Read`, `mcp__github_comment__update_claude_comment`, the three
`mcp__github_ci__` tools (started only on a pull request with `actions:
read`, so only in `claude.yml`), and the four git wrapper scripts. So a
mention reads the checkout and the runner's other files but those
`DENY_READS` names, edits and writes inside the checkout, runs four exact
read-only git commands (no wildcard, so no `--output` or `--no-index`), commits and pushes its own `claude/` branch
through the wrappers, and updates its tracking comment. A review reads the
same, runs the two `git diff` commands, updates its tracking comment and
posts inline comments; the deny list stops the wrappers.

**The review's prompt:** `Review this pull request. Follow
.claude/ci/review.md exactly. It comes from the base branch.` The procedure
says: read the diff with the two allowed `git diff` commands (a pull request
stacked on another branch shows that branch's changes too; say so), read the
changed files as needed, post each finding worth the author's time as an
inline comment on its line, and put a short summary in the tracking comment;
never quote a secret, a token, an environment value or a file outside the
checkout.

**The egress policy,** the whole file:

```yaml
# Hosts the two Claude jobs may reach (runs-on: ubuntu-24.04-firewall).
# GitHub's defaults add github.com, codeload.github.com and its blob and
# Actions hosts. Spec 0006 W2.10: a host is added by a spec amendment only.
mode: enforce
allow:
  # Model calls and the federation token exchange
  - api.anthropic.com
  # The action, the app-token step and the action's MCP servers
  - api.github.com
  # The Claude Code install script, and its binary
  - claude.ai
  - downloads.claude.ai
  # The action's bun install
  - registry.npmjs.org
  # The Bun download
  - release-assets.githubusercontent.com
```

## W5 Threat model

`docs/threat-model.md`'s Code that runs names the two files, their
allow-list, the environment, the new app and the egress list, and its
Controls paragraph drops "no secrets", "no key in the repo" and "Anthropic's
workflow validation". Its residual lines become:

- a run that an allowed actor starts reads issue, comment and pull request
  text from anyone, and that text can steer what Claude writes through the
  app's token: a mention can push to its own branches, never open or merge a
  pull request, and so stays short of `main`;
- a steered run can still read what the deny list misses (an unlisted
  command or path), and post it through the masked tools in a shape
  `redactSecrets` does not know, or push it in a commit, unmasked and
  reachable by its ID after the branch goes; an update to the tracking
  comment keeps its earlier text in the comment's public edit history;
  `github.com` and
  `api.github.com` stay open to it;
- a session holding an agent app's key can start a run that spends Anthropic
  tokens and writes through the app's token; a comment by an allowed bot that
  merely contains `@claude` starts one;
- the app's private key is a long-lived secret in the `claude` environment,
  readable by a run from `main`: whoever can change `main` can read it. Its
  leak response: uninstall the app, which ends every live token, then delete
  the key on the app's page and make a new one;
- the egress runner is a technical preview, and GitHub's default hosts stay
  open.

The V1 lines on the review's `gh` shell, the unpinned plugin and the rule's
missing ref pin go once C12 shows the narrowed rule.

## W6 Out of scope

How a session decides to ask (asking Jev is the session's work; the ask
itself is W2.4's). Inline comment classification (it needs an API key, and
is skipped under federation, so every inline comment posts). Commit
authorship: mention commits keep the action's default author while the new
app pushes them. A per-collaborator service account. Other repos. Claude
Approvals and the managed Code Review, which need a Claude Team or Enterprise
plan.

## W7 Trade-offs

- **Reach against convenience.** Collaborators can no longer ask for a
  review, and `@claude` in a review or on a diff line no longer answers. The
  driver is the owner's: review on request, by the owner and the apps; the
  review triggers fall to W2.5's reason. Cheaper to reverse: a spec change
  adds either back.
- **Autonomy against cost.** Agent apps may ask at will; each review runs on
  Opus with up to $5 and 40 turns. The workspace's monthly limit bounds the
  total. The driver is the owner's: not always in the loop.
- **A stored key against the Claude app's breadth.** V1 held no secret.
  V2's app key is one, held to `main` by the environment, in exchange for an
  app that cannot touch workflows, hooks or Actions, and a mention token that
  cannot reach `main`. Removing the environment's secret and the step returns
  to the Claude app. This is a new boundary: the owner's checkpoint.
- **Code owner review on `main`.** Requiring it would make every change to
  the Claude controls wait for the owner, and would block a pull request the
  owner's own account opens on those paths, since an author can't approve
  their own. V2 leaves it off; the owner decides (W9).
- **Egress control against reliability.** The firewall runner is in
  technical preview: GitHub reports 15 to 20 percent slower jobs, and an open
  report of jobs that never end; the time limits bound that. Moving back to
  `ubuntu-24.04` is a spec change.
- **A record against publishing it.** Keeping `execution_file` would publish
  every run's transcript (W2.12). The session's pick: keep none.

## W8 Acceptance claims

Before merge:

- C1. `workflow.test.mjs` passes on the two files, the egress policy, the
  review procedure and `.claude/settings.json` as this branch writes them,
  and the tightened common lockdown passes on every other file.
- C2. Each refusal W3 adds or tightens has a bad case, and each bad case
  fails on its plant.
- C3. The only secret either file reads is `CLAUDE_APP_PRIVATE_KEY`, in the
  app-token step; neither sets `anthropic_api_key` or
  `claude_code_oauth_token`.
- C4. CI's three jobs pass on the reviewed head.
- C5. A run on `ubuntu-24.04-firewall` starts for this account (a one-off
  probe workflow on a scratch branch, deleted after).
- C6. The owner's checklist is on the issue, and W9's before-merge steps are
  done: the environment's branch policy, read back through the API, lists
  only `main`; this repo has no Claude GitHub app installation.

After merge:

- C7. A push to a pull request and opening one start no review run.
- C8. `@claude review` from the owner on a real pull request posts a tracking
  comment with a summary, and inline comments where it finds something; the
  same from an agent app does too. The run's result line shows success and
  its turns and cost under the caps. If the CLI refuses `--max-budget-usd`,
  the flag comes out (a spec change). A run that fails or hits a cap says so
  in its tracking comment, so the asker sees it.
- C9. That comment starts no `claude` job, and an `@claude` comment that is
  not an ask starts no review.
- C10. An `@claude` comment from the owner on an issue gets an answer in its
  tracking comment, and a request for an edit lands as a commit on a
  `claude/` branch.
- C11. The run summary's egress log shows the policy loaded in enforce mode,
  and no blocked host the run needed.
- C12. The Console's authentication history shows each exchange matched the
  narrowed rule.

## W9 The owner's checklist

Kept on the issue as a comment the session posts before Test, in this order,
each step with its test. It names where each secret lives, never a value.

1. Before merge: create the app (W2.7) and install it on this repo only;
   create the `claude` environment with deployment branches `main` only, then
   add the key and client ID; delete the downloaded key file. Inert until V2
   is on `main`.
2. Before merge: confirm in the Console why today's runs fail; then the CI
   workspace with a monthly spend limit, the service
   account in it, the rule targeting it, the scope `workspace:inference`.
3. Before merge: the rule's pins (subject, workflows, events, repository ID).
   V1 runs stop then; nothing runs them by itself any more.
4. Before merge: take this repo off the Claude GitHub app.
5. Merge, then C7 to C12.

The kill switch: `gh workflow disable` for either file; suspend or uninstall
the new app, which ends its live tokens; delete the environment's secret;
archive the rule. Rollback: revert the pull request, restore the rule's V1
subject, and reinstall the Claude GitHub app on this repo. A run stuck past
its time limit, or spending past its cap, is a reason to switch it off.
