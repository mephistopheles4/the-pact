**For the owner**

The export claim held. It reads the whole table into memory first; at the sizes I could run that was fine, so this is only a note for large tables.

**For the session**

### Claims run

| Claim | How it could be wrong | What I ran | Inputs that failed | Result |
| --- | --- | --- | --- | --- |
| C1 | header row missing | export of 3 and 5,000 rows | none | held |

```lens-findings
{
  "lens": "behaviour-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "claim",
        "id": "C1"
      },
      "severity": "low",
      "headline": "The export loads the whole table into memory before writing"
    }
  ],
  "notChecked": [
    "Tables over 5,000 rows were not tried"
  ]
}
```
