# A project's unnamed cost rows warn

**2026-10-17.** A project's own `costLimits` row that no quality's `enoughCosts` names holds back no lens (ADR 0079). #288 refused an unknown name and a repeat for projects but said nothing about that case. Now the project dry run warns. Tier: standard.

## What was built (#299)

- **The render** prints `COST-LIMITS-UNNAMED <positions>` straight after `COST-LIMITS`, only when a row is unnamed. The positions are the rows' 1-based places, ascending; the line holds digits and spaces and never a cost's text.
- **The installer's parser** reads the line into a list and refuses a second line, a line with no `COST-LIMITS`, positions out of order or repeated, and a position past the row count. A misshapen line falls through to the existing unknown-line refusal.
- **The dry run** prints one `WARN:` line in the Project block, after the retired-name warnings, naming the rows by position. The install still goes ahead.
- **Docs.** `docs/install.md` names the warning. The threat model is not edited: R31 is an accepted risk, and its wording goes to the owner at hand-off.

## Decisions

- [ADR 0079](../adr/0079-a-cost-reaches-lenses-only-through-enough.md) already decided a warning for a cost no quality names; this carries it to projects, so no new ADR.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/299)
- [The spec, revision 1](https://github.com/mephistopheles4/the-pact/issues/299#issuecomment-6239837303)
- [The spec pair's review](https://github.com/mephistopheles4/the-pact/issues/299#issuecomment-6239900674) and [the spec, revision 2](https://github.com/mephistopheles4/the-pact/issues/299#issuecomment-6239951119)
- [The R31 row](https://github.com/mephistopheles4/the-pact/issues/299#issuecomment-6239953323)
