# Reference

What is in this repo, where each part installs, which agent runs at which
effort, and what never goes in. For what the pact is and why, read the
[README](../README.md); to install it, follow [install.md](install.md).

## What's here

| Path | What it is | Installs to |
|---|---|---|
| `claude/CLAUDE.md` | My global instructions for Claude Code | `~/.claude/CLAUDE.md` |
| `claude/review.md` | The review procedure: how to give lenses their input, cross their reports by its template, post them and log each finding's fate. The rules file tells a session to read it before it runs a lens | `~/.claude/pact/review.md` |
| `claude/agents/` | **The unsealed agents:** the security pair: `adversarial-lens`, which lists the attack paths through a change, and `data-lens`, which finds where its data can leak; the QA pair: `behaviour-lens`, which runs the change, and `integrity-lens`, which reads its tests; the spec pair: `executability-lens`, which drafts the first ticket from the spec, and `good-enough-lens`, which finds what could wait; the standards pair: `conventions-lens`, which checks a diff against the repo's written rules, and `reader-lens`, which checks the owner can act on its text; and `unstated-lens`, which looks for needs nobody wrote down. Each runs on Opus by default. And `scout`, the one search helper, on Haiku at medium effort. A configuration may set any agent's model and effort, to any model Claude Code takes (ADRs 0027 and 0067). Their contracts are in `familiars/` | `~/.claude/agents/` |
| `claude/commands/` | The pact commands, each one file the owner turns on by name (see "Pact commands" below) | `~/.claude/commands/<name>.md`: `/scriptorium` always, the others only when the configuration's `commands` list names them |
| `claude/settings.overlay.json` | The portable settings keys only, merged into the existing file, never replacing it | `~/.claude/settings.json` |
| `familiars/` | Each agent's grimoire contract, the record of what its file in `claude/agents/` should be: every lens's and `scout`'s (#262). No contract installs, and no agent here is sealed | Never installed |
| `cross/poster.mjs` | The poster's core (#246, #253): posts free text to GitHub through one fixed call per surface and reads back what landed. Not installed yet. Nothing under `cross/` installs | Never installed |
| `gate/` | The install gate: the pact's own check (seam A), the renderer and the install. Since ADR 0069 it checks install mechanics only; the pact is vetted like any skill | Never installed |
| `examples/pact-config/` | An example user configuration: the values a person may set, such as the usage pause line. Copy it to `~/.claude/pact/config.json` to use it; the installer reads that file and never writes it | Never installed |
| `builder/` | The config builder: a page you open from disk to build a configuration without writing JSON. The four moves show by name, with the fixed block; open slots take presets, your own text, your skills and commands, and your own agents. It fetches nothing, and the installer checks what it saves like any other file. `scriptorium.html` is the shipped page, built from `examples/pact-config/builder.json`. For a builder of your own, type `/scriptorium` in any session: it writes a builder file from your own workflow and renders your page with the installed kit's `build.mjs` | The kit `build.mjs` reads, with `/scriptorium`: `~/.claude/pact/builder/` |
| `cloud-sessions/` | The setup script for Claude Code cloud sessions, and the files that generate it | Run in a cloud environment's setup field |
| `docs/img/` | The README's figures, and `build.mjs`, which renders them from their sources in `docs/img/src/` | Never installed |

## Pact commands

A pact command is a slash command that stands for an answer the owner gives
often, meant to be typed by the owner. Each sets
`disable-model-invocation: true`, so the model can't start it on its own.
Text sent in as a prompt can still start one, as with any slash command;
Claude Code's own handling of such text is the guard (threat model, R25). A
command is installed only when its name is in the `commands` list of
`~/.claude/pact/config.json`, but `/scriptorium`, which every install puts in
place with the builder kit. The cloud copy installs none yet.

| Command | What it stands for |
| --- | --- |
| `/make-it-so` | "Accept all recommendations": the session carries out every recommendation in its last message. |
| `/finis` | "We're done, archive this session": the session checks for anything outstanding, says what it is if there is, and archives the session if there isn't. |
| `/scriptorium` | "Build my Scriptorium page": the session writes the builder file from your own skills, commands, agents and configuration, checks it, and renders your page with the installed kit. Always installed. |
## The familiars, by effort

- **Medium:** `scout`, on Haiku; the pact ships no `Explore`, so skills that call it get Claude Code's built-in. The QA pair, `behaviour-lens` and `integrity-lens`, which the rules file offers at every build; the spec pair, `executability-lens` and `good-enough-lens`; the standards pair, `conventions-lens` and `reader-lens`; and `unstated-lens`.
- **High:** the security pair, `adversarial-lens` and `data-lens`.

Builds run in a main session the owner watches, not in agents.

## The moves and Anthropic's playbook

Anthropic published a six-stage playbook of its own, [*The AI-Native SDLC
playbook*](https://claude.com/blog/the-ai-native-sdlc-playbook). The pact's
four moves are the owner's practices, taken up as the work needs them, not
once in order. The table lines each move up with the stages where it does
most of its work:

| Move | Anthropic stage | What the pact does |
|---|---|---|
| Sense the work | Plan | Size and risk the work; propose a tier with a line of why, and for sensitive work the sensitive route with its why; an experiment first for an unknown target |
| Think before doing | Plan, Design | Get the intent clear enough to defend; a quick prototype while it is still forming; the spec pair, `executability-lens` and `good-enough-lens`, and `unstated-lens` offered on a spec, standard and up |
| Checkpoint the seams | Build, Test | Costly work waits for a checkpoint, heavier the harder it is to undo; an approved spec or ticket is built test-first, straight away |
| Stay the owner | Test, Deploy | The QA pair, `behaviour-lens` and `integrity-lens`, offered at every build; the security pair, `adversarial-lens` and `data-lens`, with the sensitive route, and offered once more at Test on a list match when the route wasn't taken; the standards pair and `unstated-lens` offered, standard and up; the human decides |

The rules file's Workflow table runs the same six stages, Plan to Maintain: what each tier sets at each, the lenses to offer there, and where the work goes next.

**Built on:**

- **[Matt Pocock's skills](https://github.com/mattpocock/skills)** are one set
  you can bind to the moves: triage, grilling, specs, prototypes, tickets,
  test-driven development and deep modules. The pact describes practices, not
  skills, and a person binds their own tools to them through configuration.
  The set ships as a preset: three blocks in `examples/pact-config/blocks/`
  (`move-N-matt-pocock.md`) and `examples/pact-config/config-matt-pocock-skills.json`
  to bind them.
- **John Ousterhout's *A Philosophy of Software Design*,** the source of the
  deep-module idea those skills apply.

## What never goes in here

- **Credentials of any kind.** `~/.claude/settings.json` holds API keys in its `env` block, so it is never copied. Only the overlay is.
- **`~/.claude.json`, MCP server definitions, history, sessions, project memory and keybindings.**
- **Anything from an employer or a client.**

## Names in the instructions

The instructions name only public projects: [grimoire](https://github.com/mephistopheles4/grimoire), [stacks](https://github.com/mephistopheles4/stacks) and the wayfinder skill. The current tree holds no personal home paths, and a test guards against new ones.
