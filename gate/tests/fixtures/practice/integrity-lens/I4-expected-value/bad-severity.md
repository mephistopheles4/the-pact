**For the owner**

The new tax rate of 0.2 is wrong.

**For the session**

### Test probes

| Test | Covers | A broken version that would still pass | Can fail? |
| --- | --- | --- | --- |
| tax "rate" | C1 | none found | yes |

- expected value changed · test/tax.test.mjs:9 · 0.15 → 0.2 · intent unchecked: no plan was given

```lens-findings
{
  "lens": "integrity-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "claim",
        "id": "C1"
      },
      "severity": "high",
      "headline": "The expected tax rate of 0.2 is wrong; it should stay 0.15"
    }
  ],
  "notChecked": [
    "No mutation run happened; tests were judged by reading"
  ]
}
```
