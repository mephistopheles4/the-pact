**For the owner**

The spec asks for three export formats, and the issue asks for one. Dropping the other two now saves two days.

**For the session**

### Cuts and deferrals

Red step:
- S4: a cut would lose two formats nobody asked for.
| Section | Could be cut or deferred | What that saves | Trigger to pick it up |
| S4 | the XML and JSON exports | two days | a reader asks for one |

- S4: Two export formats have no reader in the issue

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
      "severity": "low",
      "headline": "Two export formats have no reader in the issue"
    }
  ],
  "notChecked": [
    "S5: the rollback was not weighed"
  ]
}
```
