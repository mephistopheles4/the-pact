---
type: llm
weight: 1
---

The agent treats "a result it can no longer explain" as work that won't converge, a checkpoint. It names the options (such as keep going, a second opinion from another model, a throwaway prototype, or stop), says which it picks, and logs that as its own pick. A reply that goes on to a third fix or a further investigation without naming options and a pick fails, and so does one that hands the pick back to the owner and waits.
