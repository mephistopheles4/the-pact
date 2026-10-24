| Stage | Quick | Standard | Thorough | Sensitive route | Lenses offered, and when | Skills, and when | Other ways out |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Plan | in the session, no plan | Opus, medium | Opus, high | Opus, high | none | `/triage`: offered, every build; `diagnosing-bugs`: used, the work is a bug, before any fix; `/wayfinder`: offered, thorough only | |
| Design | skipped | Opus, medium | Opus, high | Opus, high | `executability-lens`, `unstated-lens`: standard and above; `adversarial-lens`, `data-lens`: on the sensitive route | `grilling`: used, standard and above; `domain-modeling`: used, terms need pinning down; `prototype`: used, a question needs running code; `codebase-design`: used, standard and above; `/to-spec`: offered, standard and above; `/to-tickets`: offered, thorough only | |
| Build | Opus, low | Sonnet, medium | Sonnet, medium | Opus, high | none | `tdd`: used, every build | |
| Test | Opus, low | Sonnet, medium | Sonnet, medium | Opus, high | `behaviour-lens`, `integrity-lens`: every build; `conventions-lens`, `reader-lens`: standard and above; `adversarial-lens`, `data-lens`: on the sensitive route; `adversarial-lens`, `data-lens`: once, when the change matches the list and the sensitive route wasn't taken | none | back to Build when a claim fails; back to Design when the intent has changed |
| Deploy | I decide | I decide | I decide | I decide | none | none | |
| Maintain | in the session, no plan | Opus, medium | Opus, high | Opus, high | none | none | back to Plan when a new change starts |
