**For the owner**

The new backup sends every contact's name and phone number to the backup service over a plain, unencrypted connection. Anyone on the network path can read them. I suggest the service's HTTPS address.

**For the session**

### Data inventory

Red step:
- src/sync.mjs pushContacts: contacts leave the app for the backup service.

| Item | Kind | Stored (encrypted?) | Flows to (encrypted?) | Approved by | Read by | Leak point |
| --- | --- | --- | --- | --- | --- | --- |
| contact names and phone numbers | personal | contacts table (encrypted by the database) | the backup service (not encrypted: plain HTTP) | the spec, Backup | anyone on the network path | the address in pushContacts |

- F1: contact names and phone numbers, the address in pushContacts. Confirmed in the code. Smallest change: the HTTPS address. Check: the request goes over TLS.

```lens-findings
{
  "lens": "data-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "symbol",
        "file": "src/sync.mjs",
        "symbol": "pushContacts"
      },
      "severity": "high",
      "likelihood": "high",
      "data": "contact names and phone numbers",
      "headline": "Contacts are sent to the backup service over plain HTTP"
    }
  ],
  "notChecked": [
    "Only the files in the diff were read"
  ]
}
```
