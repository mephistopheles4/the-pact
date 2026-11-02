# The threat model holds accepted threat classes

The threat model, `docs/threat-model.md`, is a scope line, eight accepted threat classes of one line each, and open issues. It has no per-path entries, labels, dates, sources or scores. A finding that fits a class needs nothing, though a session may still fix one in passing if it's cheap. A finding that fits none comes to the owner as a new class, and only a merge the owner confirms in chat adds or widens one. A change that removes a control, or changes the threat model's scope, still comes to the owner. The sensitive-list check, the per-entry rules and the periodic revision are gone. This supersedes ADR 0130 and the rule on accepted risks in ADR 0129's table of reasons.

## Why

The owner's words: "i think if something fits the accepted threat classes then we dont need to do anything" and "we dont need to granularly manage each threat path". The page had reached about 2,000 lines and 61 entries, and each new path cost a labelled entry, a provenance line and a notice to an owner who rarely overrode one.

## Considered options

- **One line per live risk, about 52 lines.** The plan's first shape. It keeps the bookkeeping per path, so it was replaced.
- **Classes with no exception.** Rejected: a change that removes a guard inside a class would then reach nobody, so that one clause stays.

## Consequences

- A hole inside a class draws no report, so a cheap fix can go unseen, and the security bar no longer reaches it.
- The session decides what fits a class, and nothing checks that.
- The fold accepts paths no entry named, in every project with a threat model.
- Only the owner's merge adds a class. A session no longer records a risk on its own judgment.
- Entry detail and history stay in git, at the commit before this change. Dated ADRs and logs keep their R-citations as written.
