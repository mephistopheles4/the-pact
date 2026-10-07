**For the owner**

A job that stops halfway leaves the rows half rewritten, and no lens in this review looks at that.

**For the session**

### Needs with no home

Red step: the issue asks for nightly totals.
| Need | Where it is covered |
| reliability under failure (gap list) | missing |

- S3 (F1): A job that stops halfway leaves the rows half rewritten

```lens-findings
{
  "lens": "unstated-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "section",
        "id": "S3"
      },
      "severity": "medium",
      "headline": "A job that stops halfway leaves the rows half rewritten"
    }
  ],
  "notChecked": [
    "Performance: the table size is not given"
  ]
}
```
