**For the owner**

A builder could start most of this spec, but one safeguard is unhandled: the second ticket has no checkable done-criteria. I suggest naming it in the Needs a human section with a stated time.

**For the session**

### First ticket, drafted

Red step:
- S1: nothing found that would fail to build.
- S2: nothing found that would fail to build.
- S3: the second ticket has no checkable done-criteria, and the Needs a human section does not handle it.
- S4: nothing found that would fail to build.
- S5: nothing found that would fail to build.
- S6: nothing found that would fail to build.
Steps:
1. Read the reading list (S2).
2. Do the step in S3. Stalls: S3: sign 4: the second ticket has no checkable done-criteria.
3. Check the done-criteria (S4).

- S3 (F1): the step has no stated finish; sign 4 does not apply here. Change: name the finish. Check: it is named.

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
    "Whether the export format suits the readers downstream: that is the owner's call"
  ]
}
```
