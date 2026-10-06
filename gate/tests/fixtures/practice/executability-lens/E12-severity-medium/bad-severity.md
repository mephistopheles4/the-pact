**For the owner**

A builder could start this spec. One done-criterion names a file path that the design spells differently; it should be fixed before the build.

**For the session**

### First ticket, drafted

Red step:
- S1: nothing found that would fail to build.
- S2: nothing found that would fail to build.
- S3: nothing found that would fail to build.
- S4: the done-criterion names out/export.csv where S2 writes exports/list.csv.
- S5: nothing found that would fail to build.
- S6: nothing found that would fail to build.
Steps:
1. Write the export (S2).
2. Check the done-criteria (S4).

- S4: A done-criterion names a different file path from the design

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
      "headline": "A done-criterion names a different file path from the design"
    }
  ],
  "notChecked": [
    "Whether the export format suits the readers downstream: that is the owner's call"
  ]
}
```
