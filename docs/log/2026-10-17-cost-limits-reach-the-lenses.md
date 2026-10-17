# Cost limits reach the lenses

**2026-10-17.** The last ticket of #278. The rules, the review procedure and the nine lens contracts now carry the Cost limits that T1 (#287) and T2 (#288) put in place, and the owner's direction on accepted risks (#300) is built in. Tier: thorough.

## What was built (#289)

- **The rules text.** A Trade-off points rule replaces "Name both sides", a Business drivers rule says where the driver comes from, "accepting a risk" joins the decisions that are always the owner's, and a matched accepted risk is reported as one line marked accepted by the threat model, not dropped.
- **The review procedure.** What each lens is handed, the running count in a trade-off row's reason text, finding the threat model at the base, the session's check of every diff for a threat-model edit, the accepted-risk step, the sorting, and a Trade-offs slot in the report and the review comment.
- **The nine lens contracts** carry the trade-off outcome; the security pair also carries the ALARP bar, the definition of a security finding, the before-the-change rule, the one-line listing, the undated and weakened entry rules, and the detail level. The carried rules of the protected set are untouched.
- **The threat model** names what counts as security and the public-record detail level, and R31 now covers a committed threat model's entries.
- **The cloud copy** was regenerated and `cloud-setup-wrapper.sh` changed.

## Decisions

- [ADR 0077](../adr/0077-a-security-fix-is-due-unless-grossly-out-of-proportion.md), [ADR 0078](../adr/0078-a-projects-cost-limits-are-the-second-allowance-that-is-not-only-tighter.md) and [ADR 0079](../adr/0079-a-cost-reaches-lenses-only-through-enough.md).

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/289)
- [The spec, revision 5](https://github.com/mephistopheles4/the-pact/issues/278#issuecomment-6205162535)
- [The owner's direction on accepted risks, #300](https://github.com/mephistopheles4/the-pact/issues/300)
- [The plan](https://github.com/mephistopheles4/the-pact/issues/289#issuecomment-6234385149)
- [The QA pair's review](https://github.com/mephistopheles4/the-pact/issues/289#issuecomment-6234665986), [the gatekeeper's](https://github.com/mephistopheles4/the-pact/issues/289#issuecomment-6234666303) and [the standards pair's](https://github.com/mephistopheles4/the-pact/issues/289#issuecomment-6234666664)
- [The Lens dispositions](https://github.com/mephistopheles4/the-pact/issues/289#issuecomment-6234668708)
