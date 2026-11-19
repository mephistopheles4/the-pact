# Reference

What is in this repo, where each part installs, and what never goes in. For
what the pact is and why, read the [README](../README.md); to install it,
follow [install.md](install.md).

## What's here

| Path | What it is | Installs to |
|---|---|---|
| `claude/CLAUDE.md` | My global instructions for Claude Code | `~/.claude/CLAUDE.md` |
| `claude/review.md` | The review procedure and the record's rules, which a session reads before it runs a lens or posts | `~/.claude/pact/review.md` |
| `claude/agents/` | The lenses, in four pairs (security, QA, spec, standards), on Opus: the security pair at high effort, the rest at medium; and `scout`, the search helper, on Haiku at medium. A configuration may set any agent's model and effort | `~/.claude/agents/` |
| `claude/commands/` | The pact commands (see "Pact commands" below) | `~/.claude/commands/<name>.md`: `/scriptorium` always, the others only when the configuration's `commands` list names them |
| `claude/tools/` | The pact tools, off by default (see "Pact tools" below) | `~/.claude/pact/tools/<name>.mjs`, only when the configuration's `tools` list names it |
| `claude/hooks/` | `compact-handoff.mjs`, which keeps a session's hand-off across auto-compaction; it installs only while `auto-compact-window` is on, as it is by default | `~/.claude/pact/hooks/compact-handoff.mjs` |
| `claude/settings.overlay.json` | The portable settings keys, merged into the existing file by key, so your own keys and hooks stay | `~/.claude/settings.json` |
| `familiars/` | Empty: each agent's file in `claude/agents/` is its own record | Never installed |
| `gate/` | The install gate: the pact's own check, the renderer and the install, which check install mechanics only; and `tracker-authors.mjs`, the tracker author checker, which the install stages and never runs | Never installed |
| `examples/pact-config/` | An example user configuration; copy it to `~/.claude/pact/config.json` to use it | Never installed |
| `builder/` | The config builder, `scriptorium.html`, a page that builds a configuration without JSON; its presets; and `default-config/`, the pact's default configuration, which a home install with no `~/.claude/pact/config.json` renders. `/scriptorium` builds your own page | The kit `build.mjs` reads, with `/scriptorium`: `~/.claude/pact/builder/` |
| `.claude/` | This repo's own Claude Code settings: a hook that sends the gate's test runs through athanor | Never installed |
| `athanor.json` | The repo's [athanor](https://github.com/mephistopheles4/athanor) configuration, for a local, offline run of the gate's tests | Never installed |
| `cloud-sessions/` | The setup script for Claude Code cloud sessions, and the files that generate it | Run in a cloud environment's setup field |
| `evals/` | The eval generator, which the owner runs on request; its README gives the limits | Never installed |
| `docs/rule-reasons.md` | Why each rule is in the rules file, one row per rule | Never installed |
| `docs/img/` | The README's figures, and `build.mjs`, which renders them from `docs/img/src/` | Never installed |

## Pact commands

A pact command is a slash command for an answer the owner gives often, typed
by the owner; each sets `disable-model-invocation: true`. Text sent in as a
prompt can still start one, as with any slash command (threat model, Text
steers a session). A command installs only when the `commands` list of
`~/.claude/pact/config.json` names it, but `/scriptorium`, which every install
puts in place. The cloud copy installs none yet.

| Command | What it stands for |
| --- | --- |
| `/make-it-so` | "Accept all recommendations": carry out every recommendation in the last message. |
| `/finis` | "We're done, archive this session", once nothing is outstanding. |
| `/scry` | "Where are we?": numbered asks, each with its pick, then what only I can do, what is moving and what is done; I reply by number. |
| `/scriptorium` | "Build my Scriptorium page" from my own skills, commands, agents and configuration. Always installed. |

## Pact tools

A pact tool is a script sessions run, off unless the `tools` list of
`~/.claude/pact/config.json` names it; a project configuration may not hold
the list. A tool that is on gets a `WARN` line in the dry run and may add its
own rule to the rules file.

| Tool | What it does |
| --- | --- |
| `poster` | Posts and edits on GitHub as the owner's `gh` login from one JSON post, and reads back what landed: [poster.md](poster.md). |
| `cleaner` | Removes leftover worktrees and their local branches with fixed git commands, and adds deny rules on raw removal commands: [cleaner.md](cleaner.md). |

## What never goes in here

- **Credentials of any kind.** `~/.claude/settings.json` holds API keys in its `env` block, so it is never copied. Only the overlay is.
- **`~/.claude.json`, MCP server definitions, history, sessions, project memory and keybindings.**
- **Anything from an employer or a client.**

## Names in the instructions

Name only public projects.
