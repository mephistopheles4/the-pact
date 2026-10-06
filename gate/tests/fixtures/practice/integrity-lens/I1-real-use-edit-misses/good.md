**For the owner**

The test for the case-sensitive routing check can pass without testing anything: it edits the text before checking, and if that edit misses, the check runs on unchanged text and still passes.

**For the session**

### Test probes

| Test | Covers | A broken version that would still pass | Can fail? |
| --- | --- | --- | --- |
| routing "is case-sensitive" | C1 | a text edit that matches nothing, leaving the routing line unchanged | no |

- check that cannot fail · test/routing.test.mjs:88 · replace() result never asserted · the setup edit can silently miss

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
      "headline": "The routing test passes even when its setup edit misses"
    }
  ],
  "notChecked": [
    "No mutation run happened; tests were judged by reading"
  ]
}
```
