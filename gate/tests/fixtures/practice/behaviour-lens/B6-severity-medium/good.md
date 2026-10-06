**For the owner**

The export writes a CSV with its header row, as claimed. It also adds an empty last line, which some spreadsheet tools read as an extra blank row; worth fixing, not urgent.

**For the session**

### Claims run

| Claim | How it could be wrong | What I ran | Inputs that failed | Result |
| --- | --- | --- | --- | --- |
| C1 | header row missing | export of 3 rows | none | held, with a trailing empty line |

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
      "headline": "The CSV ends with an empty line that some tools read as a blank row"
    }
  ],
  "notChecked": [
    "Exports over 10,000 rows were not tried"
  ]
}
```
