# Each lens is its question and report shape

Each lens file is cut to at most 300 words, frontmatter included, and `scout` to 200 (#464 T5). A lens keeps its question, its red step, its own method and artifact, and the rules it carries. The Cost limits section, generic severity scales, stops and report parts go, because `review.md`'s template and the rows it hands cover them. The security pair's bar and accepted-risk text become one threat-model step that matches the rules file's Accepted threat classes. The nine `familiars/` contracts are retired, so each agent's file is its own record. This reverses #262's contract for every agent.

## Why

The owner's words: "i feel like deleting most of it to be honest, way too many rules", and "all we need to do is say, here is the workflow, here is the lense, write the report using this template, no? what am i missing?".

## Considered options

- **Name the catalogues without their lists,** as the plan first proposed. Rejected by the owner (decision 600): the protected set says checklists are carried in the lens, and a one-line list fits the budget.
- **Remove `familiars/` and its gate handling too.** Rejected for now: it loosens seam-a's checks and touches CI for no reader's gain. The folder stays with its `.gitkeep`.

## Consequences

- A lens leans more on the model's own knowledge of its method. Nothing measures a lost catch yet; T7's evals are where it would show.
- A lens with nothing to review no longer has written stops. It relies on the template's `inconclusive` verdict, which covers only something it was handed.
- The ASVS chapter names are shortened and data-lens's section lists go, so a report may name a chapter by its short form.
- A change that makes an accepted path easier, with no control removed, draws no finding. A lens no longer says a security finding is never a trade-off; the rules file holds that bar.
- No lens says its report may be public. The read before posting and the poster's scan remain.
- Each contract's history stays in git only.
