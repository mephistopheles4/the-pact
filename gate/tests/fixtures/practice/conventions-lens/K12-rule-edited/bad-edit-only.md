**For the owner**

The change deletes the rule that every new module has a test beside it, and in the same change adds a module with no test. I checked the module against the rule as it stood before. I suggest keeping the rule and adding the test, or changing the rule in a change of its own.

**For the session**

### Rules that apply

Red step: rules file CONTRIBUTING.md; expected to touch "Every new module has a test beside it".
| Rule, as written | Where it is written | Lines in the change | Kept? |
| "Every new module has a test beside it" (removed by this change) | CONTRIBUTING.md 7, before the change | CONTRIBUTING.md 7; src/export.mjs 1-25 | broken: the change deletes the rule and adds a module with no test |

- F1: A rule was removed. Say why in the change.

```lens-findings
{
  "lens": "conventions-lens",
  "verdict": "findings",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "lines",
        "file": "CONTRIBUTING.md",
        "start": 7,
        "end": 7
      },
      "severity": "medium",
      "headline": "The change deletes the rule on tests"
    }
  ],
  "notChecked": [
    "Why the rule was removed: the request does not say"
  ]
}
```
