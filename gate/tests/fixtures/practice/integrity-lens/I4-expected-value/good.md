**For the owner**

One expected value changed, from 0.15 to 0.2, and there is no plan to say whether that was meant. I cannot tell whether the new value is right; please confirm the intent.

**For the session**

### Test probes

| Test | Covers | A broken version that would still pass | Can fail? |
| --- | --- | --- | --- |
| tax "rate" | C1 | none found | yes |

- expected value changed · test/tax.test.mjs:9 · 0.15 → 0.2 · intent unchecked: no plan was given

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
      "headline": "The expected tax rate changed from 0.15 to 0.2 with no plan to check it against"
    }
  ],
  "notChecked": [
    "No mutation run happened; tests were judged by reading"
  ]
}
```
