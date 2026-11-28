# The agent identity switch

`agent-identity` in `~/.pact/config.json` is `true` or `false`, `false`
when unset; the builder's Settings dialog shows it. A project configuration may
not set it, and no preset or builder file turns it on. In Claude Code's `CLAUDE.md`, only the configuration notice names it; in
harnesses without `settings-env` (`codex` and `antigravity`), the renderer
adds a one-line `Use your pinned GitHub App` rule into `AGENTS.md`. While it is
on, the pact guards git and `gh`
writes across local sessions in Claude Code, Codex and Antigravity so
git writes to GitHub, and `gh` writes on your own repos, run as the GitHub
App you create under your own account (see
[the helper](reference.md#pact-tools)). The app's name is yours to choose: the
examples use "Mephisto's Homunculus" for Claude Code, "Mephisto's Wagner" for
Codex and "Mephisto's Euphorion" for Antigravity, and nothing in the pact names
them.

<!-- toc -->

- [Setting it up](#setting-it-up)
- [What it does](#what-it-does)
- [What it doesn't stop](#what-it-doesnt-stop)
- [What the install checks](#what-the-install-checks)
- [Turning it off](#turning-it-off)
- [Rolling back](#rolling-back)
- [Retiring an app](#retiring-an-app)
- [A leaked key](#a-leaked-key)

<!-- /toc -->

## Setting it up

The switch needs each provider's app pinned in `~/.pact/github.json` and its
gitconfig, `~/.pact/gh-app-<provider>.gitconfig`, which `gh-app.mjs setup`
writes per provider (`claude`, `codex` or `antigravity`). The install checks
`claude`'s pin and gitconfig before writing; Codex and Antigravity skip
install-time pin checks and enforce at hook runtime whenever that provider is
pinned. The helper isn't installed until the switch is on, so run setup from the
clone (`node claude/tools/gh-app.mjs setup --provider <provider> --app-id <n> --key <downloaded .pem>`),
under the Node the install will run under (an absolute path to a program called
`node`, not a shim; run `node ~/.pact/tools/gh-app.mjs refresh --provider <provider>`
after moving or upgrading Node). Without `claude`'s pin and gitconfig, an
install into Claude Code refuses: run setup.

## What it does

- **The tool.** The renderer adds `gh-app` to the `TOOLS` line (the `tools` list
  still refuses it), so the install copies `~/.pact/tools/gh-app.mjs`,
  with its own WARN in the dry run.
- **Two `env` keys in Claude Code's `settings.json`.** `GIT_CONFIG_GLOBAL`,
  pointing at `gh-app-claude.gitconfig`, and `GIT_TERMINAL_PROMPT` as `0`. The
  install records them in the `entries` of `install.json`. The gitconfig
  includes your own global git config, sets the bot as `user.name` and
  `user.email` (your own `author.*` settings still win; see below), and drops
  Git Credential Manager, so a failed mint fails an HTTPS push, except on a
  repo the app isn't installed on (below).
- **The app wherever it is installed.** The helper mints a token for any repo
  an installation of your app covers, whoever owns it, and finds that
  installation through GitHub's API. Where none covers the repo, git falls back
  to you: `git-credential` answers with your own credential, from
  `git credential fill` under your normal git config (with
  `GIT_TERMINAL_PROMPT=0` and `GCM_INTERACTIVE=never`), and says so. "Not
  installed" is remembered for ten minutes, and a remembered miss is not
  checked against the pin again in that time. The bot stays the commit author
  either way. Any other refusal, a failed pin check included, never falls back.
  `gh` mode and the poster don't fall back: on a repo the app isn't installed
  on, they refuse. Other accounts can install the app only when you make it
  public on GitHub.
- **Your own `git config --global` writes are kept.** In a session they land in
  the agent gitconfig. Setup and refresh keep every line below its last line,
  `# pact: the lines below are yours; setup and refresh keep them`. A
  `[credential]`, `[url]`, `[http]`, `[include]` or `[includeIf]` section below
  it makes setup and refresh refuse and the dry run say so, until you remove
  it; the dry run compares the rest of the lines above the marker only. A key
  git adds inside one of the pact's own sections (`[user]`,
  `[credential "https://github.com"]`) is the pact's, and refresh rewrites it.
- **Cross-harness identity guard (`~/.pact/guard/`).** Installs the shared guard
  (`guard.mjs`), `rules.json` (with `"identity": { "enabled": true, "posterOn": <boolean> }`),
  and the per-harness wrappers even when `cleaner` is off:
  - **Claude Code (`claude.mjs`).** Merges a `PreToolUse` (`Bash|PowerShell`)
    hook into `~/.claude/settings.json` running `claude.mjs` through a hardened
    launcher (`~/.pact/guard/claude.cmd` via `cmd.exe /d /c call` with
    `NoDefaultCurrentDirectoryInExePath=1` and cleared `NODE_OPTIONS` on
    Windows; `/usr/bin/env -u NODE_OPTIONS node` on POSIX). Claude Code keeps
    `settings.json` `env` injection for normal `git` writes, and the hook
    denies plain `gh` writes on owner repos, account-scoped `gh` writes, and
    `git` override/unset attempts (`-c credential.*`/`user.*`, `unset`,
    `--config-env`, `GIT_CONFIG_COUNT`/`GIT_CONFIG_PARAMETERS`, etc.).
  - **Antigravity (`antigravity.mjs`).** Intercepts both plain `gh` writes and
    plain `git` writes missing `GIT_CONFIG_GLOBAL`. On eligible single simple
    `git` `run_command` calls, it unconditionally emits `decision: "force_ask"`
    paired with `overwrite.CommandLine` (`GIT_CONFIG_GLOBAL` and
    `GIT_TERMINAL_PROMPT=0`, never `"allow"`; verified in headless `agy -p`,
    pending interactive confirmation, and switching simple `git` writes to
    `deny` requires updating the hook code if a live probe fails). It returns
    `deny` with the exact `GIT_CONFIG_GLOBAL` + `GIT_TERMINAL_PROMPT=0` prefix
    on compound, wrapped, or overridden `git` commands and on `manage_task`
    (`send_input`) / `send_command_input`.
  - **Codex (`codex.mjs`).** Denies plain `gh` writes and plain `git` writes
    missing `GIT_CONFIG_GLOBAL` with the exact `GIT_CONFIG_GLOBAL` +
    `GIT_TERMINAL_PROMPT=0` prefix to use.
- **Runtime pin, gitconfig, and repo-owner scoping.** At hook runtime, identity
  rules lazily read `~/.pact/github.json` only when a command holds a candidate
  `gh` or `git` segment (`env -S` or unknown `env` flag included). When
  `github.json` is absent or the provider has no entry in `pin.apps`, the
  provider passes through silently; a symlinked, oversized, or malformed
  `github.json` fails closed (`pin`). Before accepting or rewriting any
  repo-scoped `git` write, the guard checks that
  `~/.pact/gh-app-<provider>.gitconfig` exists as a regular non-symlink file,
  denying with `gh-app.mjs setup --provider <provider>` (or `refresh`) guidance
  otherwise. The guard finds a write's repo by inspecting explicit targets
  (`-R`/`--repo`, `GH_REPO`, `gh api` endpoint, `git push` target) and reading
  `.git/config` directly as plain text without spawning `git` (rejecting
  UNC/network paths and symlinks). A `git` write to any GitHub repo is guarded,
  whoever owns it, and the credential helper decides app or owner; other hosts
  pass through. `gh` writes are scoped to `pin.owner.login` repos: third-party
  and non-owner org repos pass through. Account-scoped `gh` writes and
  unreadable or unresolvable remotes fail closed (guarded). `gh run` and
  `gh workflow` writes and `git pull` are exempt.
- **Session guidance.** Renders a one-line `Use your pinned GitHub App` rule
  into `AGENTS.md` for Codex and Antigravity naming each provider's gitconfig
  path and `gh-app.mjs` / `poster.mjs` routes.
- **Left alone.** Your terminal and the cloud copy.

## What it doesn't stop

Your own credentials stay reachable by these routes. `node ~/.pact/tools/gh-app.mjs status --provider <provider>`
(for `claude`, `codex` or `antigravity`) reports the askpass program, an SSH
remote, a URL rewrite and a helper set after the pact's; it does not report the
rest:

- An askpass program (`GIT_ASKPASS`, `core.askPass`, `SSH_ASKPASS`, often set by an
  editor's terminal) is tried after a failed mint, and `GIT_TERMINAL_PROMPT=0`
  doesn't stop it.
- An SSH remote, a repository-local helper, a credential-bearing URL, an
  `http.*.extraHeader` auth header, or an `insteadOf` rule. With an SSH remote,
  a commit is still the bot's, but the push goes out with your SSH key, since
  the gitconfig sets only the HTTPS helper. That is accepted: `status` reports
  `remote protocol: ssh`, and `git remote set-url origin https://github.com/<owner>/<repo>.git`
  moves the push to the app.
- A plain `gh` write to another owner's repo where the app is installed: it goes
  out as your own login. `gh-app.mjs gh` runs it as the app, and nothing makes a
  session use it.
- A `git` write to a gist or another `*.github.com` host: the guard asks for the
  app's gitconfig, but its helper covers `github.com` only, so your own
  credential is used.
- Your own `author.*`, `committer.*` and signing settings, which the include loads.
- Your own git credential, for a repo the app isn't installed on, a made-up
  one included: the helper can't tell git's call from a session's, so a
  session that runs `git credential fill` for such a repo reads your
  credential, which is often account-wide.
- `GIT_CONFIG_GLOBAL` makes a session's `git config --global` write to the agent
  gitconfig, so `gh auth setup-git` swaps the helper out. The guard refuses a
  missing or symlinked gitconfig, and the next dry run refuses a changed Claude
  gitconfig until you run `node ~/.pact/tools/gh-app.mjs refresh --provider <provider>`.
- Nested shell wrappers (`bash -c`, `pwsh -Command`, `cmd /c`, `Start-Process`),
  `git pull` (excluded from guarded `git` write subcommands), `gh run` and
  `gh workflow` writes (exempt while `gh-app.mjs` holds `actions: read` only),
  and unpinned non-Claude providers.
- The helper script, the gitconfig, `NODE_OPTIONS` and the Node program stay
  writable by your account, and `setup` and `refresh` write any Node, so only the next dry run
  refuses a changed Claude gitconfig.

## What the install checks

With the switch on and `claude` in the install list, before any write:

- `.pact/github.json` holds a `claude` app of the pin's exact shape (matching
  `gh-app.mjs`).
- `gh-app-claude.gitconfig` equals the text setup writes, which the install
  computes with its own copy of `gitconfigText` from `gh-app.mjs` (a test holds
  them equal), under its own Node, which must be an absolute path to a program
  called `node`. The dry run prints `gitconfig as expected: yes`, or `no`
  with the part that differs (node path, include list or other lines) and "run
  gh-app.mjs refresh", and refuses on a `no`. It never prints a line of the file.
- Your own `env` doesn't already set either key. The install never overwrites it.

Codex and Antigravity skip install-time pin and gitconfig checks so one config
works before every provider is pinned.

A `settings.json` that isn't strict JSON is never changed: the dry run warns that
the `env` keys and `PreToolUse` hook are not set, and the apply refuses.

## Turning it off

Set it to `false`, dry run, and apply on your word. The tool goes, and so do the
recorded `env` keys, Claude Code's `PreToolUse` hook entry, the `identity`
block in `rules.json` (and `.pact/guard/` if `cleaner` is also off), and the
`Use your pinned GitHub App` rule in Codex and Antigravity `AGENTS.md`. A key or
hook you wrote yourself stays. A recorded key you changed shows as drift and the
apply refuses: put its value back, or follow [Updating later](install.md#updating-later).
A missing or changed gitconfig doesn't block this.

## Rolling back

1. Set `agent-identity` to `false` in `~/.pact/config.json`, run the dry run and
   apply **at the newer commit first**, so Claude Code's `PreToolUse` hook
   entry, `env` keys, `.pact/guard/claude.mjs` (`claude.cmd`), the `identity`
   block in `rules.json` (and `.pact/guard/` if `cleaner` is also off), and the
   `Use your pinned GitHub App` rule in Codex and Antigravity `AGENTS.md` are
   removed cleanly. An older installer knows neither
   `claude.mjs` (`claude.cmd`), nor the `identity` key in `rules.json`, nor
   `settings-env` in `harnesses/known.json`, refuses `agent-identity` when
   unsupported, and ignores `identityEnv`.
2. Take `agent-identity` out of `~/.pact/config.json` when rolling back to a
   commit before it existed.
3. Run the four rollback checks in
   [Roll back to an older version](install.md#roll-back-to-an-older-version)
   before any checkout.
4. Revert or check out the verified commit, run the dry run, and apply on your
   go-ahead (re-enabling `agent-identity: true` afterward if rolling back only
   this feature onto a commit that supports it).

## Retiring an app

1. For Claude Code, turn `agent-identity` off and apply first: `forget` refuses
   while `settings.json` `env` points at `gh-app-claude.gitconfig`.
2. Delete the app's key in the app's settings on GitHub.
3. From the clone, run `node claude/tools/gh-app.mjs forget --provider <provider>`
   (for `claude`, `codex` or `antigravity`). It revokes the cached tokens and
   deletes the credentials, the pin entry and the gitconfig.
4. Uninstall the app, which revokes every live token.

## A leaked key

In this order:

1. Uninstall the app on GitHub. That cuts every live token, the leaker's included.
2. Generate a new key. GitHub needs one before the old one can go.
3. Delete the old key on GitHub.
4. Install the app again on all your repos.
5. Run `gh-app.mjs setup --provider <provider> --app-id <n> --key <downloaded .pem>`
   with the new key. It revokes the cached tokens.

Between steps 1 and 3, every repo answers "not installed", so git pushes go
out with your own credentials: do steps 2 and 3 right after step 1. From step
3, every mint fails closed. Use this order for any suspected leak: a personal account
keeps no record of a key's use. After an account compromise, do it for each app,
then delete every key on the app but the one whose fingerprint setup printed, and
check its permissions and that its webhook is still off.
