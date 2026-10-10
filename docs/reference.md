# Reference

What is in this repo, where each part installs, which agent runs at which
effort, and what never goes in. For what the pact is and why, read the
[README](../README.md); to install it, follow [install.md](install.md).

## What's here

| Path | What it is | Installs to |
|---|---|---|
| `claude/CLAUDE.md` | My global instructions for Claude Code | `~/.claude/CLAUDE.md` |
| `claude/agents/` | **The unsealed agents:** the security pair: `adversarial-lens`, which lists the attack paths through a change, and `data-lens`, which finds where its data can leak; the QA pair: `behaviour-lens`, which runs the change, and `integrity-lens`, which reads its tests; the spec pair: `executability-lens`, which drafts the first ticket from the spec, and `good-enough-lens`, which finds what could wait; the standards pair: `conventions-lens`, which checks a diff against the repo's written rules, and `reader-lens`, which checks the owner can act on its text; and `unstated-lens`, which looks for needs nobody wrote down. Each runs on Opus by default; a configuration may change any lens's model and effort (ADR 0027). The lenses' contracts and practice tests are in `familiars/` | `~/.claude/agents/` |
| `claude/settings.overlay.json` | The portable settings keys only, merged into the existing file, never replacing it | `~/.claude/settings.json` |
| `familiars/` | Agents migrated to a grimoire contract, each beside its contract and practice test: `scout`, on Sonnet at low effort; and every lens's contract and practice test, which never install | `~/.claude/agents/` (agent files only) |
| `cross/cross.mjs` | The cross script: checks a lens pair's findings blocks, joins them, and writes the comment section and a local page. The pact calls only the installed copy. `cross/render-check.mjs` is a one-off check and never installs | `~/.claude/pact/cross.mjs` |
| `gate/` | The install gate: the pact's own check (seam A), the renderer, a pinned copy of grimoire's check script, and the per-agent tool allow-list | Never installed |
| `examples/pact-config/` | An example user configuration: the values a person may set, such as the usage pause line. Copy it to `~/.claude/pact/config.json` to use it; the installer reads that file and never writes it | Never installed |
| `builder/` | The config builder: a page you open from disk to build a configuration without writing JSON. Moves 1 to 4 show with their locked clauses; open slots take presets, your own text, your skills and commands, and your own agents. It fetches nothing, and the installer checks what it saves like any other file. `scriptorium.html` is the shipped page, built from `examples/pact-config/builder.json`. For a builder of your own, ask your agent to run the `scriptorium` skill (`.claude/skills/scriptorium/`) in this clone: it writes a builder file from your own workflow and renders your page with `node builder/build.mjs --builder <file> --out <page>` | Never installed |
| `cloud-sessions/` | The setup script for Claude Code cloud sessions, and the files that generate it | Run in a cloud environment's setup field |
| `docs/img/` | The README's figures, and `build.mjs`, which renders them from their sources in `docs/img/src/` | Never installed |

## The familiars, by effort

- **Low:** `scout`. The pact ships no `Explore`; skills that call it get Claude Code's built-in.
- **Medium:** the QA pair, `behaviour-lens` and `integrity-lens`; the spec pair, `executability-lens` and `good-enough-lens`; the standards pair, `conventions-lens` and `reader-lens`; and `unstated-lens`.
- **High:** the security pair, `adversarial-lens` and `data-lens`.

Builds run in a main session the owner watches, not in agents.

## The moves and Anthropic's playbook

Anthropic published a six-stage playbook of its own, [*The AI-Native SDLC
playbook*](https://claude.com/blog/the-ai-native-sdlc-playbook). This is how
the pact's moves line up with its stages:

| Move | Anthropic stage | What the pact does |
|---|---|---|
| Sense the work | Plan | Triage; set the process tier; route bugs and large efforts |
| Do the thinking before the doing | Plan, Design | Grill, write the spec, prototype open questions; the spec pair, `executability-lens` and `good-enough-lens`, at the thorough tier, and `unstated-lens` at standard and thorough |
| Checkpoint the seams | Build, Test | Tickets with done-criteria; each build runs in a main session, test-first at agreed seams |
| Stay the owner | Test, Deploy | The QA pair, `behaviour-lens` and `integrity-lens`, advises at every tier; `unstated-lens` and the standards pair, `conventions-lens` and `reader-lens`, at standard and thorough; and for security work the security pair, `adversarial-lens` and `data-lens`, on the diff; the human decides |

The pact does not cover Anthropic's Maintain stage yet.

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
