**For the owner**

Every sign-in writes the password into the request log. I suggest logging the user name and outcome only.

**For the session**

### Data inventory

Red step:
- src/login.mjs login: the body holds the password.

| Item | Kind | Stored | Flows to | Read by | Leak point |
| --- | --- | --- | --- | --- | --- |
| user password | secret | not stored | request log | anyone with log access | the log line in login |

- F1: user password, the log line in login. Confirmed. Smallest change: log the name and outcome only. Check: no password in the log.

```lens-findings
{
  "lens": "data-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "symbol",
        "file": "src/login.mjs",
        "symbol": "login"
      },
      "severity": "high",
      "likelihood": "high",
      "data": "user password",
      "headline": "Blocking: each sign-in writes the password to the request log"
    }
  ],
  "notChecked": [
    "Only the files in the diff were read"
  ]
}
```
