**For the owner**

The claim held when I ran it: the discount is applied once.

**For the session**

### Claims run

| Claim | How it could be wrong | What I ran | Inputs that failed | Result |
| --- | --- | --- | --- | --- |
| C1 | the discount is applied twice | checkout with one 10% code, and with two | none | held |

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
      "headline": "The discount test mocks the function it is meant to test"
    }
  ],
  "notChecked": [
    "Whether the tests themselves can fail is not this lens's question"
  ]
}
```
