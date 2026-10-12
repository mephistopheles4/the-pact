# The builder is part of the pact

Every install puts in place the `/scriptorium` command and the builder kit it runs from, so a person builds their own Scriptorium page from their Claude home, with no clone. The page ships presets, starts from one, and binds skills to the workflow's stages (#262 phases 2 and 3, folding in #203's T3; the owner's decisions in chat).

## What changed

- **`/scriptorium` always installs.** It is a pact command (`claude/commands/scriptorium.md`) with `disable-model-invocation: true`, so only the owner starts it. Unlike `/make-it-so` and `/finis`, it needs no listing in the configuration's `commands` list: the install turns it on whenever its file is in the commit. The repo skill `.claude/skills/scriptorium/` is deleted.
- **The builder kit.** With `/scriptorium`, the install copies what `builder/build.mjs` reads into `~/.claude/pact/builder/`: the builder and its parts module, the shipped page, the presets, the pact's agents, the renderer and its shared module, the brand mark and the example builder file. The rules file goes in unrendered as `claude/rules.source.md`, a copy the install makes before the render; a commit holding one, or a copy that differs from `claude/CLAUDE.md`, refuses. The kit holds no file named `CLAUDE.md`, so Claude Code never loads it as rules. `BUILDER_KIT` lists the kit, in two copies held equal by a test; the install refuses half a kit, and seam A refuses a builder file the kit doesn't list.
- **The kit's builder is careful where it writes.** It runs on Node 24 or later, never rebuilds its own page, and writes a page into a new temporary folder unless given `--out`. It refuses to write inside the kit, the Claude home folder, any `.claude` folder, any git work tree, or over an existing file, since a page carries the person's lists in plain text. `--texts` prints each part a builder file changes, as the page saves it, so the command can compare a carried part with the person's own block byte for byte.
- **Presets are builder files.** A preset is a saved Scriptorium result: the parts it changes, its models and its agent files. Six ship in `builder/presets/`: Level 1 · Beginner and Level 2 · Intermediate on two tiers, Level 3 · Full, Level 3 · Matt Pocock, Level 3 · Superpowers, and Ultra Code. Each carries its own tiers and the sensitive route's security pair. The build checks each like any builder file. The Presets dialog, and Open a file for a shared one, show a checklist, one row per section, before anything is taken; Undo takes it back. Nothing is written until Save.
- **The page starts from Level 3 · Full.** A builder file that changes no part opens on it, and Reset comes back to it. A file that brings parts of its own opens on those.
- **Skills bind to stages, never to moves.** The moves are upheld at all times; a skill or command is a node on a workflow stage, offered or used, at the tiers it names. The builder file's `presets` and `workflows` keys left and are refused.
- **The tiers are a list.** The builder takes one to six tiers, lightest first, each with an id that the stages, offers and the sensitive route point at. The pact's default stays three.
- **The page sets the pact commands.** Settings has a checkbox for each opt-in command, with `/scriptorium` shown on and locked. Until one is set, a save keeps the commands list already in the folder's `config.json`.

## Why

- **A builder only clone-holders could run excluded most people.** The skill lived in this repo's `.claude/skills/`, so building a page meant cloning the pact. The owner's call: the builder is part of the pact, so it installs with it.
- **Always on, because nothing is lost by having it.** The command only runs when the owner types it, and the kit sits in the pact's own folder. Making it opt-in would add a setting with no safety behind it.
- **Starting from a full workflow teaches more than a blank one.** A new person sees the lenses and skills at work and trims, rather than building from nothing.

## What was weighed

- **The kit opt-in, with `/scriptorium` in the commands list.** Planned in #203; reversed by the owner. A configuration that still lists `scriptorium` is accepted.
- **The kit importing only what it lists, checked by the gate.** Dropped under [ADR 0069](0069-the-pact-is-vetted-like-a-skill.md): the gate checks what each file is and where it goes, not what code imports.
- **The cloud copy.** It installs no command, `/scriptorium` included: a cloud session has no browser to open the page.
- **Presets as text added after a move's slot**, the old preset model. Retired: a move is a practice, and binding a skill to one told the person how to practise it.
