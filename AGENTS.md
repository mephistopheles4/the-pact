# AGENTS.md — the-pact

The rules for working **on** this repo. They are not the pact itself: the pact
is [`claude/CLAUDE.md`](claude/CLAUDE.md) and the agents in
[`claude/agents/`](claude/agents/), which install into `~/.claude/` and govern
every project. This file governs only changes to this repo. See
[`README.md`](README.md) for what is here and what never goes in.

Every rule for this repo lives here, whichever agent reads it.
[`CLAUDE.md`](CLAUDE.md) only imports this file, for Claude Code.

## Changes here reach every project

`claude/` is a payload, not documentation. Once installed, an edit there changes
how every session in every repo behaves. So:

- **Edit the repo copy, never the live file.** A direct edit to `~/.claude/`
  drifts from the repo.
- **Before installing, compare the live files with the last installed commit.**
  If they differ, someone edited live; stop and ask rather than overwrite.
- **Install only on the owner's go-ahead.** Installing overwrites live config.
- **After installing, confirm each live file's hash matches its repo copy.**

## Where work lives

- **Work items:** GitHub issues on `mephistopheles4/the-pact`. See
  [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md). ⚠️ The repo
  does not exist yet. Until it does, a live plan and its review rounds are
  committed under `docs/plans/`. They stay there only while the work is live,
  so the folder may be empty or absent.
- **Once the repo exists:** a plan and its review rounds live on the issue, as
  the body and comments.
- **When the work finishes:** each lasting decision becomes one ADR in
  [`docs/adr/`](docs/adr/), with its reasoning. The work itself becomes one
  dated narrative in [`docs/log/`](docs/log/), ending in a **Record** list of
  the commits that hold the verbatim plan, reviews and probe records. Then the
  plan and its files are deleted from the tree; history keeps them.
- **Vocabulary:** [`CONTEXT.md`](CONTEXT.md), created when a term first needs
  pinning down. See [`docs/agents/domain.md`](docs/agents/domain.md).

## Testing a change to an agent or a rule

A rule for agents is tested by a planted probe. While the work is live, its
record is committed beside the live plan in `docs/plans/`. When the work
finishes, the probe's results go in the work's log entry in
[`docs/log/`](docs/log/), with the commits that hold the verbatim record.

- **Write the expected result, and commit it, before running the probe.**
- **Run it after installing, in a fresh session.** A session loads agent
  definitions at startup and does not see an install made during it: the first
  run of the 2026-09-27 status-line probe most likely failed for exactly that
  reason. See [its log entry](docs/log/2026-09-27-human-in-the-loop-gate.md).
- **Don't hand the agent the rule under test as evidence.** It may then apply
  what it read rather than its own definition.
- **A probe's pass counts only once the probe has been seen to fail** — a
  control run, or a planted bad case that it catches.
- **Record every run, pass or fail, with the agent's report verbatim.**

## Agent skills

Configuration for the optional [engineering skills](https://github.com/mattpocock/skills).

### Issue tracker

GitHub issues on `mephistopheles4/the-pact`, via the `gh` CLI; external PRs are not a triage surface. The repo does not exist yet. See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

The five canonical roles, each label string equal to its name, as in stacks. `ready-for-human` is the tracker's form of the pact's "Needs a human" gate. See [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

Single-context: one [`CONTEXT.md`](CONTEXT.md) and [`docs/adr/`](docs/adr/) at the root, both created when first needed. See [`docs/agents/domain.md`](docs/agents/domain.md).
