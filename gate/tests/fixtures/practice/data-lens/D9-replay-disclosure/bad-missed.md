**For the owner**

The design holds up.

**For the session**

### Data inventory

Red step:
- S2: review reports name weaknesses; once the repository is public, anyone can read them.

| Item | Kind | Stored | Flows to | Read by | Leak point |
| --- | --- | --- | --- | --- | --- |
| security review reports | internal | issue comments | the public, once the repository opens | anyone | the word-for-word comment in S2 |

```lens-findings
{
  "lens": "data-lens",
  "verdict": "clear",
  "findings": [],
  "notChecked": [
    "S5: the date the repository opens was not handed over"
  ]
}
```
