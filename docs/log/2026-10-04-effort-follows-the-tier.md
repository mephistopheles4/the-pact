# Effort follows the tier

**2026-10-04** — The pact now states one effort value per tier and phase, tells triage to copy the line from that table, and adds one optional step at a stop: rerun the stuck step once at xhigh ([ADR 0013](../adr/0013-effort-follows-the-tier.md)). It was planned, built, installed and probed in one day (mephistopheles4/the-pact#50, PR #66). The settings-line probe failed on the old pact, as it had to. On the new pact it passed two of its three conditions, and the owner accepted that.

## What it set out to do

The owner sets each session's effort when it starts. The pact named a model per phase but no effort per tier, so sessions started at high by habit. That day the owner saw Opus at high used more than the work needed: #35 took seven spec rounds at high that more reasoning did not shorten, while #31 and the #168 research at medium were clean. Nothing told triage which effort to write, and a stuck step could get more reasoning only from a different model (`fable`).

## What was built

- **The table.** `claude/CLAUDE.md`, "Sessions and models", gives quick work Opus low; standard Opus medium to plan and Sonnet medium to build; thorough Opus high to plan and Sonnet medium to build. The security route stays on Opus at high. Work outside the tiers starts at medium.
- **The settings line.** Triage copies the tier's lines from the table. A different value needs one stated reason on the issue. xhigh is never a starting setting.
- **xhigh at a stop.** One sentence, outside the gated stop-and-escalate block, so no gate change: the owner raises effort with `/effort`, reruns the step once and sets it back, which keeps the prompt cache ([ADR 0011](../adr/0011-one-model-per-session.md)). The owner typed `/effort xhigh` once and reported "that command works".
- **The send-back threshold.** A tier's effort goes up one step when two of its first five builds fail move 4 for a reason the owner judges to be reasoning depth. The owner accepted it ("id accept it but how does it fail the move?"), after the session said what failing move 4 means: tests or gates red, `result-checker` REFUTED or INCONCLUSIVE, a reviewer finding that needs a fix, or the owner saying it is not done.

## What the checks showed

- **Tests:** 519 gate tests pass on the branch merged with main.
- **`result-checker`: CONFIRMED**, no findings. Its notes: the install would carry #45's gate changes too; the xhigh check was not yet on record (it is now); and the fit check still says chat work has no suggested effort, which sits oddly beside a quick value. That last point waits for the contract rewrite.
- **`test-reviewer` was not run:** the diff touched no tests, fixtures or checks. The probe plants live on the issue.
- **The xhigh sentence was classified a two-way door** by the owner ("yes it is"), so probe E2 was dropped. Probe E1 stood.

## The probe

E1 plants a standard issue whose settings line says "Build: Sonnet, high" with no reason, then asks a fresh Sonnet-medium session to build it. The expected result has three conditions: it names both values; it proposes the table's line or asks for a stated reason; it does not treat "high" as the rule.

- **Control, old pact: FAIL, as required.** It named both values, then asked the owner to "set high or confirm medium is fine". It met condition 1 only.
- **Treatment, new pact: FAIL on condition 2.** Its first reply was "Fit: tier standard (fits), model Sonnet 5.5 (fits), effort medium (issue suggests high)." It met conditions 1 and 3, then built without proposing the table's line or asking for a reason. The change moved behaviour: the control asked to raise effort to high, the treatment kept medium without asking.
- **The owner accepted this as done.** The orchestrator's recommendation was to let use show whether triage copies the table, in proportion to the cost of the gap: an unflagged settings line, which the owner sees in every fit check.

## What is still open

- **The dogfood record.** Each real build at a lowered tier should record its tier, model, effort and whether move 4 passed first time. No tier has the five builds the threshold needs.
- **Whether triage copies the table.** The probe did not show it; use will.
- **The fit check's chat-work wording** (above).

## Record

Issue comments on mephistopheles4/the-pact#50:

- `5983794600` — the spec. `5983845646` — the owner's two-way-door words. `5983883313` — the threshold acceptance.
- `5983908647` — probe E1's expected result, posted before any run. `5983959859` — the control run. `5984807399` — the treatment run.
- `5984451008` — verbatim: the `result-checker` report. `5984452817` — the xhigh check.

Commits:

- `57ecbb9` — the change and ADR 0013. `8063b50` — the merge of main into the branch.
- `5aa3385` — the merge of PR #66; the install was run from it.
