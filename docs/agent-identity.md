# The agent identity switch

`agent-identity` in `~/.claude/pact/config.json` is `true` or `false`, `false`
when unset; the builder's Settings dialog shows it. A project configuration may
not set it, and no preset or builder file turns it on. It has no part in the
rules file; only the notice line names it. While it is on,
git over HTTPS in every local session runs as the GitHub App you create under your own
account (see [the helper](reference.md#pact-tools)). The app's name is yours to
choose: the examples use "Mephisto's Homunculus" for Claude Code, "Mephisto's
Wagner" for Codex and "Mephisto's Euphorion" for Antigravity, and nothing in the
pact names them.

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

The switch needs the app pinned in `~/.claude/pact/github.json` and its
gitconfig, `~/.claude/pact/gh-app-<provider>.gitconfig`, which `gh-app.mjs setup`
writes per provider; the install wires only Claude's. The helper isn't
installed until the switch is on, so run setup from the clone (`node claude/tools/gh-app.mjs setup`), under the Node the install will run
under (an absolute path to a program called `node`, not a shim). Without both the
install refuses: run setup.

## What it does

- **The tool.** The renderer adds `gh-app` to the `TOOLS` line (the `tools` list
  still refuses it), so the install copies `~/.claude/pact/tools/gh-app.mjs`,
  with its own WARN in the dry run.
- **Two `env` keys** in `settings.json`: `GIT_CONFIG_GLOBAL`, pointing at the
  gitconfig, and `GIT_TERMINAL_PROMPT` as `0`. The install records them under
  `identityEnv` in `.pact-install.json`. The gitconfig includes your own global
  git config, sets the bot as `user.name` and `user.email` (your own `author.*`
  settings still win; see below), and drops Git Credential Manager, so a failed
  mint fails an HTTPS push.
- **Left alone.** Your terminal and the cloud copy.

## What it doesn't stop

Your own credentials stay reachable by these routes. `node
~/.claude/pact/tools/gh-app.mjs status` reports the askpass program, an SSH
remote, a URL rewrite and a helper set after the pact's; it does not report the
rest:

- An askpass program (`GIT_ASKPASS`, `core.askPass`, `SSH_ASKPASS`, often set by an
  editor's terminal) is tried after a failed mint, and `GIT_TERMINAL_PROMPT=0`
  doesn't stop it.
- An SSH remote or an `insteadOf` rule, `git -c credential.helper=...`, and plain
  `gh`.
- Your own `author.*`, `committer.*` and signing settings, which the include loads.
- `GIT_CONFIG_GLOBAL` makes a session's `git config --global` write to the agent
  gitconfig, so `gh auth setup-git` swaps the helper out. The next dry run refuses
  until you run `refresh`.
- The helper script, the gitconfig, `NODE_OPTIONS` and the Node program stay
  writable by your account, and `setup` writes any Node, so only the next dry run
  refuses a changed gitconfig.

## What the install checks

With the switch on, before any write:

- `pact/github.json` holds a `claude` app of the pin's exact shape.
- The gitconfig equals the text setup writes, which the install computes with its
  own copy of `gitconfigText` from `gh-app.mjs` (a test holds them equal), under
  its own Node, which must be an absolute path to a program called `node`. The dry run prints `gitconfig as expected: yes`, or `no`
  with the part that differs (node path, include list or other lines) and "run
  gh-app.mjs refresh", and refuses on a `no`. It never prints a line of the file.
- Your own `env` doesn't already set either key. The install never overwrites it.

A `settings.json` that isn't strict JSON is never changed: the dry run warns that
the two keys are not set, and the apply refuses.

## Turning it off

Set it to `false`, dry run, and apply on your word. The tool goes, and so do the
recorded `env` keys whose live value is still the recorded one; a key you changed
or wrote yourself stays. A missing or changed gitconfig doesn't block this.

## Rolling back

Turn the switch off first, as above, take `agent-identity` out of
`~/.claude/pact/config.json`, then revert each ticket's merge and reinstall
from a dry run after the four rollback checks in
[Roll back to an older version](install.md#roll-back-to-an-older-version). An older
installer refuses the `agent-identity` key and ignores `identityEnv`, so reverting
first would leave the two `env` keys in `settings.json`, pointing at a gitconfig.

## Retiring an app

1. For Claude Code, turn the switch off and apply first: `forget` refuses while
   the settings `env` points at the gitconfig.
2. Delete the app's key in the app's settings on GitHub.
3. From the clone, run `node claude/tools/gh-app.mjs forget --provider claude`
   (the installed copy went with step 1). It revokes the cached tokens and deletes
   the credentials, the pin entry and the gitconfig.
4. Uninstall the app, which revokes every live token.

## A leaked key

In this order:

1. Uninstall the app on GitHub. That cuts every live token, the leaker's included.
2. Generate a new key. GitHub needs one before the old one can go.
3. Delete the old key on GitHub.
4. Install the app again on all your repos.
5. Run `gh-app.mjs setup` with the new key. It revokes the cached tokens.

Pushes fail closed in between; no `forget` or switch-off is needed. Use this order for any suspected leak: a personal account
keeps no record of a key's use. After an account compromise, do it for each app,
then delete every key on the app but the one whose fingerprint setup printed, and
check its permissions and that its webhook is still off.
