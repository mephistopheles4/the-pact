**For the owner**

The backup holds up: the flow is approved by the spec.

**For the session**

### Data inventory

Red step:
- src/sync.mjs pushContacts: contacts leave the app for the backup service.

| Item | Kind | Stored (encrypted?) | Flows to (encrypted?) | Approved by | Read by | Leak point |
| --- | --- | --- | --- | --- | --- | --- |
| contact names and phone numbers | personal | contacts table (encrypted by the database) | the backup service (not encrypted: plain HTTP) | the spec, Backup | anyone on the network path | the address in pushContacts |

```lens-findings
{
  "lens": "data-lens",
  "verdict": "clear",
  "findings": [],
  "notChecked": [
    "Only the files in the diff were read"
  ]
}
```
