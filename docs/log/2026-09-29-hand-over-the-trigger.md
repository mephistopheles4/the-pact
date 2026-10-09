# Handing the owner the trigger: built, installed, and half shown to work

**2026-09-28 to 2026-09-29** — The pact now tells the model to hand the owner a `▶ Your move: type /<skill> <argument>` line when a move reaches a user-only skill, and reads a main-session build as the owner's call rather than a ban ([ADR 0009](../adr/0009-hand-over-user-only-skills.md)). It was built, installed, and probed. The main-session hand-off works in an interactive session. The move-1 hand-off does not: the model reasoned its way past `triage`. That finding, and the owner's rethink it prompted, moved to mephistopheles4/the-pact#12.

## What it set out to do

Five skills the pact names carry `disable-model-invocation`, so only the owner can start them. The pact only said what to do when a skill was *missing*. A cloud session hit the gap, called the skills "not installed", and stopped with no next step. The plan added five wordings to `claude/CLAUDE.md`: the user-only list, the trigger line, a once-per-session response when the owner hands a step back, a rewrite of move 3's main-session sentence, and a line in "What no skill overrides". It also added `scripts/check-skill-flags.ps1`, which warns when the list drifts from the installed skills' flags.

## What each review round caught

1. **Round 1 (draft 1):** `implement` was missing from the user-only list; the drift check broke `gen.ps1`'s rule never to read live config; one wording was a paraphrase where the builder needed exact text; and the offload probes had no control. Draft 2 also folded in the owner's correction: move 3 gates main-session builds, it does not ban them.
2. **Round 2 (draft 2):** the text checks could not fail against the hard-wrapped file; P4 expected the wrong next step (move 2 opens with `grilling`, not `to-spec`); P5 had several correct outcomes; the trigger line and the fresh-session hand-off both claimed the end of the turn; and ticket 2's dependency on ticket 1 was unstated.

The owner chose to build from draft 3 without a third paper round.

## What was built

- **`d6a43c4`**, ticket 1 (`spec-builder`): the five wordings in `claude/CLAUDE.md`, verbatim.
- **`06e7cad`**, ticket 2 (`builder`): the same wordings in `cloud-sessions/CLAUDE.cloud.md`, the regenerated cloud scripts, and `scripts/check-skill-flags.ps1`.
- **`result-checker`: CONFIRMED**, with four advisories. A1 (wording 1 said the skills were "yours to start, not mine", inverting the owner's voice) and A2 (a cross-reference said "(above)" for text below) came from the approved plan text. The owner approved the fix, `fd6fd23`. A3 and A4, gaps in how the check script reads YAML forms of the flag and which names count, were left open.

## Installing

Live `~/.claude` matched the last install, `95f67ab`, so nobody had edited it by hand. Only `CLAUDE.md` changed. On the owner's go-ahead it was copied from main (`9dcf6b9`), and all ten live files then matched their repo copies by SHA-256. `settings.overlay.json` is merged, not copied, so it has no live twin to hash. The regenerated cloud script is for the owner to paste.

## What the probes showed

The expected results were committed in the plan before any run (`7ad6e53`). The runs used a local sandbox, `~\pact-probe-sandbox`, with no remote and no instruction files above it. Session A runs P1 to P4 on an issue; session B runs P5 on an approved ticket.

**Control runs, before the install, through `claude -p`** (`5d34076`). The owner asked for them to be driven from this session instead of typed by hand. All five failed, so the probes could count. The P1 session told the owner that `triage`, `to-spec` and `to-tickets` "aren't installed", though its own startup event listed them: the very failure the plan set out to fix.

**Treatment runs, after the install, through `claude -p`** (`f1c003f`). All five still failed, although the transcript shows the new wording reached the model. Headless mode was one suspect: with no human to answer, every `node` call was denied, and the sessions kept building.

**Interactive runs, in desktop sessions the owner started from suggested tasks.**
- **P5 passed** (`7b5a931`). Asked to build the ticket in the main session, it dispatched nothing, built nothing, and ended with `▶ Your move: type /implement plans/ticket-2.md`. The same probe had failed headless. No interactive control was run, so whether this pass counts is the owner's call.
- **P1 failed** (`514953b`). The session rewrote the content itself and dispatched a builder. Its saved reasoning shows why: it knew `triage` was user-only, but inferred from the approved ticket that the work was "likely at move 3 despite no spec file or plan-reviewer trace". The wording tells the model to hand over when a move reaches a user-only skill; nothing tells it that work starts at move 1 unless the tracker shows otherwise.

**Two lessons for probing rules:**
- **Drive rule probes in an interactive session, not `claude -p`.** A headless run has no human to approve anything, which changes what the model does. `AGENTS.md` now says so.
- **Read the saved reasoning, not a post-hoc answer.** The transcript's reasoning showed the real cause of P1's failure. A session asked afterwards tends to give a plausible reason instead.

## What is still open

- **The move-1 gap.** The model can infer its way past `triage`. Moved to mephistopheles4/the-pact#12.
- **The owner's rethink.** Builders hide long work from the owner, so #12 proposes building in the main session, keeping agents for independent reading, and asking the owner for an effort tier (quick, standard, thorough) at the start. That could retire much of this work's hand-over machinery.
- **Check-script advisories A3 and A4.** Not fixed.
- **The cloud script.** Pasting the regenerated script into the cloud environment is the owner's step.

## Record

- `ff2ce80` — verbatim: the plan at draft 1.
- `ce428d0` — verbatim: `plan-reviewer` round 1, on draft 1.
- `1b22b14` — the plan at draft 2.
- `6d1e695` — verbatim: `plan-reviewer` round 2, on draft 2.
- `7ad6e53` — the plan at draft 3, with the probes' expected results, committed before any run.
- `d6a43c4`, `06e7cad` — the build.
- `15f822d` — verbatim: the `result-checker` report on the build.
- `fd6fd23` — the fix for advisories A1 and A2, in the build and the plan.
- `bbc8eda` — the probe record opened, empty.
- `5d34076` — verbatim: the control runs, through `claude -p`.
- `f1c003f` — verbatim: the treatment runs, through `claude -p`.
- `7b5a931` — verbatim: the interactive P5 run.
- `514953b` — verbatim: the interactive P1 run, with the reasoning that skipped move 1.
