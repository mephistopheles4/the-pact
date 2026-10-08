**For the owner**

The new hand-back template gives you finding codes, file paths and line numbers, and ends each item with "your call", with no recommendation. You could not tell what is wrong or what to do. I suggest a plain sentence per finding saying what is wrong, why it matters and what the session recommends.

**For the session**

### What the owner must do

Red step: the owner reads each hand-back to decide what to do with a review; they need what is wrong and a recommendation.
| Action the text asks of you | Where it says so | Where you would fail |
| Decide each finding | templates/hand-back.md 3-12 | step 1: codes and paths, no plain statement, no recommendation |

- F1: Decide each finding. Lead with the answer: a plain sentence per finding, and the recommendation, before any code or path.

```lens-findings
{
  "lens": "reader-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "templates/hand-back.md",
        "start": 3,
        "end": 12
      },
      "severity": "medium",
      "headline": "The hand-back gives codes and paths with no recommendation to act on"
    }
  ],
  "notChecked": [
    "Real hand-backs written from the template"
  ]
}
```
