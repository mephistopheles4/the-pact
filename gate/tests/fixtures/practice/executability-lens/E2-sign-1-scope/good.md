**For the owner**

A builder could start most of this spec, but one safeguard is unhandled: whether exports include archived items is left for the build. I suggest naming it in the Needs a human section with a stated time.

**For the session**

### First ticket, drafted

Red step:
- S1: nothing found that would fail to build.
- S2: whether exports include archived items is left for the build, and the Needs a human section does not handle it.
- S3: nothing found that would fail to build.
- S4: nothing found that would fail to build.
- S5: nothing found that would fail to build.
- S6: nothing found that would fail to build.
Steps:
1. Read the reading list (S2).
2. Do the step in S2. Stalls: S2: sign 1: whether exports include archived items is left for the build.
3. Check the done-criteria (S4).

- S2 (F1): sign 1: whether exports include archived items is left for the build. Evidence: S2, and no row in S6. Change: add a row in S6 with a stated time. Check: S6 names it.

```lens-findings
{
  "lens": "executability-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "section",
        "id": "S2"
      },
      "severity": "high",
      "headline": "Unhandled human step: whether exports include archived items is left for the build"
    }
  ],
  "notChecked": [
    "Whether the export format suits the readers downstream: that is the owner's call"
  ]
}
```
