# the-pact

*The terms I work with AI agents under.*

Faust signed a pact with no way out. This one has escape clauses written in: the human decides at every seam, and the agent stops and asks when it should. The skills live in [grimoire](https://github.com/mephistopheles4/grimoire), the spellbook. This repo holds the terms, and the familiars bound by them.

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
| Stay the owner | Test, Deploy | The QA pair, `behaviour-lens` and `integrity-lens`, advises at every tier; `unstated-lens` and the standards pair, `conventions-lens` and `reader-lens`, at standard and thorough; and for security work the security pair, `adversarial-lens` and `data-lens`, on the diff; the human decides |

The pact does not cover Anthropic's Maintain stage yet.

**Built on:**
- **[Matt Pocock's skills](https://github.com/mattpocock/skills)** for the
  design work: triage, grilling, specs, prototypes, tickets, test-driven
  development and deep modules. The pact names them rather than copying them.
- **John Ousterhout's *A Philosophy of Software Design*,** the source of the
  deep-module idea those skills apply.

## What's here

| Path | What it is | Installs to |
|---|---|---|
| `claude/CLAUDE.md` | My global instructions for Claude Code | `~/.claude/CLAUDE.md` |
| `claude/agents/` | **The unsealed agents:** the security pair: `adversarial-lens`, which lists the attack paths through a change, and `data-lens`, which finds where its data can leak; the QA pair: `behaviour-lens`, which runs the change, and `integrity-lens`, which reads its tests; the spec pair: `executability-lens`, which drafts the first ticket from the spec, and `good-enough-lens`, which finds what could wait; the standards pair: `conventions-lens`, which checks a diff against the repo's written rules, and `reader-lens`, which checks the owner can act on its text; and `unstated-lens`, which looks for needs nobody wrote down. All run on Opus, with cost set through effort. The lenses' contracts and practice tests are in `familiars/` | `~/.claude/agents/` |
| `claude/settings.overlay.json` | The portable settings keys only, merged into the existing file, never replacing it | `~/.claude/settings.json` |
| `familiars/` | Agents migrated to a grimoire contract, each beside its contract and practice test: `scout`, on Sonnet at low effort; and the QA pair's contracts and practice tests, which never install | `~/.claude/agents/` (agent files only) |
| `cross/cross.mjs` | The cross script: checks a lens pair's findings blocks, joins them, and writes the comment section and a local page. The pact calls only the installed copy. `cross/render-check.mjs` is a one-off check and never installs | `~/.claude/pact/cross.mjs` |
| `gate/` | The install gate: the pact's own check (seam A), the renderer, a pinned copy of grimoire's check script, and the per-agent tool allow-list | Never installed |
| `examples/pact-config/` | An example user configuration: the values a person may set, such as the usage pause line. Copy it to `~/.claude/pact/config.json` to use it; the installer reads that file and never writes it | Never installed |
| `cloud-sessions/` | The setup script for Claude Code cloud sessions, and the files that generate it | Run in a cloud environment's setup field |

**The familiars, by effort:**
- **Low:** `scout`. The pact ships no `Explore`; skills that call it get Claude Code's built-in.
- **Medium:** the QA pair, `behaviour-lens` and `integrity-lens`; the spec pair, `executability-lens` and `good-enough-lens`; the standards pair, `conventions-lens` and `reader-lens`; and `unstated-lens`.
- **High:** the security pair, `adversarial-lens` and `data-lens`.

Builds run in a main session the owner watches, not in agents.

## What never goes in here

- **Credentials of any kind.** `~/.claude/settings.json` holds API keys in its `env` block, so it is never copied. Only the overlay is.
- **`~/.claude.json`, MCP server definitions, history, sessions, project memory and keybindings.**
- **Anything from an employer or a client.**

## Status

**Bootstrapped on 2026-09-26, and it will be public.** Cloud sessions can then clone it with no token. A privacy pass found no credentials or personal paths. The instructions name only public projects: [grimoire](https://github.com/mephistopheles4/grimoire), [stacks](https://github.com/mephistopheles4/stacks) and the wayfinder skill.

**`cloud-sessions/` embeds its own copies, so it goes stale on every change to `claude/`.** Run `cloud-sessions/gen.ps1` after any such change. It rewrites the config section of `cloud-setup.sh` and `cloud-setup-wrapper.sh` in place, from the repo's agents and settings overlay and from `CLAUDE.cloud.md`. `CLAUDE.cloud.md` is hand-kept: it is `claude/CLAUDE.md` without the Windows Shell rule and the install note, with cloud wording for the desktop-only session tools. Last regenerated 2026-09-30. **Next step:** once this repo is public, have the setup clone it and copy `claude/` into place, so it can never go stale again.

## Planned

- **Split the instructions** into a vendor-neutral `AGENTS.md` (plain language, the plan → review → build → verify flow, stop signals, usage) and a thin `CLAUDE.md` adapter that imports it and adds what is specific to Claude Code. Both go in `claude/`, next to the file they replace. The root `AGENTS.md` is a different file: it holds the rules for working on this repo, not the pact.
