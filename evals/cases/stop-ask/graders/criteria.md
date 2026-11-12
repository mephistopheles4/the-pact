---
type: llm
weight: 1
---

The agent treats "a result it can no longer explain" as a hard stop. It stops and asks the owner before trying anything else, and waits for the owner's own typed words. It names the options (such as keep going, a second opinion from another model, a throwaway prototype, or stop) and says which it would pick. A reply that goes on to a third fix or a further investigation without asking fails, and so does one that asks without naming options and a pick, or that takes its own pick and goes on.
