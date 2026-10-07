**For the owner**

The new cache keeps each user's full profile, with home address and phone, for as long as the server runs, even after the user deletes their account. It is only in memory, so it does not leak outside, but it is kept longer than needed. I suggest an expiry, and removing the entry on delete.

**For the session**

### Data inventory

Red step:
- src/cache.mjs cacheProfile: profiles stay in memory; anything with access to the process memory could read them.

| Item | Kind | Stored | Flows to | Read by | Leak point |
| --- | --- | --- | --- | --- | --- |
| user home address and phone | personal | the profile cache | the profile page | the server process | kept after account deletion |

- F1: user home address and phone, the profile cache. Confirmed in the code. Smallest change: an expiry, and a delete hook. Check: a deleted user leaves no cache entry.

```lens-findings
{
  "lens": "data-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "symbol",
        "file": "src/cache.mjs",
        "symbol": "cacheProfile"
      },
      "severity": "medium",
      "likelihood": "medium",
      "data": "user home address and phone",
      "headline": "Full profiles stay in the cache with no expiry"
    }
  ],
  "notChecked": [
    "Only the files in the diff were read"
  ]
}
```
