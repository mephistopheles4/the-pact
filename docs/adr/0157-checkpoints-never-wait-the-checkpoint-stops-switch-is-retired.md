# Checkpoints never wait; the checkpoint-stops switch is retired

#564, standard tier on the sensitive route. The owner said, in chat on 2026-11-13: remove the switch, a checkpoint is just a report. [0155](0155-checkpoints-are-events-hard-stops-wait.md) made a checkpoint the session's own logged pick, unless the `checkpoint-stops` setting kept it a stop; the setting was on unless a configuration turned it off. This decision removes the setting. In every configuration, project and cloud session, a checkpoint is the session's own pick, logged as review.md's Posting says, flagged and listed in the result, and the work goes on. Hard stops wait for the owner's own typed words, as before.

It amends [0155](0155-checkpoints-are-events-hard-stops-wait.md) (the setting, its default and its rollback), [0156](0156-a-pending-read-back-makes-no-work-wait.md) ("under both values") and [0149](0149-a-free-hand-answers-offers-and-design-questions-with-the-sessions-own-pick.md) (the free hand's grant, now the Checkpoints bullet's).

## What changes

- **The rules file.** The "Checkpoints wait" line and its marks go. Three Guards sentences went with it, since each had effect only where checkpoints wait: the standing goal's "Under it, no checkpoint waits", a started session's "where checkpoints wait, it sends you its checkpoints and waits for your reply, logged as yours", and the free hand's "Under it, take your own pick on lens offers, the sensitive route and intent or design questions", which was its only grant. The free hand's definition stays, because the hard stops, review.md's weakness rule and Checkpoint log, `AGENTS.md`'s mise rule and the protected set all name it. `review.md`'s read-back bullet loses "whether or not checkpoints wait".
- **The renderer and installer.** The setting, its part and its project line are gone. A configuration or a project file that still sets the key, `true` or `false`, is ignored and warned about, never refused: the render prints `RETIRED-SETTING checkpoint-stops <true|false>`, and the dry run prints a WARN that says the pact retired it, and, for `true`, that checkpoints no longer wait. Any other value is refused with a fixed message that never echoes it. A project file whose only content is the key still renders, with no setting line, so a project install replaces the old "Checkpoints wait" project line. An `edits` entry that targets the mark is refused as an unknown mark.
- **A note on every home dry run.** One fixed NOTE, "checkpoints never wait; each is the session's own logged pick, and only hard stops wait for you (ADR 0157)", so whoever loses the wait is told at the install's hard stop.
- **The builder.** A saved file or preset that holds the key drops it with a page note; the presets and `builder/default-config/` lose it; a file the page saves never holds `settings`.
- **Copies.** `CONTEXT.md`, `docs/rule-reasons.md`, `docs/install.md`, `docs/agents/install.md`, `README.md`, `claude/commands/scry.md`, three eval criteria, and the generated files (`builder/scriptorium.html`, `builder/default-config/`, `cloud-sessions/`).

## For the owner at merge

- **A removed control.** The configured wait goes for every configuration that had it on: those that leave the key out, the level-1 and level-2 presets, any project file that set `true`, and cloud sessions. They take checkpoints alone: findings' dispositions, control removals, the tier, the route and a merge not on the hard-stop list. The accepted class "A session takes checkpoints alone" covers this, and its text is unchanged; its reach grows from the configurations that set `false` to all of them.
- **Data handling.** In every configuration, a session now settles alone what a change stores, logs or sends. It may leave a data-lens finding open, shown in a public record only by the "Owner's call: security, see chat" marker. A secret stays a hard stop. The threat model's detail names only "a free hand's design pick" for this.
- **The protected set and the class, in effect.** The text of `AGENTS.md` and `docs/threat-model.md` is unchanged. Items 1 and 2 of the protected set hold their owner-holds "where the rules file says checkpoints wait", and the rules file never says that now, so those holds apply nowhere. The class's detail "acts on its starter's reply" is narrowed, since a started session no longer waits on that reply for checkpoints. Reworking that text is #565.
- **The lost lever.** [0155](0155-checkpoints-are-events-hard-stops-wait.md) named setting `checkpoint-stops: true` as the way back to waiting. After this change, the only way back is reverting the code. A project can no longer make a risky repo wait. A narrowing in chat still keeps a named step for the owner.
- **The read-back.** The intent read-back stays `pending`: "remove the switch, a checkpoint is just a report".
- **Projects installed before this keep their "Checkpoints wait" project line** until each is installed again. Run each project's install once after the user install.

## Considered options

- **Refuse a configuration that still sets the key.** Rejected: all six presets and every preset-saved configuration set it, so every install would fail; the retired agent's precedent (#302) is a warning.
- **Retire the free hand too.** Left out: the brief limits the cut to the switch, and retiring it touches the protected set. Filed as #565.

## Consequences

- **A merge touches `gate/`, and widens a class's reach,** so it is the owner's hard stop, as is the install apply.
- **Rollback:** revert the merge, rerun `node builder/build.mjs`, `node builder/default-config.mjs` and `node cloud-sessions/gen.mjs`, and reinstall from the dry run, after the four checks in [Roll back to an older version](../install.md#roll-back-to-an-older-version). A pact from #556 up to this change makes a configuration without the key wait again, since that pact's default is `true`, and refuses a project file that sets the key `false`.
