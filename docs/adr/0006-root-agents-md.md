# This repo's rules live in root AGENTS.md; root CLAUDE.md imports it

Every rule for working on this repo lives in the root [`AGENTS.md`](../../AGENTS.md), whichever agent reads it. The root [`CLAUDE.md`](../../CLAUDE.md) holds a heading, one `@AGENTS.md` import line and an explanatory comment, and no rules, because Claude Code reads `CLAUDE.md` and not `AGENTS.md`. Only notes specific to Claude Code would go below the import, and there are none. Both are different files from `claude/CLAUDE.md`, which is the pact itself and installs to `~/.claude/` for every project.

## Why

- **One place for every rule.** A rule split between two files drifts. Putting them in `AGENTS.md` means any agent that reads that convention gets all of them.
- **Claude Code still gets them.** The import is expanded at launch, so Claude Code sees the same text without a copy.
- **Rules for the repo are not the pact.** `claude/` is a payload that changes every session in every repo once installed. The rules for editing this repo govern only this repo, so they sit at the root, apart from the payload.

## How this was decided

- **2026-09-27** — The owner asked for both root files, as in stacks: `AGENTS.md` as the constitution, `CLAUDE.md` for what is specific to Claude Code. The first draft put the "Agent skills" block in `CLAUDE.md`, as the setup skill says to. The owner asked why, since those facts apply to any agent, and the block moved to `AGENTS.md`, leaving `CLAUDE.md` as just the import.
- **2026-09-27** — Set up in `804e25a`, together with the tracker, triage-label and domain-doc config in `docs/agents/`. It ran under an owner-invoked setup skill, with no plan, review or probe. Told in [the repo rules and tracker log](../log/2026-09-27-repo-rules-and-tracker.md).
- **Not decided here:** the planned vendor-neutral split of the pact itself. That goes in `claude/`, next to the file it replaces, and is listed under "Planned" in the README.
