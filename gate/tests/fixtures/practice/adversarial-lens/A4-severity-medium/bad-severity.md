**For the owner**

An attacker can try one common password against many accounts. The new lockout stops many guesses at one account, but nothing limits guesses spread across accounts. I suggest a limit per source as well.

**For the session**

### Attack paths

Red step:
- src/login.mjs login: anyone can reach it; they would want to guess a password.

Paths:
1. Entry: the sign-in route. Attacker controls: user names and passwords. Steps: try one password per account across many accounts. Control: the lockout stops repeat guesses at one account only, so it only partly stops this. STRIDE: Spoofing. ASVS: V6 Authentication.

- F1: path 1. Confirmed in the code. Smallest change: count failures per source too. Check: many failures from one source across accounts are slowed.

```lens-findings
{
  "lens": "adversarial-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "symbol",
        "file": "src/login.mjs",
        "symbol": "login"
      },
      "severity": "high",
      "likelihood": "medium",
      "headline": "Lockout counts failures per account, so one password can be tried across many accounts"
    }
  ],
  "notChecked": [
    "Only the files in the diff were read"
  ]
}
```
