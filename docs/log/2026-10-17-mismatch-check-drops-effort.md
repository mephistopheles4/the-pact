# The mismatch check drops effort

**2026-10-17.** Tier: quick.

## What was built (#306)

- **The rule.** "Say a mismatch first" in `claude/CLAUDE.md` names the tier and the model only. A session cannot read its own reasoning effort reliably: twice in one day, sessions started at high effort reported a lower one while the app's read-back showed high. Where effort matters, the person or a lead session reads it from the app's session settings.
- **The cloud copy.** `gen.mjs` was rerun; `cloud-setup-wrapper.sh` changed, so it is pasted into the cloud environment's setup field again after merge.
- **No ADR.** The change narrows one bullet; the reason is recorded here and on the issue.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/306)
