# the-pact

*The terms I work with AI agents under.*

Faust signed a pact with no way out. This one has escape clauses written in: the human decides at every seam, and the agent stops and asks when it should. The skills live in [grimoire](https://github.com/mephistopheles4/grimoire), the spellbook. This repo holds the terms, and the familiars bound by them.

## Who it's for

**It is one person's working configuration, shared as a reference.** Read it,
borrow from it, or install it, but adopt it with your own judgement. It is
written for its owner's setup: the rules tell Claude Code to use PowerShell on
Windows, name the owner's other projects, and set the owner's preferences,
such as auto mode and the Concise output style. A configuration file can
change some of it (see `examples/pact-config/`); the rest you would edit in
your own copy.

**Two parts of the rules reach beyond your machine.** They treat your issue
tracker as the record: a session reads tiers, approvals and decisions there,
so on a tracker where others can comment, make sure your copy limits whose
text counts. And at a periodic review they collect totals into "the-pact's
issue", which means this repo's tracker; point that paragraph at your own
tracker in your copy.

To install it, follow [docs/install.md](docs/install.md).

## Why this exists

The pact is a small, runnable version of my engineering playbook: how humans
and AI agents build software together, with the human as the architect of
intent and the agent as the executor. The playbook is on
[my website](https://aymandiab.com/work/engineering-workflow-playbook). Four moves govern it:

1. **Sense the work before you process it.**
2. **Do the thinking before the doing.**
3. **Checkpoint the seams.**
4. **Stay the owner.**

Anthropic published a six-stage playbook of its own, [*The AI-Native SDLC
playbook*](https://claude.com/blog/the-ai-native-sdlc-playbook). This is how
the pact's moves line up with its stages:

| Move | Anthropic stage | What the pact does |
|---|---|---|
| Sense the work | Plan | Triage; set the process tier; route bugs and large efforts |
| Do the thinking before the doing | Plan, Design | Grill, write the spec, prototype open questions; the spec pair, `executability-lens` and `good-enough-lens`, at the thorough tier, and `unstated-lens` at standard and thorough |
| Checkpoint the seams | Build, Test | Tickets with done-criteria; each build runs in a main session, test-first at agreed seams |
| Stay the owner | Test, Deploy | The QA pair, `behaviour-lens` and `integrity-lens`, advises at every tier, `unstated-lens` at standard and thorough, and for security work the security pair, `adversarial-lens` and `data-lens`, on the diff; the human decides |

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

## What's here

| Path | What it is | Installs to |
|---|---|---|
| `claude/CLAUDE.md` | My global instructions for Claude Code | `~/.claude/CLAUDE.md` |
| `claude/agents/` | **The unsealed agents:** the security pair: `adversarial-lens`, which lists the attack paths through a change, and `data-lens`, which finds where its data can leak; the QA pair: `behaviour-lens`, which runs the change, and `integrity-lens`, which reads its tests; the spec pair: `executability-lens`, which drafts the first ticket from the spec, and `good-enough-lens`, which finds what could wait; and `unstated-lens`, which looks for needs nobody wrote down. Each runs on Opus by default; a configuration may change any lens's model and effort (ADR 0027). The lenses' contracts and practice tests are in `familiars/` | `~/.claude/agents/` |
| `claude/settings.overlay.json` | The portable settings keys only, merged into the existing file, never replacing it | `~/.claude/settings.json` |
| `familiars/` | Agents migrated to a grimoire contract, each beside its contract and practice test: `scout`, on Sonnet at low effort; and the QA pair's contracts and practice tests, which never install | `~/.claude/agents/` (agent files only) |
| `cross/cross.mjs` | The cross script: checks a lens pair's findings blocks, joins them, and writes the comment section and a local page. The pact calls only the installed copy. `cross/render-check.mjs` is a one-off check and never installs | `~/.claude/pact/cross.mjs` |
| `gate/` | The install gate: the pact's own check (seam A), the renderer, a pinned copy of grimoire's check script, and the per-agent tool allow-list | Never installed |
| `examples/pact-config/` | An example user configuration: the values a person may set, such as the usage pause line. Copy it to `~/.claude/pact/config.json` to use it; the installer reads that file and never writes it | Never installed |
| `builder/` | The config builder: a page you open from disk to build a configuration without writing JSON. Moves 1 to 4 show with their locked clauses; open slots take presets, your own text, your skills and commands, and your own agents. It fetches nothing, and the installer checks what it saves like any other file. `scriptorium.html` is the shipped page, built from `examples/pact-config/builder.json`. For a builder of your own, ask your agent to run the `scriptorium` skill (`.claude/skills/scriptorium/`) in this clone: it writes a builder file from your own workflow and renders your page with `node builder/build.mjs --builder <file> --out <page>` | Never installed |
| `cloud-sessions/` | The setup script for Claude Code cloud sessions, and the files that generate it | Run in a cloud environment's setup field |

**The familiars, by effort:**
- **Low:** `scout`. The pact ships no `Explore`; skills that call it get Claude Code's built-in.
- **Medium:** the QA pair, `behaviour-lens` and `integrity-lens`; the spec pair, `executability-lens` and `good-enough-lens`; and `unstated-lens`.
- **High:** the security pair, `adversarial-lens` and `data-lens`.

Builds run in a main session the owner watches, not in agents.

## Depends on

- **Claude Code.** The pact is a rules file, agents and settings for it.
- **PowerShell 7,** to run the install script, on Windows, macOS or Linux.
- **Node 20 or later** to install; **Node 24**, the current LTS, to run the
  gate's tests.
- **git.** The install reads the clone's committed files through git.
- **The models the rules name:** Opus and Sonnet, and Fable for a second
  opinion when reviewers disagree.
- **[grimoire](https://github.com/mephistopheles4/grimoire).** A pinned copy
  of its check script ships in `gate/grimoire/`, so the install needs nothing
  from it. Its skills are optional.
- **[Matt Pocock's skills](https://github.com/mattpocock/skills),** optional.
  The pact ships them as a preset you can bind to the moves.
- **Optional for this repo's own work:** the GitHub CLI (`gh`), for its
  tracker, and Docker, for the practice runs and the Linux test run.

How to install: [docs/install.md](docs/install.md).

## What never goes in here

- **Credentials of any kind.** `~/.claude/settings.json` holds API keys in its `env` block, so it is never copied. Only the overlay is.
- **`~/.claude.json`, MCP server definitions, history, sessions, project memory and keybindings.**
- **Anything from an employer or a client.**

## Status

**Bootstrapped on 2026-09-26.** **The git history is kept as it was written:** older commits hold the owner's Windows username in file paths, and two commits name a private folder, without any of its content ([ADR 0035](docs/adr/0035-publish-with-the-history-as-it-is.md)). The current tree holds no personal home paths, and a test guards against new ones. The instructions name only public projects: [grimoire](https://github.com/mephistopheles4/grimoire), [stacks](https://github.com/mephistopheles4/stacks) and the wayfinder skill.

**`cloud-sessions/` embeds its own copies, so it goes stale on every change to `claude/`.** Run `cloud-sessions/gen.ps1` after any such change. It rewrites the config section of `cloud-setup.sh` and `cloud-setup-wrapper.sh` in place, from the repo's agents and settings overlay and from `CLAUDE.cloud.md`. `CLAUDE.cloud.md` is hand-kept: it is `claude/CLAUDE.md` without the Windows Shell rule and the install note, with cloud wording for the desktop-only session tools. Last regenerated 2026-09-30. **Next step (#4):** have the setup clone this repo and copy `claude/` into place, so it can never go stale again.

## Planned

- **Split the instructions** into a vendor-neutral `AGENTS.md` (plain language, the plan → review → build → verify flow, stop signals, usage) and a thin `CLAUDE.md` adapter that imports it and adds what is specific to Claude Code. Both go in `claude/`, next to the file they replace. The root `AGENTS.md` is a different file: it holds the rules for working on this repo, not the pact.
