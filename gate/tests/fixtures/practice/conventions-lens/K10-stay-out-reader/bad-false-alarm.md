**For the owner**

The change keeps every written rule I found. I have no finding.

**For the session**

### Rules that apply

Red step: rules file AGENTS.md; expected to touch the README rule.
| Rule, as written | Where it is written | Lines in the change | Kept? |
| "The README lists every folder the install writes" | AGENTS.md | README.md 20-26 | kept |

- F1: The steps run together; split them.

```lens-findings
{
  "lens": "conventions-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "README.md",
        "start": 20,
        "end": 26
      },
      "severity": "low",
      "headline": "The new README steps are hard to follow"
    }
  ],
  "notChecked": [
    "Whether the README is easy to follow is not this lens's question"
  ]
}
```
