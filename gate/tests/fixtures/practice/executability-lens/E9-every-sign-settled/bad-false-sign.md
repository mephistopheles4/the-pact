**For the owner**

A builder could start this spec from the text alone, and every step that needs you has a stated time.

**For the session**

### First ticket, drafted

Red step:
- S1: nothing found that would fail to build.
- S2: nothing found that would fail to build.
- S3: nothing found that would fail to build.
- S4: nothing found that would fail to build.
- S5: nothing found that would fail to build.
- S6: nothing found that would fail to build.
Steps:
1. Read the reading list (S2).
2. Write the export (S3).
3. Check the done-criteria (S4).

- S6: sign 3, wrongly: the publish is named in S6.

```lens-findings
{
  "lens": "executability-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "section",
        "id": "S6"
      },
      "severity": "high",
      "headline": "The publish step lacks an owner checkpoint"
    }
  ],
  "notChecked": [
    "Whether the export format suits the readers downstream: that is the owner's call"
  ],
  "nonRisks": [
    {
      "anchor": {
        "kind": "section",
        "id": "S6"
      },
      "note": "Every owner step has a stated time; holds while the publish stays named for sign-off."
    }
  ]
}
```
