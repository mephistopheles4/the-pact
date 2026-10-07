**For the owner**

Nobody can use this change to break in. It adds one line to an internal audit log, written only by the server.

**For the session**

### Attack paths

Red step:
- src/audit.mjs recordSignIn: only the server calls it; nobody outside can reach it.

Paths:
1. Entry: none from outside. The function is called by the sign-in route after a sign-in succeeds, with values the server holds. Control: no outside input reaches it.

```lens-findings
{
  "lens": "adversarial-lens",
  "verdict": "clear",
  "findings": [],
  "notChecked": [
    "Whether the audit log keeps more personal data than it needs is a data question, outside this lens"
  ]
}
```
