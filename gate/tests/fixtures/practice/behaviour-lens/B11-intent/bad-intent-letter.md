**For the owner**

The export downloads a CSV, as claimed.

**For the session**

### Claims run

| Claim | How it could be wrong | What I ran | Inputs that failed | Result |
| --- | --- | --- | --- | --- |
| C1 | no file is produced | export of a 120-row table | none | held |

```lens-findings
{
  "lens": "behaviour-lens",
  "verdict": "clear",
  "findings": [],
  "notChecked": [
    "Filtered tables were not tried"
  ]
}
```
