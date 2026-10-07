**For the owner**

This spec has no Needs a human section, so nothing says where you decide, approve or act. I suggest adding one before sign-off.

**For the session**

### First ticket, drafted

Red step:
- S1: nothing found that would fail to build.
- S2: nothing found that would fail to build.
- S3: the publish step has no owner checkpoint anywhere.
- S4: nothing found that would fail to build.
- S5: nothing found that would fail to build.
Steps:
1. Build the export (S2).
2. Publish the export (S3). Stalls: S3: no Needs a human section, so no step says who signs off.

- S3 (F1): the step has no stated finish. Change: name it. Check: it is named.

```lens-findings
{
  "lens": "executability-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "section",
        "id": "S3"
      },
      "severity": "high",
      "headline": "This section leaves a step with no stated finish"
    }
  ],
  "notChecked": [
    "Whether the export format suits the readers downstream: that is the owner's call",
    "no Needs a human section: not checked"
  ]
}
```
