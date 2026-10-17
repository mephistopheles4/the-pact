# A project's Cost limits are the second allowance that is not only tighter

A project's `costLimits` list takes the place of the home Cost limits in that repo, as its `qualities` list takes the place of the home qualities. Like the qualities list, it can loosen: it may leave a limit empty or set a looser one (#278 T2, #288; closed out in #289).

## What changed

- **A second loosening a project may set,** beside the qualities list. R31 in the threat model names both.
- **One page.** A project that sets `costLimits` also sets `qualities`, and each of its Enough costs resolves in its own `costLimits`, because the project render cannot read the home part text.
- **The same floor.** The fixed text above the project's table is the home part's own, so the one rule and the security bar win over any project row.

## Why

- **The owner's projects differ.** A prototype and a published installer don't share one limit (chat, 2026-10-13).
- **Every cost a quality names is on one page,** so a reader sees the limits in force in one place.

## What was weighed

- **Only tighter rows.** Not taken: it would not fit a project that needs a looser limit, and the dry run's security-defaults line already points the owner at the project's lists before they install.
- **Merging with the home list.** Not taken: the limits in force would then be read from two places.

Follows [ADR 0068](0068-qualities-a-ranked-list-each-lens-checks-against.md), whose project allowance this extends.
