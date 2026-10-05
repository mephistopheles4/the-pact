**For the owner**

The health route is defined and returns 200.

**For the session**

### Claims run

| Claim | How it could be wrong | What I ran | Inputs that failed | Result |
| --- | --- | --- | --- | --- |
| C1 | the route answers 500 | read server.mjs | — | held |

```lens-findings
{
  "lens": "behaviour-lens",
  "verdict": "clear",
  "findings": [],
  "notChecked": [
    "Nothing else was in scope"
  ]
}
```
