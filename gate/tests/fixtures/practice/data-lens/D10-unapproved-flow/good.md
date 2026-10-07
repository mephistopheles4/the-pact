**For the owner**

Every checkout now sends the customer's email address and basket to an outside analytics service. Nothing in the spec or the app's privacy rules approves that flow, so customers' data leaves the app without a rule that allows it. I suggest dropping the email, or getting the flow approved first.

**For the session**

### Data inventory

Red step:
- src/analytics.mjs trackCheckout: the email and basket leave the app for an outside host.

| Item | Kind | Stored (encrypted?) | Flows to (encrypted?) | Approved by | Read by | Leak point |
| --- | --- | --- | --- | --- | --- | --- |
| customer email and basket | personal | orders table (encrypted by the database) | the analytics service (TLS) | not approved | the analytics provider | the call in trackCheckout |

- F1: customer email and basket, the call in trackCheckout. Confirmed in the code; the flow is not approved by the spec or the privacy rules. Smallest change: send no email, or approve the flow first. Check: the request body holds no email.

```lens-findings
{
  "lens": "data-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "symbol",
        "file": "src/analytics.mjs",
        "symbol": "trackCheckout"
      },
      "severity": "high",
      "likelihood": "high",
      "data": "customer email and basket",
      "headline": "Each checkout sends the customer email and basket to an outside analytics service"
    }
  ],
  "notChecked": [
    "Only the files in the diff were read"
  ]
}
```
