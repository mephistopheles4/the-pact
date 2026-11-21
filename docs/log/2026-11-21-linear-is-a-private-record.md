# Linear is the owner's private record

#579, T3 of #574. ADR 0160 records the decision and reverses the last sentence of 0159's decision.

`claude/review.md`'s Posting says Linear is the owner's private record (as PR 595 wrote it); its "a record anyone but me can read counts as public" gains "except my Linear workspace, the one `~/.claude/tracker.md` pins". `docs/threat-model.md` gains four short edits and names no tracker product: text on the owner's private issue tracker is inside the root of trust and doesn't cross, and GitHub issue text is outside text; whose-text-counts is named for pull request text only; the private issue tracker's account joins the root of trust, so whoever controls it counts as the owner; and the Posts are public class excepts that tracker. `cloud-sessions/` and `builder/scriptorium.html` are regenerated; `builder/default-config/` is checked.

On the owner's words, relayed by the lead on 2026-11-21: "I count linear as trusted private record, I invite people in there manually", "everything on linear counts, no checks on linear", "the model is about how the pact works" and "the threat model shouldn't mention linear at all". This loosens a control, and nothing takes effect in live sessions until the owner applies the install.

**Rolling back:** revert the merge, rerun the regens and reinstall from the dry run.

## Record

- The ticket: https://github.com/mephistopheles4/the-pact/issues/579
- The spec, revision 3 and its amendments: https://github.com/mephistopheles4/the-pact/issues/579#issuecomment-7066803329, https://github.com/mephistopheles4/the-pact/issues/579#issuecomment-7066845748, https://github.com/mephistopheles4/the-pact/issues/579#issuecomment-7067124125 and https://github.com/mephistopheles4/the-pact/issues/579#issuecomment-7067136570
