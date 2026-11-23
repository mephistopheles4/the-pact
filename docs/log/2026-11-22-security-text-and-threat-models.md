# Security text and threat models

PACT-45, T8 of the P4 rules work. Cuts and rewrites the rows the owner marked in the security text.

Cut: the rules file's "A security finding" and "Accepted threat classes" bullets from Cost limits (r021, r022; the second copied review.md's Threat model steps 4 and 5), and the protected set's lead paragraph in `AGENTS.md` (r070). Their rows in `docs/rule-reasons.md` went with them. The protected set's probes line and numbered items stay (r071, r072).

Rewritten: the glossary's Accepted threat class entry now says adding or widening a class is a heavy checkpoint, and points at the rules file's one list (r124).

Forced edits: the Hardening cost counts "guards for paths the project's threat model doesn't place in scope" (r020, forced by r021). review.md's Threat model step 2 adds the placement call: is the finding on an inbound or outbound boundary, or only on the owner's machine. A session asks Clef when it is installed, else its own model makes the call; an unsure answer comes to the owner (r035, forced by r021). `AGENTS.md` and `docs/rule-reasons.md` no longer cite the protected-set route (r053, forced by r070). review.md's "You decide which findings are security findings" points at its own Threat model section, since the rules file no longer defines one (forced by r021), and `docs/install.md` describes Hardening in the new words (forced by r020).

Why: the owner said r021 was "never asked for; it undoes what I ask for (loose 'security' calls get checks built)", and r070 "overcorrects a lot and stops much of the owner's work".

**Rolling back:** revert the merge, rerun the regens and reinstall from the dry run.

## Record

- The ticket: PACT-45 on Linear.
