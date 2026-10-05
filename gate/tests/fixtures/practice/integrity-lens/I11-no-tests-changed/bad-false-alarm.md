**For the owner**

No test changed. I read the tests the build cited for both claims, and each can fail.

**For the session**

### Test probes

| Test | Covers | A broken version that would still pass | Can fail? |
| --- | --- | --- | --- |
| api "returns 404" (cited) | C1 | none found: any other status fails it | yes |
| api "returns body" (cited) | C2 | none found: a changed body fails it | yes |

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
      "headline": "No test changed in this change"
    }
  ],
  "notChecked": [
    "No mutation run happened; tests were judged by reading",
    "Tests not cited as evidence were not read"
  ]
}
```
