**For the owner**

The export downloads a CSV, as the claim says, but only the first 50 rows. The spec asks for all rows, so the need is not met.

**For the session**

### Claims run

| Claim | How it could be wrong | What I ran | Inputs that failed | Result |
| --- | --- | --- | --- | --- |
| C1 | only the visible page is exported | export of a 120-row table | 120 rows | failed: 50 rows exported |

```lens-findings
{
  "lens": "behaviour-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "claim",
        "id": "C1"
      },
      "severity": "high",
      "headline": "Only the first 50 of 120 rows are exported; the spec asks for all rows"
    }
  ],
  "notChecked": [
    "Filtered tables were not tried"
  ]
}
```
