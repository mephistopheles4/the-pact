# Lens files ship unsealed in claude/agents

Both QA-pair lens files, `behaviour-lens` and `integrity-lens`, live in `claude/agents/` as plain agent files, beside the other agents. They are not sealed familiars. Each lens's contract and practice test stay in `familiars/`. `behaviour-lens` keeps its own entry in the tool allow-list. Sealing `behaviour-lens` is #69, which waits on grimoire#166.

## Why

- **The owner chose the existing place.** "im not sure we need to save them to familiars/ agents/ is fine, no need to reinvent the wheel."
- **The install and the gate already handle `claude/agents/`.** Seam A reads every file there, and the tool allow-list bounds each one. The lenses needed no new path.
- **The cost is a missing check.** Without a seal, nothing checks that a lens file still matches its contract. A change to a lens file is caught by the gate's tool checks and by the reviews it goes through, not by a seal.

## How this was decided

- **2026-10-05** — Decided in mephistopheles4/the-pact#47, departing from revision 7 of #35's spec, which had both lenses as sealed familiars (comment 6003969495).
