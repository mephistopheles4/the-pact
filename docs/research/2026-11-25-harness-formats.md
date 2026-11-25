# Harness formats: Codex, Antigravity and the pact's install today

Research for PACT-105, read on 2026-11-25. It checks the formats the
harness-agnostic pact would install into, against vendor docs, and traces
what in today's render and install is Claude-only. It is evidence for the
spec, not a plan. Claims marked **[local]** come from one machine's files,
not from docs; home paths are written as `~`.

How it was checked: one researcher per harness read primary sources only
(the vendors' docs, and `openai/codex` source at tag `rust-v0.172.0`, the
latest release on 2026-11-24). A second, separate fetch re-read the claims
the spec would lean on hardest (hook blocking, hook trust, failing open,
rules paths and limits) and confirmed each one. Codex's docs moved:
`developers.openai.com/codex/...` now redirects to `learn.chatgpt.com/docs/...`.

<!-- toc -->

- [Answers](#answers)
- [The four parts, side by side](#the-four-parts-side-by-side)
- [Today's install is Claude-only](#todays-install-is-claude-only)
- [Codex](#codex)
- [Antigravity](#antigravity)
- [What the spec has to settle](#what-the-spec-has-to-settle)
- [Sources](#sources)

<!-- /toc -->

## Answers

- **Does Antigravity work with plain files, without the plugin?** Yes. It
  reads rules, agents, skills and hooks as plain files from `~/.gemini/`,
  `~/.gemini/config/` and a workspace's `.agents/`, with no plugin and no
  registration. A plugin only bundles and namespaces them (skills become
  `<plugin>:<skill>`). [Rules][ag-rules], [discovery][ag-discovery],
  [plugins][ag-plugins].
- **What a person must state to describe a harness.** The two harnesses
  differ in exactly these, so they are what a description needs:
  1. the rules file's path, and its size limit;
  2. the agents folder and the agent format (Markdown with frontmatter, or
     TOML), with the field names for model, effort and tools;
  3. the skills folder;
  4. the hooks file, the event names a guard hook binds to, the tool names a
     matcher sees for shell and file edits, and how a hook says deny;
  5. the model names for the planning model and the executor model. These
     are PACT-105's terms (the owner's second-round pick) for the models the
     rules file's tier table puts on Plan and on Build; they are not in
     `CONTEXT.md` yet.

  A sixth, where command allow and deny lists go, is optional: both harnesses
  keep them apart from hooks.
- **Can the repo carry an `npx` command today?** No. There is no
  `package.json` anywhere, so no `bin` entry, and the only entry point,
  `gate/install.mjs`, refuses to run outside its own git checkout
  (`gate/install.mjs:90-111`). No workflow tags commits on `main`: `gate.yml`
  and `codeql.yml` run on push, none on tags.

## The four parts, side by side

The four parts are the issue's: rules, agents, commands and guards. A guard
here is anything that stops a tool call: a hook that answers deny, or a deny
or ask rule in a harness's permission settings. The last row is not a part;
it says how each part can reach the harness.

| Part | Claude Code (today) | Codex | Antigravity |
| --- | --- | --- | --- |
| Rules | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md`, 32 KiB cap shared with project files | `~/.gemini/AGENTS.md`, 24,000 bytes a file, 20,000 tokens for all always-on rules |
| Agents | `agents/<n>.md`, frontmatter `model`, `effort`, `tools` | `~/.codex/agents/<n>.toml`: `name`, `description`, `developer_instructions`, `model`, `model_reasoning_effort`; no tools list | `~/.gemini/config/agents/<n>.md`: `name`, `description`, `model` (`flash`, `pro`, `inherit`), `tools` |
| Commands | `commands/<n>.md` | Skills in `~/.agents/skills/`; prompts are deprecated | Skills in `~/.gemini/config/skills/`; workflows are deprecated |
| Guards | Deny and ask rules in `settings.json`; no guard hook | `~/.codex/hooks.json`; command rules in `~/.codex/rules/*.rules` | `~/.gemini/config/hooks.json`; permission rules in the app or CLI settings |
| Symlink or copy | (copied) | Rules and skills can be symlinks; agents and hooks need rendered copies | Skills can be symlinks or a manifest entry; agents and hooks need rendered copies |

Both harnesses read `SKILL.md` folders in the open Agent Skills format, so
the skill format is the one thing identical everywhere. The pact ships no
skills today: its four commands become skills only once they are rewritten
as `SKILL.md` folders. Codex follows symlinked skill
folders, as its docs say; neither vendor's docs say anything about symlinks
on Windows.

## Today's install is Claude-only

From the repo at `374670e`:

- **Render.** The renderer takes a "Claude home folder"
  (`gate/render-core.mjs:11`), writes only `CLAUDE.md` and Claude agent
  files, rewrites Claude model names in frontmatter (`render-core.mjs:241,
  250`), and bakes `~/.claude/pact/tools/cleaner.mjs` into the rules text
  (`render-core.mjs:344`).
- **Install.** The home is `--claude-home` or `~/.claude`
  (`gate/install-run.mjs:78`), the record is `<home>/.pact-install.json`
  (`:94`), and backups go to `<home>/pact/backups/` (`gate/install-io.mjs`).
  Deny and ask rules are built in `gate/install-core.mjs` (`:49`, `:55`,
  `:62`) in Claude Code's `Bash(...)` and `PowerShell(...)` syntax: the
  cleaner's deny and ask rules and the stop switch's deny rules. These rules
  are the pact's only guards today. There is no automated rollback; the
  backup is the restore source.
- **Hooks.** `claude/settings.overlay.json` binds one script,
  `claude/hooks/compact-handoff.mjs`, to five Claude Code events, and the
  script answers in Claude Code's `hookSpecificOutput` shape. It hands off
  state at compaction; it blocks nothing. The athanor guard
  (`.claude/hooks/athanor-guard.mjs`) is this repo's own hook, not part of
  the payload.
- **Commands.** The pact's four commands (`claude/commands/finis.md`,
  `make-it-so.md`, `scriptorium.md`, `scry.md`) install as Claude Code slash
  commands when the configuration names them (`gate/install-core.mjs:22`).
  Neither other harness has commands; each needs them as skills.
- **Tools.** `cleaner.mjs` removes `.claude/worktrees` and stops sessions
  with `claude stop`: Claude-only. `poster.mjs` is GitHub logic and neutral.
  `gh-app.mjs` is the one harness-aware file: it already knows the providers
  `claude`, `codex` and `antigravity` (`claude/tools/gh-app.mjs:19`).

## Codex

- **Version.** [local] The CLI here is 0.159.0, 13 minor releases behind
  0.172.0. `~/.codex/AGENTS.md` is already a rendered pact copy, not a
  symlink.
- **Rules.** Codex reads `AGENTS.override.md`, else `AGENTS.md`, from
  `$CODEX_HOME` (default `~/.codex`), then project files from the repo root
  down, joined into one text. Codex "stops adding files once the combined
  size reaches the limit" of `project_doc_max_bytes` (32 KiB). The global
  file comes first in that chain, so the files nearest the working folder
  are the ones dropped; the docs imply this but don't say it outright.
  Project files are skipped in an untrusted project. An `AGENTS.override.md`
  silently replaces the pact's file. [agents-md][cx-agents-md]
- **Agents.** One TOML file per agent in `~/.codex/agents/` or
  `.codex/agents/`. The file's `model` and `model_reasoning_effort` win over
  the parent's. Sandbox, approval policy and MCP servers always come from the
  parent, and there is no tools allowlist. The subagents page lists feature
  keys an agent file can set to `false`: `features.shell_tool`,
  `features.apps`, `features.plugins`, `features.memories` and
  `features.request_permissions_tool`. No key turning off file edits
  (`apply_patch`) was found, and the page says agent instructions "don't
  create a separate read-only sandbox". [subagents][cx-subagents],
  [config reference][cx-config]
- **Skills.** `.agents/skills` up to the repo root, `~/.agents/skills`, and
  `/etc/codex/skills`. `~/.codex/skills` still works but is marked deprecated
  in source (`codex-rs/ext/skills/src/host_roots.rs:152`). Invoked as
  `$name`; skills take no `$ARGUMENTS`. Custom prompts are deprecated.
  [skills][cx-skills], [prompts][cx-prompts]
- **Hooks.** `~/.codex/hooks.json`, events include `PreToolUse`,
  `PreCompact` and `SessionStart`. Shell runs reach a matcher as `Bash`,
  edits as `apply_patch`. A hook blocks with exit 2 or
  `hookSpecificOutput.permissionDecision: "deny"`; `"ask"` is parsed but not
  supported. `commandWindows` overrides `command` on Windows. [hooks][cx-hooks]
- **Hook trust.** "Non-managed hooks must be reviewed and trusted before they
  run", through `/hooks`, and trust is tied to the hook's hash, so a changed
  hook is skipped until it is trusted again. The docs call hooks "a useful
  guardrail, not a complete enforcement boundary". [hooks][cx-hooks]
- **Command rules** (experimental). Starlark files in `~/.codex/rules/`,
  `prefix_rule(pattern=[...], decision="allow"|"prompt"|"forbidden")`,
  checked with `codex execpolicy check`. [rules][cx-rules]
- **Models.** `model` and `model_reasoning_effort` in `config.toml` or an
  agent file. Profiles are now separate `<name>.config.toml` files; since
  0.134.0 `[profiles.x]` tables are no longer read. Current names include
  `gpt-6.2-sol` and `gpt-6.2-astra`. [config reference][cx-config],
  [models][cx-models]
- **Plugins.** A `plugin.json` can bundle skills, MCP config and hooks (hooks
  only for plugins installed by hand in the desktop app); the docs don't say
  it can carry agents. [plugins][cx-plugins]

## Antigravity

- **Rules.** Always-on global files `~/.gemini/AGENTS.md`, `GEMINI.md`, and
  the same two under `~/.gemini/config/`; modular files in
  `~/.gemini/config/rules/*.md` need a `trigger` in frontmatter or are
  "silently discard[ed]". Rules add up; none replaces another. Each file is
  truncated past 24,000 bytes, and all always-on rules share 20,000 tokens,
  over which the largest are demoted to one-line pointers. [rules][ag-rules]
- **Agents.** `agents/<name>.md` under `~/.gemini/config/`, `.agents/` or a
  plugin. `model` is a Gemini tier only (`flash`, `pro`, `inherit`), so a
  lens cannot pick Claude. A misspelled name in `tools` "may cause the
  subagent process to hang". [subagents][ag-subagents],
  [build plugins][ag-build]
- **Swarm** (preview). A coordinator, named workers, a verifier per two to
  four workers and a monitor, on a shared board. A verifier on another model
  is asked for in the prompt; no config field sets it. [swarm][ag-swarm]
- **Planner and executor.** Antigravity's Orchestrator pairs a planner model
  with an executor model, set per conversation or in account settings, not
  per agent. That is the same split as PACT-105's planning model and
  executor model (the Plan and Build models of the rules file's tier table).
  [models][ag-models]
- **Skills.** `~/.gemini/config/skills/` and a workspace's `.agents/skills/`;
  a `skills.json` manifest adds absolute paths. Workflows are deprecated in
  favour of skills. [skills][ag-skills], [migration][ag-workflows]
- **Hooks.** `~/.gemini/config/hooks.json` or a plugin's. Events:
  `SessionStart`, `PreToolUse`, `PostToolUse`, `PreInvocation`,
  `PostInvocation`, `Stop`; no compaction event. Shell runs reach a matcher
  as `run_command`. Input is camelCase JSON on stdin. `PreToolUse` must
  answer `decision`; only `"deny"` "hard blocks". "Any non-zero exit code is
  logged as a hook execution error and ignored (failing open)." [hooks][ag-hooks],
  [build plugins][ag-build]
- **Permissions.** `action(target)` rules, Deny over Ask over Allow, kept in
  the app's settings or the CLI's `settings.json`, not in a plugin.
  [permissions][ag-permissions]
- **The copy on this machine.** [local] `~/.gemini/config/plugins/the-pact/`
  is not in the `plugins` map of `~/.gemini/config/config.json`; an empty
  `plugin_data/the-pact/` folder suggests the app found it anyway. Its lenses
  list tools such as `read_file` and `search_web`, while the docs' examples
  use `view_file` and `grep_search`: if those names are wrong, a lens can
  hang.

## What the spec has to settle

These follow from the findings; none is decided here.

1. **A guard that fails open.** The issue decided on one shared guard
   script in the neutral home with a thin wrapper per harness; it doesn't
   exist yet, since today's guards are permission rules only. In Antigravity
   a crashed hook lets the call through, so that script must catch every
   error and answer deny on one. In Codex a guard does nothing until a person trusts it in `/hooks`,
   and again after every update: the installer cannot switch guards on by
   itself, and each update needs a trust step the dry run should name.
2. **No "ask" in Codex hooks.** A Claude Code `ask` rule has no hook
   equivalent there; it maps to a `prompt` command rule, which is
   experimental, or to deny.
3. **Rules text that names Claude tools.** Every harness gets the rules
   file, which names `~/.claude/pact/tools/cleaner.mjs`, slash commands and
   Claude subagents. A symlink carries that text unchanged; the rules file
   is a rendered copy per harness unless the text goes neutral first.
4. **Size budgets.** The pact's rules file is about 12 KB: inside both caps.
   Codex shares its 32 KiB with every project `AGENTS.md`; the global file
   is read first, so it is a project's own files that get dropped, which
   leaves about 20 KiB for them. In Antigravity the rules file counts toward the
   20,000-token budget for all always-on rules.
5. **Lens models.** Codex lenses can run on any model; Antigravity lenses
   only on a Gemini tier. Open question 1 (names for the lens and scout
   models) has to allow for that.
6. **Read-only lenses.** Codex has no tools allowlist per agent.
   `features.shell_tool = false` takes away the shell, but no documented key
   takes away file edits, so a Codex lens can't be made read-only by config
   alone. Open.
7. **What is neutral today.** The skill format (the pact ships no skills),
   the poster and `gh-app.mjs`. The renderer, installer, cleaner, commands,
   compaction hook and permission rules are Claude-only and need a
   per-harness layer; the commands need rewriting as skills.
8. **Packaging.** An `npx` install needs a `package.json` with a `bin`, an
   entry that runs from a fetched copy rather than a checkout, and a
   workflow that tags passing commits on `main`.

## Sources

[cx-agents-md]: https://learn.chatgpt.com/docs/agent-configuration/agents-md
[cx-subagents]: https://learn.chatgpt.com/docs/agent-configuration/subagents
[cx-skills]: https://learn.chatgpt.com/docs/build-skills
[cx-prompts]: https://learn.chatgpt.com/docs/custom-prompts
[cx-hooks]: https://learn.chatgpt.com/docs/hooks
[cx-rules]: https://learn.chatgpt.com/docs/agent-configuration/rules
[cx-config]: https://learn.chatgpt.com/docs/config-file/config-reference
[cx-models]: https://learn.chatgpt.com/docs/models
[cx-plugins]: https://developers.openai.com/plugins/build/plugins
[ag-rules]: https://antigravity.google/docs/rules/
[ag-discovery]: https://antigravity.google/docs/customization-discovery/
[ag-plugins]: https://antigravity.google/docs/plugins/
[ag-subagents]: https://antigravity.google/docs/subagents/
[ag-build]: https://antigravity.google/docs/build-plugins/
[ag-swarm]: https://antigravity.google/docs/swarm/
[ag-models]: https://antigravity.google/docs/models/
[ag-skills]: https://antigravity.google/docs/skills/
[ag-workflows]: https://antigravity.google/docs/migration/workflows-to-skills/
[ag-hooks]: https://antigravity.google/docs/hooks/
[ag-permissions]: https://antigravity.google/docs/permissions/

- Codex: [AGENTS.md][cx-agents-md], [subagents][cx-subagents],
  [skills][cx-skills], [custom prompts][cx-prompts], [hooks][cx-hooks],
  [rules][cx-rules], [config reference][cx-config], [models][cx-models],
  [plugins][cx-plugins] (this page still serves from
  `developers.openai.com`, with no redirect); source `openai/codex` at
  `rust-v0.172.0`.
- Antigravity: [rules][ag-rules], [customization discovery][ag-discovery],
  [plugins][ag-plugins], [subagents][ag-subagents],
  [build plugins][ag-build], [swarm][ag-swarm], [models][ag-models],
  [skills][ag-skills], [workflows to skills][ag-workflows],
  [hooks][ag-hooks], [permissions][ag-permissions].
