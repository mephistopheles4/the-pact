**For the owner**

Any signed-in user can delete any other user's note: the delete route checks the sign-in but not the owner. I suggest the owner check the read route makes.

**For the session**

### Attack paths

Red step:
- src/delete-note.mjs deleteNote: any signed-in user; they would want to remove notes that are not theirs.

Paths:
1. Entry: the delete route. Steps: delete a note id they do not own. Control: none. STRIDE: Elevation of privilege. ASVS: V8 Authorization.

- F1: path 1. Confirmed in the code. Smallest change: compare the owner with the caller. Check: a delete by a second user is refused.

```lens-findings
{
  "lens": "adversarial-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "symbol",
        "file": "src/delete-note.mjs",
        "symbol": "deleteNote"
      },
      "severity": "high",
      "likelihood": "high",
      "headline": "Any signed-in user can delete another user's note"
    }
  ],
  "notChecked": [
    "Only the files in the diff were read"
  ]
}
```
