# Checkpoints never wait

#564, standard tier on the sensitive route. The `checkpoint-stops` switch is retired: a checkpoint is only a report, in every configuration, project and cloud session. The "Checkpoints wait" line leaves `claude/CLAUDE.md`, with three Guards sentences that had effect only where checkpoints wait (the standing goal's "Under it, no checkpoint waits", a started session's wait on its holder's reply, and the free hand's own-pick grant). The free hand's definition stays; its retirement is #565. `claude/review.md`'s read-back bullet loses "whether or not checkpoints wait".

`gate/render-core.mjs` and `gate/install-core.mjs` drop the setting, its part and its project line. A key that is still set, `true` or `false`, in a user, default or project file is ignored with a `RETIRED-SETTING` line and a dry-run WARN; any other value is refused with a fixed message. Every home dry run prints one NOTE saying checkpoints never wait (ADR 0157). The builder, its page, the six presets and `builder/default-config/` lose the key; a file or preset that holds it loads with a page note.

`CONTEXT.md`, `docs/rule-reasons.md`, `docs/install.md`, `docs/agents/install.md`, `README.md`, `claude/commands/scry.md` and three eval criteria are updated, and ADR 0157 records the decision. The generated files `builder/scriptorium.html`, `builder/default-config/` and `cloud-sessions/` are refreshed. The text of `AGENTS.md` and `docs/threat-model.md` is unchanged, though its effect is weakened, as ADR 0157 says.

**Rolling back:** revert the merge, rerun the three generators and reinstall after the four checks in [Rolling back](../agents/install.md#rolling-back). Cloud sessions run the old rules until the owner pastes the rebuilt `cloud-setup-wrapper.sh`.

## Record

- The ask: https://github.com/mephistopheles4/the-pact/issues/564
- The approved plan, spec revision 3: https://github.com/mephistopheles4/the-pact/issues/564#issuecomment-6840727615
