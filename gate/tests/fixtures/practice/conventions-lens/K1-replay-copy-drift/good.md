**For the owner**

The change adds two items to the risk floor in the rules file, but the copy of that list in the spec checker's file still has the old four. The two copies now say different things, which the repo's rules forbid. I suggest updating the copy in the same change.

**For the session**

### Rules that apply

Red step: rules file AGENTS.md; expected to touch "A list restated outside its source holds every item of the source".
| Rule, as written | Where it is written | Lines in the change | Kept? |
| "A list restated outside its source holds every item of the source" | AGENTS.md | claude/CLAUDE.md 70-72; agents/spec-checker.md 14 | broken: the copy lacks crypto and input validation |

- F1: "A list restated outside its source holds every item of the source" (AGENTS.md). claude/CLAUDE.md now lists six items; agents/spec-checker.md line 14 still lists four. Add crypto and input validation to the copy.

```lens-findings
{
  "lens": "conventions-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "agents/spec-checker.md",
        "start": 14,
        "end": 14
      },
      "severity": "high",
      "headline": "The risk-floor copy in the spec checker lacks the two new items"
    }
  ],
  "notChecked": [
    "Copies outside the working folder, such as installed files, were not checked"
  ]
}
```
