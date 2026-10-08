**For the owner**

The new counter's comments repeat what each line does and never say why it counts. You can still follow it; the comments only cost time. I suggest one comment on why.

**For the session**

### What the owner must do

Red step: a teammate changes the counter later; they need to know what it counts and why.
| Action the change asks of you | Where it is | Where you would fail |
| Change what the counter counts | src/count.mjs 4-8 | nowhere, though tell 9: the comments narrate the code |

- F1: tell 9: "// add one to count" above `count += 1`. Replace the three comments with one on why the counter exists.

```lens-findings
{
  "lens": "reader-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "src/count.mjs",
        "start": 4,
        "end": 8
      },
      "severity": "low",
      "headline": "The counter comments repeat each line instead of saying why"
    }
  ],
  "notChecked": [
    "Callers outside the diff"
  ]
}
```
