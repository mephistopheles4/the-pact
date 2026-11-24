# Controlling Claude in GitHub Actions: what the sources say, 2026-11-24

Research for PACT-103. It compares this repo's two Claude workflows (PACT-101: `.github/workflows/claude.yml` and `claude-code-review.yml`, spec 0006) with the setup the Claude GitHub app writes, with what Anthropic's docs and source say, and with what others do and what has gone wrong. Read at claude-code-action v1.0.289 (commit `eb56b666`, the commit we pin), which installs Claude Code 2.1.331. Each claim is marked verified (read in the source), reported (a secondary source says so) or unverified. A note, not a spec: nothing here changes the rules.

<!-- toc -->
<!-- /toc -->

## Summary

- **Our setup is tighter than the default** on credentials (federation, no stored key), job token (read-only), pins (SHAs), checkout (no stored token), time limit (30 minutes, not GitHub's 360) and drift (the gate's allow-list).
- **One choice changes the run's permission model.** Setting `allowed_bots`, so the three agent apps can start runs, turns off the action's auto mode. Our runs use Claude Code's earlier defaults, where `--allowedTools` is a strict list. That is why the first review posted nothing, and why it needed the three `gh pr` commands.
- **Secrets the agent can read.** Claude's process and its shell get the Claude app's write token as `GITHUB_TOKEN` and `GH_TOKEN`, and the federation token files sit under `$RUNNER_TEMP`. Only the OIDC request variables are removed. The secret scrub only turns on with `allowed_non_write_users`, and even then leaves `GH_TOKEN` so `gh` works. The action's own comment tools mask token formats; `gh pr comment` through Bash does not. So the residual recorded in spec 0006 W5, a steered review posting a token, is a real path (not yet tried on a runner). The tokens are short-lived: the app token is revoked at job end, and a stolen Anthropic token lives about 10 minutes.
- **The bot door has been used before.** A 2026 takeover of claude-code-action (fixed in v1.0.94) came in through bot actors skipping the write check. Allowed bots are still "not checked for repository permissions"; our list names three apps whose names we hold, and the federation rule checks numeric actor IDs for the Anthropic token (not for the app token).
- **Others isolate more.** GitHub's agentic workflows keep the agent read-only with no secrets and hand its writes to a separate job, behind an egress proxy. Copilot's agent has a firewall and one branch. Anthropic's own repo runs its Claude workflows on a firewalled runner, with a pinned model and a review command kept in the repo.
- **No spend cap per run.** There is no turn limit by default, and Console spend limits are monthly, per workspace.

## Recommendations

The session's picks, for the owner to choose from. Each would be its own ticket; none is filed.

| # | Change | Why | Cost | Ticket candidate |
| --- | --- | --- | --- | --- |
| R1 | Settle the token path: a probe in a throwaway private repo, where a steered review tries `gh pr comment --body-file` on a token file and `"$GH_TOKEN"` | turns the W5 hypothesis into a fact before paying for a fix | small; one probe repo, a few runs | "Probe: can a steered review post its tokens?" |
| R2 | Review through a command kept in the repo that posts only through the action's masking comment tools, with no Bash `gh`; drop the fetched plugin | closes the unmasked channel and the unpinned plugin together; matches Anthropic's own repo | medium; a spec change to 0006 W4 | "The review posts only through masked tools" |
| R3 | Caps: `--max-turns` and `--model` in both files; the service account in its own workspace with a monthly spend limit; try the narrower `workspace:inference` scope | bounds spend per run and per month; least privilege | small in the repo, a spec change; Console steps are the owner's | "Per-run caps and the CI workspace" |
| R4 | Tighten the federation rule: add the workflow file (`job_workflow_ref`) to the CEL condition | today any workflow on any branch an allowed actor starts can mint an Anthropic token | small; Console only | with R3 |
| R5 | Egress control on the runner (an allow-list of hosts, e.g. a firewall step or runner) | cuts exfiltration that isn't a GitHub comment | medium; needs a tool the gate allows | "Egress allow-list for the Claude jobs" |
| R6 | Check what the repo's `.claude/settings.json` hooks do on a runner | the action applies the base branch's settings and hooks in CI | small | with R1 |
| R7 | Read the mention workflow's effective tools under the earlier defaults and set an explicit `--allowedTools` | it has no `claude_args`, so its reach is whatever the defaults give | small; a spec change | with R3 |

## 1. Our setup against the default


Read at claude-code-action v1.0.289 (commit eb56b666, the commit we pin), 2026-11-24. The defaults are the files the Claude GitHub app wrote for this repo (the `add-claude-github-actions-…` branch) and the action's examples ([examples/claude.yml](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/examples/claude.yml), [examples/claude-wif.yml](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/examples/claude-wif.yml)).

| | The default (app-written / examples) | Ours (PACT-101) | Source |
| --- | --- | --- | --- |
| Anthropic credential | `anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}` | Workload Identity Federation, no secret | examples/claude.yml; examples/claude-wif.yml |
| Mention job's token | `contents`, `pull-requests`, `issues`: **write**, `id-token: write`, `actions: read` | all read, `id-token: write`; writes go through the app's token | examples/claude.yml |
| Who may trigger | anyone with write access (the action's own check); bots refused | the same, plus a job guard on association or the three bot logins, plus the federation rule's actor list | [docs/security.md](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/docs/security.md) "Repository Access" |
| Pins | tags (`actions/checkout@v4`/`@v6`, `claude-code-action@v1`) | full commit SHAs, Dependabot | the app branch |
| Checkout | token left in `.git/config` | `persist-credentials: false` | the app branch |
| Runner, time limit | `ubuntu-latest`, no `timeout-minutes` (GitHub's default is 360 minutes) | `ubuntu-24.04`, 30 minutes | the app branch |
| Review's tools | `--allowedTools "mcp__github_inline_comment__create_inline_comment"` | that plus `gh pr view`, `gh pr diff`, `gh pr comment` | the app branch |
| Permission mode | **auto mode** (a safety review decides calls the allow rules don't cover) | **the earlier defaults** (manual): `allowed_bots` is set | [docs/usage.md "Permission Mode"](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/docs/usage.md) |
| Model, turns | not set (commented-out examples) | not set | examples/claude.yml |
| Drift guard | none | the gate holds both files to an exact allow-list | — |

### What the comparison teaches (verified in the docs at that commit)

1. **Why the review posted nothing at first.** The app-written review allows only the inline-comment tool, and it works for most users because the action "runs Claude in auto mode by default … a safety review decides any other tool call that your allow rules don't cover" (docs/usage.md, Permission Mode). Setting `allowed_bots` turns that off: "sessions keep the earlier defaults, because other people's text reaches these runs without a write-access check, so the review can't pass a call those defaults deny." So our `allowed_bots` is what made the extra `gh` tools necessary. The narrow list we have is a strict list, which the docs recommend where `--allowedTools` must hold ("Opt out if your workflow relies on `--allowedTools` as a strict list, because auto mode can run other tool calls when the review passes").
2. **The mention workflow has the same switch.** `claude.yml` also sets `allowed_bots` and no `claude_args`, so it runs under the earlier defaults, not auto mode. What those defaults allow on that path needs checking in the source (open question).
3. **The app token is in Claude's environment.** docs/security.md, under Bot User Control: "When `allowed_bots` is set, the token stays out of `.git/config` and git gets it from a credential helper that reads `GH_TOKEN`. … The token is still in Claude's environment." This settles half of the open `gh pr comment` worry: the token a steered run could post is there. The token is "short-lived … scoped specifically to the repository" (Token Permissions).
4. **Environment scrubbing is off for us.** The docs describe a "best-effort scrub of Anthropic, cloud, and GitHub Actions secrets from subprocess environments" and PID-namespace isolation under bubblewrap, but only "when [`allowed_non_write_users`] is set", with `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: 0` as the opt-out. Whether setting `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: 1` ourselves turns it on is not stated (open question); our gate bars `env:`, so trying it is a spec change.
5. **Allowed bots skip the permission check.** "Allowed bots are not checked for repository permissions. A bot that matches an entry does not need to be installed on your repository or have write access." Our list names three apps by slug, and GitHub App slugs are unique, so another app cannot take a listed name; the job guard and the federation rule's actor IDs back it up.
6. **Forks are skipped by default** (`allow_fork_prs` defaults to false), and on PRs the action restores `.claude/`, `CLAUDE.md`, `AGENTS.md`, `.mcp.json` and others from the base branch. Our same-repo guard on the review duplicates the fork skip; the mention workflow relies on the action's.
7. **Hooks in `.claude/settings.json` run in CI.** The base branch's settings, hooks included, apply to a run, and "If a hook … runs a package-manager script … that command resolves through files the pull request supplies." This repo has hooks in `.claude/settings.json`; whether they behave on a runner (and what they run) is an open question.
8. **Text from other people still reaches Claude** on every event ("Text. Issues and comments from outside contributors still reach Claude"). That matches the residual the owner accepted on PACT-101.


## 2. What Anthropic says and what the action does


Research for PACT-103, part A. Read on 2026-11-24.

**Versions read.**
- `anthropics/claude-code-action` tag `v1.0.289`, commit `eb56b6666facdbd501035f4a0269d8caee2e7a8b`, released 2026-11-23T23:54Z. This is the latest v1 tag and the same commit we pin, so there is no difference to compare (verified: `gh api repos/anthropics/claude-code-action/tags`). All source links below are at that commit.
- Claude Code CLI `2.1.331`. The action installs exactly this version (verified: [`src/entrypoints/run.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/entrypoints/run.ts), `const claudeCodeVersion = "2.1.331";`). It is also the current npm version on 2026-11-24 (verified: `npm view @anthropic-ai/claude-code version`).
- Docs pages on code.claude.com and platform.claude.com as served on 2026-11-24. They carry no version stamp.

Labels: **(verified)** I read it in the source or the owning doc. **(reported)** a secondary source says so. **(unverified)** my inference, not tested.

---

### 1. Inputs that control power or cost

All quotes are from [`action.yml`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/action.yml) unless noted (verified).

| Input | Default | What it does |
| --- | --- | --- |
| `trigger_phrase` | `"@claude"` | Text that starts tag mode. Matched as a whole word: `(^|\s)<phrase>([\s.,!?;:]|$)`, case-insensitive ([`trigger.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/github/validation/trigger.ts)) (verified). |
| `assignee_trigger` | none | "The assignee username that triggers the action". |
| `label_trigger` | `"claude"` | "The label that triggers the action". Note it has a default, so a `claude` label on an issue can start a run if the workflow listens to `issues: labeled`. |
| `allowed_bots` | `""` | "Comma-separated list of allowed bot usernames, or '*' to allow all bots. Empty string (default) allows no bots." |
| `allowed_non_write_users` | `""` | Skips the write check. "Only works when github_token input is provided." Turns on the env scrub (section 2.6). |
| `allow_fork_prs` | `"false"` | "By default, and with any other value, the action skips them, whoever opened them, before it checks anything out." |
| `restrict_untrusted_prs` | `"true"` | On PRs whose author lacks write access, "deny commands that commonly run code from the checkout ... even if claude_args allows them." |
| `include_comments_by_actor` / `exclude_comments_by_actor` | `""` | Filter which actors' comments reach the prompt. Wildcards like `*[bot]`. Exclusion wins. |
| `prompt` | `""` | A prompt switches to agent (automation) mode. |
| `settings` | `""` | "Claude Code settings as JSON string or path to settings JSON file". Merged into `~/.claude/settings.json` ([`setup-claude-code-settings.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/base-action/src/setup-claude-code-settings.ts)). The action then always sets `enableAllProjectMcpServers = true` (verified). |
| `claude_args` | `""` | "Additional arguments to pass directly to Claude CLI". This is where `--model`, `--max-turns`, `--allowedTools`, `--disallowedTools`, `--permission-mode`, `--agents`, `--settings`, `--mcp-config` go. |
| `additional_permissions` | `""` | "Additional GitHub permissions to request (e.g., 'actions: read')". Merged on top of the default app-token permissions (section 3). |
| `use_sticky_comment` | `"false"` | "Use just one comment to deliver issue/PR comments". |
| `classify_inline_comments` | `"true"` | Buffers unconfirmed inline comments and classifies them before posting. **With WIF it is skipped**: "Inline comment classification (`classify_inline_comments`) currently requires `anthropic_api_key`; with federation it is skipped and unconfirmed inline comments are posted directly" ([`docs/setup.md`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/docs/setup.md)) (verified in docs, not in code). |
| `use_commit_signing` / `ssh_signing_key` | `"false"` / `""` | Commit through the API (MCP file-ops tools) or sign with an SSH key. |
| `track_progress` | `"false"` | "Force tag mode with tracking comments for pull_request and issue events." |
| `include_fix_links` | `"true"` | "Fix this" links in review feedback. |
| `branch_prefix` | `"claude/"` | Prefix for branches Claude creates. `branch_name_template` default `'{{prefix}}{{entityType}}-{{entityNumber}}-{{timestamp}}'`. |
| `base_branch` | repo default | Also the branch Claude's config is restored from on untrusted PRs that don't target the default branch: "don't set it to a value from the pull request". |
| `display_report` | `"false"` | Step summary with Claude-authored content. "should only be used in cases where the action is used solely with trusted input." |
| `show_full_output` | `"false"` | "WARNING: This outputs ALL Claude messages including tool execution results which may contain secrets ... These logs are publicly visible". It is also forced on by debug mode: `const showFullOutput = options.showFullOutput === "true" \|\| isDebugMode;` where `isDebugMode = process.env.ACTIONS_STEP_DEBUG === "true"` ([`parse-sdk-options.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/base-action/src/parse-sdk-options.ts)) (verified). |
| `plugins` / `plugin_marketplaces` | `""` | Newline lists. Marketplace URLs must match `^https://...\.git$`; plugin names `^[@a-zA-Z0-9_\-\/\.]+$` with no path traversal ([`install-plugins.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/base-action/src/install-plugins.ts)). There is **no input for pinning a marketplace to a commit**; the action runs `claude plugin marketplace add <url>` and `claude plugin install <name>` (verified). |
| `path_to_claude_code_executable` | `""` | Skips the pinned CLI install; also turns off the auto-mode default. |
| `github_token` | none | If set, used instead of the Claude App token. |
| `anthropic_oidc_audience` | `https://api.anthropic.com` | Audience for the WIF identity token. |

**There is no `model` or `max_turns` input in v1.** The old inputs are "DEPRECATED: Use `claude_args` with `--max-turns` instead" ([`docs/usage.md`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/docs/usage.md)) (verified). The run step does read `process.env.ANTHROPIC_MODEL` as a model ([`run.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/entrypoints/run.ts), `model: process.env.ANTHROPIC_MODEL`), so a job-level `ANTHROPIC_MODEL` env would set it (verified in code; not tested).

**Model default.** "Without this argument, the Claude Code GitHub Action uses the Claude Code [default model]" ([GitHub Actions doc](https://code.claude.com/docs/en/github-actions)) (verified). The action sets no model of its own (verified: `sdkOptions.model = options.model || modelFromClaudeArgs`). Anthropic's own workflow comment says "`--model` is set because Claude Code's default model changes between releases" ([`.github/workflows/issue-triage.yml`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/.github/workflows/issue-triage.yml)) (verified).

**Turn limit default.** The action sets none. `maxTurns` is `undefined` unless `--max-turns` is in `claude_args` (verified, `parse-sdk-options.ts`). If a limit is set and the CLI still reports success past it, the action fails the run: "Claude reported a successful result after N turns, exceeding the configured maximum" ([`run-claude-sdk.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/base-action/src/run-claude-sdk.ts)) (verified). Whether Claude Code itself has a turn cap in SDK mode: not found (open question).

**Cost visibility.** The sanitized log prints the result's `total_cost_usd`, `num_turns` and `duration_ms` even with `show_full_output` off (verified, `sanitizeSdkOutput` in `run-claude-sdk.ts`). Anthropic's cost advice for the action is: "Set `--max-turns` in `claude_args` to limit iterations", "Set workflow-level timeouts to avoid runaway jobs", "Use GitHub's concurrency controls to limit parallel runs" ([GitHub Actions doc, Manage costs](https://code.claude.com/docs/en/github-actions)) (verified). There is no per-run dollar cap in the action (verified: no such input).

**How `claude_args` is parsed.** The action parses it with `shell-quote`, after escaping `()|&;<>` so that "unquoted `--allowedTools Bash(gh:*)` was being mangled into bare `Bash`, silently widening a scoped permission rule to Bash(*)" (comment in `parse-sdk-options.ts`) (verified). Lines starting with `#` are dropped. `--allowedTools` / `--disallowedTools` repeat and accumulate. The user's `claude_args` are appended last, so a user `--permission-mode` wins: "Append user's claude_args (which may have more --mcp-config flags, or another --permission-mode, where the last one wins)" ([`modes/tag/index.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/modes/tag/index.ts)) (verified). `settingSources` defaults to `["user", "project", "local"]` unless `--setting-sources` is given (verified).

---

### 2. Security behaviour in the source

#### 2.1 Actor and write checks

- Runs on entity events (issues, PRs, comments, reviews) and `workflow_run` call `checkWritePermissions`. For a user it calls `repos.getCollaboratorPermissionLevel` and accepts only `admin` or `write` ([`permissions.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/github/validation/permissions.ts)) (verified).
- **A login ending in `[bot]` passes the write check without an API call**: `if (actor.endsWith("[bot]")) { core.info(...); return true; }` (verified). The bot is then stopped or passed by `checkHumanActor` ([`actor.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/github/validation/actor.ts)), which resolves the account type and allows a non-`User` only if it is in `allowed_bots` (verified). So for bots, `allowed_bots` is the only gate.
- The docs say so: "**Allowed bots are not checked for repository permissions.** A bot that matches an entry does **not** need to be installed on your repository or have write access" ([`docs/security.md`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/docs/security.md)) (verified).
- When a bot acts on a PR, the PR author must also be allowed: `checkBotActorPullRequestAuthor` (verified). This only covers `pull_request` events (`if (!isPullRequestEvent(context) || !context.actor.endsWith("[bot]")) return true;`) (verified).
- Bot names are compared case-insensitively with the `[bot]` suffix stripped (verified, `isAllowedBot`).
- Comments that are edits or moderation of someone else's text do not trigger: "Editing or dismissing another person's comment or review, or deleting any comment, does not start a run" (`docs/security.md`) (verified in docs; `isModeration` and `isTextFromActor` in `trigger.ts`).

#### 2.2 Permission mode: what our setup actually gets

The action defaults to auto mode, **except** when `allowed_bots` (or `allowed_non_write_users`, a custom `ANTHROPIC_BASE_URL`, `path_to_claude_code_executable`, or some `settings` inputs) is set ([`src/modes/permission-mode.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/modes/permission-mode.ts)) (verified):

```ts
if (
  process.env.ALLOWED_NON_WRITE_USERS?.trim() ||
  process.env.ALLOWED_BOTS?.trim() ||
  process.env.ANTHROPIC_BASE_URL?.trim() ||
  process.env.PATH_TO_CLAUDE_CODE_EXECUTABLE?.trim()
) {
  return false;
}
```

Reason given: "other people's text reaches these runs without a write-access check, so what no allow rule covers stays denied rather than left to a review."

- **Tag mode** (our mention workflow): `const permissionMode = defaultsToAutoMode() ? "auto" : "acceptEdits";` ([`modes/tag/index.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/modes/tag/index.ts)). We set `allowed_bots`, so **our mention runs are in `acceptEdits`**, not auto (verified in code; inferred for our workflow).
- **Agent mode** (our review workflow, which has a `prompt`): `let claudeArgs = defaultsToAutoMode() ? "--permission-mode auto" : "";` ([`modes/agent/index.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/modes/agent/index.ts)). We set `allowed_bots`, so **our review runs in Claude Code's `default` mode**, where "anything that falls through to 'ask' is denied" because "The headless SDK has no prompt handler" (comment in tag/index.ts) (verified in code; inferred for our workflow).
- In docs: "Opt out if your workflow relies on `--allowedTools` as a strict list, because auto mode can run other tool calls when the review passes" and "Auto mode is a review, not a boundary" ([`docs/usage.md`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/docs/usage.md), [`docs/security.md`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/docs/security.md)) (verified). So for us, `--allowedTools` is the strict list. That is the stricter of the two options.

#### 2.3 Default tools

- **Tag mode** always allows: `Glob`, `Grep`, `LS`, `Read`, `mcp__github_comment__update_claude_comment`, `mcp__github_ci__get_ci_status`, `mcp__github_ci__get_workflow_run_details`, `mcp__github_ci__download_job_log`, plus the four git wrapper scripts `Bash(<action>/scripts/git-{add,commit,push,rm}.sh:*)` (or the MCP file-ops tools with `use_commit_signing`) (verified, `modes/tag/index.ts`). Edit and Write are not listed: "the permission mode (set below) allows file edits inside $GITHUB_WORKSPACE and doesn't allow every write outside (e.g. ~/.bashrc). Listing them here would grant blanket write access to the whole runner" (verified).
- The CI MCP server uses the workflow token, not the app token: `GITHUB_TOKEN: process.env.DEFAULT_WORKFLOW_TOKEN`, and is installed only if that token has `actions: read` ([`install-mcp-server.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/mcp/install-mcp-server.ts)) (verified).
- **Agent mode** adds no allowed tools of its own; the comment server is included "Only with explicit tools in agent mode"; the inline-comment server only on a PR and only when `--allowedTools` names `mcp__github_inline_comment__*` or `mcp__github__*` (verified). The docs: "keep this line even though the skill's own `allowed-tools` frontmatter names the same tool, because the Claude Code GitHub Action starts the MCP server that posts inline comments only when `--allowedTools` in `claude_args` names it" ([GitHub Actions doc](https://code.claude.com/docs/en/github-actions)) (verified).
- A skill invoked by the prompt can grant its own tools: "If you invoke a skill instead, Claude can use the tools its `allowed-tools` frontmatter grants" (same doc) (verified). **This matters for our review**: the code-review plugin's `allowed-tools` are added to ours at run time, and the plugin is fetched unpinned (unverified what it lists; see part on plugins).
- `WebSearch`/`WebFetch` are in a `buildDisallowedToolsString` default, but that string is exported to env vars that the code itself calls dead: "NOTE: these env var exports are dead — nothing reads ALLOWED_TOOLS / DISALLOWED_TOOLS" ([`create-prompt/index.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/create-prompt/index.ts)) (verified). So WebFetch/WebSearch are not denied by the action; in `acceptEdits`/`default` headless they would fall to "ask" and be denied, except WebFetch to Claude Code's preapproved documentation domains (unverified for CI; see GHSA-fg94 in section 7).

#### 2.4 Untrusted PR heads

- Before the CLI starts on any PR, the action restores a fixed list from the base branch: "`.claude/`, `.mcp.json`, `.claude.json`, `.gitmodules`, `.ripgreprc`, `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, and `.husky/`. Paths in that list that do not exist on the base branch are removed, and the PR-authored versions are kept under `.claude-pr/` for reference only" ([`docs/security.md`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/docs/security.md)) (verified; code in `restore-config.ts`, called from `run.ts`).
- If the PR author lacks write access, config comes from the default branch, not the PR's base (`chooseConfigBranch`) (verified).
- For those PRs it also denies a fixed list of commands, `UNTRUSTED_PR_DISALLOWED_TOOLS` ([`untrusted-pr.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/github/validation/untrusted-pr.ts)): package managers, test runners, interpreters, shells, `Bash(git config:*)`, `Bash(git -c:*)` (verified). "**This is a list of common commands, not a sandbox.**" (verified).
- **Bots count as untrusted PR authors**: `if (!author || author.endsWith("[bot]")) { return false; }`, and "allowed_bots and allowed_non_write_users do not apply" (verified). So PRs opened by our three Apps get the restrictions and default-branch config.
- `.npmrc`, `bunfig.toml`, tracked `node_modules/` and some `package.json` fields are also restored on those PRs (verified in docs).
- It does **not** cover "other package managers, the `.env` files and `tsconfig.json` that Bun loads, other files that a hook's own command reads, or a git command that resets the working tree during the session" (verified in docs).
- Fork PRs are skipped by default before checkout (`allow_fork_prs`) (verified).
- History: this restore exists because of [GHSA-8q5r-mmjf-575q](https://github.com/anthropics/claude-code-action/security/advisories/GHSA-8q5r-mmjf-575q), "Malicious MCP Server Configuration in PRs Enables Remote Code Execution and Secret Exfiltration", fixed in 1.0.74 (verified, section 7).

#### 2.5 Git credentials and session guard

- The action removes the `actions/checkout` extraheader from `.git/config` and from included files: "the checkout credential (typically the workflow GITHUB_TOKEN) stayed usable by git for the rest of the job. Clear the header from the local config AND from every included file" ([`git-config.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/github/operations/git-config.ts)) (verified). Our `persist-credentials: false` already prevents that header.
- With `allowed_bots` set, git gets the app token from a credential helper that reads `GH_TOKEN`, so `.git/config` holds no token: "When processing content from non-write users, use a credential helper instead of embedding the token in the remote URL. Allowed bots count too" (verified). Without `allowed_bots`, the token goes into the origin URL (verified, comment says "otherwise the origin URL").
- After the session the action restores `GITHUB_ENV`, `GITHUB_PATH` and git config; "A session therefore can't pass environment variables to later steps through `GITHUB_ENV`" (verified in docs).
- Git wrapper scripts "take only a short list of flags, so `git add -f` is refused" and "Claude's push command can't update any other branch" (verified in docs).
- Text sanitizing on input: HTML comments, invisible characters, image alt text, link titles, hidden attributes, HTML entities are stripped from issue/PR/comment text before it reaches the prompt ([`sanitizer.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/github/utils/sanitizer.ts)) (verified). "new bypass techniques may emerge" (docs) (verified).
- Text sanitizing on output: the comment and inline-comment MCP servers run `redactSecrets(sanitizeContent(body))` before posting ([`github-comment-server.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/mcp/github-comment-server.ts), [`github-inline-comment-server.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/mcp/github-inline-comment-server.ts)) (verified). `redactSecrets` masks `ghp_/gho_/ghu_/ghs_/ghr_/github_pat_`, `sk-ant-...`, AWS key IDs, Slack tokens and JWT-shaped strings (verified). **`gh pr comment` run through Bash is not an MCP server, so nothing redacts what it posts** (verified: no wrapper for `gh` in tag/agent mode; `scripts/gh.sh` is used by the repo's own workflows).

#### 2.6 Environment scrubbing — the main question

**What the Claude process gets.** The base action copies the whole step environment and removes only three things ([`parse-sdk-options.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/base-action/src/parse-sdk-options.ts)) (verified):

```ts
const env: Record<string, string | undefined> = { ...process.env };
...
// Remove OIDC token request variables so Claude cannot mint new tokens.
delete env.ACTIONS_ID_TOKEN_REQUEST_URL;
delete env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
// Remove ALL_INPUTS ...
delete env.ALL_INPUTS;
```

Before that, `run.ts` puts the app token in the environment ([`run.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/entrypoints/run.ts)) (verified):

```ts
// Set GITHUB_TOKEN and GH_TOKEN in process env for downstream usage
process.env.GITHUB_TOKEN = githubToken;
process.env.GH_TOKEN = githubToken;
```

and `action.yml` passes the workflow token into the same step: `DEFAULT_WORKFLOW_TOKEN: ${{ github.token }}` (verified).

So in our runs, the Claude process environment holds (verified from code; not observed on a runner):

| Variable | Value | Removed for Claude? |
| --- | --- | --- |
| `GITHUB_TOKEN`, `GH_TOKEN` | Claude App installation token (contents/issues/PRs write) | No |
| `DEFAULT_WORKFLOW_TOKEN` | the job's `GITHUB_TOKEN` (our read-only permissions) | No |
| `ACTIONS_ID_TOKEN_REQUEST_URL` / `_TOKEN` | can mint new OIDC tokens | **Yes** |
| `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID` | identifiers, not secrets | No |
| `ANTHROPIC_IDENTITY_TOKEN_FILE` | path to a GitHub OIDC JWT (audience `https://api.anthropic.com`) | No (it is a path) |
| `ANTHROPIC_CONFIG_DIR`, `ANTHROPIC_PROFILE` | path to the federation profile, where the SDK keeps its on-disk credentials cache | No |
| `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN` | empty for us | n/a |

The WIF code writes the JWT to `$RUNNER_TEMP/claude-workload-identity/identity-token` (mode `0o600`, same user as Claude), rewrites it every 4 minutes, and points `ANTHROPIC_CONFIG_DIR` at `$RUNNER_TEMP/claude-workload-identity/config-<fingerprint>` so that "the SDK's on-disk credentials cache" lets several `claude` processes "share one exchanged access token" ([`workload-identity.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/base-action/src/workload-identity.ts)) (verified). At the end, `stop()` deletes the directory "so they don't outlive this step" (verified). The exact file name of the cached `sk-ant-oat01-...` token inside that directory is not in the action source (open question).

**Does the Bash subprocess get the same?** By default, yes: Claude Code passes its environment to the subprocesses it starts unless the scrub is on (verified by the scrub's description: "Set to `1` to strip credentials from the environments of the subprocesses Claude Code starts, such as Bash commands, hooks, and stdio MCP servers" — [env vars](https://code.claude.com/docs/en/env-vars)).

**When the scrub turns on.** Only with `allowed_non_write_users`, or if the workflow sets the env var itself ([`action.yml`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/action.yml)) (verified):

```yaml
CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: ${{ env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB || (inputs.allowed_non_write_users != '' && '1') || '' }}
```

We set neither, so **the scrub is off in our runs** (verified in code; inferred for our workflow). A workflow can turn it on with `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: 1` in job `env:`, because the step reads `env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` (verified). Our repo test forbids `env:` today (from the task brief).

**What the scrub removes, if on** ([env vars, "What the subprocess environment scrub removes"](https://code.claude.com/docs/en/env-vars)) (verified):

- "The scrub recognizes a credential by its variable name or by the shape of its value, so use it as one layer alongside narrow permission rules rather than as the only control."
- Removes `ANTHROPIC_API_KEY`, `AWS_SECRET_ACCESS_KEY`, names that look like credentials (`NPM_TOKEN`, `DB_PASSWORD`), and `CLAUDE_CONFIG_DIR`.
- **"`GITHUB_TOKEN`, `GH_TOKEN`, `GH_ENTERPRISE_TOKEN`, `GITHUB_ENTERPRISE_TOKEN` | Leaves it in place, so that `gh` and scripts that call the GitHub API keep working"**
- "Because the scrub leaves `GITHUB_TOKEN` in place, give a GitHub Actions job the narrowest `permissions` it needs. To remove a GitHub token from sandboxed Bash commands, add a `deny` entry under `sandbox.credentials`."
- "On Linux, the scrub also runs Bash subprocesses in an isolated PID namespace so they can't read host process environments through `/proc`."
- "Before v2.1.251, the scrub removed `ANTHROPIC_API_KEY` and `AWS_SECRET_ACCESS_KEY` and left the table's other example variables unchanged."

Whether the scrub removes `DEFAULT_WORKFLOW_TOKEN` (name ends in `_TOKEN`), `ANTHROPIC_IDENTITY_TOKEN_FILE` or `ANTHROPIC_CONFIG_DIR` is not stated (open question). Even if it removed the path variables, **the files stay readable** by any process running as the runner user; the scrub is about env, not files (unverified; follows from the design).

`CLAUDE_CODE_SCRIPT_CAPS` limits calls to named scripts "when `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is set" and "Runtime fan-out via `xargs` or `find -exec` is not detected; this is a defense-in-depth control" (verified, env vars doc).

**What this means for our worries (unverified reasoning, not tested):**

- In the review workflow, `Bash(gh pr comment:*)` lets Claude run `gh pr comment <n> --body-file <path>`. A Bash allow rule matches command text; Read deny rules "don't apply to arbitrary subprocesses that read or write files indirectly" ([permissions](https://code.claude.com/docs/en/permissions)) (verified). So a steered run could post the contents of any file the runner user can read, including the WIF JWT file or the SDK's cached token, and nothing redacts it (output redaction is only in the MCP servers, section 2.5).
- `gh pr comment <n> --body "$GH_TOKEN"`: whether Claude Code treats a variable expansion inside an allowed prefix command as allowed is not documented (open question). The app token is revoked at job end (section 3), which shortens the window.
- A stolen WIF access token lives at most the lesser of the rule's `token_lifetime_seconds` and "twice the remaining lifetime of the IdP JWT"; GitHub's JWT "expires roughly 5 minutes after issuance" (section 4) (verified in docs). So about 10 minutes at most. A fresh, not-yet-exchanged JWT in the file could be exchanged by anyone who has it, since the rule and org IDs are not secret (unverified; single-use `jti` only stops a second exchange of the same JWT).
- In the mention workflow (acceptEdits), Bash is limited to read-only commands and the git wrappers. Read-only commands run "within the working directory" without approval ([permissions](https://code.claude.com/docs/en/permissions)) (verified); `$RUNNER_TEMP` is outside the workspace on GitHub-hosted runners (unverified). Claude could still write text into a workspace file and push it to its `claude/` branch with the wrapper scripts; pushed content is not redacted (unverified).

---

### 3. The GitHub App token flow

From [`src/github/token.ts`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/github/token.ts) (verified):

1. Get a GitHub OIDC token with audience `"claude-code-github-action"`: `const oidcToken = await core.getIDToken("claude-code-github-action");`. This is a **different audience** from the WIF token (`https://api.anthropic.com`).
2. POST it as a bearer to `https://api.anthropic.com/api/github/github-app-token-exchange`. If `additional_permissions` is set, the body is `{ permissions }` with defaults merged:
   ```ts
   const DEFAULT_PERMISSIONS = { contents: "write", pull_requests: "write", issues: "write" };
   ```
   With no `additional_permissions`, no body is sent and the server picks the permissions (unverified what it picks; the docs say the app "receives only a short-lived token scoped specifically to the repository it's operating in" — [`docs/security.md`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/docs/security.md)).
3. The response field `token` or `app_token` is the installation token. `core.setSecret(appToken)` masks it in logs.
4. A `401` with "workflow validation failed" or error code `workflow_not_found_on_default_branch` makes the action skip: "This is expected when adding Claude Code workflows to new repositories or on PRs with workflow changes." So **the exchange service checks that the workflow file matches the default branch** (verified in client code; server rule not visible).
5. If `github_token` is given, none of this happens.

**Lifetime and revocation.** GitHub installation tokens expire after one hour (reported: GitHub docs, not re-read here). The action revokes the token at the end of the job in a separate step ([`action.yml`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/action.yml), "Revoke app token") (verified):

```yaml
if: always() && inputs.github_token == '' && steps.run.outputs.github_token != '' && steps.run.outputs.skipped_due_to_workflow_validation_mismatch != 'true'
...
curl -q -L ... -X DELETE ... ${GITHUB_API_URL:-https://api.github.com}/installation/token || true
```

The `-q` "skips ~/.curlrc, which a session can write" (verified). On cancel the action also has "the app token revoked" (`docs/security.md`), except "Nothing is restored or revoked when the action doesn't get the runner's signal, as in a job with `container:`" (verified).

**App permissions.** The official Claude App requests many permissions, shared with other Claude features: Actions read and write, Administration read, Checks read and write, Contents read and write, Dependabot alerts read, Discussions read and write, Issues read and write, Members read, Merge queues read, Metadata read, Pull requests read and write, Repository creation read and write, Repository hooks read and write, Statuses read, Workflows read and write ([GitHub Actions doc, GitHub App permissions](https://code.claude.com/docs/en/github-actions)) (verified). "GitHub doesn't let you accept a subset. If your organization requires only the permissions the Claude Code GitHub Action uses, create a custom GitHub App with Contents, Issues, and Pull requests instead" (verified). `docs/security.md` at our commit still lists an older, shorter set (Contents, Pull Requests, Issues used; Discussions, Actions, Checks, Workflows "for future features") (verified) — the two Anthropic sources disagree; the docs site is newer.

What the exchanged token can do is bounded by what the action asks for (contents/PRs/issues write by default), not by the full app grant (inferred from the request body; open question whether the server ever grants more when no body is sent).

---

### 4. Workload Identity Federation

Sources: [WIF overview](https://platform.claude.com/docs/en/manage-claude/workload-identity-federation), [WIF with GitHub Actions](https://platform.claude.com/docs/en/manage-claude/wif-providers/github-actions), [WIF reference](https://platform.claude.com/docs/en/manage-claude/wif-reference) (all verified, read 2026-11-24).

**Resources.** Service account `svac_`, federation issuer `fdis_`, federation rule `fdrl_`. "A rule defines match conditions, a target, and the authorization scope and token lifetime that apply when the rule matches."

**Matchers.** "You can match on a `subject_prefix`, an exact `audience`, a map of exact claim values, a CEL `condition` expression for complex logic, or any combination ... All configured matchers must pass." "Anthropic rejects a `match` block that contains only `audience` or no matchers at all." `subject_prefix` is "Case-sensitive"; a trailing `*` makes it a prefix match. `claims` takes exact strings for top-level claims only; "For nested, numeric, boolean, or complex claims such as lists and maps, use `condition`." The CEL environment has one variable, `claims`, "The full decoded JWT claim set." Warning: "CEL conditions are security boundaries. An expression that evaluates to `true` for more inputs than intended grants broader access than intended. Prefer the static matchers when they express your constraint."

**GitHub claims and `sub` forms.** "For a push to a branch it has the form `repo:<owner>/<repo>:ref:refs/heads/<branch>`. Pull-request runs use `repo:<owner>/<repo>:pull_request`, and environment-gated deployments use `repo:<owner>/<repo>:environment:<name>`." Example claims listed: `iss`, `sub`, `aud`, `repository`, `repository_owner`, `ref`, `sha`, `workflow`, `actor`, `event_name`. The page does not list `repository_owner_id`, `actor_id`, `job_workflow_ref` or `workflow_ref`; GitHub's token has them (reported: GitHub's OIDC docs, linked from the page).

**Scoping advice (quoted).**
- "A `subject_prefix` of `repo:your-org/*` alone matches every repository in your organization, and without a `ref` constraint it also matches `pull_request` runs triggered from forks. Anyone who can open a pull request against a matching repository could obtain a federated Anthropic token."
- "**Pin to a single repository:** Use `subject_prefix: "repo:your-org/your-repo:*"`"
- "**Pin to a protected branch:** Add `"ref": "refs/heads/main"` ... so pull-request runs and feature branches do not match."
- "**Pin the owner explicitly:** Add `"repository_owner": "your-org"` under `claims` as a defense-in-depth check against `sub` parsing edge cases."
- "**Pin to a deployment environment:** ... gate that environment with required reviewers in GitHub."

Note for us: our mention and review runs happen on `issue_comment`, `pull_request_review*` and `pull_request` events. For `issue_comment` the `ref` is the default branch; for `pull_request` the `sub` is `...:pull_request` and `ref` is `refs/pull/<n>/merge` (reported: GitHub OIDC docs). So a `ref` pin to `main` would break the review workflow; an `event_name` or `workflow_ref` condition is the closer fit (unverified). Pinning numeric `repository_owner_id` and `actor_id`, as we do, is stronger than names against renames (reported: GitHub OIDC docs advise IDs).

**Scope.** "The default is `workspace:developer`, which grants the same access as a workspace API key." A narrower scope exists: "`workspace:inference` | The inference endpoints in the rule's workspace: Messages (including streaming and token counting), Models, and the OpenAI-compatible chat endpoint. Use this for workloads that only need to call Claude and never need to manage Files, Skills, or other resources." `org:admin` gives the whole Admin API. Whether Claude Code in the action works with `workspace:inference` is not documented (open question).

**Lifetime.** "`token_lifetime_seconds` (60 to 86,400, default 3,600)". The wizard prefills 600. "The minted Anthropic token's lifetime is the lesser of (a) the rule's `token_lifetime_seconds` ... and (b) twice the remaining lifetime of the IdP JWT you presented. The result is never less than 60 seconds." GitHub: "Each GitHub-issued identity token expires roughly 5 minutes after issuance."

**Replay.** "By default, identity tokens that carry a `jti` claim are single-use." The issuer's `check_jti` "(enabled by default)". Maximum JWT lifetime "1 hour by default, configurable for each issuer".

**Workspace.** "At exchange time, Anthropic checks that the federation rule's workspace matches one of the service account's workspace memberships. The minted token then follows that workspace's rate limits and usage attribution, the same as an API key." "Every service account is implicitly a member of your organization's default workspace." So a dedicated workspace for CI gives its own limits and reporting.

**Precedence.** "`ANTHROPIC_API_KEY` sits above the federation tiers, so a leftover key in the environment silently overrides federation." The action warns about this too (verified, `workload-identity.ts`).

**Audit.** Denied exchanges return "an opaque `401` `authentication_error` with the fixed message `Authentication failed`"; reasons show on the Console's authentication history page (verified).

**Revoking.** No revoke endpoint for a minted `sk-ant-oat01-` token was found in the pages read (open question). Disabling or deleting the rule stops new exchanges (inferred).

#### Spend, rate limits, usage reporting

- "**Spend limits** set a maximum monthly cost an organization can incur for API usage." You can set your own limit below the tier cap ([Rate limits](https://platform.claude.com/docs/en/api/rate-limits)) (verified).
- Per workspace: "**Spend limits:** Cap monthly spending for a workspace ... you can also set up email alerts for when spending reaches an amount you choose" and "**Rate limits:** Limit requests per minute, input tokens per minute, or output tokens per minute" ([Workspaces](https://platform.claude.com/docs/en/manage-claude/workspaces)) (verified). These are monthly and per-minute; **there is no per-run or per-day dollar cap** in the pages read (verified by absence; open question whether one exists elsewhere).
- At a self-set limit: "requests return HTTP 400 with error type `invalid_request_error`. The message starts with ... `You have reached your specified workspace API usage limits`" (verified).
- Reporting: the Usage and Cost **Analytics** API (beta, header `anthropic-beta: analytics-usage-cost-2026-08...`) groups by `actor`, and "With a Workload Identity Federation token, the `actor` is the service account the token acts as" and "`api_key_id: null`" ([Usage and Cost Analytics API](https://platform.claude.com/docs/en/manage-claude/usage-cost-analytics-api)) (verified). The legacy `/v1/organizations/usage_report/messages` and `/v1/organizations/cost_report` filter by API key and workspace ([Usage and Cost API](https://platform.claude.com/docs/en/manage-claude/usage-cost-api)) (verified). Both need an Admin key, an `org:admin` OAuth token, or an unscoped service-account key; "Workspace API keys don't work" (verified).

---

### 5. Anthropic's security docs and Claude Code's permission system

#### The action's security doc (key lines, [`docs/security.md`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/docs/security.md), verified)

- "The action can only be triggered by users with write access to the repository."
- On `pull_request_target` / `workflow_run`: "**Do not check out an untrusted ref into the workspace root before this action.**"
- "Text can still steer Claude. On an issue or a trusted author's pull request these commands stay allowed, so text from an outside contributor could try to get Claude to edit a file and then run it. Keep the rules you grant in `claude_args` as narrow as you can."
- "`Write` lets Claude write outside the workspace, and `Bash(git:*)` can still run programs through forms this list does not deny, such as `git rebase --exec`."
- "It is not a sandbox. Code running on the runner, for example through an allowed `npm test`, can stop the action before it restores anything".
- "**Claude does not create pull requests automatically** ... The user must click the link".
- On public repos, use `include_comments_by_actor` "to allowlist which users' comments are passed to Claude, reducing exposure to untrusted input."
- Job logs and step names "are text the pull request controls"; deny `mcp__github_ci__download_job_log` and `mcp__github_ci__get_workflow_run_details` if not needed.

#### What Anthropic does in its own repo (verified, same commit)

Anthropic's own workflows are a useful baseline:
- [`CLAUDE.md`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/CLAUDE.md) "Security hardening for GitHub Actions": jobs that call Claude run on "`runs-on: ubuntu-24.04-firewall`, a GitHub-hosted runner that filters the job's outbound network traffic", with an allow list in [`.github/egress-firewall.yaml`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/.github/egress-firewall.yaml) (`mode: enforce`; hosts `api.anthropic.com`, `api.github.com`, `claude.ai`, `downloads.claude.ai`, `release-assets.githubusercontent.com`, `registry.npmjs.org`, `bun.sh`, Ubuntu archives), and "`--permission-mode auto`" in every step, checked by [`check_workflow_hardening.py`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/.github/scripts/check_workflow_hardening.py).
- [`claude.yml`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/.github/workflows/claude.yml): a separate `fork-check` job that asks the API whether the PR's head is in the same repo; WIF via `vars.*`; `--model "claude-opus-4-7"`; `--disallowedTools` on the two CI log tools; uses `anthropics/claude-code-action@main` (not a SHA).
- [`claude-review.yml`](https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/.github/workflows/claude-review.yml): `if: github.event.pull_request.head.repo.full_name == github.repository`; `pull_request: types: [opened]` only; `contents: read`, `pull-requests: write`, `id-token: write`; a repo-local `/review-pr` command (not a fetched plugin); `--allowedTools "mcp__github_inline_comment__create_inline_comment"`; `--model "claude-opus-4-7"`; `uses: anthropics/claude-code-action@v1`.

Differences from ours (inferred): they use auto mode as the extra review layer, a network egress allow list, a pinned model, a review prompt from the repo rather than a fetched plugin, and they do not add `gh` commands to the review's allow list. They do not pin the action by SHA in their own repo.

#### Claude Code permission rules ([permissions](https://code.claude.com/docs/en/permissions), verified)

- Order: "Rules are evaluated in order: deny, then ask, then allow. The first match in that order determines the outcome".
- `:*` form: "The `:*` suffix is an equivalent way to write a trailing wildcard, so `Bash(ls:*)` matches the same commands as `Bash(ls *)`." So `Bash(gh pr comment:*)` matches `gh pr comment` with any arguments, including `--body-file`, `--repo`, `--edit-last`.
- Compound commands: "a rule like `Bash(safe-cmd *)` won't give it permission to run the command `safe-cmd && other-cmd`. The recognized command separators are `&&`, `||`, `;`, `|`, `|&`, `&`, and newlines. Every subcommand must be allowed". Deny and ask rules apply "including a command nested inside a subshell, a command substitution, or a control-flow body".
- Wrappers stripped before matching: `timeout`, `time`, `nice`, `nohup`, `stdbuf`, `command`, `builtin`, `noglob`, bare `xargs`, and "certain known-safe environment variables". "An allow rule won't match past an assignment of any other variable."
- Not a boundary: "a deny or ask rule covers the invocation Claude usually produces and isn't a security boundary around the program", e.g. `Bash(git push *)` doesn't stop "`git -C . push origin main`".
- Read-only commands such as `ls`, `cat`, `echo`, `grep`, `find`, `which` run "without a permission prompt in every mode" within the working directories. Exceptions include "`ps` that could print environment variables" (`ps auxe`) which prompts.
- "Read and Edit deny rules apply to Claude's built-in file tools ... They also don't apply to arbitrary subprocesses that read or write files indirectly".
- Argument constraints are "fragile"; example: `Bash(curl http://github.com/ *)`.
- Project `permissions.allow` rules need workspace trust, but in "`claude -p` or SDK sessions" the folder "counts as accepted" for some checks, and hooks, `env` and `apiKeyHelper` from the repo's settings are "Used" even when the folder was never trusted. The action's base-branch restore (section 2.4) is what protects that path on PRs.
- `permissions.denyInsteadOfPrompting` and `dontAsk` exist for unattended runs.

#### Sandboxing ([sandboxing](https://code.claude.com/docs/en/sandboxing), verified)

- "The Bash sandbox is an OS-enforced boundary around the shell commands Claude runs". On Linux it needs `bubblewrap` and `socat`.
- `sandbox.credentials` "declares credential files and environment variables to protect from sandboxed commands". With `"mode": "deny"`, "file paths are denied for reads inside the sandbox ... and environment variables are unset before each sandboxed command runs." "There is no built-in credential deny list, so only the files and variables you list are restricted." It "affects sandboxed Bash commands only."
- Masking (proxy substitutes the real value) is honoured "only from user settings, managed settings, and the `--settings` flag", not from the repo's `.claude/settings.json`.
- The action installs bubblewrap only when `allowed_non_write_users` is set (verified, `action.yml`). Whether `sandbox.enabled` via the `settings` input works on GitHub-hosted runners without that install step is not documented (open question). Ubuntu 24.04 restricts unprivileged user namespaces; the action runs `sysctl -w kernel.apparmor_restrict_unprivileged_userns=0` in that path (verified).

---

### 6. What `/install-github-app` writes

The templates are inside the Claude Code binary, not in a public repo. I read them from the installed `claude.exe` version `2.1.331` (verified, by extracting the embedded strings; Anthropic does not publish this file as source).

**`claude.yml` (mentions):**
- Triggers: `issue_comment [created]`, `pull_request_review_comment [created]`, `issues [opened, assigned]`, `pull_request_review [submitted]`; job `if:` checks `contains(..., '@claude')` in the right body for each event. No `author_association` check.
- `permissions: contents: read, pull-requests: read, issues: read, id-token: write, actions: read`.
- `actions/checkout@v4` with `fetch-depth: 1`; no `persist-credentials: false`.
- `anthropics/claude-code-action@v1` (a moving tag, not a SHA).
- `anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}` (or the OAuth token secret).
- `additional_permissions: | actions: read`.
- No `timeout-minutes`, no `claude_args` (a commented example `--allowed-tools Bash(gh pr *)`), no model.

**`claude-code-review.yml` (review):**
- `pull_request: types: [opened, synchronize, ready_for_review, reopened]`; author filter commented out.
- `permissions: contents: read, pull-requests: read, issues: read, id-token: write`.
- `plugin_marketplaces: 'https://github.com/anthropics/claude-code.git'`, `plugins: 'code-review@claude-code-plugins'`.
- `prompt: '/code-review:code-review --comment ${{ github.repository }}/pull/${{ github.event.pull_request.number }}'`.
- `claude_args: '--allowedTools "mcp__github_inline_comment__create_inline_comment"'` — no `gh` rules.

The docs page's review example instead uses `plugin_marketplaces: "https://github.com/anthropics/claude-plugins-official.git"` and `plugins: "code-review@claude-plugins-official"` ([GitHub Actions doc](https://code.claude.com/docs/en/github-actions)) (verified). The template and the docs name different marketplaces for the same plugin (verified; open question which is canonical).

The setup PR body the CLI writes says "Claude's default tools are limited to reading/writing files and interacting with our repo by creating comments, branches, and commits" and suggests the removed `allowed_tools:` input (verified, same binary). That text is out of date with v1.

Docs on the review: "Claude skips draft and closed pull requests, pull requests it judges not to need a review, such as automated or trivial ones, and pull requests that already have a comment from Claude" (verified).

Compared with the template, our setup adds: SHA pin, WIF instead of a stored key, `persist-credentials: false`, an author-association guard, a same-repo guard on the review, `timeout-minutes`, and a bot allow-list. It also adds three `Bash(gh pr ...)` rules to the review that the template does not have (inferred from the brief and the template).

---

### 7. Published advisories relevant to CI

From `gh api repos/anthropics/<repo>/security-advisories` on 2026-11-24 (verified).

**claude-code-action (one advisory):**
- [GHSA-8q5r-mmjf-575q](https://github.com/anthropics/claude-code-action/security/advisories/GHSA-8q5r-mmjf-575q), medium, 2026-05-20. "Malicious MCP Server Configuration in PRs Enables Remote Code Execution and Secret Exfiltration". Cause: "checking out PR head branches (attacker-controlled), reading `.mcp.json` from the working directory via default setting sources, and unconditionally enabling all project MCP servers via `enableAllProjectMcpServers`". Affected `< 1.0.74`, patched `1.0.74`. We are on 1.0.289.

**Claude Code (CLI), the ones that bear on CI runs:**
- [GHSA-pq7j-f95f-qfcv](https://github.com/anthropics/claude-code/security/advisories/GHSA-pq7j-f95f-qfcv), high, 2026-10-09. "Plugin Commit SHA Pin Bypass Allows Installation of Attacker-Controlled Code" — a branch named like the pinned SHA. Patched `2.1.179`. Relevant to plugin pinning, which we don't do yet.
- [GHSA-fg94-h982-f3mm](https://github.com/anthropics/claude-code/security/advisories/GHSA-fg94-h982-f3mm), medium, 2026-06-13. "Out-of-Band Data Exfiltration via Pre-Approved HuggingFace Domain in WebFetch" — preapproved domains bypassed "`--allowedTools` restrictions". Patched `2.1.163`. Shows preapproved WebFetch domains are an exfil path.
- [GHSA-jh7p-qr78-84p7](https://github.com/anthropics/claude-code/security/advisories/GHSA-jh7p-qr78-84p7), medium, 2026-01-20. A repo settings file setting `ANTHROPIC_BASE_URL` leaked API keys "before users confirmed trust". Patched `v2.0.65`. The action's base-branch restore and its `ANTHROPIC_BASE_URL` handling relate.
- [GHSA-mmgp-wc2j-qcv7](https://github.com/anthropics/claude-code/security/advisories/GHSA-mmgp-wc2j-qcv7), high, 2026-03-18. Repo `.claude/settings.json` could set `permissions.defaultMode` to `bypassPermissions`. Patched `2.1.53`.
- Command-parsing bypasses of read-only or approval checks: [GHSA-xq4m-mc3c-vvg3](https://github.com/anthropics/claude-code/security/advisories/GHSA-xq4m-mc3c-vvg3) (`$IFS` and short flags, patched `v1.0.93`), [GHSA-qgqw-h4xq-7w8w](https://github.com/anthropics/claude-code/security/advisories/GHSA-qgqw-h4xq-7w8w) (`find`, `v2.0.72`), [GHSA-x5gv-jw7f-j6xj](https://github.com/anthropics/claude-code/security/advisories/GHSA-x5gv-jw7f-j6xj) ("overly broad allowlist of safe commands ... read a file and then send file contents over the network", `v1.0.4`), and others (`sed`, `echo`, `rg`, `cd`). All say exploitation "requires the ability to add untrusted content into a Claude Code context window" — which is what issue and comment text is.
- All listed fixes are below the pinned CLI `2.1.331` (verified by version ranges).

The pattern across these (inferred): the read-only command set and Bash rule matching have been bypassed many times; Anthropic's own docs call Bash rules not a security boundary. A narrow allow list plus no secrets in reach is the safer design than relying on the matcher.

---

### Open questions

1. Does Claude Code allow `gh pr comment <n> --body "$GH_TOKEN"` (variable expansion inside an allowed prefix) without asking, in `default` mode headless? Not documented; needs a test run.
2. Where exactly does the SDK cache the exchanged `sk-ant-oat01-` token under `ANTHROPIC_CONFIG_DIR`, and with what file mode? Not in the action source.
3. Does `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` remove `DEFAULT_WORKFLOW_TOKEN`, `ANTHROPIC_IDENTITY_TOKEN_FILE` and `ANTHROPIC_CONFIG_DIR`? The doc lists examples only.
4. What permissions does the Anthropic app-token exchange grant when the action sends no `permissions` body? The client defaults are contents/PRs/issues write; the server side is not public.
5. Does Claude Code in the action work with a federation rule scoped to `workspace:inference` instead of `workspace:developer`?
6. Is there any per-run or per-day spend control? Only monthly workspace/org spend limits and per-minute rate limits were found.
7. Does Claude Code have its own default turn cap in SDK/headless mode when `--max-turns` is not set?
8. What tools does the fetched `code-review` plugin's skill grant through `allowed-tools`, and do they add to our `--allowedTools` at run time? Which marketplace is canonical (`claude-code` vs `claude-plugins-official`)?
9. Does `sandbox.enabled` through the `settings` input work on GitHub-hosted Ubuntu 24.04 when the action skips the bubblewrap install (it only installs it with `allowed_non_write_users`)?
10. Is there an API to revoke a minted WIF access token early?
11. Can GitHub's egress-firewall runner (`ubuntu-24.04-firewall`) be used outside Anthropic's org, and on which plans? Not checked here.

### Sources

Source code (anthropics/claude-code-action at `eb56b6666facdbd501035f4a0269d8caee2e7a8b`, tag v1.0.289):
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/action.yml
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/docs/security.md
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/docs/usage.md
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/docs/setup.md
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/docs/configuration.md
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/entrypoints/run.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/github/token.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/github/validation/permissions.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/github/validation/actor.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/github/validation/trigger.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/github/validation/untrusted-pr.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/github/operations/git-config.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/github/utils/sanitizer.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/modes/permission-mode.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/modes/tag/index.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/modes/agent/index.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/modes/detector.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/create-prompt/index.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/mcp/install-mcp-server.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/mcp/github-comment-server.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/src/mcp/github-inline-comment-server.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/base-action/src/parse-sdk-options.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/base-action/src/run-claude-sdk.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/base-action/src/workload-identity.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/base-action/src/validate-env.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/base-action/src/install-plugins.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/base-action/src/setup-claude-code-settings.ts
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/examples/claude.yml
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/examples/claude-wif.yml
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/examples/pr-review-comprehensive.yml
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/CLAUDE.md
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/.github/workflows/claude.yml
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/.github/workflows/claude-review.yml
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/.github/workflows/issue-triage.yml
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/.github/egress-firewall.yaml
- https://github.com/anthropics/claude-code-action/blob/eb56b6666facdbd501035f4a0269d8caee2e7a8b/.github/scripts/check_workflow_hardening.py

Claude Code binary:
- `@anthropic-ai/claude-code` 2.1.331, embedded `/install-github-app` workflow templates (read from the installed binary).

Docs (read 2026-11-24):
- https://code.claude.com/docs/en/github-actions
- https://code.claude.com/docs/en/permissions
- https://code.claude.com/docs/en/env-vars
- https://code.claude.com/docs/en/sandboxing
- https://platform.claude.com/docs/en/manage-claude/workload-identity-federation
- https://platform.claude.com/docs/en/manage-claude/wif-providers/github-actions
- https://platform.claude.com/docs/en/manage-claude/wif-reference
- https://platform.claude.com/docs/en/api/rate-limits
- https://platform.claude.com/docs/en/manage-claude/workspaces
- https://platform.claude.com/docs/en/manage-claude/usage-cost-api
- https://platform.claude.com/docs/en/manage-claude/usage-cost-analytics-api

Advisories:
- https://github.com/anthropics/claude-code-action/security/advisories/GHSA-8q5r-mmjf-575q
- https://github.com/anthropics/claude-code/security/advisories/GHSA-pq7j-f95f-qfcv
- https://github.com/anthropics/claude-code/security/advisories/GHSA-fg94-h982-f3mm
- https://github.com/anthropics/claude-code/security/advisories/GHSA-jh7p-qr78-84p7
- https://github.com/anthropics/claude-code/security/advisories/GHSA-mmgp-wc2j-qcv7
- https://github.com/anthropics/claude-code/security/advisories/GHSA-xq4m-mc3c-vvg3
- https://github.com/anthropics/claude-code/security/advisories/GHSA-qgqw-h4xq-7w8w
- https://github.com/anthropics/claude-code/security/advisories/GHSA-x5gv-jw7f-j6xj
- Full list: https://github.com/anthropics/claude-code/security/advisories

Secondary (reported, not re-read for this file):
- GitHub, "About security hardening with OpenID Connect" (claim list, `sub` formats): https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect
- GitHub installation token one-hour expiry: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app


## 3. What others say and what has gone wrong

Note: part 3 cites the v1.0.289 tag as `f891690f`; part 2 and the tag list give `eb56b666` for the same release (likely the tag object against the commit; unverified).


Read on 2026-11-24. Scope: GitHub's guidance, other vendors' agent actions, incidents, supply chain, practitioner reports, and agent-security models, set against our two claude-code-action workflows.

Labels: **(verified)** read in the source that owns the claim. **(reported)** a secondary source says so. **(unverified)** my inference, or not settled.

Source version for claude-code-action claims: tag `v1.0.289`, commit `f891690fbfe7b0a509882acd18428cfd2db34faa`, published 2026-11-23 ([releases](https://github.com/anthropics/claude-code-action/releases)) (verified).

### 0. Findings that bear on our setup first

These come out of the sections below. Each one points at the evidence.

1. **The Bash subprocess holds a write-capable GitHub token. The env scrub does not remove it, and it is off for us.**
   - The action sets `process.env.GITHUB_TOKEN = githubToken` and `process.env.GH_TOKEN = githubToken` ([run.ts L278-280](https://github.com/anthropics/claude-code-action/blob/f891690fbfe7b0a509882acd18428cfd2db34faa/src/entrypoints/run.ts#L278)). With no `github_token` input, that is the Claude GitHub App installation token (verified).
   - The env passed to Claude is `{ ...process.env }` minus only `ACTIONS_ID_TOKEN_REQUEST_URL`, `ACTIONS_ID_TOKEN_REQUEST_TOKEN` and `ALL_INPUTS` ([parse-sdk-options.ts L297-313](https://github.com/anthropics/claude-code-action/blob/f891690fbfe7b0a509882acd18428cfd2db34faa/base-action/src/parse-sdk-options.ts#L297)) (verified).
   - `action.yml` sets `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: ${{ env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB || (inputs.allowed_non_write_users != '' && '1') || '' }}` ([action.yml L318](https://github.com/anthropics/claude-code-action/blob/f891690fbfe7b0a509882acd18428cfd2db34faa/action.yml#L318)). So the scrub is on only when `allowed_non_write_users` is set, or when the workflow sets the variable in `env:`. We do neither: our test forbids `env:` (verified from source; our config from the brief).
   - Even when on, the scrub "Leaves it in place, so that `gh` and scripts that call the GitHub API keep working" for `GITHUB_TOKEN`, `GH_TOKEN` ([Claude Code env-vars, "What the subprocess environment scrub removes"](https://code.claude.com/docs/en/env-vars)). The docs add: "Because the scrub leaves `GITHUB_TOKEN` in place, give a GitHub Actions job the narrowest `permissions` it needs. To remove a GitHub token from sandboxed Bash commands, add a `deny` entry under `sandbox.credentials`" (verified).
   - Consequence: a steered review run holds `Bash(gh pr comment:*)` and a token in its env. Whether `gh pr comment ... --body-file /proc/self/environ`, or a body built from a variable, passes Claude Code's Bash permission check is **not tested** (unverified). It is the same shape as the Comment and Control and RyotaK chains (section 3).
2. **Under WIF, a replayable credential sits in a file the agent can read.** The action writes the GitHub OIDC token (audience `https://api.anthropic.com` by default) to `$RUNNER_TEMP/claude-workload-identity/identity-token` with mode 0600, sets `ANTHROPIC_IDENTITY_TOKEN_FILE` to that path, and refreshes it on a timer ([workload-identity.ts L138-180](https://github.com/anthropics/claude-code-action/blob/f891690fbfe7b0a509882acd18428cfd2db34faa/base-action/src/workload-identity.ts#L138)) (verified). The agent runs as the same user. A leaked copy could be traded at the federation rule until it expires. GitHub's docs example token shows `iat`/`exp` 300 s apart ([GitHub OIDC concepts](https://docs.github.com/en/actions/concepts/security/openid-connect)) (verified as an example only; real lifetime unverified). The action removes the OIDC *request* variables so Claude "cannot mint new tokens" (verified). It does not hide the minted token file (verified).
3. **The 2026 claude-code-action takeover was exactly the "trusted bot" path we use.** `checkWritePermissions` let any `[bot]` actor through; an attacker's own GitHub App could open an issue on a public repo ([Flatt Security, 2026-06-01](https://flatt.tech/research/posts/poisoning-claude-code-one-github-issue-to-break-the-supply-chain/)) (reported). Fixed in v1.0.94. Our `allowed_bots` list and job guard name three apps by login. Wiz notes that a workflow which "allows a specific bot by name can be bypassed by registering an available app with that name" ([Wiz, 2026-04-30](https://www.wiz.io/blog/github-actions-security-ai-powered-actions-vulnerabilities)) (reported). The action's own docs say "Allowed bots are not checked for repository permissions" ([security.md](https://github.com/anthropics/claude-code-action/blob/f891690fbfe7b0a509882acd18428cfd2db34faa/docs/security.md)) (verified). Our Console CEL rule on `actor_id` is a second gate on numeric IDs, which do not depend on the name (unverified that this covers the bypass fully; App bot user IDs are unique, names can be squatted only if free).
4. **Spend.** `--max-turns`: "No limit by default" ([CLI reference](https://code.claude.com/docs/en/cli-reference)) (verified). `--max-budget-usd` exists: "Stop the run once estimated spend on API calls reaches this amount (print mode only) ... Spend can pass the cap" (verified). Whether the action forwards it through `claude_args` was not tested (unverified). gh-aw defaults are a useful contrast: `max-turns` "Defaults to `500`", `max-ai-credits` "enabled by default and defaults to `1000`" ([gh-aw frontmatter](https://github.github.com/gh-aw/reference/frontmatter/)) (verified).
5. **Plugin pinning has its own advisory.** GHSA-pq7j-f95f-qfcv: plugin install "checked out a marketplace's pinned commit SHA using `git checkout` without verifying that the resulting HEAD matched"; an attacker could create "a branch named identically to the pinned 40-character SHA". Fixed in Claude Code 2.1.179, published 2026-10-15 ([GitHub advisory](https://github.com/anthropics/claude-code/security/advisories/GHSA-pq7j-f95f-qfcv)) (verified). We do not pin the marketplace at all, so the review run executes whatever the marketplace's default branch holds at run time.
6. **What GitHub and Anthropic do in their own designs that we do not:** an egress allow-list (gh-aw, Copilot, Anthropic's own VMs), keeping secrets out of the agent's process (gh-aw), staging writes for a separate job (gh-aw safe outputs), and human gates on agent-authored PRs (Copilot). Details in sections 1 and 5.

### 1. GitHub's own guidance

#### 1.1 Secure use of GitHub Actions

Page: [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use), no date on the page (verified):

- `pull_request_target`: "Avoid using the pull_request_target workflow trigger if it's not necessary." "Workflows that use these triggers must not explicitly check out untrusted code."
- `workflow_run`: "For privilege separation between workflows, workflow_run is a better trigger."
- Untrusted input in `run:`: set the value "to an intermediate environment variable", or use a JavaScript action that takes it as an argument.
- Token: "make sure that the GITHUB_TOKEN is granted the minimum required permissions." "set the default permission for the GITHUB_TOKEN to read access only for repository contents."
- Pinning: "Pin references to actions to a commit SHA in your workflow files." New in 2026: a lockfile "supersedes SHA pinning for repositories that adopt it."
- OIDC: lets you "stop storing these credentials as long-lived secrets".
- Self-hosted runners "should almost never be used for public repositories".

Our setup keeps all of these: no `pull_request_target`, no `run:` steps, read-only token, SHA pins, OIDC.

#### 1.2 GitHub Security Lab, "Keeping your GitHub Actions and workflows secure"

- Part 1, [Preventing pwn requests](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/), 2021-08-03 (verified): "Combining `pull_request_target` workflow trigger with an explicit checkout of an untrusted PR is a dangerous practice." Not passing `persist-credentials` as false "makes it even worse". Label gating "is still prone to a race condition". "Artifacts resulting from untrusted PR data are themselves untrusted".
- Part 2, [Untrusted input](https://securitylab.github.com/resources/github-actions-untrusted-input/), 2021-08-04 (verified): lists attacker-controlled fields such as `github.event.issue.title`, `github.event.issue.body`, `github.event.comment.body`, `github.head_ref`. "your code will often run with repo write privileges on potentially untrusted input."

What carries over to agents: issue and comment text is the same untrusted input. An agent does not need `run:` interpolation to be injected. The prompt is the interpolation.

#### 1.3 GitHub Agentic Workflows (gh-aw)

GitHub's own design for running coding agents in Actions. Sources: [architecture](https://github.github.com/gh-aw/introduction/architecture/) (diagram asset dated 2026-08-29), [blog, 2026-03-09](https://github.blog/ai-and-ml/generative-ai/under-the-hood-security-architecture-of-github-agentic-workflows/), [threat detection](https://github.github.com/gh-aw/reference/threat-detection/), [frontmatter](https://github.github.com/gh-aw/reference/frontmatter/) (all verified).

- Principles: "defense in depth, don't trust agents with secrets, stage and vet all writes, and log everything."
- Read-only agent: the agent job "runs with minimal read-only permissions"; writes run in separate jobs after it.
- Safe outputs: writes are "buffered as artifacts by SafeOutputs rather than applied immediately", so "even a fully compromised agent cannot directly modify repository state." The pipeline limits which writes and how many, and sanitizes content.
- Secrets: they "avoid exposing those tokens directly to the agent's container". LLM auth goes through an isolated API proxy. An MCP gateway "has exclusive access to MCP authentication material."
- Network: "The Squid proxy controls the agent's egress traffic via a configurable domain allowlist to prevent data exfiltration."
- Threat detection: a separate job checks for "prompt injection attempts, secret leaks, and malicious code patches". On by default with safe outputs. Default is warn mode; strict mode means "safe outputs are not applied". GitHub calls it "defense in depth, not proof".
- Who can trigger: a pre-activation "Role Permission Check". For public repos "`min-integrity: approved` is applied automatically," limiting content to owners, members and collaborators. The architecture page also warns that "A read-only `GITHUB_TOKEN` does not remove other credentials or privileged host access."
- Limits by default: `max-turns` 500, agent step `timeout-minutes` 20, agent job 60, detection job 10, `max-ai-credits` 1000.

Contrast with ours: our agent process holds the write token itself (finding 1). There is no egress limit, no output staging, and no detection pass between the agent and `gh pr comment`.

#### 1.4 Copilot cloud agent (formerly "coding agent")

[Risks and mitigations](https://docs.github.com/en/copilot/concepts/agents/coding-agent/risks-and-mitigations) and [firewall](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/customize-the-agent-firewall) (verified):

- Who: "Only users with write access to the repository can trigger Copilot cloud agent to work." Comments from others are not passed to the agent.
- Hidden text: "text entered as an HTML comment in an issue or pull request comment is not passed to Copilot cloud agent."
- Branches: it "only has the ability to push to a single branch", a new `copilot/` branch unless started from an existing PR.
- Workflows: "By default, workflows are not triggered until Copilot cloud agent's code is reviewed."
- Merge: its draft PRs "must be reviewed and merged by a human". The requester cannot approve their own agent PR.
- Firewall: on by default with a recommended allow-list. It "does not apply directly to other MCP servers" or to setup steps. "Disabling the firewall will allow Copilot to connect to any host".

### 2. Other vendors' agent actions

| | openai/codex-action | google-github-actions/run-gemini-cli | anthropics/claude-code-action |
| --- | --- | --- | --- |
| Who can trigger by default | write access, plus `allow-users`; bots only via `allow-bots` / `allow-bot-users` ("`*` is not supported") | not enforced by the action; the docs say to prefer runs "kicked off intentionally by a maintainer" | write access; bots only via `allowed_bots`; `allowed_non_write_users` bypass marked "RISKY" |
| Sandbox | `safety-strategy` default `drop-sudo`; options `unprivileged-user`, `read-only`, `unsafe`; legacy `workspace-write` sandbox if no profile | none mentioned | none: "This is a list of common commands, not a sandbox." bubblewrap PID isolation only with the scrub |
| Network | `:workspace` profile "does not grant network access" | not covered | not limited by the action |
| Credential to the agent | API key goes through a proxy; in `read-only`, "Codex could read it if it can reach process memory" | GITHUB_TOKEN or a custom App; WIF for Google Cloud | API key, OAuth token, or WIF; GitHub App token in env (finding 1) |
| Version read | README at HEAD, examples use `@v1` | README, `gemini_cli_version` default `latest` | v1.0.289 |

Sources: [codex-action README](https://github.com/openai/codex-action), [run-gemini-cli README](https://github.com/google-github-actions/run-gemini-cli), [its best practices](https://github.com/google-github-actions/run-gemini-cli/blob/main/docs/best-practices.md), [its trust guidance](https://github.com/google-github-actions/run-gemini-cli/blob/main/docs/trust-guidance.md), [claude-code-action security.md](https://github.com/anthropics/claude-code-action/blob/f891690fbfe7b0a509882acd18428cfd2db34faa/docs/security.md) (all verified, 2026-11-24).

Notes:
- Gemini's trust guidance: "If you are processing **untrusted data**, you must strictly limit which tools the Gemini CLI is allowed to execute." It suggests read-only tools such as `list_directory`, `read_file`, `grep_search` (verified).
- Gemini defaults the CLI version to `latest`, which is the same class of risk as our unpinned marketplace (verified).
- Codex is the only one with an OS-level sandbox and no-network default in the action itself (verified).
- Claude's action strips HTML comments, invisible characters, image alt text, hidden attributes and entities, "but new bypass techniques may emerge" (verified).
- Anthropic also offers a managed [Code Review](https://code.claude.com/docs/en/code-review) that runs on Anthropic infrastructure. "Inside a review, access to your repository is read-only, and a review doesn't push commits." It reads `REVIEW.md` "never from the pull request's own changes". It has an org-wide monthly spend limit, and it skips reviews when "what's left is less than the expected cost of one review" ([costs](https://code.claude.com/docs/en/code-review-costs)). It needs a Team or Enterprise plan (verified). This is the closest managed alternative to our review workflow.
- I did not find an official Cursor GitHub Action for CI agents (unverified; not searched in depth).

### 3. Incidents and research: prompt injection and AI agents in CI

| Case | Date | What happened | Root cause | Control that would have stopped it |
| --- | --- | --- | --- | --- |
| claude-code-action bot bypass, RyotaK ([Flatt Security](https://flatt.tech/research/posts/poisoning-claude-code-one-github-issue-to-break-the-supply-chain/); [THN](https://thehackernews.com/2026/06/claude-code-github-action-flaw-let-one.html)) | reported 2026-01-12, bypass fixed 2026-01-16, published 2026-06-01 | An attacker's GitHub App opens an issue, the injected text makes Claude read `/proc/self/environ`, the leaked `ACTIONS_ID_TOKEN_REQUEST_TOKEN`/`_URL` are replayed to get a Claude App token with write to contents, issues, PRs and workflows. Anthropic's own repo was exposed. | `checkWritePermissions` trusted any `[bot]` actor; agent mode lacked `checkHumanActor`; OIDC request vars reachable; public run summary; examples used `allowed_non_write_users: "*"` | v1.0.94: human-actor check, OIDC vars removed from Claude env, run summary off by default, `gh.sh` wrapper, ignoring edits made after trigger (reported). CVSS v4 7.8. |
| Clinejection ([Cline post-mortem](https://cline.bot/blog/post-mortem-unauthorized-cline-cli-npm); [Willison](https://simonwillison.net/2026/Mar/6/clinejection/)) | disclosed 2026-02-09, exploited 2026-02-17 | Prompt injection in an issue title to Cline's triage workflow (claude-code-action, `allowed_non_write_users: "*"`, Bash), cache poisoning into the nightly release, `cline@2.3.0` published with a postinstall for about eight hours | anyone could trigger an agent with Bash; triage and release shared a cache scope; the wrong npm token was revoked | not letting outsiders trigger; no Bash on untrusted input; no shared cache with credential jobs; OIDC trusted publishing; verify revocation (verified from the post-mortem) |
| Comment and Control ([CSA note](https://labs.cloudsecurityalliance.org/research/csa-research-note-comment-control-github-prompt-injection-20/); [researcher](https://oddguan.com/blog/comment-and-control-prompt-injection-credential-theft-claude-code-gemini-cli-github-copilot/)) | disclosed 2026-04-15 | PR titles, issue bodies and comments hijacked Claude Code Security Review, Gemini CLI Action and Copilot agent; they leaked `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `GEMINI_API_KEY`, Copilot tokens back through GitHub comments | untrusted text in context with the same authority as instructions; secrets in the agent env; a comment-posting tool | no single control; CSA lists removing secrets, minimal `permissions:`, trusted-actor gates, stripping HTML comments, scanning outputs before posting, SHA pins. "none assigned a CVE" (reported) |
| Microsoft: Read tool and `/proc` ([Microsoft Security blog, 2026-06-05](https://www.microsoft.com/en-us/security/blog/2026/06/05/securing-ci-cd-in-agentic-world-claude-code-github-action-case/)) | reported 2026-04-29, fixed 2026-05-05 | Injection got the agent to read `/proc/self/environ` and leak `ANTHROPIC_API_KEY`, with a prefix trimmed to dodge secret scanning | "the Read tool was not subject to the same sandboxing model" as Bash | Claude Code 2.1.128 blocks sensitive `/proc` files in Read; Microsoft recommends the Agents Rule of Two (reported) |
| GHSA-8q5r-mmjf-575q, CVE-2026-47751 ([advisory](https://github.com/anthropics/claude-code-action/security/advisories/GHSA-8q5r-mmjf-575q)) | published 2026-06-10 | A PR with a malicious `.mcp.json` got code execution when a privileged user ran the action on it | checkout of PR head + project MCP config loaded + `enableAllProjectMcpServers` | fixed in 1.0.74 (verified) |
| PromptPwnd ([Aikido](https://www.aikido.dev/blog/promptpwnd-github-actions-ai-agents)) | 2025-12-04 | Pattern: untrusted issue/PR text in the prompt, agent with privileged tools; PoC on Gemini CLI's own repo made the agent run `gh issue edit` with secrets in the body | prompt embeds untrusted input and the agent holds powerful tokens | "Restrict the toolset", "Avoid injecting untrusted user input into AI prompts", "Treat AI output as untrusted code". Claude/Codex risky when opened to everyone (reported) |
| Wiz, AI-powered actions ([Wiz, 2026-04-30](https://www.wiz.io/blog/github-actions-security-ai-powered-actions-vulnerabilities)) | 2026-04-30 | Bot-name trust, Dependabot as confused deputy (`@dependabot recreate`), credential files from auth actions readable by the model, `show_full_output` leaks | name-based trust; secrets on disk | explicit bot lists, author-association checks, no verbose output in public repos, "Do not rely on core models to prevent prompt injection" (reported) |
| Invariant Labs, GitHub MCP toxic flow ([Invariant](https://invariantlabs.ai/blog/mcp-github-vulnerability)) | 2025-05-26 | A public issue made a user's agent copy private-repo data into a public PR | "a fundamental architectural issue", not a server bug: an agent with cross-repo token reading untrusted issues | one repo per session, least-privilege tokens, monitoring (reported, vendor research) |
| Nx s1ngularity ([Nx GHSA-cxm3-wv7p-598c](https://github.com/nrwl/nx/security/advisories/GHSA-cxm3-wv7p-598c); [Snyk](https://snyk.io/blog/weaponizing-ai-coding-agents-for-malware-in-the-nx-malicious-package)) | 2025-08-26/27 | Malicious `nx` versions ran a postinstall that drove local AI CLIs (`claude --dangerously-skip-permissions`, `gemini --yolo`, `q --trust-all-tools`) to inventory secrets, then pushed them to `s1ngularity-repository` repos | `pull_request_target` workflow with `${{ github.event.pull_request.title }}` in `run:`; npm token reachable from `publish.yml` | no untrusted input in `run:`; no `pull_request_target`; trusted publishing; `--ignore-scripts` (verified for the workflow root cause; AI CLI flags reported by Snyk) |
| Amazon Q VS Code 1.84.0 ([AWS-2025-015](https://aws.amazon.com/security/security-bulletins/AWS-2025-015/); [404 Media](https://404media.co/hacker-plants-computer-wiping-commands-in-amazons-ai-coding-agent)) | bulletin 2025-07-23 | A wiper prompt ("clean a system to a near-factory state") shipped in a release, passed to `q` with `--trust-all-tools --no-interactive`; it failed on a syntax error | "inappropriately scoped GitHub token in their CodeBuild configuration" (verified) | least-privilege CI tokens; branch protection with no bypass; review of release contents |
| Gemini CLI, Tracebit ([Tracebit](https://tracebit.com/blog/code-exec-deception-gemini-ai-cli-hijack)) | reported 2025-06-27, fixed v0.1.14 on 2025-07-25 | A README injection got an allow-listed `grep` to run with appended commands that sent env vars out | allow-list matched on the first command only | parse the whole command; show it; require approval for new binaries (reported) |

Other Claude Code advisories worth knowing for allow-listed Bash, from the [claude-code advisory list](https://github.com/anthropics/claude-code/security/advisories) (verified titles and dates): GHSA-xq4m-mc3c-vvg3 (CVE-2025-66032, "Command Validation Bypass Allows Arbitrary Code Execution", 2025-12-03, "errors in parsing shell commands related to `$IFS` and short CLI flags"); GHSA-qgqw-h4xq-7w8w (find, 2026-02-03); GHSA-mhg7-666j-cqg4 (piped sed, 2026-02-06); GHSA-vhw5-3g5m-8ggf (domain validation bypass, 2026-02-03); GHSA-fg94-h982-f3mm (exfiltration via a pre-approved WebFetch domain, 2026-06-13). RyotaK reports about 50 ways to bypass Claude Code's permission system (reported, [THN search snippet](https://thehackernews.com/2026/06/claude-code-github-action-flaw-let-one.html)). The lesson: a `Bash(gh pr comment:*)` prefix rule is a parser-dependent control, not a boundary.

Academic: GitInject ([arXiv 2606.09935](https://arxiv.org/html/2606.09935)) offers a framework that reproduces eleven cases against live workflows (reported; not read in full).

### 4. Supply chain

- **tj-actions/changed-files**, CVE-2025-30066, active 2025-03-14 to 2025-03-15: attackers "retroactively modified multiple version tags to reference a malicious commit"; the script dumped runner memory secrets into logs; fixed in 46.0.1 ([GHSA-mrrh-fwg8-r2c3](https://github.com/advisories/GHSA-mrrh-fwg8-r2c3)) (verified). CISA ties it to an earlier reviewdog/action-setup compromise, CVE-2025-30154 ([CISA, 2025-03-18](https://www.cisa.gov/news-events/alerts/2025/03/18/supply-chain-compromise-third-party-tj-actionschanged-files-cve-2025-30066-and-reviewdogaction)) (verified). StepSecurity's anomaly detection flagged an outbound call to `gist.githubusercontent.com` (verified, per the advisory). Repos pinned by SHA to an older clean commit were not affected by tag moves (reported, general consensus).
- **GitHub SHA-pin policy**: since 2025-08-15, the allowed-actions policy can block actions with `!` and can "enforce the use of SHA pinning" ([changelog](https://github.blog/changelog/2025-08-15-github-actions-policy-now-supports-blocking-and-sha-pinning-actions/)) (reported via search summary of the changelog; the policy is checked at run time per community tests).
- **Workflow lockfiles**: GA on 2026-10-28 ([changelog](https://github.blog/changelog/2026-10-28-github-actions-workflow-lockfiles-are-generally-available), reported). The docs: "A workflow dependency lockfile pins a commit SHA to every action your workflows depend on", "including transitive dependencies", at `.github/workflows/actions.lock`, made by `gh actions-lock`. "It doesn't pin calls to reusable workflows" and "doesn't control other build inputs" ([docs](https://docs.github.com/en/actions/concepts/security/workflow-dependency-lockfiles)) (verified). For us: claude-code-action is a composite action that itself runs `oven-sh/setup-bun` and `bun install`; a top-level SHA pin does not fix those (unverified for the exact transitive list).
- **Plugin marketplaces**: see finding 5. A pin is only as good as the checkout that honours it.
- **zizmor**: audits include `excessive-permissions`, `dangerous-triggers` (flags `issue_comment`), `template-injection`, `artipacked` (persisted git credentials), `bot-conditions` ("Detects potentially spoofable bot conditions"), `unpinned-uses`, `impostor-commit`, `cache-poisoning`, `known-vulnerable-actions`, `github-app` ([audits](https://docs.zizmor.sh/audits/), newest version named on page v1.33.0) (verified). I saw no AI-agent-specific audit (unverified; the page was cut off). `bot-conditions` is relevant to our `github.actor`-style login checks.
- **StepSecurity Harden-Runner**: egress `audit` or block with an allow-list built from a baseline; detected tj-actions; full support on Linux GitHub-hosted runners, "audit mode only" on Windows/macOS; free Community tier for public repos, Enterprise for private repos ([README](https://github.com/step-security/harden-runner), example pin v2.21.0) (verified). GitHub's own outbound network control for hosted runners is on the [roadmap (#821)](https://github.com/github/roadmap/issues/821) as a preview (reported; no GA found).
- **OpenSSF Scorecard** ([checks](https://github.com/ossf/scorecard/blob/main/docs/checks.md)) (verified): Token-Permissions top score when top-level permissions are read-only and writes are declared per job; "Set top-level permissions as `read-all` or `contents: read`". Pinned-Dependencies: "pin dependencies by hash". Dangerous-Workflow (Critical): untrusted checkouts and script injection.

### 5. Practitioner reports

- **Anthropic on itself** ([Jason Clinton, 2026-07-21](https://claude.com/blog/how-anthropic-secures-its-ai-native-software-development-lifecycle)) (reported, first-party blog): "agents aren't merging code to production unchecked." "Give every agent a single-purpose identity with the minimum permissions for its job." Draw the boundary "around access and actions, not around a model's instructions." "Agent traffic on these VMs is egress-allowlisted." New AI reviewers start in shadow mode, posting "comments for human approval until trust is earned." All agent actions go to the SIEM.
- **Anthropic docs, costs** ([GitHub Actions page](https://code.claude.com/docs/en/github-actions)) (verified): "Set `--max-turns` in `claude_args` to limit iterations", "Set workflow-level timeouts", "Use GitHub's concurrency controls to limit parallel runs".
- **Uber uReview** ([Uber, 2025-08-12](https://www.uber.com/blog/ureview/)) (reported): measures usefulness by developer ratings ("75% of its comments as useful") and an addressed rate ("over 65% of its posted comments addressed", judged by re-running on the final commit). False positives are "the main challenge"; they filter with a second scoring prompt and suppress low-value categories. "Precision Is More Valuable than Volume." Not GitHub Actions (Phabricator).
- **Study of 16 AI review actions** ([arXiv 2508.18771, v2 2026-04-25](https://arxiv.org/abs/2508.18771)) (reported): more than 22,000 comments in 178 repos; "effectiveness varies widely"; concise comments with code snippets, and manually triggered reviews, more often lead to changes.
- **thoughtbot** ([2026-05-04](https://thoughtbot.com/blog/creating-software-while-afk-with-github-workflows)) (reported): label triggers (`needs-elaboration`, then `ready-for-dev`) as human gates, `--max-turns 20`, manual merge, preview deploys; pinned `claude-code-action@v1.0.70`; suits low-stakes side projects.
- **Community patterns** ([backgroundclaude.com](https://backgroundclaude.com/blog/github-actions)) (reported, low weight): concurrency group per PR or issue with `cancel-in-progress`, `--max-turns` with `--max-budget-usd`, lower turn caps for reviews than for implementation.
- I found no engineering blog from a known company with real cost figures for claude-code-action in production (unverified gap).

### 6. Agent-security models applied to CI

- **Lethal trifecta** ([Willison, 2025-06-16](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)) (verified): access to private data, exposure to untrusted content, and the ability to communicate externally. "we still don't know how to 100% reliably prevent this from happening." A 95% guardrail is "very much a failing grade".
- **Agents Rule of Two** ([Meta, 2025-10-31](https://ai.meta.com/blog/practical-ai-agent-security/)) (verified): no more than two of [A] "process untrustworthy inputs", [B] "access to sensitive systems or private data", [C] "change state or communicate externally" in one session. With all three, it "should not be permitted to operate autonomously and at a minimum requires supervision." Microsoft applies this to claude-code-action directly (section 3).
- **OWASP Top 10 for Agentic Applications 2026**, published 2025-12-09 ([OWASP](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)) (verified date; entry names reported): ASI01 Agent Goal Hijack, ASI02 Tool Misuse and Exploitation, ASI03 Identity and Privilege Abuse, ASI04 Agentic Supply Chain Vulnerabilities, ASI05 Unexpected Code Execution, ASI06 Memory and Context Poisoning, ASI07 Insecure Inter-Agent Communication, ASI08 Cascading Failures, ASI09 Human-Agent Trust Exploitation, ASI10 Rogue Agents.

Applied to our two workflows (unverified; my reading):

| Workflow | [A] untrusted input | [B] secrets / private data | [C] state change / external comms | Verdict |
| --- | --- | --- | --- | --- |
| Review | PR diff and description. Authors are limited to trusted actors and same-repo heads, but the diff can carry text a trusted bot (e.g. a dependency bot) copied from outside | App token in env, OIDC identity token file, repo contents | `gh pr comment`, inline comments (public on a public repo) | all three present; [A] is narrowed by the actor guard, not removed |
| Mention | issue and comment text; a trusted user can quote or reference outside text, and Claude "still reads the body" of others' issues it is pointed at | same, plus default tools | default tools, comments, pushes via the App token | all three present; the widest of the two |

The guard on who triggers a run does not control what text the run reads. The action says so: "Triggering a run does not make someone else's text a request ... but Claude still reads the body" ([security.md](https://github.com/anthropics/claude-code-action/blob/f891690fbfe7b0a509882acd18428cfd2db34faa/docs/security.md)) (verified).

### Open questions

1. Does Claude Code's Bash permission check allow `gh pr comment <n> --body-file /proc/self/environ` or `--body-file $RUNNER_TEMP/claude-workload-identity/identity-token` under `Bash(gh pr comment:*)`? Needs a test in a throwaway repo. The Read-tool `/proc` block (2.1.128) does not obviously cover a subprocess reading the file.
2. Does a `sandbox.credentials` deny entry, passed through the action's `settings` input, remove `GH_TOKEN` from Bash while `gh pr comment` still works? The docs suggest the deny removes the token, which would also break `gh`.
3. Real lifetime of the GitHub OIDC token, and of the Anthropic token minted from it. Can the federation rule pin `jti` single use, or a shorter max age?
4. Does `--max-budget-usd` pass through `claude_args` to the SDK in v1.0.289? (`max-turns` is parsed explicitly in [parse-sdk-options.ts L223](https://github.com/anthropics/claude-code-action/blob/f891690fbfe7b0a509882acd18428cfd2db34faa/base-action/src/parse-sdk-options.ts#L223); budget not checked.)
5. Can an App be registered with the same slug as one of our three allowed bots after one is deleted? Our CEL `actor_id` list should catch it, but only if every path (job guard, `allowed_bots`, CEL) agrees.
6. Does GitHub secret scanning auto-revoke a `ghs_` installation token posted in a PR comment, and how fast? This sets the real exposure window of finding 1.
7. Which marketplace and plugin commit did each review run actually execute? We have no record today.
8. Cursor and other vendors' CI agents were not covered in depth.

### Sources

GitHub
- https://docs.github.com/en/actions/reference/security/secure-use
- https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/
- https://securitylab.github.com/resources/github-actions-untrusted-input/
- https://docs.github.com/en/actions/concepts/security/openid-connect
- https://docs.github.com/en/actions/concepts/security/workflow-dependency-lockfiles
- https://github.blog/changelog/2026-10-28-github-actions-workflow-lockfiles-are-generally-available
- https://github.blog/changelog/2025-08-15-github-actions-policy-now-supports-blocking-and-sha-pinning-actions/
- https://github.com/github/roadmap/issues/821
- https://github.github.com/gh-aw/introduction/architecture/
- https://github.github.com/gh-aw/reference/threat-detection/
- https://github.github.com/gh-aw/reference/frontmatter/
- https://github.blog/ai-and-ml/generative-ai/under-the-hood-security-architecture-of-github-agentic-workflows/
- https://docs.github.com/en/copilot/concepts/agents/coding-agent/risks-and-mitigations
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/customize-the-agent-firewall

Anthropic
- https://github.com/anthropics/claude-code-action/blob/f891690fbfe7b0a509882acd18428cfd2db34faa/docs/security.md
- https://github.com/anthropics/claude-code-action/blob/f891690fbfe7b0a509882acd18428cfd2db34faa/action.yml#L318
- https://github.com/anthropics/claude-code-action/blob/f891690fbfe7b0a509882acd18428cfd2db34faa/src/entrypoints/run.ts#L278
- https://github.com/anthropics/claude-code-action/blob/f891690fbfe7b0a509882acd18428cfd2db34faa/base-action/src/parse-sdk-options.ts#L297
- https://github.com/anthropics/claude-code-action/blob/f891690fbfe7b0a509882acd18428cfd2db34faa/base-action/src/workload-identity.ts#L138
- https://github.com/anthropics/claude-code-action/security/advisories/GHSA-8q5r-mmjf-575q
- https://github.com/anthropics/claude-code/security/advisories (list; GHSA-xq4m-mc3c-vvg3, GHSA-pq7j-f95f-qfcv and others)
- https://code.claude.com/docs/en/github-actions
- https://code.claude.com/docs/en/env-vars
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/code-review
- https://code.claude.com/docs/en/code-review-costs
- https://claude.com/blog/how-anthropic-secures-its-ai-native-software-development-lifecycle

Other vendors
- https://github.com/openai/codex-action
- https://github.com/google-github-actions/run-gemini-cli
- https://github.com/google-github-actions/run-gemini-cli/blob/main/docs/best-practices.md
- https://github.com/google-github-actions/run-gemini-cli/blob/main/docs/trust-guidance.md

Incidents and research
- https://flatt.tech/research/posts/poisoning-claude-code-one-github-issue-to-break-the-supply-chain/
- https://thehackernews.com/2026/06/claude-code-github-action-flaw-let-one.html
- https://labs.cloudsecurityalliance.org/research/csa-research-note-claude-code-github-action-prompt-injection/
- https://www.microsoft.com/en-us/security/blog/2026/06/05/securing-ci-cd-in-agentic-world-claude-code-github-action-case/
- https://cline.bot/blog/post-mortem-unauthorized-cline-cli-npm
- https://simonwillison.net/2026/Mar/6/clinejection/
- https://labs.cloudsecurityalliance.org/research/csa-research-note-comment-control-github-prompt-injection-20/
- https://oddguan.com/blog/comment-and-control-prompt-injection-credential-theft-claude-code-gemini-cli-github-copilot/
- https://www.aikido.dev/blog/promptpwnd-github-actions-ai-agents
- https://www.wiz.io/blog/github-actions-security-ai-powered-actions-vulnerabilities
- https://invariantlabs.ai/blog/mcp-github-vulnerability
- https://github.com/nrwl/nx/security/advisories/GHSA-cxm3-wv7p-598c
- https://snyk.io/blog/weaponizing-ai-coding-agents-for-malware-in-the-nx-malicious-package
- https://aws.amazon.com/security/security-bulletins/AWS-2025-015/
- https://404media.co/hacker-plants-computer-wiping-commands-in-amazons-ai-coding-agent
- https://tracebit.com/blog/code-exec-deception-gemini-ai-cli-hijack
- https://arxiv.org/html/2606.09935

Supply chain tools
- https://github.com/advisories/GHSA-mrrh-fwg8-r2c3
- https://www.cisa.gov/news-events/alerts/2025/03/18/supply-chain-compromise-third-party-tj-actionschanged-files-cve-2025-30066-and-reviewdogaction
- https://docs.zizmor.sh/audits/
- https://github.com/step-security/harden-runner
- https://github.com/ossf/scorecard/blob/main/docs/checks.md

Practitioners and models
- https://www.uber.com/blog/ureview/
- https://arxiv.org/abs/2508.18771
- https://thoughtbot.com/blog/creating-software-while-afk-with-github-workflows
- https://backgroundclaude.com/blog/github-actions
- https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/
- https://ai.meta.com/blog/practical-ai-agent-security/
- https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/

