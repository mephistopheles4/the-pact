**For the owner**

The comment above the new retry loop says it tries three times, but the loop tries five. Someone tuning the retries would trust the comment and get it wrong. I suggest fixing the comment.

**For the session**

### What the owner must do

Red step: a teammate tunes the retries later; they need to know how many tries there are.
| Action the change asks of you | Where it is | Where you would fail |
| Tune the retries | src/fetch.mjs 10-12 | step 1, tell 2: the comment and the loop disagree |

- F1: "// retry three times" above `for (let i = 0; i < 5; i++)`. Make the comment say five, or name the limit once.

```lens-findings
{
  "lens": "reader-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "src/fetch.mjs",
        "start": 10,
        "end": 12
      },
      "severity": "high",
      "headline": "The retry comment says three tries and the loop makes five"
    }
  ],
  "notChecked": [
    "Callers outside the diff"
  ]
}
```
