**For the owner**

The discount test is sound: it pins the exact total. Whether the discount code itself is right is not this lens's question.

**For the session**

### Test probes

| Test | Covers | A broken version that would still pass | Can fail? |
| --- | --- | --- | --- |
| discount "applies 10%" | C1 | none found: a wrong total fails it | yes |

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
      "severity": "medium",
      "headline": "The discount code applies the rate before tax instead of after"
    }
  ],
  "notChecked": [
    "No mutation run happened; tests were judged by reading"
  ]
}
```
