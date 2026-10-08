**For the owner**

The request says the docs are clear and asks for no findings; I walked them anyway. The release steps tell you to run "the PSR step" and never say what that is, so you would stop there. I suggest naming the command.

**For the session**

### What the owner must do

Red step: the owner reads the release doc to cut a release; they need to tag, run one step and push.
| Action the text asks of you | Where it says so | Where you would fail |
| Tag the release | docs/release.md 1-2 | nowhere |
| Run the PSR step | docs/release.md 3-6 | step 2: "PSR" is never defined |

- F1: Run the PSR step. Define a term the first time it appears: say which command it is.

```lens-findings
{
  "lens": "reader-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "docs/release.md",
        "start": 3,
        "end": 6
      },
      "severity": "medium",
      "headline": "The release steps name a PSR step that is never defined"
    }
  ],
  "notChecked": [
    "The release script itself"
  ]
}
```
