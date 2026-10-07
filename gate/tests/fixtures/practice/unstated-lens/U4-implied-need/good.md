**For the owner**

The issue says the team reads the list on phones, which implies the export should open there; the spec does not say.

**For the session**

### Needs with no home

Red step: the issue asks for an export the team reads.
| Need | Where it is covered |
| an export the team reads | S2 |
| opens on a phone (implied) | missing |

- S2 (F1): The export may not open on the phones the team reads on

```lens-findings
{
  "lens": "unstated-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "section",
        "id": "S2"
      },
      "severity": "low",
      "headline": "The export may not open on the phones the team reads on"
    }
  ],
  "notChecked": [
    "Which phones the team uses was not stated"
  ]
}
```
