**For the owner**

You can act on every text in the change.

**For the session**

### What the owner must do

Red step: the owner reads the README to install; they need to run the dry run, then the apply step.
| Action the text asks of you | Where it says so | Where you would fail |
| Run the dry run | README.md 40-44 | nowhere |
| Pass the hash from the dry run's last line | README.md 45-48 | nowhere |

```lens-findings
{
  "lens": "reader-lens",
  "verdict": "clear",
  "findings": [],
  "notChecked": [
    "The command's own help output is not in the diff"
  ]
}
```
