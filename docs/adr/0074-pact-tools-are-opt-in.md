# Pact tools are opt-in

The pact's tools are something the owner chooses, the way its commands are. A `tools` list in the home configuration turns each one on; with no list, or an empty one, none installs (#280, the owner's decision in chat, 2026-10-13). The poster is the first tool.

## What changed

- **The list.** The gate holds a fixed list of tool names, `poster` today, with the install core's copy held equal by a test. The home configuration's `tools` key takes unique names from it, matched exactly, and enters the configuration digest. A bad value refuses with `config-tools`. A project configuration may not hold the key (`project-key`), so a cloned repo can't install code into the home folder.
- **Where a tool lives.** Its source is `claude/tools/<name>.mjs`, under the payload folder the install already stages, checks and generates the cloud copy from. It installs to `pact/tools/<name>.mjs`, never to the home root the general rule would give. `cross/` is gone.
- **The checks.** Seam A takes `--tools`, required once like `--commands`, classifies a tool by path and name (`tool-path`, `tool-file-name`), runs the text scanner on it, and lists it for install only when named; a name with no file refuses (`tools-not-in-pact`). The renderer prints `TOOLS none` or the names, straight after `COMMANDS`, and the install refuses a missing, doubled or misplaced line, or a tool with no configuration.
- **The live file.** A tool turned off is deleted at the next install. An unrecorded file at its path refuses (`unlisted-live`), and a changed live tool is drift, never "Yours, left as is": unlike an agent file, a tool runs with the owner's credentials.
- **The rule.** A tool that names a rule fills a marked part of the rules file, `tool-poster` for the poster, which sits empty in the source and outside the six parts Scriptorium builds. Off, the render is byte for byte what it was; on, the rendered hash changes, so the `--apply` go-ahead binds the choice the dry run showed. No edit may target the part.
- **The dry run** gives a `Tools:` block, and a `WARN` line for each tool on, naming where it installs and what it does.
- **Scriptorium** has a "Pact tools" section beside "Pact commands", left as is until set on the page. No preset carries `tools`, and a shared builder file holding it is refused.
- **The cloud copy** passes `--tools none` from a frozen empty list: the published root setup script installs no code that posts as the owner.

## Why

- **Not every person wants code that posts to GitHub on their machine.** #246 planned to install the poster like the old cross script (ADR 0064), on every install. Opt-in keeps it off unless the owner ticks it.
- **A session never meets a rule for a tool it doesn't have.** The rule is rendered only while its tool is on.
- **The list mirrors one the owner already knows.** Commands work this way (#203, ADR 0070); a second shape would be one more thing to learn.

## What was weighed

- **A project configuration turning a tool on.** Not taken: a project file comes with a cloned repo, and a tool installs into the home folder.
- **A tool folder outside `claude/`.** Not taken: the install bootstrap's filter, the install core's staging check, seam A's walk and the cloud generator's payload would each need changing.
- **A fallback rule ("if the poster is installed, use it") in every render.** Not taken: a rule present only while its tool is on can't misdirect a session without it.
- **Content checks on the tool's code,** such as the import and spawn rules #256 proposed. Not taken: ADR 0069 holds; the gate checks install mechanics, and the owner vets what the pact's files say.

## Rolling back

A pact from before #280 refuses a configuration with a `tools` key, so take the key out first. Its install then deletes the poster the record lists, as it does any file its own payload lacks.

Amends [ADR 0064](0064-review-crossings-by-template-and-judgment.md), which says nothing under `cross/` installs and that the poster's scan takes R29 over, and [ADR 0067](0067-every-agent-can-be-set-on-any-claude-code-model.md), which rests on the poster never being staged: the poster now installs when the owner turns it on, and its scan is a backstop behind the search before posting.
