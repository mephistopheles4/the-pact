# A follow-up lens run reads only the revision

#389, standard tier, planned and built on Opus at medium by pact-389-followups, led by head-chef-field-test. The owner's answers, numbered q1 on, came by relay through the lead; q1 to q14 are written into spec revision 6, and the rest into the Test review comments. The security pair ran on the spec and the diff, without the sensitive route's Opus-high build (q4).

The issue counted one day of brigade lens runs: a follow-up cost about what a first round did, because it re-read the whole change. The spec went through six revisions and three Design rounds of the spec pair and the security pair. The first round found the push gate this repo keeps on the security pair's read, and the owner kept that read full (q5). The second found that a spec has no git head, and the owner kept spec follow-ups full (q8). It also found that repos with no push rule would merge on a scoped security read, and the owner answered with a closing read that compares three states (q9). The third round, by the owner's q11 its last, brought five rules pinning the closing read down (q13) and the push sentences' own wording (q12). The Design follow-ups cost 57–81k tokens each, about what the first rounds did, which is the issue's point.

The build edits `claude/review.md` (the scoped follow-up, the closing read, Spec drift in the template and the review comment), the push sentences in `AGENTS.md` and `docs/agents/gate-tests.md`, and `CONTEXT.md`, with one assertion block in the existing review-file test in `gate/tests/pact-call.test.mjs`, seen red first (ADR 0108). Whether reviews cost less is proved by use after the install (claim 9).

Test ran the QA pair and the security pair together as the closing read, on `3499e1f`, on the fix head `c445aab`, and the security pair alone as the full push read of `de1f188`; the standards pair ran last, as the second Test round. Each round turned up small new items in the text the last fix added, so Test hit the Guards' stop after two rounds, and the owner chose one last fix commit (q18). The fixes:
- a scoped follow-up gets the base by its hash, never the whole diff;
- a claims lens keeps the claims its earlier findings sit on;
- the push read and the closing read are handed their earlier findings;
- a squash falls back to a restart, which carries the open rows;
- a file the revision touches stays in scope even when a withheld finding sits in it (q15), though a claim run never reaches it for a lens that can reach the web;
- "the approved spec" means the revision the owner approved.

The owner then took four close-out fixes (q19), with the R42 and R23 wording in the threat model; the gap that a scoped data read can't see a leak crossing out of its scope stays a note, not an accepted risk.

## Record

- The request: the issue body of #389.
- Spec revisions 1 to 6: issuecomment-6389194243, issuecomment-6389899815, issuecomment-6390011115, issuecomment-6390040839, issuecomment-6390172799, issuecomment-6390274791.
- Design reviews: issuecomment-6390002036 and issuecomment-6390003189 (revision 2); issuecomment-6390122653 and issuecomment-6390122917 (revision 4); issuecomment-6390249895 and issuecomment-6390250243 (revision 5).
- Test reviews: issuecomment-6390437253 and issuecomment-6390438474 (`3499e1f`); issuecomment-6390588301 and issuecomment-6390588858 (`c445aab`); issuecomment-6390743100 (`de1f188`, the security pair's push read); issuecomment-6390816290 (`de1f188`, the standards pair).
- The input-validation gap filed from the Design review: #391.
