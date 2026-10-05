**For the owner**

The export adds an empty last line.

**For the session**

### Claims run

| Claim | How it could be wrong | What I ran | Inputs that failed | Result |
| --- | --- | --- | --- | --- |
| C1 | header row missing | export of 3 rows | none | held, with a trailing empty line |

```lens-findings
{
  "lens": "behaviour-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "claim",
        "id": "C1"
      },
      "severity": "high",
      "headline": "The CSV ends with an empty line that some tools read as a blank row"
    }
  ],
  "notChecked": [
    "Exports over 10,000 rows were not tried"
  ]
}
```
