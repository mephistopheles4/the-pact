# A status comment per record, edited each round

#412, standard tier, built by pact-412. The owner's words came relayed by backlog-head-chef: "its for the issue tracker, we can start it".

On a record with many review rounds, the owner had to read every round comment to see where things stood. The review procedure (`claude/review.md`, Handling the reports) now says to post or edit one status comment on the record after each round's comment: the latest round's title line and signal table, the rows that wait on the owner with a link to the round, and a link to every round, newest first. The round comments stay the record, never edited, and nothing reads the status comment back.

The comment is signed `status-<n>`, n the issue's or pull request's number, not a session's label, because rounds on one record often run in several sessions and a session label would make the next session's edit `edit/unsigned`. It holds none of what the poster's `edit/record` and `edit/decision` checks refuse, so the poster accepts every later edit. The round's "for you" rows replace the decision boxes #464 had already removed. No round comment links the status comment, and no spec pair ran, on the owner's word. `docs/poster.md` names the status comment as the routine use of `issue-comment-edit`. No ADR: ADR 0117 and ADR 0120 already decide the split and the checks.

## Record

- The ask and the spec, revision 1: https://github.com/mephistopheles4/the-pact/issues/412#issuecomment-6711932000
- The owner's decision from chat: https://github.com/mephistopheles4/the-pact/issues/412#issuecomment-6711970957
