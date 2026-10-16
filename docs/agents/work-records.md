# Where work lives

Read this when you plan, close out or record work: plans, ADRs, logs, the PR checkbox, and keeping the threat model and README in step.

- **Work items:** GitHub issues on `mephistopheles4/the-pact`. See
  [`docs/agents/issue-tracker.md`](issue-tracker.md). `main` was
  first pushed on 2026-09-30. Cite a commit by its short
  hash; GitHub links it only once the commit is on the remote.
- **A security escape on this public repo waits for its fix.** An escape row
  for a security defect carries only the lens, the link to the review and a
  placeholder until the fix ships.
- **A session assigns the issue it takes.** When it starts work on an issue,
  it runs `gh issue edit <n> --add-assignee @me`. If it stops before the work
  is done, it removes itself with `--remove-assignee @me`.
- **The assignee is for visibility.** Claims go by
  [parallel sessions](parallel-sessions.md).
- **Plans:** a plan, its review rounds and its probe records live on the
  issue, as the body and comments. Nothing in the tree holds a plan. A record
  a check can run becomes a test or fixture beside the code it checks.
- **When the work finishes:** each lasting decision becomes one ADR in
  [`docs/adr/`](../../docs/adr/), with its reasoning. The work itself becomes one
  dated narrative in [`docs/log/`](../../docs/log/), ending in a **Record** list of
  the issue comments that hold the verbatim plan, reviews and probe records.
  Work that finished before #52 keeps its commit citations. The PR that
  finishes a piece of work carries its log entry and its ADRs, and a session
  doesn't report the work as finished until both are merged. If that PR can't
  carry them, for example a security-set record merged before the narrative
  is written, the session opens a docs PR before it is cleaned up.
- **Every PR carries the close-out checkbox.** GitHub fills a PR from
  [`.github/pull_request_template.md`](../../.github/pull_request_template.md) only
  in the web UI; `gh pr create --body` skips it. So a session that opens a PR
  from the CLI makes the template's checkbox line the first line of its
  `--body`, copied word for word. It ticks the box when the PR finishes the
  work, and leaves it unticked otherwise.
- **Finding a decision or a log:** start from the indexes,
  [`docs/adr/README.md`](../../docs/adr/README.md) and
  [`docs/log/README.md`](../../docs/log/README.md), one line per file. Add a line
  there with every new ADR or log entry; `gate/tests/docs-index.test.mjs`
  fails when one is missing.
- **Keep the threat model in step.** A change that alters a defence
  [`docs/threat-model.md`](../../docs/threat-model.md) names, or closes an issue it
  lists, updates that page in the same PR.
- **Keep the README in step with the rules.** A change to the tiers, the
  lenses, the models or the sensitive-work default in `claude/CLAUDE.md`, or to the
  roster in `claude/agents/`, updates in the same PR: the figure sources in
  `docs/img/src/` and their alt text and "Text of FIG." blocks in the README
  (then rerun `node docs/img/build.mjs`), the README's prose, and the tables
  in [`docs/reference.md`](../../docs/reference.md). Reviewers reading such a diff
  check those too. `gate/tests/readme-figures.test.mjs` fails while an SVG is
  stale, when the README shows an image that isn't there, and when a line
  overflows its box; no test checks the figures' words.
- **Vocabulary:** [`CONTEXT.md`](../../CONTEXT.md), created when a term first needs
  pinning down. See [`docs/agents/domain.md`](domain.md).
