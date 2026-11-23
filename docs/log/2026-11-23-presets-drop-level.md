# The presets drop "Level N"

PACT-72, quick tier. Follows PACT-50, which named the grimoire head chef's autonomy modes (Manual, Auto, Turbo) and kept the bare word "level" out of the rules: a preset title is a configuration, never an autonomy setting.

The five "Level N" presets lose the word and the number. Ids and titles: `beginner` "Beginner", `intermediate` "Intermediate", `full` "Full" (the default), `full-matt-pocock` "Full · Matt Pocock skills", `full-superpowers` "Full · Superpowers skills". The number said nothing the autonomy modes don't, and a mode name (Turbo for Full) would bring back the confusion PACT-50 removed. `ultra-code` was never numbered and stays.

Renamed with them: `DEFAULT_PRESET_REL` in `builder/default-config.mjs`, `DEFAULT_CONFIG_NAME` in `gate/install-core.mjs` (the dry run's "the pact's default, Full (<digest>)" line and the security-defaults warning), the page's `LANDING_PRESET`, `AGENTS.md`, `CONTEXT.md`, `README.md`, `docs/install.md`, `docs/reference.md`, `docs/agents/install.md`, one eval prompt, and the tests that pin the names. `builder/scriptorium.html` is rebuilt. `builder/default-config/` is unchanged: its `config.json` carries no preset name or id, so an installed default renders the same bytes.

**Migration:** none for a configuration. `~/.claude/pact/config.json` and `~/.claude/pact/blocks/` never name a shipped preset. The one visible change is the dry run's name line. A personal preset file in `~/.claude/pact/presets/` named `beginner.json`, `intermediate.json`, `full.json`, `full-matt-pocock.json` or `full-superpowers.json` now shares a shipped id and is left out of the page, as a personal `level-3-full.json` was before; rename it to list it. ADRs 0070 and 0094 and older logs keep the old names as history.

**Rolling back:** revert the merge, rerun `node builder/build.mjs` and `node builder/default-config.mjs`, reinstall from the dry run.

## Record

- The ticket: PACT-72 on Linear.
