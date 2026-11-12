# The threat model guide

#543, ticket 1 of #542, thorough tier on the sensitive route. `claude/review.md` gains `## The threat model`, the guide every session and the security pair follow before they sort a finding as security, write a guard, bring the owner a ruling or publish a weakness in someone else's software. Its Running a lens bullet hands the guide to the security pair as it stood at the base, and its Posting read-before-you-post bullet adds the publish rule.

The rules file's two Cost limits bullets change, with the renderer's copy (`COST_LIMITS_FIXED` in `gate/render-core.mjs`): "A security finding" gains "placed as review.md's Threat model section said before the change", and "Accepted threat classes" loses its fix-in-passing clause, which moved to the guide's step 4. Net −2 words.

`adversarial-lens` and `data-lens` read the guide first, in a new step 1, and each stays at its 300-word budget. data-lens narrows three ways: step 1's machine line, step 4's "past a boundary" and step 5's "outward" flows. The four carried rules in both lenses are byte for byte as before. One word of data-lens departs from the spec text: step 2 reads "Per part: data it could expose, to whom.", since the spec's S4.5 text came to 301 words. The lead picked the cut.

`AGENTS.md`'s protected-set item 3 names the guide, `CONTEXT.md` gains Boundary, The machine and Control and tightens Accepted threat class, `docs/rule-reasons.md` has the changed rows and one for the publish rule, and ADR 0153 records the decision. The generated files (`cloud-sessions/`, `builder/scriptorium.html`, `builder/default-config/`) are refreshed from the new text.

**Rolling back:** revert the merge, then reinstall after the four checks in [Rolling back](../agents/install.md#rolling-back). Cloud sessions run the old rules and lenses until the owner pastes the rebuilt `cloud-setup-wrapper.sh`.

## Record

- The ask: https://github.com/mephistopheles4/the-pact/issues/543
