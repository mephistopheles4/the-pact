# Review severities, a skip list, evidence to block, and repo review rules

#421, standard tier, planned on Opus at medium by pact-421, led by head-chef-field-test. The tier was the lead's pick under the owner's standing instruction for the day.

Several changes that day went two or three Test rounds without settling. The lead compared the review procedure with Anthropic's guidance for its managed Code Review service and filed four gaps: undefined severities though high blocks, no skip list, blocking without evidence, and no home for repo review rules. Reading the lens files narrowed the first gap: every lens already calibrated its own levels except `behaviour-lens`, so the procedure needed only the shared meaning of each level. The owner answered q1 to q5 ("all a", relayed), including the lead's addition that a new low finding can be noted without another round.

The spec pair read revision 1. `executability-lens` returned blocking. The first draft's skip list would have reached `cloud-sessions/`, generated and run as root, before this repo's close-read rule moves under a "Review rules" heading. The threat model names that close read in a defence, so the finding was sorted as security. No choice on the security pair was recorded either. `unstated-lens` found the same gap, and found that a repo's rules could add any path to the skip list. Revision 2 never skips a path the agent instructions ask to read closely, counts a file as generated only when it is marked with its generator, and lets repo rules add only such paths. It also spells out how the crossed verdict is lowered.

The build adds the severity meanings, the evidence rule, the skip list, the Review rules hand-off and the low-finding sort to `claude/review.md`, and renames `behaviour-lens`'s scale (ADR 0121).

## Record

- The spec, revision 1: https://github.com/mephistopheles4/the-pact/issues/421#issuecomment-6402210244
- The Design round's review: https://github.com/mephistopheles4/the-pact/issues/421#issuecomment-6402273716
- The spec, revision 2: https://github.com/mephistopheles4/the-pact/issues/421#issuecomment-6402274167
