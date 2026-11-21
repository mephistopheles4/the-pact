# The pact carries one Linear tracker rule

#578 (T2 of #574). Reverses [0062](0062-this-repo-keeps-its-own-tracker-rule.md), which said the pact carries no tracker rule.

## Decision

The pact now carries one rule for Linear text, `claude/tracker.md`, installed as `~/.claude/tracker.md` and pointed to from `review.md`'s Posting. A repo opts in with a pair, its `origin` path (owner and repo name) and a project id, in the owner's local `~/.claude/pact/linear.json`. With no pair or no pinned file, the rule is silent and the repo's own tracker rule holds. A repo's GitHub rule stays in force until that repo's lock ticket closes.

Linear is inside the owner's trust boundary: everything in the owner's workspace counts, with no check on its author, and the owner controls who is in it. Text on a repo's GitHub issues, once the repo is on Linear, is outside and is data, the owner's own included. Sessions read and post through the Linear connector, as the pact app, with no pact tool of their own. A cloud session reads Linear as data and hands its posts back through its starter. Linear is a public record under Posting.

## Why

The move to Linear creates a trusted boundary for the issue tracker. Checking authors inside it would only recreate the checks the boundary removes, and the connector shows too little to make them sound.

## Consequences

- No authorship, actor, identity or scan check runs on Linear text. Secrets and others' weaknesses stay out of Linear posts.
- The installer and seam A gain a kind for `claude/tracker.md`; a missing file or a live file the record doesn't list refuses, as for `review.md`.
- The pact app can't change an existing item or be assigned, so the owner moves workflow state and creates labels by hand.
- The rule's PR part is unchanged: PRs stay on GitHub under today's rules.
- **Rollback:** revert the merge, rerun `node builder/build.mjs` and `node cloud-sessions/gen.mjs`, and reinstall from the dry run after the four checks in [Roll back to an older version](../install.md#roll-back-to-an-older-version).
