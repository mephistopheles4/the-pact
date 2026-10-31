# A follow-up issue needs a trigger

#444, standard tier, specified and built by do-444, led by the headchef. The owner's ask came by relay; the spec go on revision 2 was the lead's own pick under the owner's level-3 command, not the owner's words.

The default Follow-up issues row now counts only issues that name a trigger; one with none counts as past the limit and stays a note (ADR 0127). The spec pair read revision 1: executability-lens found no Needs a human section and no stated time for the owner's own configuration edit, unstated-lens asked how an owner-picked note counts; revision 2 fixed all but one low, noted. At Build the builder's 160-character cap on Counted as dropped the row's examples, which moved to the ADR.

Test ran the QA pair and the standards pair twice. Round 1 found three lows: two crossed on whether a note the owner picks to file needs a trigger, fixed with one clause in the review procedure; one on the row's wording stays a note. The closing read found no high or medium, and two lows on this record (its missing Test links, and "follow-up" for an issue where the glossary means a later lens run), fixed in a docs-only commit read by the standards pair past the two-round limit, on the lead's own pick (decision 436). CI's `gate` and `gate-windows` passed on each reviewed head.

The owner's installed configuration replaces the Cost limits block, so the new row reaches their sessions only when they paste it in.

## Record

- The spec, revision 2: https://github.com/mephistopheles4/the-pact/issues/444#issuecomment-6546022114
- The Design round 1 review: https://github.com/mephistopheles4/the-pact/issues/444#issuecomment-6546023809
- The Test round 1 review: https://github.com/mephistopheles4/the-pact/issues/444#issuecomment-6546255943
- The Test round 2 review, the closing read: https://github.com/mephistopheles4/the-pact/issues/444#issuecomment-6546372336
