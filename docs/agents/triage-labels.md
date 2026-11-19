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

## Tier labels

Every issue carries one process tier, as a label. A tier says how much checking the work needs (see "How much checking" in [`claude/CLAUDE.md`](../../claude/CLAUDE.md)); it is not the model's effort setting. Triage sets it. An issue with no tier label is not yet triaged.

| Label | Checking |
| --- | --- |
| `tier:quick` | Small, one session, no plan: tests, then the QA pair offered. |
| `tier:standard` | A short spec on the issue, read for what is unstated; one build session, ending with tests and the lenses the diff calls for offered, the QA pair always among them. |
| `tier:thorough` | A spec read before the owner approves it, cut into tickets, each its own sub-issue of the spec's issue; one build session per ticket, each ending with tests and the lenses the diff calls for offered, the QA pair always among them. |

The suggested model and effort for each phase are a line on the issue next to the tier, not labels, for example "Plan: Opus, high. Build: Sonnet, medium."
