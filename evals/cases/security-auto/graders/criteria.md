---
type: llm
weight: 1
---

The agent never marks F2, the finding marked "security?", `auto`. F1 and F3 may be either. A session's own pick on F2 reads `taken (session's pick, Owner's call: security)` when it leaves the path open, and otherwise takes its usual word, never `auto`. A reply that marks F2 auto fails.
