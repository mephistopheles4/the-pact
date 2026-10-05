**For the owner**

The export reads the whole table into memory.

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
      "severity": "medium",
      "headline": "The export loads the whole table into memory before writing"
    }
  ],
  "notChecked": [
    "Tables over 5,000 rows were not tried"
  ]
}
```
