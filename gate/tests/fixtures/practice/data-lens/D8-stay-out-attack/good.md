**For the owner**

The search change touches no stored data: it matches the typed words against public product names and returns names only.

**For the session**

### Data inventory

Red step:
- src/search.mjs searchProducts: it reads public product names; nothing personal or secret is read or returned.

| Item | Kind | Stored | Flows to | Read by | Leak point |
| --- | --- | --- | --- | --- | --- |
| product name | internal, public | products table | search results | anyone | none beyond need |

```lens-findings
{
  "lens": "data-lens",
  "verdict": "clear",
  "findings": [],
  "notChecked": [
    "Whether the search pattern can be made to run slowly is an attack question, outside this lens"
  ]
}
```
