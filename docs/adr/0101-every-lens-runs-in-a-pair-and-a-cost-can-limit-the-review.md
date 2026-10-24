# Every lens runs in a pair, and a cost can limit the review

The gatekeeper row leaves the pact: `unstated-lens` is offered only in the spec pair, so every lens is offered in a pair (#377). A cost row that no quality's Enough names now limits the review itself, and the pact ships one: Lens pairs, at most two pairs a review round.

## What changed

- **No lens is offered alone.** The Lenses table loses "`unstated-lens` (the gatekeeper)", and the default Test cell loses its offer. The builder's half-of-a-pair warning loses its gatekeeper exception, and the presets and example blocks drop their lone offers. The review procedure never runs or crosses one lens of a pair without its partner; only a lens a rules file still offers on its own is crossed alone, and it counts as a pair.
- **A cost no Enough names limits the review itself.** The session counts it each review round, in its own unit, and follows its "At the limit". The security pair, a lens a repo's own rules require and the lenses of a skill the owner typed count toward it, but it never holds them back: another pair waits. This holds for a project's own rows in that repo too.
- **The Lens pairs row ships in the pact's text:** "Lens pairs run in one review round; a lens offered alone counts as a pair", limit 2, and at the limit the next pair becomes a trade-off for the owner. Ultra Code carries the other three rows and stays uncapped.
- **The unnamed-row checks follow.** The builder's warning for a cost no quality names is gone, and Scriptorium shows such a row as limiting the review itself. The dry run's WARN for a project's unnamed rows is now a NOTE, and the home and project notes say the rows limit the review rather than reaching no lens.
- **No carry-over row.** A pair taken at one stage isn't run again at the next on its own: "Lenses are offers" already says the later stage offers it again.

## Why

- **The owner caps a review at two pairs a round.** A field test on 2026-10-24 ran seven lenses at Test twice, on a Standard change.
- **A pair keeps its reasoning whole.** Each pair's two questions are crossed together; a lens alone has no partner to cross.
- **A limit on the review counterweights the review.** ADR 0079 linked a cost only to the lenses of the qualities it limits. A cost on the review as a whole has no quality to name, so naming none now means the review itself, with no new field or column to keep in step.

## What was weighed

- **A field on each cost row saying what it limits.** Not taken: a fifth column changes every configuration's Cost limits block, and ADR 0079 keeps reach out of the stored part.
- **Writing the cap into the Workflow cells.** Not taken: the owner chose a cost row, so the Workflow table changes only by losing the gatekeeper.
- **A Carried pairs row.** Dropped by the owner: the cap already bounds the cost.

## The risks

- **Less coverage at Test.** A finished result no longer gets the unstated-needs sweep, which also flags security-sensitive work with no security review. The sensitive-work default still brings the security pair on a list match.
- **An unnamed row changes meaning.** A row meant for a quality's lenses but named by no Enough now limits the review, with a note rather than a warning. The threat model's R30 and R31 describe the old warning; their edit goes to the owner.

The owner waived, in chat on 2026-10-24, ADR 0094's sensitive route for this change and the security-pair read a roster change needs.

Supersedes in part [ADR 0080](0080-the-spec-pair-is-executability-lens-and-unstated-lens.md) (`unstated-lens` as the gatekeeper at Test) and [ADR 0079](0079-a-cost-reaches-lenses-only-through-enough.md) (a cost reaches lenses only through Enough, and its warning for a cost no quality names).
