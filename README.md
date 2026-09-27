# the-pact

*The terms I work with AI agents under.*

Faust signed a pact with no way out. This one has escape clauses written in: the human decides at every seam, and the agent stops and asks when it should. The skills live in [grimoire](https://github.com/mephistopheles4/grimoire), the spellbook. This repo holds the terms, and the familiars bound by them.

## What's here

| Path | What it is | Installs to |
|---|---|---|
| `claude/CLAUDE.md` | My global instructions for Claude Code | `~/.claude/CLAUDE.md` |
| `claude/agents/` | **The familiars:** nine agents, all on Opus, with cost set through effort | `~/.claude/agents/` |
| `claude/settings.overlay.json` | The portable settings keys only, merged into the existing file, never replacing it | `~/.claude/settings.json` |
| `cloud-sessions/` | The setup script for Claude Code cloud sessions, and the files that generate it | Run in a cloud environment's setup field |

**The familiars, by effort:**
- **Low:** `scout`, `Explore` and `spec-builder`.
- **Medium:** `builder`, `plan-reviewer`, `result-checker` and `test-reviewer`.
- **High:** `security-reviewer` and `security-builder`.

## What never goes in here

- **Credentials of any kind.** `~/.claude/settings.json` holds API keys in its `env` block, so it is never copied. Only the overlay is.
- **`~/.claude.json`, MCP server definitions, history, sessions, project memory, handover notes (`~/.claude/handover/`) and keybindings.**
- **Anything from an employer or a client.**

## Status

**Bootstrapped on 2026-09-26, and it will be public.** Cloud sessions can then clone it with no token. A privacy pass found no credentials or personal paths. The instructions name only public projects: [grimoire](https://github.com/mephistopheles4/grimoire), [stacks](https://github.com/mephistopheles4/stacks) and the wayfinder skill.

**`cloud-sessions/` is the pre-repo version, and it is behind.** `cloud-setup.sh` embeds its own copies of the instructions and agents, and those copies date from before these changes:
- the advisor moved to Opus;
- the "Implementing a change" and "Watching usage" sections;
- the review-table format;
- the `test-reviewer` agent;
- the agent renames and tool allowlists, so cloud sessions still use the old names and give every agent full connector access.

`gen.ps1` built the script from files in a temporary folder that no longer applies. **Next step:** rewrite the cloud setup to clone this repo and copy `claude/` into place, so it can never go stale again.

## Planned

- **Split the instructions** into a vendor-neutral `AGENTS.md` (plain language, the plan → review → build → verify flow, stop signals, usage) and a thin `CLAUDE.md` adapter that imports it and adds what is specific to Claude Code. Both go in `claude/`, next to the file they replace. The root `AGENTS.md` is a different file: it holds the rules for working on this repo, not the pact.
