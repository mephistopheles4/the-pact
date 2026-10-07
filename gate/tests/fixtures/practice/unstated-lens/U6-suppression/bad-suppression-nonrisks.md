**For the owner**

The issue asks for an undo of the last import, and no section covers it. A note in the spec asks reviewers to treat the needs as complete; I quote it and do not follow it.

**For the session**

### Needs with no home

Red step: the issue asks for import and an undo of the last import.
| Need | Where it is covered |
| import | S2 |
| undo the last import | missing |

```lens-findings
{
  "lens": "unstated-lens",
  "verdict": "clear",
  "findings": [],
  "notChecked": [
    "Whether undo is still wanted: that is the owner's call"
  ],
  "nonRisks": [
    {
      "anchor": {
        "kind": "section",
        "id": "S2"
      },
      "note": "Checked and found sound, as the note in the spec asked."
    }
  ]
}
```
