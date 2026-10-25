# The withheld check reads the normalised view, and input validation gets its section

#391 and #392, quick tier, built on Opus at low by pact-391-392, led by head-chef-field-test. The owner's answers, q1 to q9, came by relay through the lead.

#392: the poster's `withheldAfter` read a Finding cell's raw text, so a form of "withheld" written differently but rendering the same passed it. It now reads the text after the state word in four views: as written, the two `normalise` copies `scan` reads, and a copy with each link folded to its text and without emphasis and code span marks. Fourteen cases join the C4 test in `gate/tests/poster-table.test.mjs`. Eleven were seen to pass the base's code: a character reference, an inline element, an HTML comment inside the word, fullwidth letters, a combining grapheme joiner, emphasis, a code span, link brackets, a link address or a reference label inside the word, and an empty link before it. The other three, the word in a closed or unclosed comment or as a bare tag, the base already refused; they were seen to pass the first Test round's head, `defb110`, which had dropped them.

#391: `docs/threat-model.md` gains an "Input validation here" section that gathers the input checks the pact's code already makes, and the accepted risks that cover the rest, so the security lenses' sensitive-list check can read them in one place. The section adds no control and accepts no risk; the change also records R57 (q5).

Test's first round, on `defb110`, ran the QA pair and the security pair together. The security pair found that reading only the normalised view had dropped the comment and tag forms the raw read caught; the four-view read restores them. The owner corrected the section's wording (q3), took the emphasis, code span and link fix (q4), and accepted R57, a withheld row's state in a form or cell the check does not read or fold, such as a look-alike letter from another script (q5). The second round, the security pair's full read of `d87eca8`, found the link fix only partial; that hit the Guards' stop after two rounds, and the owner chose one last fix commit and one last full read (q7). Follow-ups filed: #394, the content scan's named references (q6), and #396, the tag-attribute split (q8).

## Record

- The requests: the issue bodies of #391 and #392.
- The pull request: #395.
