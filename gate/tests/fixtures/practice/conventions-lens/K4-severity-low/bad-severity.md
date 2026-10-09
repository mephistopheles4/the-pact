**For the owner**

One line of the new guide runs past the width the contributing guide asks for. No reader would notice; I suggest wrapping it.

**For the session**

### Rules that apply

Red step: rules file CONTRIBUTING.md; expected to touch "Wrap Markdown prose at about 80 characters".
| Rule, as written | Where it is written | Lines in the change | Kept? |
| "Wrap Markdown prose at about 80 characters" | CONTRIBUTING.md | docs/guide.md 12 | broken: 84 characters |

- F1: "Wrap Markdown prose at about 80 characters" (CONTRIBUTING.md). Line 12 is 84 characters. Wrap it.

```lens-findings
{
  "lens": "conventions-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "docs/guide.md",
        "start": 12,
        "end": 12
      },
      "severity": "medium",
      "headline": "One guide line runs past the wrap width"
    }
  ],
  "notChecked": [
    "Lines in files the change did not touch"
  ]
}
```
