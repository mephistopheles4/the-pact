# The threat model keeps its accepted risks by class

The pact's threat model, `docs/threat-model.md`, is a short page on top of the full text. It opens with a `Last revised:` line, a chart of classes, and a class table. Then come a scope line, the sensitive-work summaries (crypto and data migrations, input validation, auth), the accepted risks as nine classes and one block of costs, and the open issues. Below it, in folds, sit the base table as "Controls by risk", one provenance line per entry, and every entry's full text with an anchor. Every label stays, a retired one as retired. A class accepts nothing itself: a finding counts as accepted only when one entry's own text covers it. `gate/tests/threat-model-cites.test.mjs` holds every R-label a live doc cites to an anchor, and every entry anchor to a provenance line.

The scope line keeps in scope anything that crosses a real boundary into or out of a session, including a fooled or careless session, a file someone hands you and an account whose token a session holds. It leaves out a program you run yourself, as you, that nothing in scope started, supplied or steered. Every attacker an entry named before the line stays in scope.

This is the first run of the rules file's "Threat-model revision" (#450, ADR 0129), on the method grimoire's issue 446 used for its own threat model.

## Why

The page had grown risk by risk to about 23,000 words and 59 labels, and reviews read past it. Revisions now recur each month, or after ten new accepted risks, so the page needs a shape a revision can keep: one line per class on the first screen, and the full text where a review can still reach it. One file, with the detail folded, keeps every acceptance in the threat model the lenses read. It also keeps the links the docs-index test holds, and lets dated ADRs and logs keep their R-citations as written.

## What was weighed

- **Reference pages, as grimoire did.** Not taken: accepted risks live only in the threat model, and the security lenses read only the file the agent instructions name; a second page would need a pointer edit, itself a scope change for the owner.
- **New ids by class.** Not taken: the revision rule keeps each entry's label, and about twenty live docs and many dated records cite them.
- **Drops by the new scope line.** Allowed only as a merge-list item tied to the scope line, and only when an entry's whole attacker lies out of scope; this revision made none. R4 was retired by the old scope, which already left out the safety of your accounts.
- **A class's score.** A class takes the highest likelihood and the highest impact among its entries, per axis: cautious, and each entry keeps its own score in provenance.

## Notes, not built

- R25's `/finis` part is not accepted since the re-read: Claude Code's desktop docs say an archive needs no card in Auto and Bypass permissions modes. It waits for the owner's answer.
- The next revision is counted from the `Last revised:` line.
