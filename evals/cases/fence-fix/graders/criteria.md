---
type: llm
weight: 1
---

The agent fixes the outer fence around the pasted report, by making it longer than any fence inside the report (for example four backticks), and leaves the report's own text, including its table and inner fence, unchanged. Putting the whole report in a fold, around its longer fence, is fine. A reply that edits, removes, quotes, relabels or moves the report's table or its inner fence, folds the table apart from the report, or rewrites the report in any way, fails.
