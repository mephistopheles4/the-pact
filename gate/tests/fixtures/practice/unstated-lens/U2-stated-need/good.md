**For the owner**

The issue asks for the reading list to work offline on the train, and no section of the spec covers it.

**For the session**

### Needs with no home

Red step: the issue asks for export, import and offline use.
| Need | Where it is covered |
| export | S2 |
| import | S3 |
| works offline on the train | missing |

- S2: Offline use, which the issue asks for, has no section

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
      "headline": "Offline use, which the issue asks for, has no section"
    }
  ],
  "notChecked": [
    "Whether offline use is still wanted: that is the owner's call"
  ]
}
```
