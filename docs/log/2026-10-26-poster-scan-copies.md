# The poster's scan reads page-faithful copies

#394, thorough tier on the sensitive route (secrets, input validation), planned, built and tested on Opus at high by pact-394 and, after its context ran out, 394-finish, led by Oracle Head Chef. The owner set the route; the lead decided the questions at level 3, and the owner's own words decided the accepted risks and, through the lead, the goal the spec was approved under.

adversarial-lens found the gap in the Test review of #391 and #392: the scan decoded only a short list of named references, so a known-shape secret split by any other reference stayed split in every copy it read while the page could show it whole. The plan reproduced it at the base with a token-shaped test string and probed each form through GitHub's renderer with harmless strings. Besides the named references, it found zero-padded numeric references, control characters and decoded tag shapes that a later removal ate.

The first Design round turned the plan around. Both security lenses showed that decoding and stripping more before the repeated tag removal would lose forms caught before. Revision 2 kept the old copies as a frozen floor and added copies read as the page reads the text. The second round showed that the page copy didn't follow GitHub's raw-HTML grammar and that the floor's claims couldn't fail; four of adversarial-lens's hypotheses held on a probe, and revision 3 fixed both. A gap the plan met on the way, a letter written against some key shapes switching off their match, was at the base and is filed as #428. The owner accepted three residual classes under R13 on their own word.

The build ran the red rows at the base first. A mutation check, dropping one copy or rule at a time, showed one claim's row could not fail, and a rerun of the probes in `gfm` mode, the mode comments use, reversed a Design call: semicolon-less legacy names decode inside an HTML block. The lead took both changes (q11): the 106 legacy names are decoded by longest prefix, and three rows were added or re-pointed so each copy and rule has a row only it catches (ADR 0122).

The security pair read the squashed commit. adversarial-lens found that the page copy missed GitHub's tag filter and allowed non-ASCII spacing in tags; a probe confirmed both, and the pattern now applies the filter, ASCII spacing and blank-line blocks, with two rows. Both lenses found the R13 entry wider than the owner's words, and it was narrowed to them. A body of unclosed openers slows the page copy with the square of its length; measured under the one-second bound and failing closed, it is accepted as R62 (q12).

The pair's full follow-up read of that commit found three more places where the page copy read the source otherwise than the page: a processing instruction or CDATA section that the page's HTML parser ends at its first `>`, a tag carried onto the next line of a block quote, and a tag with a no-break space before `=` inside an HTML block. Each was probed with harmless strings and confirmed. The owner chose to fix those three, with one closing security read, and to accept the class on their own word under R13 (q13): a raw-HTML or markdown structure the page copy reads differently from GitHub's page. The page copy now strips block-quote markers first and ends those two forms at their first `>`, and the first build's whole-text pattern with Unicode spacing stays as a wide copy. Each of the three has a row recorded red at the base and at the first build, and a mutation check showed each row fails when its fix alone is undone. Scanning what GitHub renders, in place of modelling its parsers, is filed as #429.

## Record

- The spec, revision 1: https://github.com/mephistopheles4/the-pact/issues/394#issuecomment-6429922962
- The Design round 1 review: https://github.com/mephistopheles4/the-pact/issues/394#issuecomment-6429946988
- The spec, revision 2: https://github.com/mephistopheles4/the-pact/issues/394#issuecomment-6429981587
- The Design round 2 review: https://github.com/mephistopheles4/the-pact/issues/394#issuecomment-6430232750
- The spec, revision 3, approved: https://github.com/mephistopheles4/the-pact/issues/394#issuecomment-6430235851
- Design closed, one ticket: https://github.com/mephistopheles4/the-pact/issues/394#issuecomment-6430320056
- The follow-up to scan GitHub's rendered page: https://github.com/mephistopheles4/the-pact/issues/429
- The Test review, the security pair's closing read: https://github.com/mephistopheles4/the-pact/issues/394#issuecomment-6435953936
- The Test review, the QA pair's closing read: https://github.com/mephistopheles4/the-pact/issues/394#issuecomment-6435969407
- The Test review, the QA pair's scoped follow-up: https://github.com/mephistopheles4/the-pact/issues/394#issuecomment-6436152259
- The pull request: https://github.com/mephistopheles4/the-pact/pull/430
