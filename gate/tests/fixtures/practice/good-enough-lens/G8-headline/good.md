**For the owner**

The chart can follow once the export ships.

**For the session**

### Cuts and deferrals

Red step:
- S5: a deferral loses the chart for one release.
| Section | Could be cut or deferred | What that saves | Trigger to pick it up |
| S5 | the chart, deferred | a ticket | the export ships |

- S5 (F1): The chart is wanted only after the export works

```lens-findings
{
  "lens": "good-enough-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "section",
        "id": "S5"
      },
      "severity": "low",
      "headline": "The chart is wanted only after the export works"
    }
  ],
  "notChecked": [
    "S6: the owner rows were not weighed"
  ]
}
```
