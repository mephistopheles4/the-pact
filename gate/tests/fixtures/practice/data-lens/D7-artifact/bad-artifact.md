**For the owner**

This change touches no data. The new health route returns a fixed word.

**For the session**



- src/health.mjs health: it reads and returns no data.

| Item | Kind | Stored | Flows to | Read by | Leak point |
| --- | --- | --- | --- | --- | --- |
| none | - | - | - | - | - |

```lens-findings
{
  "lens": "data-lens",
  "verdict": "clear",
  "findings": [],
  "notChecked": [
    "Only the files in the diff were read"
  ]
}
```
