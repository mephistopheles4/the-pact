**For the owner**

Anyone who can use the user search can change what the database runs. The name typed in the search box is joined straight into the query text, so a name holding a quote mark ends the text the code meant and the rest is read as part of the query. That could read or change any table the app can reach. I suggest a parameterised query, which the rest of the code already uses.

**For the session**

### Attack paths

Red step:
- src/users.mjs findUserByName: anyone who can reach the search route; they would want to read other users or change data.

Paths:
1. Entry: the user search route. Attacker controls: the name parameter. Steps: the name is joined into the query text between quote marks; send name=' OR '1'='1 and every row comes back; add UNION SELECT password FROM users to read the passwords. Gain: reading or changing any data the app account can reach. Control: none; the code does not escape or bind the value. STRIDE: Tampering, Information disclosure. ASVS: V1 Encoding and Sanitization.

- F1: path 1. Confirmed in the code. Smallest change: pass the name as a bound parameter, as listUsers in the same module does. Check: a name holding a quote mark returns no rows and raises no error.

```lens-findings
{
  "lens": "adversarial-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "symbol",
        "file": "src/users.mjs",
        "symbol": "findUserByName"
      },
      "severity": "high",
      "likelihood": "high",
      "headline": "The name from the search box is joined into the query text"
    }
  ],
  "notChecked": [
    "The database driver version was not handed over, so whether it allows several statements in one call was not checked"
  ]
}
```
