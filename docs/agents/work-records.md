# Where work lives

Read this when you plan, close out or record work: plans, ADRs, logs and the PR checkbox.

- **Work items:** GitHub issues on `mephistopheles4/the-pact`. See
  [`docs/agents/issue-tracker.md`](issue-tracker.md). Cite a commit by its short
  hash; GitHub links it only once the commit is on the remote.
- **Assign the issue you take,** and unassign it if you stop before the work
  is done.
- **Plans:** a plan, its review rounds and its probe records live on the
  issue, as the body and comments. When a spec is cut into tickets, the spec
  stays on the parent issue and each ticket is its own sub-issue holding its
  own plan and records; the ticket's PR closes the ticket, and the owner
  closes the parent once its last sub-issue closes
  ([tickets as sub-issues](issue-tracker.md#tickets-as-sub-issues)).
  Nothing in the tree holds a plan. A record
  a check can run becomes a test or fixture beside the code it checks.
- **When the work finishes:** a decision that reverses or constrains something
  becomes one ADR in [`docs/adr/`](../../docs/adr/), with its reasoning. A change
  to the pact text or the gate becomes one dated narrative in
  [`docs/log/`](../../docs/log/), ending in a **Record** list of the issue comments
  that hold the verbatim plan, reviews and probe records. Other work writes
  neither. The PR
  that finishes a piece of work carries what it owes, and a session doesn't
  report the work as finished until that is merged. If that PR can't carry
  them, for example a security-set record merged before the narrative is
  written, the session opens a docs PR before it is cleaned up.
- **Folding logs:** a session that writes a log folds any log older than a month
  into [`docs/log/older.md`](../../docs/log/older.md), one level down under its
  own title, and repoints the links to it. No test checks those links.
- **Every PR carries the close-out checkbox.** GitHub fills a PR from
  [`.github/pull_request_template.md`](../../.github/pull_request_template.md)
  only in the web UI, so a PR's `body_file` opens with the template's
  checkbox line, word for word, and its post's `signer` is `pr-<n>`, n the
  issue it works on. The poster adds the ask and the `Signed:` line. Tick the
  box when the PR finishes the work, and leave it unticked otherwise.
- **Finding a decision or a log:** decisions start from the index
  [`docs/adr/README.md`](../../docs/adr/README.md), one line per file; add a line
  there with every new ADR. Logs have no index: their file names carry the date
  and the topic, and folded logs are titled in `docs/log/older.md`.
