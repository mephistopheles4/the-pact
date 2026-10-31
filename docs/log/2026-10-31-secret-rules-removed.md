# The secret and personal-data rules removed

#441, thorough tier on the sensitive route, planned and specified by plan-441, built by build-441, led by the headchef. The owner decided the removal ("nope I'm done with them, nuke them please"); the proceed on revision 4 was the lead's own pick under level 3 (decision 398), not the owner's words.

The pact no longer makes Claude treat a secret or a personal detail in its own text specially (ADR 0125). "Secrets" leaves the sensitive-work default, the security-finding definition loses its exposure clause, the read before posting checks a post against the rest of Posting, the lens files and their contracts drop their own secret rules, and `/scriptorium` no longer reads builder files or presets for keys or names. The poster drops its token-shape, URL-password and email refusals and keeps two: a live environment secret's value, matched exactly (decision 388), and hidden characters. The spec pair and the security pair read two Design rounds; round 2 was declared final.

The build cut the poster's scan rows for the three refusals and kept its normalisation rows, planting the token shape as an environment secret's value, so the kept refusal is still seen reading through entities, comments, escapes and split forms. It added one case that a token shape, a URL password and an email address post, on a new post and on an edit. The threat model's places that named a removed control are reworded in the diff as proposals; the four leak classes go to the owner as drafted accepted-risk entries at hand-off. This repo's own rules on secrets go to a separate issue, filed before merge.

## Record

- The spec, revision 4: https://github.com/mephistopheles4/the-pact/issues/441#issuecomment-6545544304
- The hand-off from Plan and Design: https://github.com/mephistopheles4/the-pact/issues/441#issuecomment-6545551174
