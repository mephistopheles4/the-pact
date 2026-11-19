# The pact carries one Linear tracker rule

#578 (T2 of #574), thorough tier on the sensitive route: whose-text-counts is an authorization control. Reverses [0062](0062-this-repo-keeps-its-own-tracker-rule.md), which said the pact carries no tracker rule.

## Decision

The pact now carries one rule for Linear text, `claude/tracker.md`, installed as `~/.claude/tracker.md` and pointed to from `review.md`'s Posting. A repo opts in with a pair, its `origin` path (owner and repo name) and a team key, in the owner's local `~/.claude/pact/linear.json`. With no pair or no pinned file, the rule is silent and the repo's own tracker rule holds. A repo's GitHub rule stays in force until that repo's lock ticket closes.

Under the rule, only the owner's own typing counts as the owner's. A comment, issue body, label or workflow state counts when the named read shows the owner's user id as author or actor, every provenance field null, and no edit by anyone else. The pact app's posts, bot writes and migrated items are data. The "Owner decision, from chat" mark is dropped in Linear. A cloud session reads Linear as data and hands its posts back through its starter. Linear is a public record under Posting.

## Why

A private workspace removes outsiders' tracker text, but Linear credits any holder of the connector or a key to the owner, so GitHub's "the owner's account" test does not carry over. The rule counts what a session can verify: the id and provenance fields the read returns.

## Consequences

- The installer and seam A gain a kind for `claude/tracker.md`; a missing file or a live file the record doesn't list refuses, as for `review.md`.
- The rule names `poster.mjs linear-read` and the poster's Linear surfaces, which T4 builds. Until then a read counts for nothing and nothing is posted to Linear.
- The pact app can't change an existing item, so the owner moves workflow state and creates labels by hand.
- The rule's PR part is unchanged: PRs stay on GitHub under today's rules.
- **Rollback:** revert the merge, rerun `node builder/build.mjs` and `node cloud-sessions/gen.mjs`, and reinstall from the dry run after the four checks in [Roll back to an older version](../install.md#roll-back-to-an-older-version).
