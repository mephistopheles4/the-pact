# Show the next move as a choice

**2026-10-04** — When a session proposes a tier or the next move, it now shows the live options side by side instead of handing over one command. Usually there are two or three, such as build now, prototype, spec first or triage. Each gets one line on when it fits and the risk it carries: what could go wrong, and what it costs to recover. The recommended option is marked, with why. The change is a new paragraph in `claude/CLAUDE.md`, "Show the next move as a choice" (mephistopheles4/the-pact#73, merged as a42c22b).

## What it set out to do

The owner's idea: a session that suggests the next move should show it as a choice, weighed by risk, instead of handing over one command as if it were the only path. It borrows the vocabulary of ATAM (the Architecture Tradeoff Analysis Method), risks and tradeoffs, without its process.

## How it was built

- **Quick work in chat, with no issue.** The PR itself carried the change.
- **The new paragraph.** It names the options, when each fits, its risk, and the recommended one. Two limits stay in place:
  - **The risk floor still sets the tier** for risky work. The choice shows what is open within it.
  - **A `▶ Your move` line,** when there is one, still comes last.
- **Move 1 points at it.** The first reply on an unlabelled issue is the fit check and a proposed tier, shown as that choice.
- **No gated clause changed.**

## What the checks showed

- **Tests:** 519 gate tests pass.
- **Proved by use.** The owner classified it as a two-way door under the probe rule of the time, so it got no planted probe. Asked "do you agree this is a two-way door, so it gets no planted probe and is proved by use?", the owner replied "looks good, merge it and install it". The two-way-door bullet was later replaced by [ADR 0014](../adr/0014-evidence-in-proportion-to-the-cost-of-being-wrong.md), under which this change is proved by use by default.

## Record

Comments on mephistopheles4/the-pact#73:

- `5985258578` — the owner's two-way-door classification and go, word for word.
