# The withheld check reads the normalised view, and input validation gets its section

#391 and #392, quick tier, built on Opus at low by pact-391-392, led by head-chef-field-test. The owner's answers came by relay through the lead: the threat-model wording applied as drafted (q1) and corrected after Test (q3), and the security pair with the QA pair at Test (q2).

#392: the poster's `withheldAfter` read a Finding cell's raw text, so a form of "withheld" written differently but rendering the same passed it. It now reads the text after the state word in four views: as written, the two `normalise` copies `scan` reads, and a copy without emphasis, code span and link marks. Eleven cases join the C4 test in `gate/tests/poster-table.test.mjs`, each seen to pass the old code: a character reference, an inline element, an HTML comment inside the word, fullwidth letters, a combining grapheme joiner, the word in a closed or unclosed comment or as a bare tag, and emphasis, a code span or link brackets inside the word.

Test's first round, on `defb110`, ran the QA pair and the security pair together. The security pair found that reading only the normalised view had dropped the comment and tag forms the raw read caught; the four-view read restores them. The owner took the emphasis, code span and link fix (q4), and accepted R57, a withheld row's state in a form or cell the check does not read or fold, such as a look-alike letter from another script (q5). A gap in the content scan's named references, outside this change, waits on the owner (q6).

#391: `docs/threat-model.md` gains an "Input validation here" section that gathers the input checks the pact's code already makes, and the accepted risks that cover the rest, so the security lenses' sensitive-list check can read them in one place. It adds no control and accepts no risk.

## Record

- The requests: the issue bodies of #391 and #392.
