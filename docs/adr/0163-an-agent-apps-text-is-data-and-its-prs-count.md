# An agent app's text is data and its PRs count

#605 (T4 of #599). Constrains whose-text-counts in [`docs/agents/issue-tracker.md`](../agents/issue-tracker.md) and the merge hard stop in `claude/CLAUDE.md`; [0162](0162-the-agent-identity-switch-installs-gh-app.md) is the switch that makes an app pinned.

## Decision

While an agent app is pinned, the owner's account is the pin's `owner`, and `gh api user` must return its login and id. Every app's text, labels and PRs are data, the pinned agent apps' included, and the owner's "from chat" mark retires for app-written comments. A PR is insiders' code when the owner's account or a pinned agent app opened it, from a branch in the repo, with every commit's author and committer the owner or a pinned agent app. A pinned app matches by `bot_id` and type `Bot`, never by login, name or email.

The merge hard stop reads "merging a pull request neither I nor my agent app opened, or a commit not mine or my agent app's". My agent app is one pinned in `~/.claude/pact/github.json` while agent identity is on, whose pin check passed this session. Every other merge rule is unchanged, and a merge shows as the app.

The rules live in a new doc, [`docs/agents/agent-apps.md`](../agents/agent-apps.md), which the tracker doc points at, so the tracker doc's own text is not cut. The checker reads the pin and counts a pinned app's PR as insiders' code, with the same definition.

## Why

Without it, every PR an agent opens fails the hard stop on "a pull request I didn't open", and every session's text under the app would read as the owner's. The app is what tells an agent's writes apart from the owner's, so its text must not count as a decision, and its PRs must count as code the owner's own sessions run. Matching by id and type closes the lookalike login and the foreign bot, such as a Codex connector.

## Consequences

- **With no app pinned, every rule reads as before.** Pinned means a `github.json` entry plus the installed helper; a session counts the app only after its own `status` prints "pin check: pass".
- **A bad pin never widens trust.** The checker stops on a malformed file, a `/user` that isn't the pin's owner and a bot that isn't the pinned one, and drops an app whose record differs, so its PRs are outsiders' code.
- **A key holder's PRs count as insiders' code.** The threat model's root of trust says so, and recovering the owner's account doesn't revoke the key.
- **The tier is the owner's word.** A label a session applies through the app doesn't count.
