# The spec pair is executability-lens and unstated-lens

`good-enough-lens` leaves the pact. The spec pair becomes `executability-lens` and `unstated-lens`, a joining pair offered on a spec at standard and above (#281, #302). This supersedes the spec-pair part of [ADR 0053](0053-review-is-nine-lenses-in-pairs-joined-by-the-cross-script.md).

## What changed

- **The roster drops to eight lenses and `scout`.** The Workflow's Design row and the Lenses table read the new pair, and the builder, its presets and the three example blocks follow. At Test, `unstated-lens` stays the gatekeeper, alone.
- **The stop test moves into `executability-lens`,** as a seventh readiness point, and the guard goes with it: a deferral of work that guards security or data fails the test whatever trigger it names, and is a `high` finding. The guard is written out in full in the lens, with no exception clause. `executability-lens` stays on the security set for that reason.
- **The tension pair retires.** Every pact pair is a joining pair, so a crossing at a spec section means two different problems meet there, and the review procedure has no Disagreements heading.
- **The old name is handled, not ignored.** The render keeps a fixed list of retired agents. A configuration whose `agents` key names one is refused, with a message that holds constants only. An edit block or a project qualities list that names one draws a warning, and a live agent file with a retired name draws one fixed dry-run line; the install goes ahead on all three and never deletes a file it didn't write ([ADR 0071](0071-an-agent-file-the-pact-did-not-write-is-yours.md)).

## Why

- **Cost limits and Enough carry the "less" side now** ([ADR 0079](0079-a-cost-reaches-lenses-only-through-enough.md)): a finding that would go past a limit is routed by the limit, not by a lens that argues for less.
- **The lens found nothing real.** A history pass over every Lens dispositions table in three repositories counts 47 findings from it: none a real defect, about two thirds polish and a third edge cases (labelled by a small model, so the shares are approximate).
- **One lens run less per spec review,** since `unstated-lens` already ran at Design.

## What was weighed

- **Keeping the lens and cutting its brief.** Not taken: the part worth keeping, the guard, moves with the stop test, and the rest duplicated Cost limits.
- **The builder drops a retired agent's file text too.** A saved or shared builder file that carries an agent file under the retired name loses it on load, with the page's note; the file on disk is untouched unless the owner saves over it. A separate Design offer of `unstated-lens` goes only when the new pair covers its tiers and condition.
- **Refusing a block that names the old name.** Not taken: a block is prose, and refusing one for a word is the kind of text check [ADR 0069](0069-the-pact-is-vetted-like-a-skill.md) took out of the gate. The `agents` key is structured, so it still refuses.
- **Adding the lens file to the install's retired list.** Not taken: a first install with no record must not delete a file it didn't write.

Supersedes in part [ADR 0053](0053-review-is-nine-lenses-in-pairs-joined-by-the-cross-script.md) (the spec pair) and [ADR 0064](0064-review-crossings-by-template-and-judgment.md) (the Disagreements heading for the spec pair's crossings).
