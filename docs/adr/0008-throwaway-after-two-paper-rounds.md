# After two paper review rounds without READY, build a throwaway and use it

When a plan has gone through two paper review rounds and `plan-reviewer` still has not returned `READY`, one of the options is to stop reviewing on paper, build a throwaway version, and use it. What the throwaway shows then feeds the plan. **`claude/CLAUDE.md` does not offer this yet.** After two rounds without converging, it offers only three options: keep going, get a second opinion from a different model (`fable`), or stop. Adding the throwaway is follow-up F1.

## Why

- **Some faults only show in use.** A paper review reads the plan's text against the rules. It finds a fault only once someone imagines the case that triggers it, so each round tends to find one more. A throwaway in use meets real cases directly, instead of waiting for a reviewer to imagine each one.
- **The 2026-09-27 gate plan went five paper rounds for that reason.** Each `plan-reviewer` round found one more rule that, read literally, fired on routine work: the relay on every read-only return, then the gate on `builder`'s own design calls, on auth changes, on reviewer dispatches, and finally on the re-task that carries the owner's answer. With no throwaway on offer, the choices after round two were to keep going, ask `fable`, or stop, and after round 4 the owner chose to keep going. See [the human-in-the-loop gate log](../log/2026-09-27-human-in-the-loop-gate.md).
- **Two rounds is where the pact already draws the line.** "The build or review has gone round twice without converging" is an existing stop signal. This decision adds a way forward at that stop; it does not move the stop.
- **From the owner's private research,** where it is settled. It predates this repo.

## How this was decided

- **2026-09-27** — The coherence check between the pact and the owner's private research found this rule settled there and not reflected in `claude/CLAUDE.md`. The owner decided that this ADR records it now, and the `claude/CLAUDE.md` change is queued as follow-up F1, with its own plan. Recorded in the ADR/log plan in `c115eee`.
- **2026-09-27** — The check and the owner's call are told in [the ADR and log entry](../log/2026-09-27-adr-and-log.md).
- **Not yet in the pact's text:** until F1 lands, a session that follows `claude/CLAUDE.md` will not offer this option on its own.
