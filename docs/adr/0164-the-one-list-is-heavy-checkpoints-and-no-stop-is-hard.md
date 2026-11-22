# The one list is heavy checkpoints, and no stop is hard

PACT-42 (P1 · T1), PR 621, standard tier. It reverses the split that [0155](0155-checkpoints-are-events-hard-stops-wait.md) drew between hard stops and checkpoints, [0157](0157-checkpoints-never-wait-the-checkpoint-stops-switch-is-retired.md)'s "hard stops wait for the owner's own typed words", and [0158](0158-a-hard-stop-waits-for-the-owners-own-words-typed-or-spoken.md)'s "own words", spoken or typed, in the session's own chat.

## Decision

The rules file has one list, headed **Heavy checkpoints**: the acts too costly to take back. At level 2 each waits for the owner's confirmation in any form and anywhere: typed or spoken, in any session, said to the lead included. At level 3 each is logged and flagged. With no level set (the pact alone) Claude's default holds, and it asks first. "Hard stop" leaves the pact's text; every copy of the list points to the rules file.

The list keeps what the owner's item review of 2026-11-21 kept: an install apply, a secret, the usage pause, a reply or message to other people in the owner's name, making anything public or a merge that deploys, a merge editing a threat model's classes, boundaries or scope, a check that can't clear without being skipped, loosened or removed, and anything that can't be undone (deleting what git or the cleaner can't restore included).

It drops what that review cut: a merge touching hooks, settings, CI or read-closely files; merging a pull request or commit the owner or the agent app didn't make; marking outside text ready for an agent; trusting a project's config (and with it AGENTS.md's mise rules); getting past a permission prompt or classifier block; a withheld pick leaving a security path open; a result a session can't explain; and the read of each commit before a push.

Two cuts went through the protected-set route, read by the spec pair and the security pair, and decided by the owner:

- The Checkpoints clause "take your own pick and go on, never declining the sensitive route or the security pair or skipping a lens past the one-line exception" stays cut. AGENTS.md's protected-set items 1 and 2 lose the same wording.
- The weakness paragraph in `review.md` and its place on the list are cut.

## The owner's words

- On the stops: "I don't want hard stops." A stop that blocked a Dependabot merge, and a trust rule that blocked everything, were "too vague" and "extreme", and "hooks and branch rule sets make a true hard stop where wanted".
- On the weakness rule: plans are no longer public, since "everything is planned on linear, which is private", so it should be "a checkpoint at most", and the owner leans "towards removing it".
- On the Checkpoints clause: "this makes me use the security pair more than I want", and the decision is the owner's at manual level, or the lead's at level three.
- On what sets a level: a rule that only chat can set one is "exactly what will make me rage quit". That moved to PACT-50.

The quotes are on PACT-42 (the ticket and its comments) and PACT-50.

## Consequences

- **Weakened controls, for the owner at merge:** the hard stops for a merge touching hooks, settings or CI, an outside pull request, marking text ready, a permission bypass and a withheld security pick are gone, as is the weakness rule and the push read. The Test and protected-set comments on PACT-42 list the open findings, all `security?` and open for the owner.
- **Left for PACT-50:** `docs/threat-model.md` still names hard stops as a control, the install NOTE still says only hard stops wait, and the word "level" is not yet defined in the pact's text.
- **Rollback:** revert the merge, rerun `node cloud-sessions/gen.mjs`, `node builder/build.mjs` and `node builder/default-config.mjs`, and reinstall from the dry run after the four checks in [Roll back to an older version](../install.md#roll-back-to-an-older-version).
