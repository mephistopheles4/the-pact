# Right-size the probe rule

**2026-10-05** — AGENTS.md's testing section now sizes the evidence to the cost of being wrong: a planted probe on a security floor, proof by use for everything else, and depth as the owner's dial ([ADR 0014](../adr/0014-evidence-in-proportion-to-the-cost-of-being-wrong.md)). It was specced and built in one day (mephistopheles4/the-pact#67). The owner waived this change's own planted probe.

## What it set out to do

On 2026-10-04 the old rule made small changes heavy. #45, #50 and #52 each needed a planted probe with a control. #45's probe (#63) took a design session and two review rounds before the owner stopped it: "What even is the risk of this if the thing doesn't exist and it just goes on then that's just a lost cause and start over the session". A misbehaving session usually costs one restart, yet the rule spent its heaviest evidence there.

## What was built

- **A floor and a default.** The floor bullets keep their wording and still need a planted probe seen to fail. Everything else is proved by use: tests and gates pass, a reviewer reads it at move 4, standing measures are recorded where they apply.
- **The dial.** The owner may ask for a probe or a closer look on any change. Silence means the default. Nobody can go below the floor.
- **Doubt.** Unclear whether a change is on the floor means it is. Doubt about anything else falls to the default.
- **The section itself.** Only a change that loosens a floor rule is on the floor. The old "anything in this whole section" clause is the one floor wording that changed.
- **Removed.** The two-way-door bullet and the "owner classifies" bullet. "Running a probe" and "The protected set" are unchanged.

## What the checks showed

- **Tests:** 519 gate tests pass.
- **`result-checker`: CONFIRMED.** Every floor item survives with the same requirement. Its one advisory, a missing blank line before "Running a probe", was fixed.
- **`test-reviewer` was not run:** no tests, fixtures or check configuration changed.
- **No probe.** The owner waived it ("Waive it"), as a one-off for this change, not a rule.

## What is still open

- **Whether the default holds up in use.** The standing measures will show it.
- **The contract rewrite (#74)** still covers the pact's own CLAUDE.md, outside this change.

## Record

Issue comments on mephistopheles4/the-pact#67:

- `5986696952` — the owner's waiver. `5986697097` — the spec.
- `5986747548` — verbatim: the `result-checker` report. `5986747697` — the move-4 checks.
