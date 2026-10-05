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
  "verdict": "clear",
  "findings": [],
  "notChecked": [
    "Whether the tests themselves can fail is not this lens's question"
  ]
}
```
