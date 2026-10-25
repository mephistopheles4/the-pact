# The dry run warns when the checkout is behind the last install

#407, on the sensitive route (Opus at high, the security pair on the spec and the diff), built by pact-407, led by head-chef-field-test. The lead first set Quick; the build stopped before any work because the issue named the security pair and a loosened gate check, and the lead's pick moved it to the sensitive route. Every answer came from the lead under the owner's standing instruction for the day; none came from the owner in chat.

Earlier the same day a lead nearly ran a dry run from a checkout behind the last install: the overwrite and delete lists were long for a one-file change, with no warning, and the apply would have rolled the pact back. #399 cut the warning out to this issue, with its draft (S6b) and three findings marked `security?`.

The spec addendum went through four revisions. The spec pair and the security pair read revision 1 together. Their findings moved the warning after the security-defaults line, so that line still comes first (ADR 0066); stopped the line from printing anything but a commit id, since a session can write the install record; named the failure and recovery when `rev-list` can't read the history; and added a real dry run from the branch to the claims. Their follow-ups on revision 2 found that the boot test's tightened rule would have refused the shipped `ls-tree` call, which indexes an array inside its own, and that the rule still missed other ways to reach git: an alias, a call through `call()`, a direct spawn of the git path, a second `commit`. Revision 3 has the boot test read the source's tokens for those, with a bad case for each. The lead took the seven security fixes and added the AGENTS.md stop rule (q2, q3).

The build adds one line to the bootstrap, which is now at its 250-line budget. `parseReachable` and `behindLine` sit in `gate/install-core.mjs`, the runner reads the list and prints the line, and the boot test allows `rev-list` only as `'rev-list', commit`. The warning never refuses (ADR 0118). Two sentences, one for R22 and one for the threat model's "Input validation here", go to the owner at hand-off; neither is applied here.

## Record

- The issue, with the draft and the findings carried from #399: https://github.com/mephistopheles4/the-pact/issues/407
- The spec addendum, revision 1: https://github.com/mephistopheles4/the-pact/issues/407#issuecomment-6400534371
- The spec pair's review of revision 1: https://github.com/mephistopheles4/the-pact/issues/407#issuecomment-6400653865
- The security pair's review of revision 1: https://github.com/mephistopheles4/the-pact/issues/407#issuecomment-6400654277
- Revision 2: https://github.com/mephistopheles4/the-pact/issues/407#issuecomment-6400654699
- The spec pair's follow-up on revision 2: https://github.com/mephistopheles4/the-pact/issues/407#issuecomment-6400759184
- The security pair's follow-up on revision 2: https://github.com/mephistopheles4/the-pact/issues/407#issuecomment-6400759647
- Revision 3: https://github.com/mephistopheles4/the-pact/issues/407#issuecomment-6400760072
- Revision 4, with the lead's answers: https://github.com/mephistopheles4/the-pact/issues/407#issuecomment-6400772371
- The Test review, the QA pair and the security pair on the built head, is on the issue after these.
