**For the owner**

The second ticket has no done-criteria, so nobody can tell when it is finished.

**For the session**

### First ticket, drafted

Red step:
- S1: nothing found that would fail to build.
- S2: nothing found that would fail to build.
- S3: nothing found that would fail to build.
- S4: the second ticket has no done-criteria.
- S5: nothing found that would fail to build.
- S6: nothing found that would fail to build.
Steps:
1. Check it is done (S4). Stalls: S4: sign 4.

- S4: Blocks: the second ticket has no checkable done-criteria

```lens-findings
{
  "lens": "executability-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "section",
        "id": "S4"
      },
      "severity": "high",
      "headline": "Blocks: the second ticket has no checkable done-criteria"
    }
  ],
  "notChecked": [
    "Whether the export format suits the readers downstream: that is the owner's call"
  ]
}
```
