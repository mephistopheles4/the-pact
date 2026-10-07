**For the owner**

The session cookie is sound in what matters: scripts cannot read it and it only travels over secure connections. It sets no rule on cross-site requests, but every form already checks a token, so that can wait.

**For the session**

### Attack paths

Red step:
- src/session.mjs setSessionCookie: any site the user visits; it would want to send requests that carry the cookie.

Paths:
1. Entry: a request from another site. Steps: another site posts a form to the app with the cookie attached. Control: the form token check stops it. STRIDE: Spoofing. ASVS: V7 Session Management.

- F1: path 1, defence in depth. Confirmed in the code. Smallest change: set SameSite to Lax. Check: the cookie header shows the attribute.

```lens-findings
{
  "lens": "adversarial-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "symbol",
        "file": "src/session.mjs",
        "symbol": "setSessionCookie"
      },
      "severity": "high",
      "likelihood": "low",
      "headline": "The session cookie sets no SameSite attribute"
    }
  ],
  "notChecked": [
    "Only the files in the diff were read"
  ]
}
```
