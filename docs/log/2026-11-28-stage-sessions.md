# A stage's own work runs in a session

**2026-11-28.** PACT-97. The tier table gives each stage a model, but nothing said how sessions move between stages, and a lead had told a session to build in a subagent on another model. The owner asked that the point be control: the rule belongs to the move "Stay the owner", and the model split is a reference. Standard tier, not on the sensitive list. The design is [spec 0013](../spec/0013-stage-sessions.md), amended into [ADR 0180](../adr/0180-a-session-splits-where-the-model-changes.md).

## What was built

- **The move:** "Stay the owner" ends with one sentence: a stage's own work runs where the owner can open it, steer it and stop it.
- **The pointer:** the Workflow section's opening names `review.md`'s Sessions.
- **The reference:** `review.md` gains Sessions, placed first. Posting's phase-boundary sentence now names the model change.
- **No new rule** in the rules file. The two existing rows in `rule-reasons.md` carry the reasons.
- **The records and copies:** ADR 0180 amends ADR 0011; ADR 0179 was taken by another open change. The builder page and the cloud copies are regenerated, and the default configuration did not move.
- **Beyond the spec's list:** `reference.md`'s row for `review.md` names Sessions too, since that row says what the file holds.
- **Tests: +1 −0.** The new test in `review.test.mjs` failed before the text edits. `neutral-home.test.mjs` gains the two substitutions its stored older rules file needs.

## What is still open

- **The probe** (the spec's claim 6) runs around the install, and its results are pending on PACT-97. A follow-up log entry records them. The issue stays open until then.
- **Grimoire's head-chef** repeats the rule. Its follow-up, pointing to this reference, is filed when this change merges.

## Rolling back

Before an install, revert the merge. After one, revert, then install the reverted `main` through the dry run at the owner's go-ahead.

## Record

- PACT-97 on Linear. Its comments hold the spec rounds, the Test review and the probe's results.
