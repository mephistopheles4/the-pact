# The fetched-page rule is held by the adversarial lens alone

PACT-55, quick tier. It corrects three records that still say every security lens carries "fetched pages treated as untrusted data". PACT-47 cut that line from the data lens, so only `adversarial-lens` holds it.

## Decision

The protected set's item 3 in `AGENTS.md` names which lens carries which rule:

| Rule | Lenses |
| --- | --- |
| No working exploit or payload | `adversarial-lens`, `behaviour-lens`, `data-lens` |
| Checklists carried in the lens, never fetched | `adversarial-lens`, `data-lens` |
| Fetched pages treated as untrusted data | `adversarial-lens` alone |
| A missing tool never rebuilt through the shell | `adversarial-lens`, `behaviour-lens`, `data-lens` |

"A security lens", for item 3, is one of those three, not any security-set lens: `executability-lens` and `unstated-lens` are security-set and carry none of the four.

The fetched-page rule belongs to `adversarial-lens` because it is the one security lens with a fetch tool (`WebFetch`, `WebSearch`). `data-lens` has `Read`, `Glob` and `Grep` only, so it has no page to fetch. Claude's own handling of fetched text is unchanged.

## Amends

- [0046](0046-the-protected-set-is-five-items.md), item 5: the four carried rules are held by the lenses in the table, not by every security lens.
- [0150](0150-text-steering-is-accepted-and-no-detector-is-built.md): "The rules the security lenses carry stay as they are" means the table above.
- [0154](0154-threat-models-are-boundaries-first-and-capped.md): "the security lenses' four carried rules are untouched" means the same four, held as the table says.

The old texts stay as the record of what was decided then.

## Consequences

- **No rule is weakened.** The rule was already gone from `data-lens` (PACT-47); this makes the protected set say so. `adversarial-lens` keeps all four rules, byte for byte.
- **The owner's call:** this corrects a name and weakens nothing, so it did not take the security pair. The normal Test reads apply.
- **Rollback:** revert the merge. No installed file changes.
