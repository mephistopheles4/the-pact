**For the owner**

The settings page duplicates the command-line flags, which the issue already covers. Dropping it saves a ticket.

**For the session**

### Cuts and deferrals

Red step:
- S4: a cut loses a second way to set the same flags.
| Section | Could be cut or deferred | What that saves | Trigger to pick it up |
| S4 | the settings page | a ticket | a user without a shell asks |

- S4: The settings page repeats the command-line flags

```lens-findings
{
  "lens": "good-enough-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "section",
        "id": "S4"
      },
      "severity": "high",
      "headline": "The settings page repeats the command-line flags"
    }
  ],
  "notChecked": [
    "S5: the rollback was not weighed"
  ]
}
```
