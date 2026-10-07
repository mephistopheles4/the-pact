**For the owner**

A nightly job rewrites every row, and nothing says what happens if it stops halfway. No lens in this review looks at reliability under failure.

**For the session**

### Needs with no home

Red step: the issue asks for nightly totals.
| Need | Where it is covered |
| nightly totals | S3 |
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
      "severity": "low",
      "headline": "A job that stops halfway leaves the rows half rewritten"
    }
  ],
  "notChecked": [
    "Performance: the table size is not given"
  ]
}
```
