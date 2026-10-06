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

- **Gate tests:** 620 pass, 0 fail, before and after the fixes below. `seam-a` passes.
- **QA pair, standard tier.** The first `integrity-lens` report was refused by the cross script (a non-risk note over 200 characters), so the lens was rerun fresh; the rerun was clear. `behaviour-lens` was blocking, with three findings.
  - **Auto-take exceptions were incomplete** (high). The list omitted the plan-review "proceed, fix or kill", cutting a lens, confirming escape rows and the claiming rules. Fixed: all four named, and "facts only I have" and "approvals the pact requires" repeated, in the paragraph and ADR 0019. Auto-taken.
  - **`auto` as a disposition blocked the walk-through skip** (medium). Fixed: `auto` is now a mark beside fixed, taken or dismissed, for example "fixed (auto: …)". Auto-taken.
  - **The lens contract files still say the owner decides every finding** (low). Not fixed: they don't ship, and the spec put them out of scope. Follow-up for the owner.

## What is still open

- **Install:** `scripts/install.ps1`, dry run first, `-Apply` only on the owner's go-ahead.
- **Proof by use:** the first thorough-tier move 4 after install shows the gloss, pre-fills and `auto` rows. The first periodic review shows the rudder totals.

## Record

Issue comments on mephistopheles4/the-pact#87:

- the spec, the owner's additions and the approval comment.
- `6026534864` — verbatim: the QA pair's reports through the cross script.
