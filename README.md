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
| Do the thinking before the doing | Plan, Design | Grill, write the spec, prototype open questions, `plan-reviewer` |
| Checkpoint the seams | Build, Test | Tickets with done-criteria; each build runs in a main session, test-first at agreed seams |
| Stay the owner | Test, Deploy | `result-checker` advises, and for security work `security-reviewer` on the diff; the human decides |

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
| `claude/agents/` | **The familiars:** six read-only agents: the four reviewers and checkers on Opus, `scout` and `Explore` on Sonnet, with cost set through effort | `~/.claude/agents/` |
| `claude/settings.overlay.json` | The portable settings keys only, merged into the existing file, never replacing it | `~/.claude/settings.json` |
| `cloud-sessions/` | The setup script for Claude Code cloud sessions, and the files that generate it | Run in a cloud environment's setup field |

**The familiars, by effort:**
- **Low:** `scout` and `Explore`.
- **Medium:** `plan-reviewer`, `result-checker` and `test-reviewer`.
- **High:** `security-reviewer`.

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
