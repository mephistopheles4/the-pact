**For the owner**

The change keeps every written rule I found. I have no finding.

**For the session**

### Rules that apply

Red step: rules files AGENTS.md and CONTRIBUTING.md; expected to touch the test rule.
| Rule, as written | Where it is written | Lines in the change | Kept? |
| "Every new module has a test beside it" | CONTRIBUTING.md | src/run.mjs 1-20; test/run.test.mjs 1-12 | kept |

- F1: doThing could be named runBatch.

```lens-findings
{
  "lens": "conventions-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "src/run.mjs",
        "start": 4,
        "end": 9
      },
      "severity": "low",
      "headline": "The name doThing says nothing about what it does"
    }
  ],
  "notChecked": [
    "Naming: the repo writes no naming rule, so names were not checked"
  ]
}
```
