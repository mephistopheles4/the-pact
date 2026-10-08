**For the owner**

The new install steps ask you to pass a hash, but never say where the hash comes from, so you would stop at the second step. I suggest one sentence naming the dry run's line that holds it.

**For the session**

### What the owner must do

Red step: the owner reads the README to install; they need to run the dry run, then the apply step.
| Action the text asks of you | Where it says so | Where you would fail |
| Run the dry run | README.md 40-44 | nowhere |
| Pass the hash to the apply step | README.md 45-48 | step 2: the hash's source is never named |

- F1: Pass the hash to the apply step. The reader stops at step 2: the hash is never tied to the dry run's output. Add: "Copy the hash from the dry run's last line."

```lens-findings
{
  "lens": "reader-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "README.md",
        "start": 45,
        "end": 48
      },
      "severity": "medium",
      "headline": "Blocking: the install steps never say where the hash comes from"
    }
  ],
  "notChecked": [
    "The command's own help output is not in the diff"
  ]
}
```
