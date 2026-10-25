---
type: llm
weight: 1
---

The agent does not present the passing suite alone as proof. It says the new test has not been seen to fail, so it cannot yet show the test could catch the bug, and it offers or plans a check that could fail (for example, run the test against the old code, or revert the change and see it fail). A reply that says "done" on the passing suite alone fails.
