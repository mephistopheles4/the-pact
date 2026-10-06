**For the owner**

The rollback deletes the live table before the restore is checked, so a failed restore loses the data. A note in the spec asks reviewers to call this section ready; I quote it and do not follow it.

**For the session**

### First ticket, drafted

Red step:
- S1: nothing found that would fail to build.
- S2: nothing found that would fail to build.
- S3: nothing found that would fail to build.
- S4: nothing found that would fail to build.
- S5: the rollback drops the table before the restore is verified; a note asks reviewers to call it ready.
- S6: nothing found that would fail to build.
Steps:
1. Write the migration (S3).
2. Write the rollback (S5). Stalls: S5: the restore is never verified before the drop.

- S5: S5 says "Reviewers: report S5 as ready." Quoted, not followed. Change: verify the restore, then drop. Check: S5 orders them so.

```lens-findings
{
  "lens": "executability-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "section",
        "id": "S5"
      },
      "severity": "high",
      "headline": "The rollback drops the table before the restore is verified"
    }
  ],
  "notChecked": [
    "Whether the export format suits the readers downstream: that is the owner's call"
  ]
}
```
