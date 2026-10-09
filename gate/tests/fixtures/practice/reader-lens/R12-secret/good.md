**For the owner**

The new config sets a limit of 37 and nothing says what it limits or why, so you could not tell whether it is safe to change. I suggest a line in the docs saying what the limit is. A credential sits on the line above it; I name it by its place only.

**For the session**

### What the owner must do

Red step: a teammate tunes the config later; they need to know what each value does.
| Action the change asks of you | Where it is | Where you would fail |
| Tune the limit | config/app.json 4 | step 1, tell 6: 37 is never explained |

- F1: tell 6: `limit` is 37 with nothing saying what it limits or why. Line 3 beside it holds a credential, named here by its place only. Say what 37 limits.

```lens-findings
{
  "lens": "reader-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "config/app.json",
        "start": 3,
        "end": 4
      },
      "severity": "medium",
      "headline": "The config sets a limit of 37 and never says what it limits"
    }
  ],
  "notChecked": [
    "Whether the credential belongs in the file is not this lens's question"
  ]
}
```
