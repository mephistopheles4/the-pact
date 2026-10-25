# Nudge once stays as it is

#403, standard tier, planned on Opus at medium by pact-403, led by head-chef-field-test. The lead answered every question under the owner's standing instruction for the day; no answer came from the owner in chat.

#403 asked for a rewrite of Nudge once after the #402 pilot saw it over-escalate: told "no spec or questions, just build it" on an export holding customer names and addresses, the model led with a tier mismatch, recommended the sensitive route and wrote a spec anyway. The spec went through four revisions. The spec pair read revision 1 and asked for owner steps, a named runner, real old-against-new copies and a security read; the security pair read revisions 2 and 3, and each round tightened how the rewrite carried the sensitive-route recommendation: with its why, before any work, whether or not a nudge fired, and open in every hand-off. Revision 4 was built, six lines like today's.

The security pair's follow-up also found that the pilot's eval generator was broken. It wrote the rules text into each case's front matter, and the eval ends the front matter at the first `---`, which the rules text holds in its first table. Every #402 with-rules run lost its case settings and got most of the rules in the user prompt. The bare runs were built correctly, so their passes, and the cut evidence #404 acted on, stand; a correction went on #402.

With the generator fixed (the case keys first, the rules as one escaped string), ten Haiku runs compared the rewrite with today's text, which differed only in that bullet. Both built with no spec and recommended the sensitive route with its why on the invoice export and on a login change, and both passed on a small change. On an order log holding personal data both logged a redacted line instead and recommended no route. The text made no difference, and today's text no longer over-escalated, so the rewrite was dropped (ADR 0116) and #403 closed as not reproduced. The order-log result is a note for the owner, not filed.

The runs cost $0.044 on Haiku, agent and judge. Every reply was read by hand: the Haiku judge failed 8 of 10, mostly on wording. The cases stay outside the repo. No rule text, threat-model text or cloud copy changes, and no gate test was added; the lenses were not run on this docs-only diff.

## Record

- The spec, revision 4, with its revision history: https://github.com/mephistopheles4/the-pact/issues/403#issuecomment-6400038449
- The spec pair's review of revision 1: https://github.com/mephistopheles4/the-pact/issues/403#issuecomment-6400055164
- The security pair's review of revision 2: https://github.com/mephistopheles4/the-pact/issues/403#issuecomment-6400058521
- The security pair's follow-up on revision 3: https://github.com/mephistopheles4/the-pact/issues/403#issuecomment-6400062590
- The expected results, before the runs: https://github.com/mephistopheles4/the-pact/issues/403#issuecomment-6400072148
- The results and the decision: https://github.com/mephistopheles4/the-pact/issues/403#issuecomment-6400127376
- The correction to the pilot: https://github.com/mephistopheles4/the-pact/issues/402#issuecomment-6400071674 and https://github.com/mephistopheles4/the-pact/issues/402#issuecomment-6400129750
