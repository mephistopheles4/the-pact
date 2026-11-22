# When parallel sessions work one chain

Read this before you claim a ticket while other sessions run on the same chain.

This repo runs several sessions at once on one chain of tickets. These rules
apply to a session that resolves a ticket in such a chain.

- **Tickets that can run side by side start together.** A ticket is its own
  sub-issue ([tickets as sub-issues](issue-tracker.md#tickets-as-sub-issues)).
  Tickets with no dependency between them and no shared files start in
  parallel, one session each; the cut says which. A ticket that depends on
  the one before it [stacks on its PR](#stacked-pull-requests), and never waits for the merge.
- **Name the ticket when you launch each session.** A session honours it, so
  nothing self-selects.
- **Check for a live session before claiming.** List the live sessions, with
  the desktop session tools where they are available, and match candidates
  **on worktree name**, never on ticket number. A worktree match means someone
  is on it: pick another ticket, or message them.
- **A ticket created in the last hour is presumed live,** whatever its
  assignee says. Confirm its author is finished; silence doesn't clear it.
- **Message the session, don't guess.** Ask the other session whether it is
  done, rather than inferring it from a stale transcript or an idle-looking
  process. Where no session tool can reach it, ask the owner.
- **Re-read a shared file just before you write it,** such as the chain's
  tracking issue.

## Stacked pull requests

A ticket that depends on the one before it on the chain keeps moving while that PR is open.

- **Branch from the previous ticket's branch,** not from `main`, and open the PR as a draft with that branch as its base.
- **A change lower in the stack** means every ticket above it rebases onto the new head.
- **Merge bottom first.** When a PR merges, set the base of the one above to `main` and rebase it onto `main` without the merged commits, since the merge is a squash.
- **Each PR gets its own Test evidence** on its own head, taken again after each rebase ([gate tests](gate-tests.md)).
