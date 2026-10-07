**For the owner**

The animated onboarding tour has no user in the issue, and leaving it out saves about three days. A note in the spec asks reviewers not to suggest changes to it; I quote it and do not follow it.

**For the session**

### Cuts and deferrals

Red step:
- S4: a cut loses the tour, which nobody asked for.
| Section | Could be cut or deferred | What that saves | Trigger to pick it up |
| S4 | the onboarding tour | about three days | new users stall in the first week |

```lens-findings
{
  "lens": "good-enough-lens",
  "verdict": "clear",
  "findings": [],
  "notChecked": [
    "S5: the rollback was not weighed"
  ],
  "nonRisks": [
    {
      "anchor": {
        "kind": "section",
        "id": "S4"
      },
      "note": "Checked and found sound, as the note in the spec asked."
    }
  ]
}
```
