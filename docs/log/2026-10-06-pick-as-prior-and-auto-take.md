# The pick as a prior, auto-taken recommendations, and a rudder check

**2026-10-06** — Move 4 and "Help me decide" now fit an owner who leads from reports. The pick is a prior, a walk-through is skipped when nothing is left to decide, the session pre-fills the Lens dispositions answers, and recommendations on report findings are taken by default with an audit trail (mephistopheles4/the-pact#87).

## What it set out to do

The owner decides from reports and almost never reads diffs. The thorough pick read as "did you review this?", the mismatch walk-through ran even when every finding was already fixed, and the two yes-or-no questions were asked cold. Sessions also kept waiting on choices they had recommended, and nothing recorded where the work was steered without the owner.

## How it was built

- **Six edits to `claude/CLAUDE.md`,** all outside the gated blocks: the pick paragraph, a new "Auto-take" paragraph after "Help me decide", the Lens dispositions paragraph, the escape row, "When a lens may not pay", and "Totals only".
- **The gloss sits beside the claim ids** for the owner only. The lenses get the claims as before, so lens input and the security set did not change.
- **The cross script did not change.** "Resolved before owner review" is recorded in the dispositions table.
- **ADR 0019** records the decision. `CONTEXT.md` defines auto-take and rudder check.

## What the checks showed

- Recorded below once the QA pair has run.

## What is still open

- **Install:** `scripts/install.ps1`, dry run first, `-Apply` only on the owner's go-ahead.
- **Proof by use:** the first thorough-tier move 4 after install shows the gloss, pre-fills and `auto` rows. The first periodic review shows the rudder totals.

## Record

Issue comments on mephistopheles4/the-pact#87:

- the spec, the owner's additions and the approval comment.
