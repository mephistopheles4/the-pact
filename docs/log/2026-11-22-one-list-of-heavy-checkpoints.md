# One list of heavy checkpoints

PACT-42, T1 of the P1 rules work. Rewrites the Hard stops bullet and cuts the rows the owner marked.

The rules file has one list, headed Heavy checkpoints: the acts too costly to take back. At level 2 each waits for the owner's confirmation in any form, anywhere; at level 3 it is logged and flagged; with no level set Claude's default holds and it asks first. The list keeps the items the owner's review of 2026-11-21 kept (the ticket's r004 row): an install apply, a secret, the usage pause, a reply or message to other people in the owner's name, making anything public or a merge that deploys, a merge editing a threat model's classes, boundaries or scope, a check that can't clear without being skipped, loosened or removed, and anything that can't be undone (deleting what git or the cleaner can't restore included).

Cut from the rules: the merge touching hooks, settings, CI or read-closely files, a pull request or commit the owner or the agent app didn't make, marking outside text ready for an agent, trusting a project's config, getting past a permission prompt or classifier block, a withheld pick leaving a security path open, a result a session can't explain, and the read of each commit before a push. The AGENTS.md mise rules and the push read go with them. Every "hard stop" left in the rules file, `review.md`, the commands, the cleaner's text, the usage templates and the docs this change touches reads "heavy checkpoint", and each copy of the list points to the rules file.

Lead picks, owner may veto: the mise rules (rows r059 and r060) go with item 11 of that review, trusting a project's config, though their own marks said Rewrite; the cleaner's own output still says "never on a lead's pick", which the next ticket (a confirmation counts anywhere) changes.

The owner's answer: three stops in `review.md` wait for nothing (more than one status comment, a withheld pick that would leave a security path open, and the poster ending unavailable or refusing for a reason nobody can clear). Each is a plain heads-up with the work going on, and none is on the list.

Two cuts the ticket's rows made went through the protected-set route: the spec pair and the security pair read them (the Test comments on PACT-42), and the owner decided each.

- The Checkpoints clause "take your own pick and go on, never declining the sensitive route or the security pair or skipping a lens past the one-line exception" (r003) stays cut. The owner's words: "this makes me use the security pair more than I want", and the decision is the owner's at manual level, when steering the session, or the lead's at level 3. AGENTS.md's protected-set items 1 and 2 and the rule-reasons row for lens offers lose "the session's own pick, logged, never a decline" to match.
- The weakness paragraph (r036) is cut, with its place on the list, its note rule and the references to it in `review.md`. The owner's words: plans were public once, and now everything is planned on the private Linear tracker, so this should be "a checkpoint at most", and they lean toward removing it. GitHub pull requests and commits stay public.

Why: a stop that blocked a Dependabot merge, and a trust rule that blocked everything, were too vague to hold; the stops that remain are the ones a person would want even when work runs unattended.

**Rolling back:** revert the merge, rerun the regens and reinstall from the dry run.

## Record

- The ticket: PACT-42 on Linear, with its Test round 1 comment (findings and dispositions).
- The decision: [ADR 0164](../adr/0164-the-one-list-is-heavy-checkpoints-and-no-stop-is-hard.md), which reverses 0155, 0157 and 0158 (PACT-51).
- The pull request, with the removal map: https://github.com/mephistopheles4/the-pact/pull/621
