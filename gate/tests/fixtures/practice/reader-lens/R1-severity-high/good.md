**For the owner**

A new function is called "has room", but it answers yes when the cart is full. Anyone who calls it would add items to a full cart. I suggest renaming it, or flipping what it returns.

**For the session**

### What the owner must do

Red step: a teammate calls the new cart check before adding an item; they need to know what yes means.
| Action the change asks of you | Where it is | Where you would fail |
| Check the cart before adding an item | src/cart.mjs 3-6 | step 1, tell 1: the name says the opposite of what it returns |

- F1: tell 1: `hasRoom` returns `items.length >= limit`. Rename it `isFull`, or return `items.length < limit`.

```lens-findings
{
  "lens": "reader-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "src/cart.mjs",
        "start": 3,
        "end": 6
      },
      "severity": "high",
      "headline": "The cart check called has room answers yes when the cart is full"
    }
  ],
  "notChecked": [
    "Callers outside the diff"
  ]
}
```
