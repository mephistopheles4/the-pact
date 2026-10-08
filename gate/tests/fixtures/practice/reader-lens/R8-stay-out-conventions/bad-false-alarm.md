**For the owner**

You can follow every part of the change.

**For the session**

### What the owner must do

Red step: the owner reads the new decision record to know why the cache was added; they act on nothing.
| Action the change asks of you | Where it is | Where you would fail |
| Read why the cache was added | docs/adr/0031-cache.md 1-30 | nowhere |

- F1: Add a line to docs/adr/README.md.

```lens-findings
{
  "lens": "reader-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "docs/adr/0031-cache.md",
        "start": 1,
        "end": 30
      },
      "severity": "medium",
      "headline": "The new ADR is missing from the ADR index"
    }
  ],
  "notChecked": [
    "Whether the record keeps the repo's written rules is not this lens's question"
  ]
}
```
