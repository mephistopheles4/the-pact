# The threat model guide

#543, ticket 1 of #542, thorough tier on the sensitive route. `claude/review.md` gains `## The threat model`, the guide every session and the security pair follow before they sort a finding as security, write a guard, bring the owner a ruling or publish a weakness in someone else's software. Its Running a lens bullet hands the guide to the security pair as it stood at the base, and its Posting read-before-you-post bullet adds the publish rule.

The rules file's two Cost limits bullets change, with the renderer's copy (`COST_LIMITS_FIXED` in `gate/render-core.mjs`): "A security finding" gains "placed as review.md's Threat model section said before the change", and "Accepted threat classes" loses its fix-in-passing clause, which moved to the guide's step 4. Net −2 words.

`adversarial-lens` and `data-lens` read the guide first, in a new step 1, and each stays at its 300-word budget. data-lens narrows three ways: step 1's machine line, step 4's "past a boundary" and step 5's "outward" flows. The four carried rules in both lenses are byte for byte as before. data-lens reads as the spec's S4.5 text, 300 words, except that each lens's step 1 says "the guide clears" in place of "wholly on the machine", so the guide's machine exception reaches the lenses (299 words each).

The final Test round's findings were folded in by the lead's picks under the owner's goal: the machine exception, the publish rule's gate on the owner's word in chat, the private note's place, "a secret or personal detail", and three reader fixes. Three more clauses came from that round's own drafts, with no further round: the publish paragraph tells the owner where the note is, a standing goal's, free hand's or holder's reply is never the owner's word to publish, and the lenses' step 1 defers to the guide. Whether the private-note folder sits in an accepted class is left to the threat model rewrite (#544).

`AGENTS.md`'s protected-set item 3 names the guide, `CONTEXT.md` gains Boundary, The machine and Control and tightens Accepted threat class, `docs/rule-reasons.md` has the changed rows and one for the publish rule, and ADR 0154 records the decision. The generated files `cloud-sessions/` and `builder/scriptorium.html` are refreshed from the new text; `builder/default-config/` needed no change, since the edited bullets sit outside the blocks it is built from.

**Rolling back:** revert the merge, then reinstall after the four checks in [Rolling back](../agents/install.md#rolling-back). Cloud sessions run the old rules and lenses until the owner pastes the rebuilt `cloud-setup-wrapper.sh`.

## Record

- The ask: https://github.com/mephistopheles4/the-pact/issues/543
- The approved plan, spec revision 3: https://github.com/mephistopheles4/the-pact/issues/542#issuecomment-6823747749
- Its approval: https://github.com/mephistopheles4/the-pact/issues/542#issuecomment-6823760046
- The Test round on PR 552: https://github.com/mephistopheles4/the-pact/pull/552
