# An agent app's text is data and its PRs count

#605, T4 of #599. ADR 0163 records the decision.

With an agent app pinned, the pact's rules change in four places. The owner's account is the pin's owner, and an app's comments, labels and PR text are data, so a tier label a session sets through the app doesn't count. A PR counts as insiders' code when the owner's account or a pinned app opened it from a branch in the repo and every commit is theirs. The merge hard stop in `claude/CLAUDE.md` names "my agent app", so an agent's own PR doesn't trip "a pull request I didn't open". `claude/review.md`'s Posting says a session writes through the poster or `gh-app.mjs gh` while an app is pinned, with assigning excepted.

The rules for the tracker are in a new doc, `docs/agents/agent-apps.md`, with its own word budget. The tracker doc holds one pointer line and its budget rose by 50; `docs/rule-reasons.md` rose by 50 for the hard stop's reason. The spec's `claude/tracker.md` edit has nothing to land on: that file left the payload with #611.

The tracker author checker reads the pin only when `github.json` exists and the helper is installed. It checks the file's shape and GitHub's own records for the app, its bot and the owner, strips the token variables from `gh`, and stops on a `/user` that isn't the pin's owner. An app whose record doesn't match is left out with a `NOTE` line. It keeps a copy of the helper's permission list, which a test holds equal.

The threat model gains each pinned app's key in its root of trust, the installation token in what crosses, the controls with when each doesn't hold, the routes that still write as the owner (a global git write included), and the key at rest. Its class "Who counts as you" is widened, which makes the merge a hard stop for the owner's own words.

Nothing takes effect in live sessions until the owner applies the install. With no app pinned, every rule reads as before.

**Rolling back:** turn `agent-identity` off as `docs/agent-identity.md` says, then merge a revert of this change to `main`, then run the four checks in [Roll back to an older version](../install.md#roll-back-to-an-older-version), rerun the regens and reinstall from the dry run.

## Record

- The ticket: https://github.com/mephistopheles4/the-pact/issues/605
- The spec, revision 5: https://github.com/mephistopheles4/the-pact/issues/599#issuecomment-7067672460
- The plan: https://github.com/mephistopheles4/the-pact/issues/599#issuecomment-7071766914
