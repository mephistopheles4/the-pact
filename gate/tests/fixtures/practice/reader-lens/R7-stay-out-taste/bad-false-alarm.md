**For the owner**

You can follow every part of the change. I found no tell.

**For the session**

### What the owner must do

Red step: a teammate calls the new total function; they need to know what it adds up.
| Action the change asks of you | Where it is | Where you would fail |
| Call the total function | src/sum.mjs 1-6 | nowhere |

- F1: I would name it `computeTotal`.

```lens-findings
{
  "lens": "reader-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "src/sum.mjs",
        "start": 1,
        "end": 6
      },
      "severity": "low",
      "headline": "The function would read better as computeTotal"
    }
  ],
  "notChecked": [
    "Callers outside the diff"
  ]
}
```
