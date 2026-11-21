# Linear counts as the owner's private record

#579 (T3 of #574), standard tier, the sensitive route declined by the owner. Reverses the last sentence of the decision in [0159](0159-the-pact-carries-one-linear-tracker-rule.md): "Linear is a public record under Posting."

## Decision

Linear is the owner's private record, as `claude/tracker.md` and `review.md`'s Posting say, on the owner's words that Linear is a trusted private record, that they invite people in by hand, and that "everything on linear counts, no checks on linear". So Posting's "a record anyone but me can read counts as public" gains "except Linear", and an open security reason may sit on Linear under the private-record rules Posting already has: the line `Owner's call: security` with its why. Others' weaknesses, secrets and withheld items stay out, as of any record.

The threat model says one thing, without naming Linear: the owner's private issue tracker sits inside the trust boundary, and GitHub issue text stays outside it. So whose-text-counts is named for pull request text only, the tracker's account joins the root of trust, and the Posts are public class excepts the tracker.

## Why

Before, an open security reason never left chat and `~/.claude/pact/private/`. The owner decided that a private workspace they control, by manual invite, is private enough, and that the pact's controls are about how the pact works, not how the owner sets up the tracker.

## Consequences

- **This loosens a control.** Who can read an open security reason on Linear is the owner's choice, not the pact's, and a reason posted there stays readable after a revert.
- The pact still forbids a secret in any post.
- It takes effect in live sessions only on an install apply; until then they read Linear as public, the safe side.
- No new accepted class: the threat model's existing entries and out-of-scope lines cover it.
- **Rollback:** revert the merge, rerun `node builder/build.mjs`, `node builder/default-config.mjs` and `node cloud-sessions/gen.mjs`, and reinstall from the dry run after the four checks in [Roll back to an older version](../install.md#roll-back-to-an-older-version). Then show the owner the Linear items holding an `Owner's call: security` reason, to keep or delete.
