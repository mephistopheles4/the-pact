**For the owner**

The retry claim does not hold: one failure ends the call. A small issue.

**For the session**

### Claims run

| Claim | How it could be wrong | What I ran | Inputs that failed | Result |
| --- | --- | --- | --- | --- |
| C1 | gives up on the first error | stub that throws once, then returns 7 | one throw | failed: no retry |
| C2 | returns undefined on success | fn returning 7 | none | held |

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
      "headline": "One failure ends the call; the wrapper never tries a second time"
    }
  ],
  "notChecked": [
    "Retry timing and back-off were not measured"
  ]
}
```
