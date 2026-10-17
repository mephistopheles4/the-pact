# A cost reaches lenses only through Enough

A cost row names no lenses. It holds back the lenses of every quality whose Enough names it (#278, #289).

## What changed

- **One link.** A quality's Enough holds an optional level and the costs it answers to. A cost's reach is read from the Enough cells alone, and Scriptorium shows it; it is never stored in the part.
- **A warning for a cost no quality names,** since it binds no lens, and a dry-run note when a Qualities edit leaves the shipped costs reaching none.
- **Two lenses added to Functional suitability,** `integrity-lens` and `unstated-lens`, which had been on no quality and so would never have been limited.
- **The review procedure hands each lens** its quality rows with their Enough, the cost rows those name, and the running count against each counted limit.

## Why

- **A limit counterweights the quality it limits.** Linking a cost to anything but the lenses' qualities would not do that.
- **Nothing to keep in step by hand.** The lens list lives in one place, the Qualities table.

## What was weighed

- **A lens list on each cost row.** Not taken: it would have to match the Qualities table, and a mismatch would hold back the wrong lens in silence.

Follows [ADR 0068](0068-qualities-a-ranked-list-each-lens-checks-against.md).
