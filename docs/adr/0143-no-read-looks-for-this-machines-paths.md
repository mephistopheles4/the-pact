# No read looks for this machine's paths

#506. The read before posting in `claude/review.md` and the read of commits before a push in `AGENTS.md` and `docs/agents/gate-tests.md` no longer look for a path on this machine, or for this machine's names. Both still look for a secret and a personal detail. This amends [0098](0098-the-read-before-posting-looks-for-no-path.md), which kept the push read's path item, and [0095](0095-ci-runs-the-gate-on-windows-too.md), which set it.

## Why

- **The owner asked** (in chat, 2026-11-08): "delete the rules about local paths, it's inevitable and it just creates friction", and "there is nothing secret about the paths you posted".
- **It came back once already.** #368 took paths out of the read before posting. #464 T2 rewrote `review.md` and brought "or a path on this machine" back, with nothing checking the rewrite against #368. The push read's path item dated from #351 and was never removed.

## What stays

- The secret and personal-detail items in both reads, as they were. [ADR 0126](0126-the-pact-has-no-secret-or-personal-data-rules.md) records that the read looked for neither; #449 decides those items.
- Record mode's scrub of test output (`--record`, [ADR 0030](0030-the-gate-suite-runs-through-one-runner-in-named-tiers.md)). It is gate code, and removing it is a spec change of its own.

## The risk

A path that says something about the owner now reaches a post or a push with no read looking for it. The threat model's "Posts are public" line already names a revealing path.
