# Where work lives

Read this when you plan, close out or record work: plans, ADRs, logs, the PR checkbox and the README's figures.

- **Work items:** GitHub issues on `mephistopheles4/the-pact`. See
  [`docs/agents/issue-tracker.md`](issue-tracker.md). `main` was
  first pushed on 2026-09-30. Cite a commit by its short
  hash; GitHub links it only once the commit is on the remote.
- **A session assigns the issue it takes.** When it starts work on an issue,
  it runs `gh issue edit <n> --add-assignee @me`. If it stops before the work
  is done, it removes itself with `--remove-assignee @me`.
- **The assignee is for visibility.** Claims go by
  [parallel sessions](parallel-sessions.md).
- **Plans:** a plan, its review rounds and its probe records live on the
  issue, as the body and comments. Nothing in the tree holds a plan. A record
  a check can run becomes a test or fixture beside the code it checks.
- **When the work finishes:** a decision that reverses or constrains something
  becomes one ADR in [`docs/adr/`](../../docs/adr/), with its reasoning. A change
  to the pact text or the gate becomes one dated narrative in
  [`docs/log/`](../../docs/log/), ending in a **Record** list of the issue comments
  that hold the verbatim plan, reviews and probe records. Other work writes
  neither. Work that finished before #52 keeps its commit citations. The PR
  that finishes a piece of work carries what it owes, and a session doesn't
  report the work as finished until that is merged. If that PR can't carry
  them, for example a security-set record merged before the narrative is
  written, the session opens a docs PR before it is cleaned up.
- **Folding logs:** a session that writes a log folds any log older than a month
  into [`docs/log/older.md`](../../docs/log/older.md), one level down under its
  own title, and repoints the links to it. No test checks those links.
- **Every PR carries the close-out checkbox.** GitHub fills a PR from
  [`.github/pull_request_template.md`](../../.github/pull_request_template.md) only
  in the web UI; `gh pr create --body` skips it. So a session that opens a PR
  from the CLI makes the template's checkbox line the first line of its
  `--body`, copied word for word. It ticks the box when the PR finishes the
  work, and leaves it unticked otherwise.
- **Finding a decision or a log:** decisions start from the index
  [`docs/adr/README.md`](../../docs/adr/README.md), one line per file; add a line
  there with every new ADR. Logs have no index: their file names carry the date
  and the topic.
- **The README's figures:** after a change to a source in `docs/img/src/`, rerun
  `node docs/img/build.mjs`. `gate/tests/readme-figures.test.mjs` fails while an
  SVG is stale and when a line overflows its box; no test checks the figures'
  words.
- **Vocabulary:** [`CONTEXT.md`](../../CONTEXT.md), created when a term first needs
  pinning down. See [`docs/agents/domain.md`](domain.md).
