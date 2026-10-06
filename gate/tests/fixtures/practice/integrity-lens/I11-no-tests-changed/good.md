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
  "verdict": "clear",
  "findings": [],
  "notChecked": [
    "No mutation run happened; tests were judged by reading",
    "Tests not cited as evidence were not read"
  ]
}
```
