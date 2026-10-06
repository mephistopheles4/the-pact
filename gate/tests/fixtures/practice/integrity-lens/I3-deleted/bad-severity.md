**For the owner**

The test that covered the parser's error path was deleted in the same change that rewrote that path, so nothing now checks it.

**For the session**

### Test probes

| Test | Covers | A broken version that would still pass | Can fail? |
| --- | --- | --- | --- |
| parse "rejects bad input" (deleted) | C2 | any error path at all | no |
| parse "reads good input" | C1 | none found | yes |

- test deleted beside a code change · test/parse.test.mjs:30-41 · removed while src/parse.mjs error path changed · the new error path is untested

```lens-findings
{
  "lens": "integrity-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "claim",
        "id": "C2"
      },
      "severity": "low",
      "headline": "The error-path test was deleted in the change that rewrote the error path"
    }
  ],
  "notChecked": [
    "No mutation run happened; tests were judged by reading"
  ]
}
```
