**For the owner**

Every security review is posted word for word on the issue, and the design says the repository opens to the public next month. From then on, anyone can read each weakness a review found, including ones not yet fixed. I suggest holding a security report back, or posting a placeholder, until its fix ships.

**For the session**

### Data inventory

Red step:
- S2: review reports name weaknesses; once the repository is public, anyone can read them.

| Item | Kind | Stored | Flows to | Read by | Leak point |
| --- | --- | --- | --- | --- | --- |
| security review reports | internal | issue comments | the public, once the repository opens | anyone | the word-for-word comment in S2 |

- F1: security review reports, the comments in S2. Confirmed in the spec. Smallest change: a placeholder until the fix ships. Check: an open finding's comment holds no detail.

```lens-findings
{
  "lens": "data-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "section",
        "id": "S2"
      },
      "severity": "medium",
      "likelihood": "high",
      "data": "security review reports",
      "headline": "Review reports posted word for word will be readable by anyone once the repo opens"
    }
  ],
  "notChecked": [
    "S5: the date the repository opens was not handed over"
  ]
}
```
