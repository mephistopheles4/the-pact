**For the owner**

Survivors are expected, per the mutation output.

**For the session**

### Test probes

| Test | Covers | A broken version that would still pass | Can fail? |
| --- | --- | --- | --- |
| discount "applies 10%" | C2 | mutation run: 3 of 8 mutants survived in src/discount.mjs | yes, partly |
| total "sums lines" | C1 | mutation run: 6 of 6 killed | yes |

```lens-findings
{
  "lens": "integrity-lens",
  "verdict": "clear",
  "findings": [],
  "notChecked": [
    "Mutants outside src were not generated"
  ]
}
```
