# Effort follows the tier

The pact states one effort value per tier and phase, and triage copies it into the issue's settings line:

| Work | Plan | Build |
| --- | --- | --- |
| Quick | none | Opus, low |
| Standard | Opus, medium | Sonnet, medium |
| Thorough | Opus, high | Sonnet, medium |
| Security route (any tier) | Opus, high | Opus, high |

A different value needs one stated reason on the issue. Work outside the tiers starts at medium. xhigh is never a starting setting. At a stop, one more option is to rerun the stuck step once at xhigh: the owner raises it with `/effort` and sets it back.

## Why

- **High by habit cost more than it bought.** #35 took seven spec rounds at high that more reasoning did not shorten, while #31 and the #168 research at medium were clean.
- **High effort stays where the risk is.** The security route keeps Opus at high ([ADR 0010](0010-build-in-the-main-session-with-process-tiers.md)), because the cost of a miss is highest there.
- **Changing effort keeps the prompt cache** ([ADR 0011](0011-one-model-per-session.md)), so an xhigh rerun costs reasoning, not a cache rebuild.
- **Copy, don't choose.** A rule triage copies makes a fit-check mismatch mean something.
- **Reversible.** The effort values are a choice that can go back up. Each real build at a lowered tier records its move 4 result on its issue. A tier's effort goes up one step when two of its first five builds fail move 4 for a reason the owner judges to be reasoning depth. A build fails move 4 when tests or gates go red, `result-checker` returns REFUTED or INCONCLUSIVE, a reviewer raises a finding that needs a fix, or the owner says it is not done.
- **No gated clause.** The xhigh sentence sits outside the gated stop list, so no gate change is needed. The owner classified it as a two-way door ("yes it is", on #50).

## How this was decided

- **2026-10-04** — Decided in mephistopheles4/the-pact#50 and built there. The send-back threshold was accepted by the owner at the build start.
