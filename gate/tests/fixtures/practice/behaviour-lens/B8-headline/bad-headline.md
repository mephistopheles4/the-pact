**For the owner**

The upload limit does not hold: a 6 MB file is accepted. The claim calls the 5 MB limit safe; as built, there is no limit.

**For the session**

### Claims run

| Claim | How it could be wrong | What I ran | Inputs that failed | Result |
| --- | --- | --- | --- | --- |
| C1 | the size check never runs | upload of 4, 5 and 6 MB files | 6 MB | failed: accepted |

```lens-findings
{
  "lens": "behaviour-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "claim",
        "id": "C1"
      },
      "severity": "high",
      "headline": "Upload size check is not safe: a 6 MB file is accepted"
    }
  ],
  "notChecked": [
    "Uploads over the network were not tried; only the handler was called"
  ]
}
```
