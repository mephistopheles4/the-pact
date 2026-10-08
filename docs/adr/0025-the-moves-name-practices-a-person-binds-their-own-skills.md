# The moves name practices; a person binds their own skills

The default rules file (`claude/CLAUDE.md`) describes each move as a practice: what the owner does, what the agent does, and why. It names no skill outside the gated clauses. Agents keep their names, because the lenses, `scout` and the reviewers are part of the pact's own checks. A person brings their own skills through configuration blocks in a move's open part.

## The binding convention

A block names a skill in one of two forms. The form says who starts it.

- **A code span (`name`)** is a skill the agent uses for that step. The agent loads it itself.
- **A command (`/name`)** is a skill only the owner starts. The agent stops at that step and ends its turn with `▶ Your move: type /<skill> <argument>`. It never reads the skill's `SKILL.md` and follows it instead.
- **What counts as a command.** A code span whose text is a `/` followed by a name (a letter or digit, then letters, digits, `.`, `_` or `-`). A bare /name in prose, a placeholder such as `/<skill>`, and a code span holding more than the command do not count.
- **A missing skill.** If a bound skill is not installed, the agent does the step as the move describes it and says in one line which skill was missing. A missing agent still stops the work.

## The phase-boundary line

A step is also the owner's to start at a phase boundary, with no skill bound. The line is `▶ Your move: start a fresh session with: <start line>`, and the start line names the issue, ticket or plan file. The line comes last. The pact already ended a session at a phase boundary with a start line; this gives it the same `▶` form as a bound command.

## Why

- **The pact should stand on its own practice.** A rules file that routes every step to named skills reads as a wrapper around one person's tools, and a person without them cannot follow it. The fallback "do the step by hand" left them no description of the step. Each move now says what the step is and why.
- **A fixed list of skill names cannot hold the hand-off rule.** [ADR 0009](0009-hand-over-user-only-skills.md) listed five user-only skills. A skill that only the owner may start is hidden from the model's skill list, so the model can learn of it only from the rules text. The block that binds the skill now carries that knowledge, and the command form is both what the owner types and what the skill-flag check can test against the skill's `disable-model-invocation` flag.
- **Binding one's own tools needed an empty slot.** The configuration (#53) and the builder (#97) put a person's skills into a move's open part. While the default text named other skills there, a person either replaced whole moves or ended up with two tools for one step.
- **The agent's confidence does not pick the tier.** The agent proposes the triage and the tier, and the owner decides. Agent self-assessment errs toward overrating its own success (Kaddour et al., 2026).
- **The agent questions the owner until the idea is clear.** Questions a model asks draw out better specifications than the prompts people write unaided (Li et al., ICLR 2025). Move 2 states the practice, not a skill that carries it.
- **The owner keeps control of the work.** Developers who stay in control of agentic work are the case Huang et al. (2025) study. The friction the pact keeps, typing the command and starting the fresh session, is the owner's deliberate act at each boundary.
- **Build test-first at the agreed seams.** Test-first development reduces defects at a cost in time (Nagappan et al., 2008). Move 3 states the practice and leaves the tool to the person.
- **The owner needs a minimum level of understanding to own the result.** Lin et al. (2026) argue for such a minimum. Move 4 and the owner's "done" stay as they are, and a gated clause still holds each rule that must hold, because skills are advisory and a policy that must hold needs a deterministic check.

## What does not change

- **Every gated clause stays word for word,** including `stop-and-escalate`, which keeps the word "prototype". No clause file or gate code changes, so this decision takes no planted probe and no security route.
- **The agents stay named in moves 1 to 4,** so the gate's routing check still passes.
- **The repo's own tooling docs** (the Agent skills section of `AGENTS.md` and the docs in `docs/agents/`) describe how this repo uses one skill collection. They configure the-pact's own work, not the pact.

## Status

Decided 2026-10-08 in mephistopheles4/the-pact#123 (spec revision 2, "fix, then proceed"). The rules text landed in #126. This ADR updates the status of [ADR 0009](0009-hand-over-user-only-skills.md): the trigger rule stands, and the fixed list gives way to the binding convention above. The way back, if the new text makes sessions skip steps: bind the "Matt Pocock's skills" preset set (once #127 lands it; install waits for that), or empty the live edit list and reinstall the previous commit.

## How this was decided

- **2026-10-08** — The owner asked for each move to say what the person and the agent must do and why, with no skill named. The spec went through the spec pair and `unstated-lens`; the owner decided "fix, then proceed", and the decision is in #123 (spec revision 2 and its correction). The ticket for this record is #129.
- **Sources.** Kaddour et al. 2026; Li et al., ICLR 2025; Huang et al. 2025; Nagappan et al. 2008; Lin et al. 2026.
