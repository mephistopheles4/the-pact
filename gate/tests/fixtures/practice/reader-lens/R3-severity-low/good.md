**For the owner**

One sentence in the new guide is long and passive, but you can still find and take the step. I suggest splitting it.

**For the session**

### What the owner must do

Red step: the owner reads the guide to rotate the log; they need to run one command.
| Action the text asks of you | Where it says so | Where you would fail |
| Rotate the log | docs/guide.md 5 | nowhere, though the sentence is 45 words and passive |

- F1: Rotate the log. Keep sentences short; use active voice. Split it: "Run the rotate command. It keeps the last seven files."

```lens-findings
{
  "lens": "reader-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "docs/guide.md",
        "start": 5,
        "end": 5
      },
      "severity": "low",
      "headline": "The rotate step sits in one long passive sentence"
    }
  ],
  "notChecked": [
    "The rotate command's own output"
  ]
}
```
