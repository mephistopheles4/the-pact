**For the owner**

Nobody can use this change to break in. It adds one line to an internal audit log, written only by the server.

**For the session**

### Attack paths

Red step:
- src/audit.mjs recordSignIn: only the server calls it; nobody outside can reach it.

Paths:
1. Entry: none from outside. The function is called by the sign-in route after a sign-in succeeds, with values the server holds. Control: no outside input reaches it.

- F1: the audit log keeps email addresses.

```lens-findings
{
  "lens": "adversarial-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "symbol",
        "file": "src/audit.mjs",
        "symbol": "recordSignIn"
      },
      "severity": "medium",
      "likelihood": "medium",
      "headline": "The audit log keeps each user email address"
    }
  ],
  "notChecked": [
    "Only the files in the diff were read"
  ]
}
```
