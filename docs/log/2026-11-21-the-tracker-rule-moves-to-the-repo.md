# The tracker rule moves to the repo

#574. ADR 0161 records the decision.

On the owner's words, relayed by the lead on 2026-11-21: "I never asked for tracker md, where did that come from", "the repo already has issue tracker file for agents, it's a per repo doc" and "nothing from linear should be on the pact beyond issue tracker folder".

`claude/tracker.md` is gone from the payload, with its install destination, its seam A check, its doc budget and the tests that planted it. `claude/review.md` and `docs/poster.md` name no tracker product. The rule's content moved into `docs/agents/issue-tracker.md`, cut to fit its budget. The threat model's two pointers to the removed file now name that doc. `cloud-sessions/`, `builder/scriptorium.html` and `builder/default-config/` are regenerated. A follow-up cut from `claude/review.md` its private-record exception, its keyed signer example and "The poster is for GitHub only"; the threat model's "Posts are public" line now points at the tracker doc.

Nothing takes effect in live sessions until the owner applies the install, which deletes `~/.claude/tracker.md`. This removes a seam A check along with the file it checked.

The owner's words above name the removal, which includes the seam A requirement and the install refusal that guarded only that file; the merge is the owner's to confirm.

**Rolling back:** merge a revert of this change to `main`; at that commit, run the four checks in [Roll back to an older version](../install.md#roll-back-to-an-older-version), then rerun the regens and reinstall from the dry run.

## Record

- The ticket: https://github.com/mephistopheles4/the-pact/issues/574
