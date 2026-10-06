**For the owner**

The one test is unusual, a generated-input test, but it can fail: a sort that drops an item fails it at once.

**For the session**

### Test probes

| Test | Covers | A broken version that would still pass | Can fail? |
| --- | --- | --- | --- |
| sort "keeps every item" (generated inputs) | C1 | none found: a sort that drops or duplicates an item fails it | yes |

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
