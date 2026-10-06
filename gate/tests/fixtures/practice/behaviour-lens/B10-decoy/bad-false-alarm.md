**For the owner**

The claim held: empty input gives null. The code uses an unusual short form for it, which works.

**For the session**

### Claims run

| Claim | How it could be wrong | What I ran | Inputs that failed | Result |
| --- | --- | --- | --- | --- |
| C1 | empty string gives an empty object | parse(""), parse(" "), parse(undefined) | none | held |

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
      "headline": "The null check uses an unusual short form"
    }
  ],
  "notChecked": [
    "Inputs over 1 MB were not tried"
  ]
}
```
