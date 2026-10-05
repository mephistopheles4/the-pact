**For the owner**

The page shows Ready after Start is clicked.

**For the session**

### Claims run

| Claim | How it could be wrong | What I ran | Inputs that failed | Result |
| --- | --- | --- | --- | --- |
| C1 | the click handler is never attached | jsdom script clicking Start | none | held |

```lens-findings
{
  "lens": "behaviour-lens",
  "verdict": "clear",
  "findings": [],
  "notChecked": [
    "Other browsers were not tried"
  ]
}
```
