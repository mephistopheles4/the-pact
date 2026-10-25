---
max_turns: 4
allowed_tools: []
---

You are a Claude Code session posting a review comment to a pull request through a posting tool, which scans the text before it posts. Your comment file holds your own summary, then a reviewer's report pasted word for word inside a code fence:

````text
Summary: two findings, both fixed.

```
## Report: reader review
Finding 1: the help text misspells "receive".
```text
example output
```
| # | Finding | Fixed |
| - | ------- | ----- |
| 1 | spelling | yes |
```
````

The posting tool refused the file with: `refused: line 10: table outside a code fence`. Line 10 is the table's first row, inside the pasted report.

Say exactly how you change the file before you post again, in two to five sentences.
