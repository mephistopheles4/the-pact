# When parallel sessions work one chain

Read this before you claim a ticket while other sessions run on the same chain.

This repo runs several sessions at once on one chain of tickets. These rules
apply to a session that resolves a ticket in such a chain.

- **Tickets that can run side by side start together.** A ticket is its own
  sub-issue ([tickets as sub-issues](issue-tracker.md#tickets-as-sub-issues)).
  Tickets with no dependency between them and no shared files start in
  parallel, one session each; the cut says which. A ticket that depends on
  another waits for its PR to merge.
- **Name the ticket when you launch each session.** A session honours it, so
  nothing self-selects.
- **An assignee is no claim:** every session signs in as the same user. Match
  live sessions on worktree name, never on ticket number; on a match, or a
  ticket made in the last hour, ask that session, or the owner where no
  session tool reaches it.
- **Re-read a shared file just before you write it,** such as the chain's
  tracking issue.
