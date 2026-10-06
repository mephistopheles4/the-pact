**For the owner**

The parser tests can fail: each one pins an exact value.

**For the session**

Tests I read:

| Test | Covers | A broken version that would still pass | Can fail? |
| --- | --- | --- | --- |
| parse "reads good input" | C1 | none found | yes |

```lens-findings
{
  "lens": "integrity-lens",
  "verdict": "clear",
  "findings": [],
  "notChecked": [
    "No mutation run happened; tests were judged by reading"
  ]
}
```
