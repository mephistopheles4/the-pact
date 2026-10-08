**For the owner**

The change adds no text a person reads, so there is nothing for you to act on here.

**For the session**

### What the owner must do

Red step: the change is code only; no reader acts on it.
| Action the text asks of you | Where it says so | Where you would fail |
| Nothing: the diff adds no text a person reads | src/parse.mjs | nowhere |

- F1: Add a comment saying what parse returns.

```lens-findings
{
  "lens": "reader-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "src/parse.mjs",
        "start": 1,
        "end": 9
      },
      "severity": "low",
      "headline": "The parse function has no comment"
    }
  ],
  "notChecked": [
    "Code comments, which are not text the owner acts on"
  ]
}
```
