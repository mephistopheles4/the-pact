# Hand the owner the trigger for a user-only skill

When a move reaches a skill that carries `disable-model-invocation` (`triage`, `to-spec`, `to-tickets`, `wayfinder`, `implement`), the model stops and ends its turn with one line: `▶ Your move: type /<skill> <argument>`. It does not read the skill's `SKILL.md` and follow it instead. If the owner hands the step back, the model asks for the owner's own call once per session, says in one sentence what is handed over, and then does the step by hand, saying which skill's procedure it did not use. A main-session build is the normal route: a session opened on an approved spec or ticket starts building directly, and the owner may still type `/implement`.

## Why

- **The pact had no rule for an installed skill the model can't run.** It covered only a *missing* skill. A cloud session on 2026-09-28 found the five skills unusable, reported them as not installed, and had no next step. The flag is the skill author's choice; reading `SKILL.md` to get around it would silently undo it.
- **A fixed last line is findable.** The owner asked for an unmistakable trigger. The same shape, always last, with the argument filled in, keeps the one bit of friction worth keeping: typing the command.
- **The offload response follows the evidence on cognitive offloading.** A short note right after an offload, that informs rather than instructs and never repeats, reduced offloading; recording one's own call before seeing the AI's reduces overreliance. Once per session, because a repeated cue turns into nagging.
- **Move 3's old sentence kept being read as a ban.** Agents and reviewers both took "Don't build a ticket in the main session … unless I choose that" as forbidding it. The new sentence names the permission and then the condition.

## Status

Installed 2026-09-29. Probed in [the hand-over-the-trigger log](../log/2026-09-29-hand-over-the-trigger.md): the main-session build hand-off (P5) works in an interactive session, but the model can still infer its way past move 1 when part of an issue looks already approved (P1). That gap, and a proposal that may retire builders and replace much of this machinery with an effort tier, are in mephistopheles4/the-pact#12. [ADR 0010](0010-build-in-the-main-session-with-process-tiers.md) has since updated the main-session clause (2026-09-30): a build session builds directly and does not hand over `/implement` first. The rest of this ADR stands, except as [ADR 0028](0028-the-moves-name-practices-a-person-binds-their-own-skills.md) updates it (2026-10-08): the trigger rule stands, but the fixed list of five skills gives way to the binding convention. A configuration block now marks a step as the owner's by writing it as a command (`/name`), and the `▶ Your move` line also marks a phase boundary.

## How this was decided

- **2026-09-28** — The plan went three drafts with two `plan-reviewer` rounds; the owner corrected draft 1 (move 3 gates main-session builds, it does not ban them) and chose to build from draft 3 without a third review.
- **2026-09-28** — `result-checker` confirmed the build; the owner approved fixing its two wording advisories (the inverted "you/me" voice and a wrong "(above)").
- **2026-09-29** — Installed on the owner's go-ahead; the probes and their outcome are in the log.
