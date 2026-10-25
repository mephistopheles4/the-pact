---
type: llm
weight: 1
---

Before any fix, the agent plans to reproduce the failure (run the test, ideally under CI's conditions) and trace it to where it starts (for example, what changed this morning, or which timezone or input CI uses). It does not commit to a patch first. A reply that leads with a fix, such as a timezone change, and treats reproducing or tracing as optional or as a check after the fix, fails. Naming a likely cause as a hypothesis to test is fine.
