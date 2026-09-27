# The repo's own rules, and a tracker for a repo that doesn't exist yet

**2026-09-27** — The repo got a root `AGENTS.md` holding every rule for working on it, a root `CLAUDE.md` that only imports it ([ADR 0006](../adr/0006-root-agents-md.md)), and the config the engineering skills read in `docs/agents/`. One commit, `804e25a`.

## What it set out to do

The owner ran their usual repo-setup skill for the engineering skills, `setup-matt-pocock-skills`. It was not installed in that session, so the main session followed a local copy of it. The skill records where issues live, which triage labels the repo uses, and how its domain docs are laid out, so the skills can work here.

## The choices

- **Issues on GitHub, on `mephistopheles4/the-pact`.** The repo is not created yet. The owner is holding it back until their contract skill is ready, so the agents are refined first. Until then, `docs/agents/issue-tracker.md` warns that every `gh issue` command fails, and live plans are committed under `docs/plans/` instead.
- **External pull requests are not a triage surface.**
- **The five default triage labels, as in stacks,** each label string equal to its role's name. `docs/agents/triage-labels.md` also ties `ready-for-agent` and `ready-for-human` to the pact's gate on builder hand-offs.
- **Single-context domain docs:** one `CONTEXT.md` and one `docs/adr/` at the root.

## Where the rules went

The owner asked for both root files, as in stacks: `AGENTS.md` as the constitution, and `CLAUDE.md` for what is specific to Claude Code. The first draft put the "Agent skills" block in `CLAUDE.md`, because that is where the skill puts it. The owner asked why: those facts apply to any agent, not just Claude Code. So the block moved to `AGENTS.md`, and `CLAUDE.md` was left as a heading, the `@AGENTS.md` import and a comment explaining it.

The README gained a line to keep the two `AGENTS.md` files apart: the planned vendor-neutral version of the pact goes in `claude/`, next to the file it replaces, not at the root. The root file holds the rules for working on this repo.

The same reasoning applies to stacks, so the owner had an issue opened there: [stacks#398](https://github.com/mephistopheles4/stacks/issues/398). It was posted through stacks' own helper for posting to GitHub, and read back to confirm it matched what was written.

## Reviews and probes

**None.** This was a docs-only change made under a skill the owner invoked by name, and that skill replaced the plan, review and build flow for that turn. No plan was written, no reviewer ran, and no rule for agents changed, so there was nothing to probe.

## What is still open

When the GitHub repo is created:
- push `main`;
- create the four labels GitHub does not make by default, with the commands in `docs/agents/triage-labels.md`;
- drop the "repo does not exist yet" warnings from `AGENTS.md` and `docs/agents/issue-tracker.md`.

## Record

- `804e25a` — the setup: root `AGENTS.md` and `CLAUDE.md`, the three `docs/agents/` files, and the README line. No verbatim artefact; there were no plan, reviews or probe records.
