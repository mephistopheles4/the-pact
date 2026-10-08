# A configuration sets the model and effort of non-security lenses only

A user configuration's `agents` key may set a lens's `model` and `effort`, but only for a lens in the renderer's configurable list. Today that list holds one lens, `integrity-lens`. Every other agent is locked and refused by name.

Superseded by [ADR 0027](0027-every-pact-lens-is-configurable-with-opinionated-defaults.md) (2026-10-08): every pact lens is now configurable, and a security-set lens's override is marked instead of refused.

- **Values:** models `opus` or `sonnet`; efforts `low`, `medium` or `high`. `xhigh` is never a starting setting.
- **How it renders:** the renderer rewrites only the agent file's two frontmatter lines, from those constants. The install script checks that nothing else changed before it installs the file.
- **When the setting is refused at render time:**
  - the lens has gained a tool;
  - it carries a seal;
  - it has an entry in the tool allow-list;
  - the security route or the risk floor names it.

  Any of these would make it security-set.
- **Probe floor:** adding a lens to the configurable list is a spec change, and AGENTS.md puts it on the probe floor.

## Why

- **The owner's ask.** On #97 the owner wanted people to control which model their agents run on: "the config file is the source of truth and people should be able to control their model choice if they want".
- **The security set stays fixed.** By AGENTS.md's definition, a lens is security-set if it holds a shell or network tools, or guards the security route or the risk floor. That leaves only `integrity-lens` today. A security-set lens's model is part of what its security set measures, so a configuration may not move it.
- **The owner accepted the residual risk.** `integrity-lens` also reads the gate's own bad-case tests on security work. A cheaper model there weakens that read, and a Sonnet run may refuse security work partway through, which stops the session. The owner accepted this rather than force Opus on the security route.
- **The guard fails closed.** The configurable list is a gate default that bounds a protected-set rule. A lens that later gains a tool, a seal or a security-route mention falls out of reach without anyone editing the list.

## How this was decided

- **2026-10-07** — Decided in mephistopheles4/the-pact#97.
  - The spec, the security review of the spec and the owner's sign-off are recorded in comments 6045600302, 6045743897 and the decision comment after them.
  - The owner's "your setting applies everywhere" answer was relayed word for word by the lead session.
