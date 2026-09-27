# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## `ready-for-agent` and `ready-for-human` follow the pact's gate

The pact gates every builder hand-off with one question: will the builder need the owner *after* it is dispatched? (See "Gate every builder hand-off" in [`claude/CLAUDE.md`](../../claude/CLAUDE.md).) Triage uses the same test:

- **`ready-for-human`** — the issue trips a gate signal that its body doesn't settle: an owner decision left open, an owner-only action during the build, an irreversible action not approved up front, or no checkable done-criteria.
- **`ready-for-agent`** — none of those, or the body settles each one.

## Creating the labels

GitHub creates `wontfix` on a new repo by default. The other four must be created once, after the repo exists:

```bash
gh label create needs-triage --description "Maintainer needs to evaluate this issue" --color fef2c0
gh label create needs-info --description "Waiting on reporter for more information" --color f9d0c4
gh label create ready-for-agent --description "Fully specified, ready for an AFK agent" --color c2e0c6
gh label create ready-for-human --description "Requires human implementation" --color bfd4f2
```

The colours match stacks.
