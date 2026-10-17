| Stage | Quick | Standard | Thorough | Sensitive route | Lenses offered, and when | Other ways out |
| --- | --- | --- | --- | --- | --- | --- |
| Plan | in the session, no plan | Opus, high | Opus, high | Opus, high | none | |
| Design | skipped | Opus, high | Opus, high | Opus, high | `executability-lens`, `unstated-lens`: standard and above; `adversarial-lens`, `data-lens`: on the sensitive route | |
| Build | Opus, low | Sonnet, medium | Sonnet, medium | Opus, high | none | |
| Test | Opus, low | Sonnet, medium | Sonnet, medium | Opus, high | `behaviour-lens`, `integrity-lens`: standard and above; `conventions-lens`, `reader-lens`: standard and above; `unstated-lens`: standard and above; `adversarial-lens`, `data-lens`: on the sensitive route; `adversarial-lens`, `data-lens`: once, when the change matches the list and the sensitive route wasn't taken; `behaviour-lens`, `integrity-lens`: at quick, when I ask for it | back to Build when a claim fails; back to Design when the intent has changed |
| Deploy | I decide | I decide | I decide | I decide | none | |
| Maintain | in the session, no plan | Opus, high | Opus, high | Opus, high | none | back to Plan when a new change starts |
