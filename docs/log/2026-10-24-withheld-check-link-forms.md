# The withheld check folds links with parentheses

Follow-up to #391 and #392 (#395), under #396, quick tier, built on Opus at low by pact-391-392, led by head-chef-field-test. The owner's answers came by relay through the lead (q10 to q12 on #395's last Test read).

The poster's withheld check folds a link to its text before it matches the word. A second fold now takes an address with one level of parentheses and a quoted title, so a link whose address holds a pair of parentheses, or whose title holds a closing parenthesis, no longer splits the word past it. The first fold stays beside it: the security pair found that the new fold alone read a lone quote in an address as a title and missed a form `7d282c2` caught. Three cases join the C4 test in `gate/tests/poster-table.test.mjs`. The check failed each before its fix, letting the row through: the two new forms at `7d282c2`, and the lone quote at `2f43184`.

`docs/threat-model.md`: R57's text adds "or in markup it doesn't fold", the owner's wording (q11), and the label line names the two crypto collision residuals that are accepted without a label (q12).

## Record

- The request: q10 to q12, relayed by the lead after #395's last Test read; #396.
