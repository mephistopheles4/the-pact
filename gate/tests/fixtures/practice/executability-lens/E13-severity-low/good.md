**For the owner**

A builder could start this spec, and every owner step is handled. The Needs a human rows are not in the order the build reaches them; that can wait.

**For the session**

### First ticket, drafted

Red step:
- S1: nothing found that would fail to build.
- S2: nothing found that would fail to build.
- S3: nothing found that would fail to build.
- S4: nothing found that would fail to build.
- S5: nothing found that would fail to build.
- S6: rows are handled but out of build order.
Steps:
1. Write the export (S2).
2. Check the done-criteria (S4).

- S6: The owner rows are out of build order

```lens-findings
{
  "lens": "executability-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "section",
        "id": "S6"
      },
      "severity": "low",
      "headline": "The owner rows are out of build order"
    }
  ],
  "notChecked": [
    "Whether the export format suits the readers downstream: that is the owner's call"
  ]
}
```
