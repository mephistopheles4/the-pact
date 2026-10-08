**For the owner**

You can follow every part of the change.

**For the session**

### What the owner must do

Red step: the owner reads the release doc to cut a release; they need to tag, run one step and push.
| Action the change asks of you | Where it is | Where you would fail |
| Tag the release | docs/release.md 1-2 | nowhere |
| Run the PSR step | docs/release.md 3-6 | nowhere |

```lens-findings
{
  "lens": "reader-lens",
  "verdict": "clear",
  "findings": [],
  "notChecked": [
    "The release script itself"
  ],
  "nonRisks": [
    {
      "anchor": {
        "kind": "lines",
        "file": "docs/release.md",
        "start": 3,
        "end": 6
      },
      "note": "The release steps can be followed"
    }
  ]
}
```
