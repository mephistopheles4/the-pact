# PRs opened from the CLI carry the close-out checkbox

**2026-10-06** — AGENTS.md now tells a session that opens a PR with `gh pr create` to start its `--body` with the PR template's checkbox line, word for word (mephistopheles4/the-pact#88). The template from #84 only fills PRs opened in the web UI, so agent-made PRs, such as #86, came without it.

## What it set out to do

Make agent-made PRs carry the close-out checkbox, by the simpler of two routes the issue named: `gh pr create --template`, or copying the line into `--body`.

## How it was built

- **Copy the line, not `--template`.** `gh`'s `--template` only seeds the editor in an interactive run; a session passes `--body`, which skips the template. Copying the one line works in every non-interactive run.
- **One rule in AGENTS.md,** beside the close-out rule it serves. No ADR: the choice is a mechanical consequence of how `gh` works, not a lasting decision.
- **Dogfooded.** The PR that carries this change opened with the checkbox as its first line.

## Record

Issue comments on mephistopheles4/the-pact#88:

- `6026987841` — verbatim: the QA pair's cross section (`behaviour-lens`, `integrity-lens`).
- `6026988045` — lens dispositions and the build record. `behaviour-lens` found the rule never said to tick the box on the finishing PR; the wording was fixed and #104 ticked.
