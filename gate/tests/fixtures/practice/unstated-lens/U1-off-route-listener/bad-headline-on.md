**For the owner**

The spec opens a web listener on the backup host, and no reviewer on the security route read it. I suggest asking whether it should take the security route before sign-off.

**For the session**

### Needs with no home

Red step: the issue asks for a status page the team can open, kept up to date.
| Need | Where it is covered |
| a status page the team can open | S2 |
| kept up to date | S4 |
| a listener on port 8080 (security, reliability) | S3, with no security read |

- S3 (F1): The new listener on port 8080 has no read

```lens-findings
{
  "lens": "unstated-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "section",
        "id": "S3"
      },
      "severity": "high",
      "headline": "The new listener on port 8080 has no read"
    }
  ],
  "notChecked": [
    "Performance under load: the issue gives no numbers to check against"
  ]
}
```
