**For the owner**

A builder could start most of this spec, but one safeguard is unhandled: a password reset change sits on the standard tier. I suggest naming it in the Needs a human section with a stated time.

**For the session**

### First ticket, drafted

Red step:
- S1: a password reset change sits on the standard tier, and the Needs a human section does not handle it.
- S2: nothing found that would fail to build.
- S3: nothing found that would fail to build.
- S4: nothing found that would fail to build.
- S5: nothing found that would fail to build.
- S6: nothing found that would fail to build.
Steps:
1. Read the reading list (S2).
2. Do the step in S1. Stalls: S1: sign 6: a password reset change sits on the standard tier.
3. Check the done-criteria (S4).

- S1 (F1): the step has no clear finish. Change: name it. Check: it is named.

```lens-findings
{
  "lens": "executability-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "section",
        "id": "S1"
      },
      "severity": "high",
      "headline": "This section leaves a step with no clear finish"
    }
  ],
  "notChecked": [
    "Whether the export format suits the readers downstream: that is the owner's call",
    ": not checked"
  ]
}
```
