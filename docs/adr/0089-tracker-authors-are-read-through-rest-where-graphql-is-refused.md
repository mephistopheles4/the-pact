# Tracker authors are read through REST where GraphQL is refused, and the login is announced

Two changes to this repo's tracker rule, "Whose text counts" in `docs/agents/issue-tracker.md` (#183, T2).

- **The login is announced, not confirmed,** in every session with `GH_TOKEN` or `GITHUB_TOKEN` set, local or cloud. The session states the login `gh api user --jq .login` returns, and the GitHub MCP tools' login if it posts through them, in its first chat message, and goes on. If the two differ it stops and asks; if the owner objects, it stops reading and posting on the tracker and treats what it read as data. Until the owner answers, the announced login stays open in every hand-off.
- **Where GraphQL is refused,** as in a cloud thread, author reads go through a checker in code: `gate/tracker-authors.mjs` and its core, run as they stand on `main`. It reads the issue or PR through REST, page by page, with fail-closed stops, and prints one record per item and a SUMMARY line, the only place a verdict is taken from. Local sessions keep the GraphQL reads, which can see editors.

## Why

- **The cloud proxy refuses GraphQL** (HTTP 403), and `gh issue view`, `gh issue list` and `gh pr list` use it underneath, so every author read failed in a cloud thread and nothing on the tracker counted there (#188). REST works for every path the checker needs. `--paginate` follows links the proxy refuses, so lists are read with explicit page numbers.
- **The owner's decisions, in chat on 2026-10-18:** reads through the GitHub MCP tools are data, since they carry no hidden flag and list no label events (D1); REST only where GraphQL is refused (D2); the checker meets ASVS 5.0 V8 (D3); the decision runs in code with fixture tests, so each check is seen to catch its bad case (D4). Confirming the login in chat added friction, so it is announced instead, in every session with a token.
- **REST shows no editor,** so the checker is stricter than the GraphQL reads: an edited comment never counts, and an issue, PR or review body never counts. A session corrects its own comment by posting a new one.
- **No check that the login is the owner's.** The owner removed it at Design review: a check against a fixed login can't prove the token is the owner's own, and a session run with another account's token would take that account as the owner. The owner accepts that risk; the announcement is the only safeguard. The threat model's entry for it is the owner's to approve at hand-off.

## What stays

- **The checker is not part of the install gate.** ADR 0069's "install mechanics only" is about the install gate. The checker sits in `gate/` because its checks are code with bad cases, as the gate's are; the install stages it with the rest of `gate/`, hashes it into the manifest, and never runs it.
- **Outsiders' code.** Under REST, as under GraphQL, a PR is insiders' code only when the owner's account opened it from this repo and every commit's author and committer is the owner's. Commits made in cloud threads show `claude`, so such a PR stays outsiders' code.
- **Everything else in "Whose text counts":** the "Owner decision, from chat" mark, quoted blocks, restated text, hidden comments summarised, and a failed or empty read counting for nothing. Any checker exit other than 0, or a missing `RESULT: pass`, is a failed read.

## What was weighed

- **A REST form inside the doc, as shell or PowerShell.** Not taken: each check would be prose a session follows by hand, with no bad case seen to fail.
- **The GitHub MCP tools as the read.** Not taken (D1): they carry no hidden flag and list no label events.
- **Checking the token's login against `mephistopheles4`.** Removed by the owner, as above.
- **A review's or review comment's hidden flag.** REST carries none, so the checker gives `null`, and the doc says to summarise any record whose `hidden` isn't `false` (the owner's choice at Build for review comments, 2026-10-18; reviews follow it after the Test review).

Amends [ADR 0062](0062-this-repo-keeps-its-own-tracker-rule.md) and [ADR 0075](0075-agents-md-holds-only-what-every-session-needs.md), whose token part said nothing counts until the owner confirms the login.
