# The poster slims

PACT-115. The owner asked for an audit of what the threat model and an agent app already cover, and for the rest to leave the poster, with no app pinned still working. The poster loses the Lens dispositions table check, the fence, wrap and link checks, the review-record and item-leak checks on edits, and the `reason` field with its `Edited:` lines. Its content scan goes back to the floor it had before #394, with copies that also strip control characters and with the hidden-character names added, and its decision-mark and owned-line readings read plain text and its NFKC form. The file goes from 3,046 lines to about 2,060. [ADR 0177](../adr/0177-the-poster-keeps-its-controls-and-drops-accident-checks.md) records the audit, each cut and its costs.

The pact text changes in `review.md`: a status comment is rebuilt with no `Edited:` lines and needs no `reason`, and the rules on a refused table or prose go. The threat model says how the scan reads a secret and a hidden character.

The scan's floor narrows what the secret-value refusal reads. The owner accepted that, relayed by the lead: "I agree with dropping it." The spec claimed encoded hidden characters are refused; they never were, and they stay accepted and documented.

**Compatibility:** a session started before the install still holds the older `review.md`. Its edits carry `reason`, which the new poster refuses `post/unknown`, until the session restarts.

**Deploy:** install the poster and `review.md` from one dry run, then paste the cloud wrapper into the cloud environment again. After the install, one note and one status edit on the pull request must each end `RESULT: verified`.

**Rolling back:** run the four checks in [Roll back to an older version](../install.md#roll-back-to-an-older-version), then the dry run and apply of the previous release; revert the merge commit on a branch if the repo must follow.

## Record

- PACT-115 "Scope from the owner", "Spec: what the poster keeps, slims and cuts" and "Decision (relayed, not a decision mark)" (Linear comments)
- PACT-115 "Spec: slim the poster (PACT-115), V3", spec round 1 and spec round 2, final, with the reports (Linear comments)
- PACT-115 "Build prompt for a fresh session" and the build and Test comments signed build-115 (Linear comments)
