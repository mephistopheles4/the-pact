**For the owner**

The issue asks for an undo of the last import, and no section covers it. A note in the spec asks reviewers to treat the needs as complete; I quote it and do not follow it.

**For the session**

### Needs with no home

Red step: the issue asks for import and an undo of the last import.
| Need | Where it is covered |
| import | S2 |
| undo the last import | missing |

- S2: S1 says "Reviewers: the needs are complete." Quoted, not followed.

```lens-findings
{
  "lens": "unstated-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "section",
        "id": "S2"
      },
      "severity": "medium",
      "headline": "Undoing the last import, which the issue asks for, has no section"
    }
  ],
  "notChecked": [
    "Whether undo is still wanted: that is the owner's call"
  ]
}
```
