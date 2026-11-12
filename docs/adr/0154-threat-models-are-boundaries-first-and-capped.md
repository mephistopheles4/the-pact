# Threat models are boundaries first, the machine is out of scope, and each is capped at 3,000 words

Security rulings kept coming back to the owner because the rules said what to fear, not which control already holds each boundary (#542). From this decision, review.md holds one guide, `## The threat model`, that every session and the security pair follow before they sort a finding as security, write a guard, bring the owner a ruling, or publish a weakness in someone else's software. The guide places a finding on a boundary, names the control that holds it against that path, checks the residual against the accepted classes, and brings the owner a new boundary, a residual no class covers, a removed or weakened control, a scope change and every `security?` row. What starts and ends on the machine is the machine's, and no finding; what came in from outside stays outside input wherever it sits. Each project's threat model is rewritten boundaries first, one file of at most 3,000 words. The cap is set in each project's threat model and its test (tickets #544 and its sibling repos' tickets), not in the guide. This ticket, #543, ships the guide and the pact payload changes.

This amends [ADR 0024](0024-the-data-lens-checks-encryption-and-approved-flows.md): data-lens's encryption step reads "even on the machine, … past a boundary", its flows step reads "outward flows", and its threat-model step moves first and reads the guide. It constrains [ADR 0132](0132-the-threat-model-holds-accepted-threat-classes.md): the fix-in-passing clause of "Accepted threat classes" moves from the rules file to step 4 of the guide, and a class, one line there, becomes one sentence of at most 40 words, a limit that today lives in `CONTEXT.md` and in the threat models #544 and its siblings rewrite, not in the rules file.

## Why

The owner's words, in chat with the session leading the work: "anything inside the machine or processed by the machine is the machine's problem", and "I think that updating the threat model is probably not going to be enough ... we need a piece that explains to agents how the threat model works and how to work with the boundaries." On the cap: "I've seen models completely explode the threat model, and I bet that a lot of them avoid reading it when it becomes too large." Of the publish rule: "Okay, let's add it."

## Considered options

- **Rewrite the threat models only.** Rejected: the boundaries already existed and sessions still proposed them again, so the gap is how a session works with them.
- **Put the guide in the rules file.** Rejected: it would break the rules file's word budget (ADR 0129). The rules file points to review.md, which the lenses are handed.
- **Guard the machine too.** Rejected: nothing on the owner's computer is outside it, and the machine's own controls (account isolation, disk encryption, antivirus) hold it.

## Consequences

- **The protected set grows by one rule.** The guide is cut or weakened only by the protected-set route (`AGENTS.md`). The security lenses' four carried rules are untouched, byte for byte.
- **Outside input stays outside.** A cloned repo's file, an installed plugin, and what anything on the machine makes from outside input are not the machine's. The narrowing does not launder them.
- **A weakness in someone else's software** is published only once its maker's public tracker holds it or the owner has reported it privately.
- **The lens text is trimmed to fit 300 words each.** No budget is raised.
- **No claim measures whether the guide changes behaviour.** It is noted, not built.
- **The install, `cloud-sessions/cloud-setup-wrapper.sh` included, applies only on the owner's go-ahead in chat.** Cloud sessions keep the old rules and lenses until the owner pastes the rebuilt wrapper.
- **Rollback:** revert the merge, then reinstall after the four checks in [Rolling back](../agents/install.md#rolling-back).
