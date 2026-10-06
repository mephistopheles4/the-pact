**For the owner**

The theme picker could ship later behind its own ticket. The upload validation stays, though the spec offers to move it: it is on the risk floor.

**For the session**

### Cuts and deferrals

Red step:
- S1: a cut would lose a part the issue asks for.
- S2: a cut would lose a part the issue asks for.
- S3: a cut would ship uploads with no input validation.
- S4: a cut would lose only the theme picker.
- S5: a cut would lose a part the issue asks for.
- S6: a cut would lose a part the issue asks for.
| Section | Could be cut or deferred | What that saves | Trigger to pick it up |
| S2 | nothing | - | - |
| S3 | input validation: risk floor: not deferrable | - | - |
| S4 | the theme picker, deferred | a ticket | after the first release |

- S4: The theme picker has no user before the first release

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
      "headline": "The theme picker has no user before the first release"
    }
  ],
  "notChecked": [
    "S5: whether the rollback could be simpler was not weighed"
  ]
}
```
