# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified; an agent can start it unasked |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## `ready-for-agent` and `ready-for-human`

These two say whether a session can start the issue's next move without the owner.

- **`ready-for-agent`**: a session can start the issue's next move without asking.
- **`ready-for-human`**: an owner decision or owner-only action is open that the issue doesn't settle.

## Tier labels

Every issue carries one process tier, as a label. The tier is the set of moves the work goes through (see "Implementing a change" in [`claude/CLAUDE.md`](../../claude/CLAUDE.md)); it is not the model's effort setting. Triage sets it. An issue with no tier label is at move 1.

| Label | Moves |
| --- | --- |
| `tier:quick` | Build, then verify (move 4), in one session. |
| `tier:standard` | A short `to-spec` posted on the issue and read by `unstated-lens`, then one build session that ends with move 4. |
| `tier:thorough` | `to-spec`, the spec pair and `unstated-lens`, `to-tickets`, then one build session per ticket, each ending with move 4. |

Auth, secrets, crypto, input validation and data migrations are always `tier:thorough`. The suggested model and effort for each phase are a line on the issue next to the tier, not labels, for example "Plan: Opus, high. Build: Sonnet, medium."

## Creating the labels

The five roles exist on the tracker (created 2026-09-29; this repo got no default labels, so `wontfix` was created too). The three tier labels were created 2026-09-30. For reference:

```bash
gh label create needs-triage --description "Maintainer needs to evaluate this issue" --color fef2c0
gh label create needs-info --description "Waiting on reporter for more information" --color f9d0c4
gh label create ready-for-agent --description "Fully specified; an agent can start it unasked" --color c2e0c6
gh label create ready-for-human --description "Requires human implementation" --color bfd4f2
gh label create tier:quick --description "Quick tier: build, then verify, in one session" --color c5def5
gh label create tier:standard --description "Standard tier: short spec on the issue, then one build session" --color fbca04
gh label create tier:thorough --description "Thorough tier: full spec, review, tickets, one build session each" --color d93f0b
```

The colours match stacks.
