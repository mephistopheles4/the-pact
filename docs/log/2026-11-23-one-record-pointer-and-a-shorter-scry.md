# One record pointer, and a shorter /scry

PACT-46, T9 of the P5 rules work. Merges the two record pointers, shortens the checkpoint log, moves the diagram format out of `review.md`, and rewrites `/scry` around "what is waiting for me".

The rules file's Keep the record bullet now says where the record is: "in the work's record, as the Posting section of `review.md` says; with no record, in chat". The Where to post bullet in `review.md` is gone, since the pointer says the same. The Checkpoint log bullet is 54 words, from 221: a one-line why, the goal the session ran under and a flag, big when it drops or narrows a review, check or route, accepts a security risk, or takes a heavy checkpoint at level 3. The poster parses none of the log's wording (it reads only the `withheld, see chat` table cell, which stays), so no token changed there.

On more than one status comment, a session updates the newest and mentions the duplicate there, and goes on.

The diagram block, the pin colours and the no-diagram rule moved to `claude/review-diagrams.md`, installed as `pact/review-diagrams.md` beside `review.md`; `review.md` keeps one line pointing at it. The install, seam A and the cloud copy carry the file like `review.md`: it never overwrites a live file the record doesn't list.

`/scry` answers a very short numbered list, each item a bold question and an italic pick, then one "There's also …" line for what is running and what landed, with detail on request. The facts line, the Only you can do, Moving and Done sections, the five-line Done cap and the rule voiding numbers after a compaction or a resume are cut. The wait-label test lost its exemption for the Only you can do section.

Why: the owner found `/scry` overwhelming, and asked for one pointer to the record and fewer words in the log.

**Rolling back:** revert the merge, rerun the regens and reinstall from the dry run. An install that already put `pact/review-diagrams.md` in place lists it in its record, so the rollback removes it.

## Record

- The ticket: PACT-46 on Linear.
- The pull request, with the removal map: see the ticket.
