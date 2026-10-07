**For the owner**

The search change touches no stored data: it matches the typed words against public product names and returns names only.

**For the session**

### Data inventory

Red step:
- src/search.mjs searchProducts: it reads public product names; nothing personal or secret is read or returned.

| Item | Kind | Stored | Flows to | Read by | Leak point |
| --- | --- | --- | --- | --- | --- |
| product name | internal, public | products table | search results | anyone | none beyond need |

- F1: the search pattern can run slowly.

```lens-findings
{
  "lens": "data-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "symbol",
        "file": "src/search.mjs",
        "symbol": "searchProducts"
      },
      "severity": "medium",
      "likelihood": "medium",
      "data": "search input",
      "headline": "A crafted search string can make the pattern run for a long time"
    }
  ],
  "notChecked": [
    "Only the files in the diff were read"
  ]
}
```
