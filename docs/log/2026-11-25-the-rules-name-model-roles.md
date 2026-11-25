# The rules name model roles, and each harness gets its own render

PACT-105, ticket T2 of [spec 0007](../spec/0007-harness-agnostic-pact.md). The tier and workflow tables, the sensitive route and the agents name roles: the planning model, the executor model and the light model. Each harness's rules carry one line, after the tiers, that says which of its own models those are. Claude Code runs as it did: Opus plans, Sonnet builds, scout runs on Haiku. A name a person writes themselves renders as written, and the dry run warns for each harness that isn't Claude Code. The builder, the default configuration and the presets name roles.

The install renders the rules, agents, commands and skills for each harness it takes. Codex gets rules and agents; Antigravity gets rules, and no agent until the pact has its tool names. Skills go to `~/.pact/skills/`; no harness has them linked in yet. Neither Codex nor Antigravity has a guard yet.

Other changes to the pact text: "How Claude helps" is now "How the agent helps"; the permission sentence names "your harness"; a harness without subagents gets one line saying to run each lens in a separate session; `/make-it-so`, `/finis` and `/scry` act only when the person's latest message names them, and `/finis` archives only where the harness can. `review.md` gains the tree check, for a harness that can't hold an agent to its tools.

**What the gate bounds differently:**

- Rules over a harness's cap, or over the shared cap of the harnesses it takes, refuse the install.
- An Antigravity agent whose tool list maps to nothing, or loses its read tools, refuses the install. So does a Codex agent whose text holds `'''`.
- The hash an apply is bound to covers every harness's rendered rules, so a change to any one refuses an old apply.
- Seam A reads the rendered files, and refuses one it can't classify.

**Rolling back:** as [Roll back to an older version](../install.md#roll-back-to-an-older-version) says.

## Record

- PACT-105 plan and status comments (Linear)
- Ticket T2's pull request into `pact-105`: build and Test records
