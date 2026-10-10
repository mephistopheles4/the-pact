# Evidence in proportion to the cost of being wrong

Superseded in part by [ADR 0045](0045-agent-and-rule-changes-are-proved-by-review-not-by-probe.md) (2026-10-10): its floor no longer needs a planted probe; it takes the security route. Its default, its dial and its doubt rule still hold.

AGENTS.md's "Testing a change to an agent or a rule" now has a floor and a default:

- **The floor needs a planted probe, seen to fail.** The floor is the risk floor, the security route, the gated clauses, the protected set, security-set lenses (with their security-set rerun and rescoring), non-lens agents with a shell or network tools or that guard the security route or risk floor, the tool allow-list, the settings guard, and the gate's code (with its own bad-case tests). A change to the section itself is on the floor only if it loosens a floor rule.
- **Everything else is proved by use.** The repo's tests and gates pass, a reviewer reads the change at move 4, and the standing measures are recorded where they apply.
- **Depth is the owner's dial.** The owner may ask for a planted probe, or a closer look, on any change. Silence means the default. Nobody can go below the floor.
- **Doubt falls the safe way for security only.** Unclear whether a change is on the floor means it is. Doubt about anything else means the default.

The two-way-door bullet, which held a classification until the owner's quoted agreement, is gone. The default and the dial do its job.

## Why

- **The old rule spent its heaviest evidence where being wrong is cheap.** When a session misbehaves after a rule change, the usual cost is one wasted session that the owner restarts. #45, #50 and #52 each needed a planted probe with a control; #45's (#63) took a design session and two review rounds before the owner stopped it.
- **Probes are worth it where a miss is expensive or silent.** That is the security floor. A security hole does not announce itself the way a bad session does.
- **Probabilistic behaviour can't be enumerated.** The owner: "we're never going to find every case out there especially when it comes to AI and how probabilistic it is".
- **Depth is the owner's choice.** Someone can delegate everything, and someone can dig as deep as they like. Security is the exception, where every corner gets checked.
- **The floor wording did not change.** Each floor bullet keeps its requirement, so a reviewer can compare it with the old text. The one edit is the section clause, which now reads "a change to this section that loosens a rule on this floor".

## How this was decided

- **2026-10-05** — Decided in mephistopheles4/the-pact#67. The owner waived this change's own planted probe ("Waive it"); it edits the testing section, which the old rule put on the probe list.
