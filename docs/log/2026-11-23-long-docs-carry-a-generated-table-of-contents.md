# Long docs carry a generated table of contents

PACT-78. Every tracked Markdown file of over 100 lines, outside the logs, the ADRs, the test fixtures, the rules file with its cloud copy, the agents and the commands, now carries a table of contents before its first H2. `docs/toc.mjs` writes it from the H2 and H3 headings ([ADR 0168](../adr/0168-long-docs-carry-a-generated-table-of-contents.md)).

The pact text changes in one place: `claude/review.md`, installed as `~/.claude/pact/review.md`, gains its table, and so do the cloud setup script and the Scriptorium page, which embed it, regenerated in the same change. The gate's checks change in two: `gate/tests/toc.test.mjs` fails while a table is missing or stale, and the doc budgets and the threat model's cap count each doc without its table.

Why: the owner found long docs hard to navigate, and none had a table. The rules file is left out because every session loads it whole.

**After merge:** paste `cloud-sessions/cloud-setup-wrapper.sh` into the cloud environment's setup field again.

**Rolling back:** revert the PR, reinstall through the dry run and the owner's apply, and paste `cloud-sessions/cloud-setup-wrapper.sh` into the cloud environment's setup field again.

## Record

- The ticket: PACT-78 on Linear, which holds the spec and its review rounds. The PR is #654.
