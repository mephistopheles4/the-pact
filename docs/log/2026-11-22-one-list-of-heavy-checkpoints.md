# One list of heavy checkpoints

PACT-42, T1 of the P1 rules work. Rewrites the Hard stops bullet and cuts the rows the owner marked.

The rules file has one list, headed Heavy checkpoints: the acts too costly to take back. At level 2 each waits for the owner's confirmation in any form, anywhere; at level 3 it is logged and flagged; with no level set Claude's default holds and it asks first. The list keeps the items the owner's review of 2026-11-21 kept (the ticket's r004 row): an install apply, publishing a weakness before its maker's tracker has it, a secret, the usage pause, a reply or message to other people in the owner's name, making anything public or a merge that deploys, a merge editing a threat model's classes, boundaries or scope, a check that can't clear without being skipped, loosened or removed, and anything that can't be undone (deleting what git or the cleaner can't restore included).

Cut from the rules: the merge touching hooks, settings, CI or read-closely files, a pull request or commit the owner or the agent app didn't make, marking outside text ready for an agent, trusting a project's config, getting past a permission prompt or classifier block, a withheld pick leaving a security path open, a result a session can't explain, and the read of each commit before a push. The AGENTS.md mise rules and the push read go with them. Every "hard stop" left in the rules file, `review.md`, the commands, the cleaner's text, the usage templates and the docs this change touches reads "heavy checkpoint", and each copy of the list points to the rules file.

Lead picks, owner may veto: the mise rules (rows r059 and r060) go with item 11 of that review, trusting a project's config, though their own marks said Rewrite; the owner then said the three stops in `review.md` (more than one status comment, a withheld pick that would leave a security path open, a poster refusal nobody can explain) wait for nothing, so each is a plain heads-up with the work going on, and none is on the list; the cleaner's own output still says "never on a lead's pick", which the next ticket (a confirmation counts anywhere) changes.

Why: a stop that blocked a Dependabot merge, and a trust rule that blocked everything, were too vague to hold; the stops that remain are the ones a person would want even when work runs unattended.

**Rolling back:** revert the merge, rerun the regens and reinstall from the dry run.

## Record

- The ticket: PACT-42 on Linear, with its Test round 1 comment (findings and dispositions).
- The pull request, with the removal map: https://github.com/mephistopheles4/the-pact/pull/621
