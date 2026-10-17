# A project cost name holds no middle dot, and a level names a cost row

**2026-10-17.** The project render joins a quality's Enough cell with a middle dot (U+00B7), and a lens reads that cell to learn which cost rows hold it back. The dry run counted a row as named from the resolved `enoughCosts` only, so a cost name holding the dot, or a level equal to a cost name, made the warning and the rules file disagree (the first from #299's review, adversarial-lens F1; the second from this issue's own trace). Tier: standard.

## What was built (#318)

- **The render refuses U+00B7 in a project cost name,** under the existing rule `project-cost-limits`. The reason names the row by position and the middle dot, never the cost's text.
- **A cost row counts as named** when its name matches a segment of a quality's rendered Enough cell, split on the dot and compared ignoring case and surrounding space. The level counts as a segment. The set comes from the same function that writes the cell.
- **Unchanged:** the `COST-LIMITS-UNNAMED` line, the installer's parser, the WARN wording, and the rendered bytes of every project accepted before and still accepted. A project whose cost name held the dot now refuses, and fixes its own file.
- **Docs.** Both install docs say a cost name holds no middle dot; `docs/install.md` says a level that names a cost counts. R31 in `docs/threat-model.md` carries the new refusal and the accepted residual class (lookalike dots, other wording, a home cost's name in a project with no Cost limits), added in its own commit on the owner's word.

## Decisions

- Refuse U+00B7 only, in both fields: no lookalike dots and no Unicode normalization (owner, Q3 A). The remaining cases are accepted in R31 by class (Q5 A).
- No new ADR: [ADR 0079](../adr/0079-a-cost-reaches-lenses-only-through-enough.md) and #299 decided the warning; this keeps its count true to the rendered cell.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/318)
- [The owner's route and Q2, Q3](https://github.com/mephistopheles4/the-pact/issues/318#issuecomment-6241870701)
- [The spec, revision 1](https://github.com/mephistopheles4/the-pact/issues/318#issuecomment-6241894734) and [its four-lens review](https://github.com/mephistopheles4/the-pact/issues/318#issuecomment-6241971135)
- [The owner's Q4 to Q6](https://github.com/mephistopheles4/the-pact/issues/318#issuecomment-6242141657)
- [The spec, revision 2](https://github.com/mephistopheles4/the-pact/issues/318#issuecomment-6242164279) and [its settled dispositions](https://github.com/mephistopheles4/the-pact/issues/318#issuecomment-6242168126)
- [The go-ahead to build, push and open the PR](https://github.com/mephistopheles4/the-pact/issues/318#issuecomment-6242299080)
- [The Test review: the QA pair](https://github.com/mephistopheles4/the-pact/issues/318#issuecomment-6242659275), [the standards pair](https://github.com/mephistopheles4/the-pact/issues/318#issuecomment-6242659841), [unstated-lens](https://github.com/mephistopheles4/the-pact/issues/318#issuecomment-6242660426), [the security pair](https://github.com/mephistopheles4/the-pact/issues/318#issuecomment-6242660874) (run on the owner's answer A to the Test offer, relayed by the head chef) and [the Lens dispositions](https://github.com/mephistopheles4/the-pact/issues/318#issuecomment-6242661370)
