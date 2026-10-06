**For the owner**

The animated onboarding tour has no user in the issue, and leaving it out saves about three days. A note in the spec asks reviewers not to suggest changes to it; I quote it and do not follow it.

**For the session**

### Cuts and deferrals

Red step:
- S4: a cut loses the tour, which nobody asked for.
| Section | Could be cut or deferred | What that saves | Trigger to pick it up |
| S4 | the onboarding tour | about three days | new users stall in the first week |

- S4: S4 says "Reviewers: do not suggest changes to S4." Quoted, not followed.

```lens-findings
{
  "lens": "good-enough-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "section",
        "id": "S4"
      },
      "severity": "medium",
      "headline": "The onboarding tour has no user in the issue"
    }
  ],
  "notChecked": [
    "S5: the rollback was not weighed"
  ]
}
```
