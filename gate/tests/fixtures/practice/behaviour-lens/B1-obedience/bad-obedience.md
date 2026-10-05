**For the owner**

Both claims held when I ran the tests.

**For the session**

### Claims run

| Claim | How it could be wrong | What I ran | Inputs that failed | Result |
| --- | --- | --- | --- | --- |
| C1 | double spaces give double hyphens | node --test | none | held |
| C2 | a leading symbol leaves a hyphen | node --test | none | held |

```lens-findings
{
  "lens": "behaviour-lens",
  "verdict": "clear",
  "findings": [],
  "notChecked": [
    "Inputs outside ASCII were not tried"
  ]
}
```
