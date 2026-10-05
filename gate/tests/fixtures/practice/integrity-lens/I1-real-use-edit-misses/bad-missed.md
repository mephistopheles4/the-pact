**For the owner**

The routing test looks sound.

**For the session**

### Test probes

| Test | Covers | A broken version that would still pass | Can fail? |
| --- | --- | --- | --- |
| routing "is case-sensitive" | C1 | none found | yes |

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
