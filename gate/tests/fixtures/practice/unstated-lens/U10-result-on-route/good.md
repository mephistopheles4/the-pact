**For the owner**

Every need in the issue has a claim. The new endpoint was read on the security route, so it does not need the question.

**For the session**

### Needs with no home

Red step: the issue asks for an endpoint, its rate limit and its docs.
| Need | Where it is covered |
| the endpoint | C1 |
| its rate limit | C2, read on the security route |
| its docs | C3 |

```lens-findings
{
  "lens": "unstated-lens",
  "verdict": "clear",
  "findings": [],
  "notChecked": [
    "Performance under load: the issue gives no numbers to check against"
  ]
}
```
