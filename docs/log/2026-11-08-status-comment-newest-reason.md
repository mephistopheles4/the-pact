# The status comment keeps only its newest reason line

#503, standard tier with the security pair, built by pact-503.

The poster's status edit, `issue-comment-edit --signed status-<n>` with n the `--issue` value, now drops the item's `Edited:` lines: the session's body holds none, and the poster adds the newest, so the status comment shows the latest round and one reason line. One shared function, `isStatusEdit`, decides it for both the body and the item checks. Every other edit keeps the append-only rule, and the author, target, signature, record, decision and leak checks run on a status edit as before.

`claude/review.md` says to drop the old lines, read the comment and the round comments just before the edit, and restart a session refused right after an install. It also signs every pull request body `Signed: pr-<n>`, n the issue it works on, and gives the owner route for a body already posted unsigned: a changed line, scanned with `issue-comment --dry-run`, that the owner types on GitHub, never a squash message. This repo's template, `AGENTS.md` and `docs/agents/work-records.md` carry the `Signed:` line.

The change narrows a control ADR 0120 names; the owner accepted it, and the stale-read residual beside R60 (decision 180). [ADR 0144](../adr/0144-the-status-comment-keeps-only-its-newest-reason-line.md) records why.

**Rolling back:** revert the PR, then reinstall through the dry run and the owner's apply. Status comments already trimmed keep their earlier lines in GitHub's history.

## Record

- The ask: https://github.com/mephistopheles4/the-pact/issues/503
- Spec revision 5, final: https://github.com/mephistopheles4/the-pact/issues/503#issuecomment-6722422925
- Spec round 1: https://github.com/mephistopheles4/the-pact/issues/503#issuecomment-6722424761
- Spec round 2 (final): https://github.com/mephistopheles4/the-pact/issues/503#issuecomment-6722426592
