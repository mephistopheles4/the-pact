# Recommendations are auto-taken, with an audit trail

Superseded in part by [ADR 0051](0051-review-bookkeeping-keeps-only-what-feeds-a-decision.md) (2026-10-10): the rudder check and the thorough-pick exception are gone, and the Lens dispositions table keeps five things: four columns and the override mark. The `auto` mark, the reversal mark and the other exceptions still hold.

After a report or review, a session acts on its own recommendation for each finding and carries on. Every such choice gets an `auto` row, and a rudder check at the periodic review counts how the defaults steer.

## What it covers

- **Scope:** choices that come out of a report or review. Nothing else.
- **Exceptions:** facts only the owner has and approvals the pact requires; every stop in "When to stop or escalate"; every gated clause; tier decisions; "Quick work stops at an open decision"; the owner's "proceed, fix or kill" on a plan review; the thorough pick; user-only skill triggers; installs; cutting a lens; confirming escape and gap rows; the claiming and coordination rules; and the owner's "done". Accepting the work, closing a ticket and merging are never auto-taken.
- **The trail:** an `auto` mark beside the disposition in the Lens dispositions table, for example "fixed (auto: …)". The disposition stays fixed, taken or dismissed, so the walk-through skip still works. With no lens review, the rows go in an "Auto-takes" list on the issue. A reversal changes the mark to `auto, reversed` and keeps the original line.
- **The rudder check:** three totals at the periodic review: auto-takes, reversed auto-takes, and confirmed escapes after an auto-take. Summed across projects, no breakdown.

## Why

- **The owner leads from reports.** They almost never read diffs, so a session that waits on a choice it already recommended adds a round trip with no information in it.
- **"Help me decide" already said so,** but sessions kept stopping. A named rule with named exceptions is easier to follow than a default stated in passing.
- **A narrow scope keeps the stops.** A session-wide "stop only for facts" rule would have dropped non-gated stops. Naming the exceptions leaves each one where it was.
- **Defaults need a gauge.** Without a trail, nobody can tell whether auto-takes steer well. The rudder check turns that into three numbers.

## How this was decided

- **2026-10-06** — Decided in mephistopheles4/the-pact#87. The owner asked for items 4–6 in chat and approved the spec.
