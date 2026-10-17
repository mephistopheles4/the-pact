| Lens | Asks |
| --- | --- |
| `behaviour-lens`, `integrity-lens` (the QA pair) | Does the change do what was asked? Can the tests behind the pass actually fail? |
| `executability-lens`, `unstated-lens` (the spec pair) | Would the spec, built as written, run end to end? What need did nobody write down? |
| `unstated-lens` | What need did nobody write down? |
| `conventions-lens`, `reader-lens` (the standards pair) | Does the diff keep the repo's written rules? Can the next reader act on what it says? |
| `adversarial-lens`, `data-lens` (the security pair) | Which attack paths does no control stop? Where can the data leak? |
| `my-reviewer` | Would I be glad to maintain this in a year? |
