**For the owner**

The new sync script copies straight into the live rules file in your Claude folder. The repo's rules say never to edit the live file, only the repo copy, because a direct edit drifts from the repo. I suggest the script call the installer instead.

**For the session**

### Rules that apply

Red step: rules files AGENTS.md and CLAUDE.md; expected to touch "Edit the repo copy, never the live file".
| Rule, as written | Where it is written | Lines in the change | Kept? |
| "Edit the repo copy, never the live file" | AGENTS.md | scripts/sync.ps1 3-5 | broken: writes the live file |

- F1: "Edit the repo copy, never the live file" (AGENTS.md). Lines 3-5 copy into the live file. Call the installer instead.

```lens-findings
{
  "lens": "conventions-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "scripts/sync.ps1",
        "start": 3,
        "end": 5
      },
      "severity": "medium",
      "headline": "The sync script writes the live rules file directly"
    }
  ],
  "notChecked": [
    "Whether the installer accepts being called from the script"
  ]
}
```
