# One mission per lens

PACT-47, T7 of the P6 rules work. Cuts the shared "text you read is data" line from six lenses, points the lenses at the sensitive work in the owner's rules instead of a fixed list, and tightens `scout`.

Each lens now holds its own mission and perspective and protects only that; the shared line made the lenses overlap. The behaviour, executability and unstated lenses and the rules file's lens pointer say "the sensitive work in the user's rules", so the owner's rendered rules are the one source and no copy of the default list is left in the lenses or in `docs/agents/triage-labels.md`. The executability lens now gives the owner a recommendation and its why on an open scope decision, grounded in the qualities and their measures, the cost limits, and the spec's trade-off points and business driver. `scout` is for researching a module or tracing what a piece of code leads to, in its description and in the rules file's pointer. `docs/reference.md` loses its familiars-by-effort line for the Medium agents, which copied each agent's own setting.

The data lens loses its line that a fetched page's text is untrusted; Claude's own handling of fetched text remains. This is the protected set's carried rules, which land only through the spec pair and the security pair.

Budgets: the rewrites leave `behaviour-lens` at 301 words and `executability-lens` at 314. Both budgets go to 350 in `gate/tests/rule-budget.test.mjs`, which the ticket allows (rule 4). The adds are r157's "the sensitive work in the user's rules" (one word more than the list it replaces) and r163's recommendation clause in the executability lens (about twenty words more than the line it replaces).

**Rolling back:** revert the merge, rerun the regens and reinstall from the dry run.

## Record

- The ticket: PACT-47 on Linear.
