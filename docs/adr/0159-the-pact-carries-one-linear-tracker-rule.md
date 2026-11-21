# The pact carries one Linear tracker rule

#578 (T2 of #574), thorough tier on the sensitive route: whose-text-counts is an authorization control. Reverses [0062](0062-this-repo-keeps-its-own-tracker-rule.md), which said the pact carries no tracker rule.

## Decision

The pact now carries one rule for Linear text, `claude/tracker.md`, installed as `~/.claude/tracker.md` and pointed to from `review.md`'s Posting. A repo opts in with a pair, its `origin` path (owner and repo name) and a project id in the one team, in the owner's local `~/.claude/pact/linear.json`. With no pair or no pinned file, the rule is silent and the repo's own tracker rule holds. A repo's GitHub rule stays in force until that repo's lock ticket closes.

Sessions read and post through the Linear connector, as the pact app, with no pact tool of their own. Only the owner's own typing counts as the owner's: a comment counts when its `author` is the owner's user id and `onBehalfOf` is empty. An issue body is data, and a label, state or project counts only when the read shows the owner as its actor. Every other author is data, whatever Linear features are on: the pact app, bots, integrations, invited members and migrated items. The "Owner decision, from chat" mark is dropped in Linear. A cloud session reads Linear as data and hands its posts back through its starter. Linear is a public record under Posting.

## Why

A private workspace removes outsiders' tracker text, but Linear credits any holder of the connector or a key to the owner, so GitHub's "the owner's account" test does not carry over. The rule counts what a session can verify: the author the connector returns.

## Consequences

- The connector shows no edit, sync or bot flag, and no actor for a label, state or project change. This loosens the earlier read, which named those fields. The app's create-only token can't edit a comment; no feature is switched off for the rest. One gap remains: a feature that writes under the owner's own account, such as a linked GitHub or Slack identity, looks like the owner's typing, so the owner attests to such links, an app or connector signed in as the owner included, and a session that sees one tells the owner. Flagged for the security pair.
- The installer and seam A gain a kind for `claude/tracker.md`; a missing file or a live file the record doesn't list refuses, as for `review.md`.
- Linear posts don't go through the poster, so Posting has a session run each body through the poster's `issue-comment` dry run for its scan before posting. The pact app can't change an existing item or be assigned, so the owner moves workflow state and creates labels by hand.
- The rule's PR part is unchanged: PRs stay on GitHub under today's rules.
- **Rollback:** revert the merge, rerun `node builder/build.mjs` and `node cloud-sessions/gen.mjs`, and reinstall from the dry run after the four checks in [Roll back to an older version](../install.md#roll-back-to-an-older-version).
