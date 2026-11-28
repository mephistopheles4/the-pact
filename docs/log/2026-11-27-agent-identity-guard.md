# Cross-harness agent identity guard

**2026-11-27.** PACT-119 (sub-issues T1 PACT-120, T2 PACT-121, T3 PACT-122, T4 PACT-123, T5 PACT-124), thorough tier on the sensitive route (auth). Spec `0010-agent-identity-guard.md` extends `agent-identity` guarding across Claude Code, Codex, and Antigravity under one configuration setting, closing plain `gh` writes across all three harnesses and plain `git` writes in Codex and Antigravity.

## What was built

- **T1 (`PACT-120`, shared guard core):** `claude/guard/guard.mjs` adds `parseTableDoc` for optional `"identity": { "enabled": true, "posterOn": <boolean> }` in `rules.json`, closed `git`/`gh` subcommand and option tables (`GIT_WRITE_SUBCOMMANDS`, `GIT_GLOBAL_OPTS`, `GIT_PUSH_VALUE_FLAGS`, `GH_READ_VERBS`, `GH_ACCOUNT_SCOPED_GROUPS`, shared `parseGhApi`), hardened `segmentsOf` tokenization (arithmetic depth, `--%` stop-parsing, inline continuations, unquoted escapes, nested `"$(...)"`, no-space `{` scriptblocks), lazy 64 KiB `github.json` reading (`pin` fail-closed on symlinks/malformed shapes), regular-file `.gitconfig` checks (`identity-gitconfig`), plain-text `.git/config` / `gitdir:` / `commondir` / `config.worktree` repo-owner scoping via `resolveNoSymlinks` (zero `git` subprocesses, rejecting UNC/device/drive-relative paths and symlinks, 1 MiB read cap), `claude` `git` override/unset guarding, optional `shell` hint on `answerCall`, and zero-leak denial templates (`C1`–`C6`, `C11`).
- **T2 (`PACT-121`, wrappers and launchers):** adds `claude/guard/claude.mjs` (`PreToolUse` `hookSpecificOutput` `deny` output), updates `claude/guard/antigravity.mjs` and `claude/guard/codex.mjs` to pass `shell`, strict `cwd`, and `canOverwrite`, updates `GUARD_SCRIPTS` in `gate/install-core.mjs` and `gate/seam-a-core.mjs`, and adds `LAUNCH_ANSWERS.claude` / `guardLauncherText('claude')`. Antigravity emits `overwrite` + `decision: "force_ask"` (never `"allow"`) only on unambiguous single simple `git` `run_command` calls (`deny` fallback on compound/shadowed commands, `manage_task`, and `send_command_input`).
- **T3 (`PACT-122`, installer, Seam A, rendered rules, and Scriptorium):** wires `switches` (`cleaner` + `agent-identity`), `expectedCopySet`, and per-active-harness Windows `.cmd` launchers in `gate/install-core.mjs`, `gate/install-run.mjs`, and `gate/seam-a-core.mjs`; merges Claude's `PreToolUse` (`Bash|PowerShell`) hook independently of `auto-compact-window` with `entryDrift` matcher checks and updated `TOOL_WARNS['gh-app']`; adds `settings-env` in `gate/harnesses.mjs` and `harnesses/known.json`; renders `tool-gh-app` (`Use your pinned GitHub App`) into Codex and Antigravity `AGENTS.md` without changing Claude `CLAUDE.md` (`claude/CLAUDE.md`, `gate/render-core.mjs`, `gate/harness-render.mjs`); updates `builder/build.mjs`, `builder/default-config/`, and `builder/scriptorium.html`; and adds bad-case gate tests plus automated `--home` end-to-end launcher invocations (`C7`–`C9`, `C12`).
- **T4 (`PACT-123`, docs, threat model, and regenerated outputs):** updates `claude/review.md`, `AGENTS.md`, `docs/agents/agent-apps.md`, `docs/agents/work-records.md`, `docs/agent-identity.md`, `docs/install.md`, `docs/rule-reasons.md`, and `docs/reference.md` with `--provider <provider>`, explicit-login `--add-assignee <owner>` / `--remove-assignee <owner>` via `gh-app.mjs gh`, cross-harness guarding, and rollback order; updates `docs/threat-model.md` (`Text into a session`, `Code that runs`, `What leaves the machine`, and the ADR 0175 speed-bump boundary); folds `2026-10-26-poster-scan-copies.md` into `older.md`; and regenerates `builder/` defaults/page, `cloud-sessions/`, and doc TOCs (`C10`).

## Post-T2 early Windows live probe (redacted)

Executed at `fdb4ef17` in isolated temporary directories (`<TMP>` only); live `~/.claude/`, `~/.pact/`, and `~/.gemini/` stayed untouched and temporary fixtures were removed afterward:

1. **Windows `cmd.exe` launchers (`claude.cmd`, `antigravity.cmd`, `codex.cmd`):**
   - `claude.cmd` (`Bash`, Windows `cwd`): `gh pr create` exited `0` with `PreToolUse` `permissionDecision: "deny"` pointing to `poster.mjs`/`gh-app.mjs --provider claude`. Shell hint verified (`Bash` denies `$env:GH_REPO = "Stranger/repo"; gh pr create ...`; `PowerShell` allows it).
   - `claude.cmd` (`Bash`, `/c/...`-style `cwd`): `gh pr create` and `git -c user.email=... commit` denied; `git commit` with valid `GIT_CONFIG_GLOBAL` + `GIT_TERMINAL_PROMPT=0` exited `0` silently; unconfigured `/c/...` `cwd` fails closed safely.
   - Missing `node` / crashing wrapper (`process.exit(1)`): `claude.cmd` emitted `PreToolUse` `deny` (`exit=0`), `antigravity.cmd` emitted `{"decision":"deny",...}` (`exit=0`), and `codex.cmd` exited `2` on stderr.
2. **Claude Code CLI (`claude -p`, `2.1.332`):** Under isolated temp `HOME`/`USERPROFILE`, `init` reported Windows `cwd` and exited `1` (`Not logged in · Please run /login`), so unauthenticated `--home` isolation cannot fire authenticated hooks; `cmd.exe` launcher behavior holds.
3. **Antigravity headless CLI (`agy -p`, `1.5.18`):** Under isolated `HOME`/`USERPROFILE` (`<TMP>/home/.gemini/config/hooks.json`), on `run_command` (`git commit -m test`), `agy` invoked `antigravity.cmd` (`hasCwd: true`, `workspacePathsLen: 1`), `antigravity.mjs` returned `decision: "force_ask"` + `overwrite.CommandLine`, and `agy` both applied `overwrite.CommandLine` (`GIT_CONFIG_GLOBAL` + `GIT_TERMINAL_PROMPT=0`) and honored `force_ask` by refusing headless auto-execution (`request-review` `TOOL_ERROR`). No fallback to `"deny"` was needed.

## Live dogfooding confirmation (T5, redacted)

Executed interactively against a live `--apply` install at `3c6ca78b` on the owner's machine (no bot login, app ID, bot ID, slug, owner ID, or local paths logged):

- **Antigravity UI:** interactive `run_command` triggered `antigravity.cmd`, returned `decision: "force_ask"` paired with `overwrite.CommandLine`, and prompted the owner in the UI with the rewritten `GIT_CONFIG_GLOBAL` + `GIT_TERMINAL_PROMPT=0` command.
- **Claude Code & Codex:** owner-verified live in both harnesses across plain `git`/`gh` write checks and identity routing.

## Left open

- **Owner-accepted security residuals (`S2` items 6–7, 9, 11; `ADR 0175`):** unpinned non-Claude provider pass-through, `gh run`/`gh workflow` write exemption while `CLAIM_PERMISSIONS` holds `actions: read` only (`PACT-95`), `git pull` exclusion, `~/.gitconfig` `author.*` inheritance, and the speed-bump parser/harness boundary.

## Record

- `PACT-119`: spec approval decision (`8b2a56bc`), T1–T4 execution records (`3ea051ef`), push rollup (`457bfbd8`), Round 1 (`f8833487`), Round 2 final (`1fb6139f`), reopened Round 1 (`defe665d`), reopened Round 2 final (`5c2a07be`), reopened Round 1 on `65fedf20` (`0764d20a`), reopened Round 2 final on `f971f235` (`5d795923`); `Test further read` and CI links live on `PACT-119` / `PACT-124`
- `PACT-120` (T1): `7d646286`, handoff (`63abdf42`)
- `PACT-121` (T2): `56da6fe1`, early Windows probe (`a420117b`), handoff (`45680204`)
- `PACT-122` (T3): `99e821f6`, `dadf9079`, handoff (`43454f45`)
- `PACT-123` (T4): `eb6080fc`, Round 2 final (`69c68054`), status (`b6a8a385`)
- `PACT-124` (T5): handoff (`fb4c24ef`); final probe and CI completion record on `PACT-124`
