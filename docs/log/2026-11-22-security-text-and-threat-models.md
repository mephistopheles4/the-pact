# Security text and threat models

PACT-45, T8 of the P4 rules work. Cuts and rewrites the rows the owner marked in the security text.

Cut: the rules file's "A security finding" and "Accepted threat classes" bullets from Cost limits (r021, r022; the second copied review.md's Threat model steps 4 and 5), and the protected set's lead paragraph in `AGENTS.md` (r070). Their rows in `docs/rule-reasons.md` went with them. The protected set's probes line and numbered items stay (r071, r072); item 3's last sentence, which said review.md's Threat model section changes "only by the same route", is dropped with no pointer back (r070).

Rewritten: the glossary's Accepted threat class entry now says adding or widening a class is a checkpoint, and points at review.md's Threat model step 5 (r124).

Forced edits:
- The Hardening cost counts "guards for paths off the sensitive-work list that the project's threat model, if any, doesn't place in scope" (r020, forced by r021). `docs/install.md` says the same.
- review.md's Threat model step 2 adds the placement call: is the finding on an inbound or outbound boundary, or only on the owner's machine. Clef is the model the pact's runner serves on this machine's own address from its pinned table; one a repo, plugin or project file supplies is not Clef. It is never asked over a network or in a cloud session, and without it the session's own model decides. An unsure answer comes to the owner. The step also says "auth" means authentication and authorization (r035, forced by r021).
- review.md's "You decide which findings are security findings" points at its own Threat model section, since the rules file no longer defines one (forced by r021).
- `AGENTS.md` and `docs/rule-reasons.md` no longer cite the protected-set route (r053, forced by r070).

Accepted by the owner: the residual from the r022 cut, that no installed text says "with no threat model, flag the risk and record nothing".

Why: the owner said r021 was "never asked for; it undoes what I ask for (loose 'security' calls get checks built)", and r070 "overcorrects a lot and stops much of the owner's work".

**Rolling back:** revert the merge, rerun the regens and reinstall from the dry run.

## Record

- The ticket: PACT-45 in the project's issue tracker.
