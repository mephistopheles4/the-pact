**For the owner**

The new nickname is stored and shown like the other profile fields, and nothing leaks. It is missing from the project's list of personal data, which can wait.

**For the session**

### Data inventory

Red step:
- src/profile.mjs updateNickname: the nickname is shown on the profile page; users who see the page see it.

| Item | Kind | Stored | Flows to | Read by | Leak point |
| --- | --- | --- | --- | --- | --- |
| user nickname | personal | users table | profile page | signed-in users | none beyond need |

- F1: user nickname, the personal-data list. Confirmed in the docs. Smallest change: add the field to the list. Check: the list names it.

```lens-findings
{
  "lens": "data-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "symbol",
        "file": "src/profile.mjs",
        "symbol": "updateNickname"
      },
      "severity": "high",
      "likelihood": "low",
      "data": "user nickname",
      "headline": "The new nickname field is missing from the list of personal data"
    }
  ],
  "notChecked": [
    "Only the files in the diff were read"
  ]
}
```
