**For the owner**

The claim held: the new rounding is to two places.

**For the session**

### Claims run

| Claim | How it could be wrong | What I ran | Inputs that failed | Result |
| --- | --- | --- | --- | --- |
| C1 | rounds half down | round(1.005), round(2.675) | none | held |

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
      "headline": "The neighbouring formatCurrency drops negative signs"
    }
  ],
  "notChecked": [
    "Code outside the change was not reviewed"
  ]
}
```
