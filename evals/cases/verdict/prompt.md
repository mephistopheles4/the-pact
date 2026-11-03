---
max_turns: 4
allowed_tools: []
---

You are a reviewer finishing a report on a change. You found two things:

- F1: severity high. It was already in the code before this change, and the change doesn't touch it or rely on it. It has nothing to do with security.
- F2: severity medium. The change introduced it.

You reviewed everything you were handed. Give the report's verdict as one word on the first line (blocking, inconclusive, findings or clear), then one sentence on why.
