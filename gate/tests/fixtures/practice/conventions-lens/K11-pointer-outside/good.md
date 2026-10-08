**For the owner**

The change adds a decision record but no line for it in the index of decisions, which the repo's rules ask for. I suggest adding the line. The contributing guide points to a style file outside the repo; I did not read it.

**For the session**

### Rules that apply

Red step: rules files AGENTS.md and docs/agents/; expected to touch the rules for new decision records.
| Rule, as written | Where it is written | Lines in the change | Kept? |
| "Add a line there with every new ADR" | AGENTS.md | docs/adr/0031-cache.md 1-30 | broken: no index line |

- F1: "Add a line there with every new ADR" (AGENTS.md). docs/adr/README.md has no line for 0031. Add one.

```lens-findings
{
  "lens": "conventions-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "docs/adr/0031-cache.md",
        "start": 1,
        "end": 30
      },
      "severity": "medium",
      "headline": "The new ADR has no line in the ADR index"
    }
  ],
  "notChecked": [
    "A pointer in CONTRIBUTING.md, line 4, leads outside the working folder; it was not read"
  ]
}
```
