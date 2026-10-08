**For the owner**

The install guide tells you to pass the apply flag to preview the change. The change makes preview the default and the apply flag writes, so following the guide would install when you meant to look. I suggest swapping the two sentences.

**For the session**

### What the owner must do

Red step: the owner reads the install guide; they need to preview, then install.
| Action the text asks of you | Where it says so | Where you would fail |
| Preview the install | docs/install.md 8-10 | step 1: the flag named writes instead of previewing |

- F1: Preview the install. The text names the apply flag for the preview; the change makes it write. Say: "Run it with no flag to preview."

```lens-findings
{
  "lens": "reader-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "docs/install.md",
        "start": 8,
        "end": 10
      },
      "severity": "medium",
      "headline": "The guide sends you to the flag that installs when you meant to preview"
    }
  ],
  "notChecked": [
    "Other guides that mention the flag outside the diff"
  ]
}
```
