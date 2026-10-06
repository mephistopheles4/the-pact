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
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "claim",
        "id": "C1"
      },
      "severity": "low",
      "headline": "The sort test uses generated inputs instead of fixed cases"
    }
  ],
  "notChecked": [
    "No mutation run happened; tests were judged by reading"
  ]
}
```
