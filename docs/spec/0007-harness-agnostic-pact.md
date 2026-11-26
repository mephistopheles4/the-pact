# Spec: a harness-agnostic pact — V1

Status: draft, after spec round 2 of 2 (final). The owner settled the design in two
rounds (S2). The lead took the spec's further picks as flagged checkpoints.
The spec counts once it is on `main`.

<!-- toc -->

- [S1 Objective](#s1-objective)
- [S2 Decisions](#s2-decisions)
- [S3 Terms](#s3-terms)
- [S4 The neutral home](#s4-the-neutral-home)
- [S5 Harness descriptions](#s5-harness-descriptions)
- [S6 Models: roles and mapping](#s6-models-roles-and-mapping)
- [S7 Rendering per harness](#s7-rendering-per-harness)
- [S8 The guard](#s8-the-guard)
- [S9 The installer](#s9-the-installer)
- [S10 Packaging and releases](#s10-packaging-and-releases)
- [S11 Scriptorium](#s11-scriptorium)
- [S12 Lenses outside Claude Code](#s12-lenses-outside-claude-code)
- [S13 Other consumers](#s13-other-consumers)
- [S14 The one-time removal](#s14-the-one-time-removal)
- [S15 Threat model](#s15-threat-model)
- [S16 Trade-offs](#s16-trade-offs)
- [S17 Target environments](#s17-target-environments)
- [S18 Acceptance claims](#s18-acceptance-claims)
- [S19 Rollback](#s19-rollback)
- [S20 Tickets](#s20-tickets)
  - [Needs the owner](#needs-the-owner)
  - [Stop and ask when](#stop-and-ask-when)
- [S21 Out of scope (deferred)](#s21-out-of-scope-deferred)

<!-- /toc -->

## S1 Objective

The pact moves out of Claude Code's folder into a neutral home, `~/.pact`.
One installer renders it from there into each harness a person uses: Claude
Code, Codex and Antigravity in V1, plus any harness a person describes. A
person runs it with one `npx` command that installs only tagged releases.

Why: the owner runs the pact in all three harnesses. Today it installs only
into `~/.claude`. The Codex and Antigravity copies were made by hand from that
install, they depend on `~/.claude`, nothing updates them, and each cost 500
to 1,300 lines of hand port.

Who uses V1: the owner, on the owner's own machines, as a private trial. A
public release follows in its own spec (S21).

Success: on the owner's Windows machine, one dry run and one apply put the
four parts (rules, agents, commands, guards) into all three harnesses from
`~/.pact`. A session in each harness then works under the pact, and the hand
copies are out of use, kept in a backup (S14, C26).

## S2 Decisions

**The owner's, first round (the issue's decision table):**

1. Tiers stay as the one choice a person makes per task. Playbooks are
   scrapped.
2. The pact lives in a neutral folder in the user folder. Harness folders
   only receive output.
3. Files reach a harness both ways: symlinks for parts that are identical
   everywhere, rendered copies for parts that differ.
4. One installer, with a small description per harness.
5. One shared guard script in the neutral home, with a thin wrapper per
   harness.
6. One `npx` command fetches from the pact's repo, finds the harnesses
   present, and guides a dry run and then the install. It installs only
   tagged commits, and CI tags every commit on `main` that passes. The owner
   can still install from a local checkout.
7. No autonomy setting in the pact. A checkpoint never waits by default; a
   driver or the owner may answer one or make one wait. The rules file
   already says this, so its text doesn't change for it.

**The owner's, second round (the eagle-eye box):**

8. V1 serves the owner first, as a private trial.
9. Harnesses: Claude Code, Antigravity and Codex. No Antigravity plugin,
   since plain files work there.
10. All four parts.
11. In a harness without subagents, each lens runs in a separate session. All
    three V1 harnesses have subagents, so this is named, not built (S12).
12. The rules name two roles, the planning model and the executor model.
    Each harness maps them to its own models. Plan, Design and Maintain use
    the planning model; Build and Test use the executor model.
13. The neutral folder is `~/.pact`.
14. The current install is removed by hand, once. The installer knows nothing
    about the old layout.
15. Scriptorium shows what each harness receives, and its settings gain a
    harness section with one row per harness.
16. The pact ships a table of known harnesses with default models. A person
    can add their own harness and say where each part goes. Checks are loose
    on purpose: the installer backs up, then installs.
17. The install command offers first: install the default configuration, or
    open Scriptorium and install what the person builds.

**The lead's picks, flagged (its decision 51, from this spec's grilling):**

18. Lenses run on the planning model. Scout runs on a third, optional role,
    the light model; a harness that leaves it empty uses the executor model.
19. The term "executor model" stays.
20. The issue's older Codex mirror ticket is superseded. Its state is the
    owner's to change (pending).
21. The rules name roles in their tables, plus one rendered line per harness
    naming its models (S6).
22. The rules file is rendered per harness, never linked (S7).
23. The guard: one rule table; Claude Code keeps its native permission rules
    rendered from it; Codex and Antigravity get one guard script with a thin
    wrapper each (S8).
24. A guard that errors fails closed (S8).
25. An `ask` rule becomes deny in Codex (S8). The fact check then found
    that an Antigravity hook can ask, so there it is `force_ask` (the
    session's pick, flagged).
26. Codex's hook trust step is named in the dry run and the apply (S8).
27. Each harness's rules cap is checked at render (S7).
28. Packaging: an `npx` bootstrap that clones the newest release tag, and a
    release workflow that tags passing commits on `main` (S10). Its write
    token is flagged big.
29. The ticket cut in S20.

**The session's picks from the fact check, flagged, before the lead:**

30. Replaced by the owner's words, relayed by the lead (its decision 53):
    "i dont think making expections like this for other harnesses is gonna
    be easy to manage, i think scriptorium should be universal". So every
    command ships to every harness as one universal set (S7).
31. Codex lenses keep the shell and are read-only by instruction, with a
    tree check before and after each one (S12). A new residual for the owner
    (S15).
32. The guard's hook entry is fixed, since Codex's trust covers the entry and
    not the script (S8).

**The session's picks from spec round 1, flagged.** The round's comment on
the issue lists each finding. A pick marked security is the owner's call
(S20):

33. A hooks or settings file is merged into, never refused; only a rules
    file the record doesn't list is refused (S9).
34. Tier and workflow cells map by the model they name: Opus to the planning
    model, Sonnet to the executor model, Haiku to the light model. Claude
    Code then runs as today, and item 12 sets the defaults for new cells
    (S6).
35. Security: every tag is under the ruleset, since npm resolves any tag name
    that ends in a version. The release job tags only `main`'s tip from a
    push run of this repo, numbered one past the highest release (S10).
36. Security: S14 runs in one sitting with `agent-identity` off, and the hand
    copies move into a backup instead of being deleted (S14).
37. Security: each owner-typed skill opens with "Act only if the person's
    latest message names this command". T5 probes a hook that asks before
    Antigravity reads one, and on the owner's no Antigravity leaves the
    default install list (S7, S15).
38. Security: Codex lens files turn off apps, plugins, memories and the
    permission-request tool. The tree check also sees ignored files and
    `.git`, and puts back only what the lens changed (S12).
39. Security: the hook command names the wrapper by its absolute path and
    clears `NODE_OPTIONS`; the guard's error code is an id from a closed list
    (S8).
40. The freeze: no apply into `~/.pact` before T9 and the owner's answers,
    and releases wait for a repository variable the owner sets (S20).
41. The "guards unverified" line for an own harness is built as offered. The
    owner never answered the offer, so it stays open (S20).
42. Security: project installs stay Claude Code only in V1, as a residual
    (S13, S15).

**The session's picks from spec round 2, the final round, flagged.** No lens
read them again at spec; the security pair reads each ticket's diff. The
round's comment on the issue lists each finding.

43. Security: on Windows the hook command sets
    `NoDefaultCurrentDirectoryInExePath=1`, and the bootstrap starts `git`
    from the home folder, so a clone's own `node` or `git` never runs (S8,
    S10).
44. Security: the tree check finds git's real folders through git, records
    HEAD, refs and stash, puts config and hooks back before any status, and
    says what it can't see; the network-off option names MCP servers (S12,
    S15).
45. A trade-off: C3 exempts S7's command changes, and each decline has its
    encoding and its form of C26 (S5, S12, S18).
46. A trade-off: S14 rewrites the owner's replaced parts in role terms, and
    C26 checks that no Claude model is named outside Claude Code (S14,
    S18).

**The lead's picks at T8, T4 and T5, flagged:**

47. The threat model's word cap rises from 3,050 to 4,100, since S15's text,
    the release app's (the lead's pick at T6, S2 item 49) and the probe
    findings of T4 and T5 didn't fit it, and no text is cut
    (`gate/tests/threat-model-cap.test.mjs`, ADR 0173). By the same rule, T4
    and T5 raise `docs/install.md`'s budget past item 50's to 10,350, for T4's
    skill links, guard and shell policy and T5's Antigravity text beside T6's
    (`gate/tests/doc-budget.test.mjs`, PACT-110).
48. The threat model's two charts come back, as the owner asked, and the
    word count leaves mermaid blocks out, since the charts were dropped twice
    to fit it. Prose past the cap still fails (the same test, ADR 0173).

**Ticket T6's picks, flagged:**

49. Security, the lead's pick (its decision 76), pending the owner: the
    release job tags with a GitHub App used only for releases, the only
    bypass actor of the ruleset on creating tags, its key a secret of an environment only `main`
    deploys to. It changes S10's and C23's "no secrets". Why: a bypass names a
    role, app, team, user or deploy key, never a workflow, so a bypass for
    `github.token` is one every workflow shares, and a workflow file on any
    branch of the repo sets its own permissions and runs before review (S10).
50. Trade-off: the word budgets of `docs/install.md` (8,700 to 9,100, then
    9,500 with T3's text) and `docs/reference.md` (2,300 to 2,400) rise, and
    nothing is cut to make room, on the owner's rule; PACT-110 cleans up.

## S3 Terms

These join `CONTEXT.md` in T1.

- **Harness:** a program that runs an AI coding session and loads rules,
  agents, skills or commands, and hooks from its own folders: Claude Code,
  Codex, Antigravity.
- **Known harness:** a harness the pact ships a description for, in
  `harnesses/known.json`, tested with each release.
- **Own harness:** a harness a person describes in their configuration, from
  the formats the pact knows (S5).
- **Harness description:** where a harness keeps each part, in which format,
  its rules cap, and its default models (S5).
- **The neutral home:** `~/.pact`, the one folder that holds the pact's
  configuration, tools, guard, hand-offs, record and backups (S4).
- **Planning model:** the model a harness runs Plan, Design and Maintain on,
  and the lenses.
- **Executor model:** the model a harness runs Build and Test on.
- **Light model:** the model a harness runs scout on; empty means the
  executor model.
- **The rule table:** `~/.pact/guard/rules.json`, the pact's deny and ask
  rules as data, from which every harness's guards are made (S8).
- **The guard:** `~/.pact/guard/guard.mjs`, the one script that answers a
  shell call against the rule table, and its thin wrapper per harness.
- **Release tag:** a tag named exactly `v1.<n>.0`, which the release job
  puts on `main`'s tip once `gate.yml` passed on the push (S10). The highest
  `<n>` is the current release.

## S4 The neutral home

`~/.pact` holds:

| Path | What | Was |
| --- | --- | --- |
| `config.json`, `blocks/` | the home configuration | `~/.claude/pact/` |
| `builder.json`, `presets/`, `scriptorium.html` | the builder file, presets and page | `~/.claude/pact/` |
| `builder/` | the builder kit | `~/.claude/pact/builder/` |
| `review.md`, `review-diagrams.md` | the review procedure | `~/.claude/pact/` |
| `tools/` | cleaner, poster, gh-app, clef | `~/.claude/pact/tools/` |
| `hooks/` | `compact-handoff.mjs` | `~/.claude/pact/hooks/` |
| `guard/` | `guard.mjs`, `rules.json`, one wrapper per harness | new |
| `skills/<name>/SKILL.md` | the pact's commands as skills (S7) | new |
| `github.json`, `linear.json`, `gh-app-*.gitconfig` | the owner's pins | `~/.claude/pact/` |
| `handoffs/` | compaction hand-offs | `~/.claude/pact/` |
| `install.json` | the install record (S9) | `~/.claude/.pact-install.json` |
| `backups/` | install backups | `~/.claude/pact/backups/` |
| `source/<sha>/` | release clones the bootstrap made (S10) | new |

- `~` means the home folder. The installer's `--home <dir>` sets it, for
  tests and CI, in place of today's `--claude-home`; `~/.pact` and every
  harness path then sit under that folder. It must be an absolute local path
  outside any git work tree, as the Claude home must be today (C30). No
  environment variable moves `~/.pact`; `CLAUDE_CONFIG_DIR` still moves
  Claude Code's own paths, as it does today.
- The backups folder keeps today's protections: owner-only modes (700 and
  600) on Linux and macOS, `docs/install.md`'s Windows access list named as
  `~/.pact`'s, and its "never sync, share or commit", which names the old
  folder too.
- Every path in the payload, the tools, the hooks, the commands, the rules
  text and the agent-facing docs that names `~/.claude/pact` names `~/.pact`
  instead. `~/.claude` stays only where Claude Code itself reads it: its
  rules file, agents, commands, `settings.json` and `.claude/worktrees`.
- Nothing reads the old paths. A tool that finds no pin at `~/.pact` acts as
  if none were set, as it does today with no pin.

## S5 Harness descriptions

A description is JSON. `harnesses/known.json` in the repo holds the three
known ones; a person's own harnesses go under `harnesses` in the home
configuration. Each has:

- `id`: `[a-z][a-z0-9-]{0,31}`, unique.
- `name`: shown in the dry run and in Scriptorium.
- `detect`: a folder whose presence means the harness is on this machine.
- `rules`: `{ "path", "cap" }`, the file the rendered rules go to and its
  byte cap; optional `"sharedCap"`, a cap the rules share with other files.
- `agents`: `{ "dir", "format" }`, format one of `claude-md`, `codex-toml`,
  `antigravity-md` (S7).
- `skills`: `{ "dir" }`, the folder skills are linked or copied into; or
  absent.
- `commands`: `{ "dir" }`, Claude Code's commands folder; or absent.
- `hooks`: `{ "file", "format" }`, format one of `claude`, `codex`,
  `antigravity` (S8); or absent.
- `models`: `{ "planning", "executor", "light" }`, each a model name the
  harness takes, `light` optional.
- `defaultInstall`: `false` keeps a detected harness out of a missing
  install list; optional, `true` when absent.
- `capabilities`: a list from `subagents`, `tool-limits`, `cleaner`,
  `archive`, `native-rules`, `hook-ask`, `hook-trust`, `explicit-skills` and
  `skill-copies`, naming what the install may rely on (S7, S8, S12).
  `tool-limits` means an agent file can take tools away; `explicit-skills`
  means a skill can be kept from the model's own invocation; `skill-copies`
  means the harness finds no linked skill folder, so its skills are copied;
  `archive` means a session can be archived.

The known descriptions:

| | Claude Code | Codex | Antigravity |
| --- | --- | --- | --- |
| `detect` | `~/.claude` | `~/.codex` | `~/.gemini/config` |
| `rules` | `~/.claude/CLAUDE.md`, no cap | `~/.codex/AGENTS.md`, cap 32768 shared | `~/.gemini/AGENTS.md`, cap 24000 |
| `agents` | `~/.claude/agents`, `claude-md` | `~/.codex/agents`, `codex-toml` | `~/.gemini/config/agents`, `antigravity-md` |
| `skills` | none | `~/.agents/skills` | `~/.gemini/config/skills` |
| `commands` | `~/.claude/commands` | none | none |
| `hooks` | `~/.claude/settings.json`, `claude` | `~/.codex/hooks.json`, `codex` | `~/.gemini/config/hooks.json`, `antigravity` |
| `models` | `opus`, `sonnet`, `haiku` | `gpt-6.2-sol`, `gpt-6.2-astra`, none | `pro`, `flash`, `flash` |
| `capabilities` | `subagents`, `tool-limits`, `cleaner`, `archive`, `native-rules` | `subagents`, `hook-trust`, `explicit-skills` | `subagents`, `tool-limits`, `hook-ask`, `explicit-skills`, `skill-copies` |

- **Detection.** The dry run lists each known harness whose `detect` folder
  exists, and each own harness. A harness is installed into only when the
  configuration's `harnesses.install` list names its id. A missing list means
  every detected known harness whose `defaultInstall` isn't `false`. The dry run says which are in and which are
  out. A harness the record lists whose `detect` folder is gone stays in:
  the dry run warns, and only a list that leaves it out removes its files.
- **An own harness** may set any field above, but its formats must be the
  pact's own names; any other value refuses (`harness-format`). Its paths
  must be absolute, under the home folder, outside any git work tree and
  outside `~/.pact`; otherwise it refuses (`harness-path`). So does a rules
  file not ending `.md`, a hooks file not ending `.json`, or a path on the
  secret-store list; a name may start with a dot at any depth (T1's picks).
  Nothing else is checked. The dry run prints, for each own harness with `hooks`: "guards
  unverified for `<name>`: the pact has not seen this harness run its hook".
- **A known harness's fields** may be overridden by an own entry of the same
  id, field by field, under the same checks, with a `WARN` naming each.

## S6 Models: roles and mapping

- **The rules name roles.** The tier table and the workflow table say
  "planning model, low" and "executor model, high", never a model name. The
  sensitive route says "planned on the planning model at high".
- **Mapping today's cells.** Each cell maps by the model it names: Opus to
  the planning model, Sonnet to the executor model, Haiku to the light
  model. Today's "Opus, low" for Quick Build reads "planning model, low", so
  Claude Code runs as it does today. Existing cells map by model, in the
  default configuration and the presets as in a person's blocks; a cell the
  builder adds defaults by stage, as item 12 says.
- **The models line.** Each rendered rules file gets one line after the
  tiers part, whatever block fills that part: "Here the planning model is
  `<planning>`, the executor model `<executor>` and the light model `<light>`." A
  configuration that replaces the tiers block can't drop it (C29). Where the
  names come from the configuration, the dry run warns, without naming them,
  that the rules hold them as written and sessions may quote them.
- **Agent files name roles.** Each source agent's `model:` is `planning`,
  `executor` or `light`: every lens `planning`, scout `light`. The renderer
  writes the harness's model in its place. `light` with no light model
  writes the executor model.
- **A person's own names still work.** A configuration block, an agent
  setting or a builder table cell that names a model, such as "Opus", renders
  as written, in every harness. The dry run warns for each harness that isn't
  Claude Code: "`<file>` names model `<name>`, which `<harness>` may not have".
- **Effort.** Claude Code and Codex agents keep `effort` (Codex as
  `model_reasoning_effort`, the same five words). Antigravity agents have no
  effort field, so it is dropped there.
- **The builder.** Its Models list becomes three dropdown roles plus the
  person's own names. The default configuration and presets switch to roles.
  Each harness row in Scriptorium sets that harness's three models (S11).

## S7 Rendering per harness

**What each part becomes:**

| Part | Claude Code | Codex | Antigravity | Linked or copied |
| --- | --- | --- | --- | --- |
| Rules | `CLAUDE.md` | `AGENTS.md` | `AGENTS.md` | rendered copy |
| Agents | Markdown, frontmatter `name`, `description`, `tools`, `model`, `effort` | TOML: `name`, `description`, `developer_instructions`, `model`, `model_reasoning_effort` | Markdown, frontmatter `name`, `description`, `model`, `tools` | rendered copy |
| Commands | `commands/<n>.md`, as today | skills | skills | skill folders linked; copied for Antigravity |
| Guards | native rules in `settings.json` | `hooks.json` entry | `hooks.json` entry | rendered entry; the guard script stays in `~/.pact` |

**The rules file.** One source, `claude/CLAUDE.md` (the payload folder keeps
its name in V1), rendered once per harness:

- Paths name `~/.pact`. "Claude's own permission prompts and classifier
  blocks still stop you" becomes "your harness's own permission prompts and
  blocks still stop you". "How Claude helps" becomes "How the agent helps".
- A clause that needs a capability sits between `<!-- pact:if <capability> -->`
  and `<!-- pact:end -->`, and renders only into a harness that has it. In V1
  the cleaner bullet is the one such clause (`cleaner`).
- The rendered file must fit the harness's `cap`, or the render refuses
  (`rules-cap`). Above half of a `sharedCap`, the dry run warns that project
  files share the rest.
- Claude Code's rendered rules are byte for byte today's, except for the
  `~/.pact` paths, the neutral phrases above and the model roles (C3).
- The rule budget test counts the source, as today.

**Tool limits, not choices.** Every part is one universal set. Two places
differ per harness only because a tool can't do otherwise:

- The cleaner's bullet renders only into Claude Code, because the cleaner
  removes `.claude/worktrees` and stops sessions with `claude stop`. It goes
  universal once the cleaner works in other harnesses.
- An `ask` rule is an ask in Claude Code, `force_ask` in Antigravity and a
  deny in Codex (S8). It goes universal once Codex hooks support ask.

**Agents.** One source per agent, `claude/agents/<n>.md`, rendered per format:

- `claude-md`: as today, with the model role mapped.
- `codex-toml`: the body goes to `developer_instructions` as a TOML literal
  string; a body holding `'''` refuses (`agent-toml`). `tools` has no field
  and is dropped. Every agent file sets `features.apps`, `features.plugins`,
  `features.memories` and `features.request_permissions_tool` to `false`;
  S12 says what is left.
- `antigravity-md`: `tools` is mapped through a fixed table per harness from
  the pact's tool names (`Read`, `Glob`, `Grep`, `Bash`, `WebFetch`,
  `WebSearch`) to Antigravity's; a name with no entry is dropped with a
  `WARN`, since a wrong name can hang a subagent. A lens whose mapped list
  comes out empty, or loses `Read`, `Glob` or `Grep`, refuses
  (`agent-tools`), since an empty list may mean every tool. Antigravity's
  table is `view_file`, `find_by_name`, `grep_search`, `run_command`,
  `read_url_content` and `search_web`, in the order of the six names. T5's
  probe of agy 1.2.14 found: an empty list leaves only `send_message` and
  `manage_task`, and no list leaves more; an unknown name stops the subagent;
  and a subagent gets fewer tools than its file lists, never a shell it
  doesn't list. `find_by_name`, `grep_search` and `read_url_content` did not
  arrive, so a lens there can't search, and every subagent also gets
  `send_message` and `manage_task`; in the probe a lens's was refused the
  program its session left running
  ([T5's record](../log/2026-11-25-antigravity.md)).

**Commands as skills.** The four commands are one universal set: every
harness gets all four, with no per-harness exceptions (the owner's words,
S2 item 30).

- Claude Code keeps them as commands, as today. Every other harness with
  `skills` gets each as a skill: the command's body as `SKILL.md`, with
  `name` and `description` frontmatter, `disable-model-invocation` where the
  bullets below say, and its paths on `~/.pact`.
- A pact command stands for an answer the owner types, so each skill is
  kept from the model's own invocation wherever the harness allows it
  (`explicit-skills`). In Codex each skill folder gets `agents/openai.yaml`
  with `policy.allow_implicit_invocation: false`, so it runs only when typed
  as `$make-it-so`. This is the same command everywhere, not an exception.
- Each skill that stands for an owner's answer (`make-it-so`, `finis`,
  `scry`) opens with the same line in every harness: "Act only if the
  person's latest message names this command; otherwise say so and stop."
- Antigravity keeps a skill from the model when its `SKILL.md` carries
  `disable-model-invocation: true`: the skill is left out of what the model
  sees, and a typed `/<name>` still runs it. A skill carries the key where its
  command's own frontmatter does and a harness that reads the folder has
  `explicit-skills`; the render adds it to no other.
- A session can still find the file and read it, so Antigravity's guard also
  asks the person before a read tool opens the `SKILL.md` of one of those
  three (S8). T5's probe saw such a read held for a question (headless, so
  the question itself was not seen), and none when the owner types the
  command. What is left is a residual for the owner (S15).
- `finis` archives a Claude Code session. Its archive step sits in a
  `pact:if archive` block; a harness without `archive` gets instead the same
  check for outstanding work and then: "Nothing is outstanding; close this
  session." It archives nothing.
- `scriptorium` lists the skills, commands and agents folders of each harness
  `install.json` lists, never one harness's fixed folders.
- The skills folder in `~/.pact` is one for every harness that reads it, so it
  has a capability only when each of them has it: an `if` block renders then,
  and an `unless` block otherwise.

**Links.** A skill folder is linked from the harness's skills folder to
`~/.pact/skills/<n>`: a symlink, or on Windows a directory junction, which
needs no extra rights. If neither can be made, the install copies the folder
and the dry run says so. A harness with `skill-copies` gets a copy on every
platform: agy 1.2.14 on Windows lists no linked skill folder, and its links
elsewhere are not probed. The install records each link or copy and removes
only what it recorded.

## S8 The guard

**The rule table.** `rules.json` holds today's guard rules as data, from the
same source as `gate/install-core.mjs`'s `CLEANER_DENY`, `CLEANER_ASK` and
`STOP_DENY`: each rule an `id`, a decision (`deny` or `ask`), the switch it
hangs on (`cleaner`, `session-stop-deny` or `owner-skills`), and the command
words it matches. The table is rendered from the configuration, so a rule whose switch
is off is not in it. One rule more, `owner-skill`, asks on a read of the
`SKILL.md` of `make-it-so`, `finis` or `scry` in a folder named `skills`. It
is in the table while one of those commands is on and a harness is in whose
hook can ask before a read: Antigravity's, with `hook-ask` and `skills`.
With no command rule on, only such a harness gets a hook.
The path is met in any case and with either separator. Each name loses a
stream after a colon and the spaces at its end, then `.` and `..` are
resolved, then dots and spaces at its end go: more paths than Windows would
open. A read call's `AbsolutePath` and `Path` are each judged.

**Claude Code** keeps its native permission rules. The install renders them
from the table, and they are byte for byte today's (C11). No hook is added to
Claude Code for them.

**Codex and Antigravity** get one PreToolUse hook each, which runs the
wrapper `~/.pact/guard/<harness>.mjs`:

- **The command.** It names its script by absolute path, quoted for the
  platform, since Windows shells don't expand `~` and a hook that can't start
  may let the call through. On Linux and macOS it runs the wrapper under
  `env -u NODE_OPTIONS`. On Windows it is one text for cmd and PowerShell:
  `<Windows>\System32\cmd.exe /d /c call "<launcher>.cmd" ; exit
  $LASTEXITCODE`. PowerShell, which Codex runs hooks under, would report a
  hook's exit 2 as 1, which lets the call through; the last words pass the code
  on, and cmd hands them to the launcher, which ignores them. A path either
  shell would read as more than a path refuses (`hook-command-path`). The text
  is fixed per machine, so Codex's trust holds.
- **The Windows launcher,** made by the install beside each wrapper, clears
  `NODE_OPTIONS` and `ERRORLEVEL`, sets `NoDefaultCurrentDirectoryInExePath=1`,
  so cmd never runs a `node` from the session's working folder, and runs the
  wrapper. Exit 0 passes through, and so does Codex's 2. Any other end, a
  missing node included, is the harness's denial: exit 2 with a reason for
  Codex, the `deny` JSON with exit 0 for Antigravity.
- **A Windows home from another platform.** A node that is not Windows's
  refuses (`guard-windows-home`) to write a guard into a home holding
  `AppData`.
- The hook matches Codex's `Bash`. In Antigravity it matches `run_command`,
  and `manage_task` and `send_command_input`, which type into a program left
  running; and, while `owner-skill` is in the table, `view_file` and
  `read_file`. The wrapper reads the call from stdin in its harness's shape,
  passes the command text, the typed text or the file's path to `guard.mjs`,
  and writes its harness's answer. The `manage_task` actions agy lists as
  typing nothing (`list`, `status`, `kill`) get no answer; another action,
  or a matched call whose text or path the wrapper can't find, is denied. Codex's hooks see no typed text (T4's probe).
- A denial in Codex is exit 2 with the reason on stderr, since an exit 2 with
  an empty stderr lets the call through; in Antigravity it is
  `decision: "deny"` as JSON on stdout, exit 0.
- `guard.mjs` matches the command against the table with the tokenizer in
  `.claude/hooks/athanor-guard.mjs`, ported as spec 0001 ports it: quotes,
  heredocs, separators and wrappers. It reads the call as data and runs
  nothing.
- **An `ask` rule** is `force_ask` in Antigravity, which prompts the person
  whatever they allowed before (`hook-ask`). In Codex, whose hooks have no
  ask, it is a deny with the fixed line: "This needs the owner: ask them to
  run it in a terminal."
- **It fails closed where it can.** The wrapper catches every error, an
  unreadable table included, and answers deny with: "The pact's guard failed
  (`<code>`); run the pact's dry run." `<code>` is an id from a closed list,
  never text from the call or an error message. It never answers allow; a
  call no rule matches gets no answer at all, so the harness's own
  permission flow goes on. Both harnesses let a call through, or say they do,
  when the hook can't start, crashes past the wrapper or times out, so the
  hook entry sets a 15 s timeout and the guard reads only the table and the
  call. agy 1.2.14 on Windows blocked each of those, and a non-zero exit,
  which the pact doesn't rely on.
- **Codex's trust step.** A Codex hook runs only once a person trusts it in
  `/hooks`. Codex hashes the hook entry (event, matcher, command, timeout),
  not the script's bytes, so the entry stays fixed and an update to
  `guard.mjs` or the table needs no new trust. Trust is what lets the guard
  run at all; it never sees a change to the script or the table. The dry run
  and the apply print, whenever the entry is new or changed: "Codex: open
  /hooks and trust pact-guard; until then Codex runs unguarded."
- **The hook entry** merges into the harness's hooks file by key, as
  `compact-handoff` merges into `settings.json` today, whether or not the
  record lists the file (S9). The person's other hooks stay, the record lists
  only the pact's entry, and switching every rule off removes only that
  entry.

**The compaction hand-off** stays Claude Code's. Antigravity has no
compaction event, and V1 adds none to Codex.

## S9 The installer

The installer is today's, generalised from one home to many harnesses:

- **One record.** `~/.pact/install.json` lists every file, link and settings
  entry the install wrote, in every harness, with its harness id and hash,
  and the source of the last apply: a checkout commit or a release tag.
- **One dry run, one apply.** The dry run renders for each harness in the
  install list, prints a block per harness (its files, links, hook entry,
  warnings), and ends with the apply line. The apply binds the commit and the
  rendered hash, as today, across all harnesses together.
- **One backup** per apply under `~/.pact/backups/`, holding each replaced
  file from every harness, with a manifest naming its harness.
- **Rules files are the pact's.** The pact owns the whole rules file in each
  harness, as it owns `~/.claude/CLAUDE.md` today; a person's own text goes
  in the configuration's blocks. Where a rules target holds a file the record
  doesn't list, the apply refuses (`unrecorded-target`), naming the path and
  the one-time removal in `docs/install.md`. This is a general rule, not a
  check for the old layout.
- **Hooks and settings files are merged into.** `settings.json` and each
  `hooks.json` are merged by key whether or not the record lists them; the
  record lists only the pact's entries (S8).
- **Agents and skills** at a target the record doesn't list are listed under
  "Yours, left as is", as today.
- **Drift and behind, per harness.** The dry run checks every recorded file,
  link and entry in every harness against its hash in `install.json` and
  reports drift per harness, as it does for `~/.claude` today. After a
  checkout install, the behind check is today's, against the recorded
  commit. Two recorded entries are not compared,
  `permissions.defaultMode` and `skipAutoPermissionPrompt` (the lead's pick at
  T1): each apply sets them again, with a warning, so a hand edit doesn't
  block it. After a release install, a release lower than the recorded one
  warns "behind the last install", and a checkout is checked against the
  recorded release's commit. A shallow release clone never needs history.
- **A failed apply** leaves its backup and a record written file by file, so
  the record matches the disk where it stopped; the next dry run shows what
  is left, and S19 works from it.
- **A harness taken out** of the install list has every recorded file, link
  and entry removed by the next apply, from its backup-first copy.
- **Seam A** keeps its job, the payload's copy set, with a `--harness` list in
  place of the one Claude home. The cloud generator passes `claude` only. A
  rendered agent may share its name with its source, and two installs collide
  on a destination only within one harness.
- **From a checkout** the owner runs `node gate/install.mjs` as today, with
  `--home` in place of `--claude-home` (S4).

## S10 Packaging and releases

**The command:** `npx github:mephistopheles4/the-pact#semver:^1`. npm resolves
the highest tag whose name ends in a `1.x.y` version, whatever comes before
it, and runs the package's one `bin`, `pact`. When the default branch's tip
carries such a tag, npm takes that one even if a higher one exists; the
bootstrap still picks the highest release itself. So every tag in the repo is
under the tag ruleset, not only `v*` (below).

**`package.json`** at the repo root: `name`, `version` `1.0.0`, `bin`,
`engines.node` `>=24`, `files`, no dependencies of any kind and no install
scripts. A gate test holds it to that shape (C21).

**The bootstrap,** `bin/pact.mjs`, uses Node's built-ins and `git` on PATH.
It starts `git` with the home folder as its working folder, and on Windows
with `NoDefaultCurrentDirectoryInExePath=1`, so a `git` in the folder `npx`
ran from never runs:

1. Runs `git ls-remote --tags https://github.com/mephistopheles4/the-pact.git`,
   with no shell, keeps only tags named exactly `v1.<n>.0`, takes the highest
   `<n>` and its commit, and prints the tag it took.
2. Clones that tag with `--depth 1 --branch <tag>` into
   `~/.pact/source/<sha>`, unless that folder already holds it, and checks
   that its `HEAD` is that commit. On any difference it refuses
   (`release-head`) and deletes the clone.
3. Asks: install the default configuration, or open Scriptorium first (S11).
   With `--default` or `--builder` it doesn't ask; with no terminal it
   refuses (`bootstrap-choice`). `--default` is only the dry run's input: it
   never overwrites an existing `~/.pact/config.json`, and with one present
   the dry run uses it.
4. Runs `gate/install.mjs` from the clone for the dry run, passing the tag so
   the record holds it (S9). The dry run prints the apply command with the
   script's absolute path, so it runs from any folder. The bootstrap never
   runs `--apply` itself.

It keeps the last three clones and deletes older ones it made.

**The release workflow,** `.github/workflows/release.yml`:

- triggered by `workflow_run` of `gate` completing. The job's `if` requires
  `conclusion == 'success'`, `event == 'push'`, `head_branch == 'main'`,
  `head_repository.full_name == github.repository`,
  `github.ref == 'refs/heads/main'`, and the repository variable
  `PACT_RELEASES` set to `on`, which the owner sets in T9;
- one job in the `release` environment, which only `main` may deploy to. Its
  own token only reads; its one secret is the release app's key,
  `PACT_RELEASE_APP_KEY`; actions are pinned by SHA; no checkout;
- reads `main`'s tip through the API and tags only when `head_sha` is that
  tip, so a re-run of an old gate run tags nothing. The number is one past
  the highest existing `v1.<n>.0`, or 1 when none exists, never the run
  number, so a renamed workflow can't restart it;
- runs in a `release` concurrency group that never cancels, and reads the tip
  again just before it creates the tag, so two close runs can't put the
  higher number on the older commit;
- creates the tag through the API (`git/refs`) with a token of the release
  app, scoped to `contents: write` (`actions/create-github-app-token`, with the
  variable `PACT_RELEASE_APP_CLIENT_ID`), unless a release tag already points
  at `head_sha`;
- runs none of the repo's code.

`gate/tests/workflow.test.mjs` bans `workflow_run` in every workflow today.
This change exempts one file, `release.yml`, with an exact allow-list for its
job, the way it holds the CodeQL and Claude jobs. That loosens a check, so it
is a spec change, flagged big and read by the security pair. A second file
using `workflow_run` still fails (C23).

**The tag rulesets** are the owner's acts on GitHub. Both target every tag,
not only `v*`, and there are two, since a bypass covers each rule of its
ruleset: one restricts creating, with the release app as its one bypass actor,
and one restricts updating and deleting, with none. T6 found that a bypass can name no actor narrower
than every workflow while the job tags with `github.token`, so it tags with
the app instead (S2 item 49).

## S11 Scriptorium

- **The harness section.** One row per harness the dry run would see, known
  and own: its name, whether it is in the install list, and its three
  models, each a dropdown of that harness's known models plus a free entry.
  An "Add a harness" row takes an own harness's fields (S5).
- **What each harness receives.** The page shows each harness's rendered
  rules, agents and skills, read-only, as the install would write them.
- **Before any install.** `/scriptorium` keeps working in Claude Code, from
  the kit in `~/.pact/builder/`. The bootstrap's builder choice runs the
  clone's `builder/build.mjs`, writes the page to `~/.pact/scriptorium.html`,
  and prints its path to open. The person saves their builder file; the
  bootstrap's next run installs from it.
- **The fixed page path** moves from the Claude home to `~/.pact`, under ADR
  0171's same refusals (T7's ADR amends it).

## S12 Lenses outside Claude Code

- **Subagents.** All three V1 harnesses have them, so lenses run as subagents
  everywhere, under the review procedure as it stands.
- **No subagents.** A harness without the `subagents` capability gets one
  rendered line where the review procedure dispatches a lens: "run each lens
  in a separate session". V1 builds nothing that starts such a session.
- **Lenses in Codex can't be read-only.** A Codex agent file can't take away
  file edits, and Codex reads files only through its shell, so taking the
  shell away leaves a lens unable to read. A Codex lens keeps the shell, runs
  under the parent session's sandbox and approval policy, and is read-only
  by its instructions alone. Its file turns off apps, plugins, memories and
  the permission-request tool (S7).
- **The tree check.** `review.md`, one shared file, gains one step under
  Running a lens. In a harness whose agents can't be held to their tools
  (Codex today), the session, before each lens:
  - finds git's real folders through git (`rev-parse --git-common-dir` and
    `--git-path` for `config`, `config.worktree`, `hooks` and `info`), since
    in a linked worktree `.git` is a file;
  - copies those outside the work tree, readable only by the owner, keeping a
    hash of each copy, its file names included, and the records below, in the
    session's own output, never in a file a lens can write;
  - records `HEAD`, a hash of every ref and of the stash list, and
    `status --porcelain --ignored=matching --untracked-files=all` run with
    fsmonitor and every filter off, with a hash of each listed path's
    content.

  After the lens it first stops any process the lens left running and removes
  any new link or junction, in the git folders too. It checks each copy against
  its hash, and again right before it puts anything back from it; where one
  differs it puts nothing back from the copies and brings it to the owner. Else
  it compares the git folders with the copies and puts them back, checks them
  against the same hashes, bringing any difference to the owner, then runs the
  same records again. Any change, a removed link included, marks the lens
  inconclusive. The session puts back only what changed during the lens: a
  moved ref goes back to its earlier value first; then a path clean before is
  restored with git from that `HEAD`, or deleted if it is new. Each path is
  removed, put back or restored as itself, never through a link or junction. A
  path already changed before the lens is left as it is and named, so the
  owner's own work is never thrown away. The copies are deleted afterwards. The
  change and the restore are a flagged checkpoint.
- **If the owner declines** widening "Review rests on rules" for Codex lenses
  (S15), T4 removes `subagents` from Codex's known description, so Codex
  gets the no-subagents line and each lens runs in a separate session.
- **Antigravity lenses** run on Gemini tiers only; the planning model there is
  `pro`. Their agent files list their tools (S7); each also gets
  `manage_task` and `send_message`, and the guard's hook runs on a lens's
  calls too. A lens's `manage_task` was refused a program the session had left
  running (T5's probe).

## S13 Other consumers

- **Cloud sessions** stay Claude Code only. `cloud-sessions/gen.mjs` passes
  the Claude harness and gets the `~/.pact` paths.
- **Project installs** (`--project-folder`) stay Claude Code only in V1: a
  repo made stricter is stricter in Claude Code alone (S15, S21).
- **The tools** read their pins and settings from `~/.pact`. The cleaner
  stays Claude-only. `gh-app.mjs`'s providers stay as they are, and
  `agent-identity` binds Claude Code sessions only: Codex and Antigravity
  sessions push with the owner's own Git credentials, which the docs and
  the threat model say (C27).
- **Codex's shell environment policy.** T4's probe found that Codex 0.159.0,
  left at its defaults, hands its shells every variable, ones named like KEY,
  SECRET or TOKEN included. While Codex is taken, the install puts
  `shell_environment_policy.ignore_default_excludes = false` first in
  `~/.codex/config.toml`, which drops those names from the shells Codex starts.
  The record marks it, a config that names the policy itself is left with a
  warning, and a Codex taken out loses the line (C33). It was probed on
  Windows only, and it drops names from the environment alone: a value stays
  readable where it was set (S15).
- **The poster** refuses a post holding a live secret found in its own
  environment. In a Codex shell it can't see a variable the policy drops
  (S15).
- **Docs.** `docs/install.md`, `docs/agents/install.md`,
  `docs/agents/issue-tracker.md`, `docs/agents/agent-apps.md`,
  `docs/reference.md` and the README name `~/.pact`, the `npx` command and
  the three harnesses.

## S14 The one-time removal

V1 has no migration. `docs/install.md` gains a one-time section, "Before the
first install into `~/.pact`", for the owner. It runs in one sitting,
straight before T9's apply, with no other session running:

1. If `agent-identity` is on, turn it off and apply with the old install, as
   `docs/agent-identity.md`'s rollback says, so no session pushes through a
   gitconfig that has moved.
2. Move `config.json`, `blocks/`, `builder.json`, `presets/`, `github.json`,
   `linear.json`, the `gh-app-*.gitconfig` files and `handoffs/` from
   `~/.claude/pact/` to `~/.pact/`.
3. Delete what the old record `~/.claude/.pact-install.json` lists, then the
   record itself, and the pact's entries in `~/.claude/settings.json`.
4. Copy any of the owner's own lines in `~/.codex/AGENTS.md` and
   `~/.gemini/AGENTS.md` into a configuration block; it then reaches every
   harness, since V1 has no text for one harness only (S21).
5. Rewrite every replaced part of the configuration that names a model in
   role terms (planning, executor, light), through Scriptorium or by hand,
   so the rules outside Claude Code name no Claude model.
6. Move the hand copies into `~/.pact/backups/hand-copies/`:
   `~/.gemini/config/plugins/the-pact/`, the whole `~/.codex/AGENTS.md`, and
   `~/.gemini/AGENTS.md` if it exists. The pact owns those files from here
   (S9).
7. Run the dry run. Any rules target it calls unrecorded is a copy step 3 or
   6 missed.
8. After T9's apply and C26's sessions, which push with the owner's own
   credentials since `agent-identity` is off, turn it back on in
   `~/.pact/config.json`, run `node claude/tools/gh-app.mjs refresh` from the
   release clone, and apply again.

The old backups stay where they are, as the owner's; `docs/install.md`'s
never-sync rule names both folders.

## S15 Threat model

**New crossings:**

- **Code that runs:** the bootstrap, fetched by `npx` from the repo at a
  release tag, and the clone it makes; both run with the owner's rights
  before any dry run. The guard script and its wrappers run before every
  shell call in Codex and Antigravity, and in Antigravity before typed input
  and, while a skill is asked on, before each file read.
- **Merges and installs:** installs now reach `~/.codex`, `~/.gemini` and
  `~/.agents/skills` as well as `~/.claude`, and an own harness's paths.
- **A write key in CI:** the release job tags with the release app's key.
- **What leaves the machine:** Codex and Antigravity sessions send their
  context to OpenAI and Google: the rendered rules, pins, private tracker
  text, hand-offs and private code among it.

**Controls:**

- the tag rulesets (GitHub): every tag, created only by the release app, none
  moved or deleted. They don't hold while the owner edits them (S10);
- the `release` environment (GitHub): only `main` reads the app's key. It
  doesn't hold if the environment allows another branch, or the key is also a
  repository secret;
- the release job's conditions: a push run of `gate` on this repo's `main`,
  at `main`'s tip, with `PACT_RELEASES` on (C23);
- `main`'s ruleset, as today, so a release commit passed review and `gate`;
- the bootstrap's exact-name pick and its head check, which keep the clone
  consistent; npm, not the bootstrap, picks which bootstrap runs, so the tag
  rulesets decide it;
- the dry run and the owner's typed apply, as today;
- `workflow.test.mjs`'s allow-list for the release job, and its refusal of
  a secret or a deployment environment in the other workflows;
- the guard's fail-closed answer;
- Codex's sandbox and approval policy, which don't hold under full access,
  and Antigravity's permission settings, which don't hold under
  auto-proceed;
- Codex's trust step: a precondition for the guard to run, not a control on
  a change to the script or the table;
- Codex's shell environment policy (S13), which a trusted project's config or
  a `-c` flag sets back;
- the hook command's and the bootstrap's guard against a `node` or `git` in
  the working folder (S8, S10).

**Residual:**

- **`npx` runs code from GitHub.** A person who types the command trusts
  GitHub and the tag rulesets. npm may cache a resolved copy. The head check
  compares ids from the same server, so it checks consistency, not
  integrity. This widens "What you install and CI run".
- **The release app's key** does all `contents: write` does, not tags alone:
  it can push a branch no ruleset covers, and merge what `main`'s ruleset lets
  through. A change merged to `main` can read the key from the `release`
  environment; required reviewers on it would stop that without a session's
  help, at one click per release. This widens "What you install and CI run":
  the owner's call.
- **A guard that never runs.** In an own harness, or in Codex before the
  trust step, a guard can be missing with no report beyond the dry run's
  line. The owner accepted this for own harnesses.
- **Codex lenses** have the session's own reach. A lens steered by what it
  reads can write files or send data within the parent's sandbox, and read
  what the owner's account can: the agent app's key in Credential Manager,
  `~/.codex/auth.json`, `gh`'s token and `~/.pact`. The tree check (S12)
  sees a change to the work tree's status and content, to refs and to git's
  own folders. It doesn't see a write outside them, a read or a send, and a
  write inside an ignored folder too big to hash is seen only by its status
  line. MCP servers come from the parent and run outside the sandbox, so the
  owner's option is to run Codex lenses only with the parent's network off
  and no MCP server in its profile. T4's probe found that neither holds it
  everywhere: an interactive session asks before a lens's MCP call unless the
  server marks the tool read-only, `codex exec` runs at `never` and asks about
  nothing, and on native Windows the `unelevated` sandbox with network off
  still let a raw loopback connection through. This widens "Review rests on
  rules": the owner's call, asked before T4 starts.
- **An Antigravity session can still start an owner's command.** The skill's
  own switch keeps it out of what the model sees, and the guard asks before a
  read tool opens its file, but a shell read, a copy elsewhere or a child
  `agy` run passes both; another read tool, an 8.3 name, a relative path or a
  link to the folder passes the ask; and whether the ask holds under
  auto-proceed is not probed. So a session there may start `make-it-so` on its own; the skills'
  first line (S7) is a rule the model keeps, not a control. After `scry`,
  `make-it-so` means "yes, 1 to N", open security picks included, and the
  record then shows it as the owner's answer. Or it starts `finis` and ends
  the work. In that harness only, the owner's typed answer stops being a
  sure sign the owner gave it. This spec's answer is that nothing a session
  starts itself is the owner's word for an install apply or mise trust; no rule
  a session loads says so, and nothing enforces it. What is left
  fits "A session takes checkpoints alone" only if that class widens to
  name it: the owner's call, asked before T5 starts. On a no, Antigravity
  leaves the default install list (`defaultInstall: false`) until a probed
  hook holds; it stays detected, and the owner can still name it in the
  list.
- **The poster in Codex** doesn't refuse a post holding a secret the shell
  policy drops, since it can't see it (S13), not even one read from where it
  was set. It is a control that works without the session's cooperation, so its
  weakening is the owner's call.
- **Secrets in Codex's environment.** A secret under a name without KEY,
  SECRET or TOKEN, such as `DB_PASSWORD` or `GITHUB_PAT`, reaches every
  command, hooks see every variable, and a config that sets its own policy is
  left as it is (S13). A dropped value stays readable where it was set: a shell
  profile, which a login shell reads again, a saved Windows user variable, a
  `.env` file or a credential store. Codex's documentation says it allows login
  shells by default; `allow_login_shell = false` would stop the profile route,
  at the cost of any tool that relies on one, and the install doesn't set it.
  Neither was probed.
- **Project installs** tighten a repo in Claude Code alone (S13).
- **An old copy** left behind loads beside the new pact until a person
  removes it; S14's dry run catches only a rules file.
- **Guards are speed bumps,** as the deny rules are today: another spelling
  gets past them, and in Codex so does text typed into a running shell, which
  runs no hook (T4's probe). `features.unified_exec_tty=false` closes that in
  Codex, at the cost of every interactive terminal session and an edit inside
  the owner's `[features]`; the install doesn't set it. Antigravity's
  hook meets typed text through `manage_task`; text sent a few characters at a
  time passes it, and `send_command_input`'s arguments are not probed.
- **A lens's leftover process** in Codex outlives the lens, so it can write
  after the tree check (T4's probe).
- **Antigravity's shells keep secret-named variables** (T5's probe), and no
  setting that drops them was found: don't start an Antigravity session with
  secrets in its environment. The owner's call.

**The class and the scope.** "What you install and CI run" widens to name the
bootstrap and the release app's key, and "Merges and installs" names
`~/.pact` and the harness folders. Scope gains Codex with OpenAI's models and
servers, and Antigravity with Google's, out of scope as Anthropic's are. The
harness controls name both harnesses' controls and when each doesn't hold.
Widening a class and changing the scope are the owner's calls. The threat model must stay within its word budget:
4,100 words of prose (S2 item 47), raised on the owner's
word-cap rule. T4 and T5 raised `docs/install.md`'s budget to 10,350 on the
same rule, and T5, merging T6's text, `docs/reference.md`'s to 2,450.

## S16 Trade-offs

| Pull | Side taken | Driver |
| --- | --- | --- |
| A guard that fails open vs closed | Closed: a broken guard blocks shell calls in that harness | A guard that fails open in silence guards nothing |
| One hook everywhere vs native rules where they exist | Native in Claude Code, the hook elsewhere | No control in Claude Code is loosened |
| `ask` as an experimental Codex prompt rule vs deny | Deny, with a line to the owner | The pact relies on nothing experimental |
| Automatic migration vs by hand | By hand, once | The owner's pick: a simple installer |
| Tags vs the newest passing commit read from the API | Tags, at the cost of a CI write token | The owner's pick; a tag can't move under the ruleset |
| Linking the rules vs rendering them | Rendering | The text differs per harness (paths, capabilities, models) |
| Loose checks on own harnesses vs known only | Loose | The owner's pick: no wait for a release |

## S17 Target environments

- **The owner's Windows 11 machine,** Node 24 under mise, with all three
  harnesses; links are junctions.
- **macOS and Linux** in CI (`gate-macos`, `gate`), with symlinks.
- **Codex CLI** at the version T4 records, **Antigravity** at the version T5
  records: its CLI, agy 1.2.14, headless on Windows.

## S18 Acceptance claims

**The home and the harnesses**

- **C1** Every file the install writes for the pact
  itself is under `~/.pact`; no payload file, tool, hook, command or agent
  names `~/.claude/pact` (a gate test greps).
- **C2** A dry run lists each detected known harness and each own harness,
  and says which the install list takes; a recorded harness whose `detect`
  folder is gone stays in, with a warning; one with `defaultInstall: false`
  is detected and out.
- **C3** For Claude Code, the rendered rules, agents, commands and settings
  match today's bytes, except for the paths, the neutral phrases and the
  model roles of S6 and S7, and S7's command changes: the first line,
  `finis`'s archive block and `scriptorium`'s list (a gate test diffs
  against a fixture, in which Quick Build reads "planning model, low").
- **C4** An own harness with an unknown format refuses (`harness-format`), and
  one with a path inside a git work tree, inside `~/.pact` or outside the
  home refuses (`harness-path`). One with hooks gets the "guards unverified"
  line.
- **C30** `--home` inside a git work tree refuses.

**Rendering**

- **C5** Each known harness's agents render in its format, with its models in
  place of the roles; a `light` role with no light model gets the executor
  model. Each Codex agent file turns off apps, plugins, memories and the
  permission-request tool. An Antigravity lens whose mapped tools come out
  empty or lose a read tool refuses (`agent-tools`), and an Antigravity agent
  has a shell only where its source has one.
- **C6** A rules file over a harness's cap refuses (`rules-cap`); above half
  of a shared cap, the dry run warns.
- **C7** A capability block renders only into a harness that has the
  capability.
- **C8** A configuration that names a model gets the dry run's warning in
  each harness but Claude Code.
- **C9** All four commands reach every harness: as commands in Claude Code,
  as skills wherever `skills` is set. In Codex each skill carries
  `allow_implicit_invocation: false`. `make-it-so`, `finis` and `scry` open
  with S7's line everywhere. `finis` without `archive` ends with S7's line
  and archives nothing. `scriptorium` names no one harness's folders.
- **C10** `review.md` holds S12's tree check: git's folders found through git
  and put back first, `HEAD`, refs and stash recorded, status with content
  hashes and filters and fsmonitor off, moved refs reset, only what changed
  restored, and the copies outside the work tree, deleted afterwards.
- **C29** Each harness's rendered rules hold the models line with its own
  models, also under a configuration that replaces the tiers block.

**The guard**

- **C11** Claude Code's permission rules are byte for byte today's, for each
  switch setting.
- **C12** For each command rule in the table, the Codex and the Antigravity
  wrapper,
  run through the rendered entry's exact command text, each deny the
  matching command across the tokenizer cases, in their own deny shape, and
  answer nothing for a command no rule matches. The command names an
  absolute path and clears `NODE_OPTIONS`; this runs on `gate-windows` too,
  under cmd and PowerShell, where a `node.cmd` planted in the working folder
  never runs, and a launcher whose wrapper can't run denies. Antigravity's
  wrapper judges typed input the same way, and answers `force_ask` to either
  read tool on an owner's skill file.
- **C13** An `ask` rule answers `force_ask` in Antigravity and is denied in
  Codex with S8's line.
- **C14** A planted error in the guard, a missing table, a malformed call and
  an inherited `NODE_OPTIONS=--require=<missing>` each get the fail-closed
  deny, never an allow (a test per wrapper). The Codex deny always carries a
  non-empty stderr, and no deny holds any part of the call.
- **C15** The dry run and the apply print Codex's trust step when the hook
  entry is new or changed, and not otherwise.
- **C16** The hook entry merges by key into a hooks file the record doesn't
  list as well as one it does; the person's other hooks stay, only the
  pact's entry is recorded, and switching every rule off removes only it.

**The installer**

- **C17** One apply writes every harness's files, records each in
  `install.json`, and backs up each replaced file first; the apply refuses
  on a commit or hash other than the dry run's. Drift is reported per
  harness.
- **C18** An unrecorded rules file at a target refuses
  (`unrecorded-target`); an unrecorded agent or skill is listed as yours and
  left as is. A harness dropped from the list has its recorded files removed.
- **C19** A link is a junction on Windows and a symlink elsewhere, falling
  back to a copy with a dry-run line; a harness with `skill-copies` gets
  copies; only recorded links and copies are removed.
- **C33** While Codex is taken, one apply puts S13's shell policy line first in
  `.codex/config.toml`, backs the file up and records it; a config that names
  the policy itself is warned about and left; a recorded line changed or moved
  under a table is drift; a Codex taken out loses only that line.
- **C20** The cloud generator's output changes only in the `~/.pact` paths.
- **C31** After an apply with an empty install list, `install.json` lists
  nothing and every recorded target is gone; `docs/install.md`'s rollback
  brings the hand copies back from their backup (a documented check).

**Packaging**

- **C21** `package.json` has one `bin`, no dependencies and no install
  scripts; the gate test fails on each.
- **C22** The bootstrap takes the highest tag named exactly `v1.<n>.0`,
  ignores every other name, and prints the tag; it refuses when the clone's
  head isn't the tag's commit, and deletes the clone; it never runs
  `--apply`; the apply line it leads to runs from another folder; a fake
  `git` in the folder it runs from never runs.
- **C23** `workflow.test.mjs` passes the release job only with a job token that
  only reads, no secret but the release app's key, the `release` environment,
  an app token asked for `contents: write` alone, SHA-pinned actions, no
  checkout, the `workflow_run` trigger on `gate`, and each of S10's `if`
  conditions; a bad case for each fails it, and so do a missing `release`
  concurrency group, a second workflow file that uses `workflow_run`, and
  another workflow that reads a secret or names an environment.
- **C28** With no terminal and neither flag, the bootstrap refuses
  (`bootstrap-choice`); `--default` never overwrites an existing
  configuration; the bootstrap keeps three clones.
- **C32** Through the bootstrap path, installing a release lower than the
  recorded one warns "behind the last install", and a higher one doesn't; a
  checkout behind the recorded release's commit warns too.

**Scriptorium**

- **C24** The harness section sets each harness's three models and its place
  in the install list, and adds an own harness; the page shows each
  harness's rendered rules.
- **C25** The bootstrap's builder choice writes the page to
  `~/.pact/scriptorium.html` without installing anything.

**The threat model (T8)**

- **C27** `docs/threat-model.md` names the bootstrap, the release app's key
  and its `release` environment, `~/.pact`
  and the harness folders in their classes, both harnesses' controls with
  when each doesn't hold, the scope line, and each owner answer; the
  doc-budget test passes.

**End to end (T9)**

- **C26** On the owner's machine, after S14's removal: one dry run and one
  apply from a release tag install into all three harnesses; Codex's hook is
  trusted; in each harness a session shows the rules loaded, runs a lens as
  a subagent on its planning model, and a guarded command (a raw
  `git worktree remove`, with the cleaner on) is denied. The Codex and
  Antigravity rules name no Claude model, and the dry run warns of no own
  model name. On the owner's no to a widening: Codex runs a lens in a
  separate session, and Antigravity is installed only when the list names
  it.

## S19 Rollback

An older installer knows only `~/.claude`. To go back, in one sitting with no
other session running: turn `agent-identity` off and apply; run the new
install with an empty `harnesses.install` list and apply, which removes every
recorded file; move the configuration back to `~/.claude/pact/` and the hand
copies back from `~/.pact/backups/hand-copies/`; follow `docs/install.md`'s
rollback checks for the older commit; then turn `agent-identity` back on
there. Done when `install.json` lists nothing, every recorded target is gone,
and the older install's dry run shows no drift (C31). Tags already pushed
stay; nothing runs them unless someone types the bootstrap command.

## S20 Tickets

1. **T1: the neutral home and harness descriptions.** S4, S5, S9, S13, S14,
   S19; C1–C4, C17, C18, C20, C30, C31. The installer, renderer and seam A
   take a list of harnesses; Claude Code moves to `~/.pact` with today's
   bytes but for paths; the tools and docs; `CONTEXT.md`; a dated log. T1
   proves C17 and C18 with a test harness of the `claude-md` format in a test
   home; T4 and T5 run them again for their harnesses. The `--home` rename
   reaches `gate.yml`, which is read closely.
2. **T2: the neutral rules source and per-harness render.** S6, S7, S12's
   `review.md` step; C5–C10, C29. Each changed rule's row in
   `docs/rule-reasons.md`; `node builder/default-config.mjs`; C3's fixture
   updated for S7's command changes only; a dated log. Depends on T1.
3. **T3: the rule table and the shared guard.** S8; C11–C16. Depends on T1.
4. **T4: Codex.** Its description, agents, skills and guard wrapper; C5, C9,
   C12–C15, C17 and C18 as they hold in Codex, C19 and C33; a probe session on the
   installed Codex that confirms the deny shape, the trust step, the exact
   hook command, the environment the poster sees, whether Codex asks before
   a lens's MCP call, and what its sandbox holds on native Windows, in its
   record. Depends
   on T2, T3 and the owner's answer on Codex lenses.
5. **T5: Antigravity.** The same, with the tool-name table; C5, C9, C12–C14,
   C17 and C18 as they hold in Antigravity; a probe session that confirms the
   deny, the `force_ask`, the exact hook command, each mapped tool name, what
   an empty tool list means, and whether a `force_ask` on reading a skill
   makes Antigravity ask. Depends on T2, T3 and the owner's answer on
   Antigravity skills. Runs beside T4.
6. **T6: packaging and releases.** S10; C21–C23, C28, C32; which actor the
   tag ruleset's bypass can name, in its record. Depends on T1.
7. **T7: Scriptorium.** S11; C24, C25; the ADR amending 0171. Depends on T2.
8. **T8: the threat model and the ADR.** S15; C27. May run beside T1–T7.
9. **T9: end to end.** C26. Depends on T1–T8 merged, the owner's answers
   below, the tag ruleset, the owner's S14 steps and the owner's apply.
   First it lists the remote's tags and the rulesets by API: both cover every
   tag, only the release app bypasses the one on creating, none bypasses the
   one on updating and deleting, and no tag but a release ends in a version.
   It also lists the `release` environment's branch rule, and the repository
   secrets by name, never value: `PACT_RELEASE_APP_KEY` is not among them.
   Then the owner sets `PACT_RELEASES`, and a push to `main`
   or a re-run of `gate` at the tip makes `v1.1.0`.

**The freeze.** No apply writes into `~/.pact`, from a release tag or a
checkout, before T9, and none before the owner has answered the two
widenings and the scope change. Until then gate tests install into `--home`
test folders only, the release job tags nothing, since `PACT_RELEASES` is
unset, and the owner's live install updates only from a checkout before T1's
merge, or not at all.

The work runs at the thorough tier on the sensitive route. The security pair
reads this spec and each ticket's diff.

### Needs the owner

| What | Kind | When |
| --- | --- | --- |
| The older Codex mirror ticket's state | the owner's call | any time |
| The security picks, S2 items 35–39 and 42–44 | the owner's call | before the ticket each touches starts |
| The final round's trade-offs, S2 items 45 and 46 | the owner's call | before T1 starts |
| Widening "Review rests on rules" for Codex lenses, and the network-off option (S15) | the owner's call; on a no, S12's fallback | before T4 starts |
| Widening "A session takes checkpoints alone" for Antigravity skills (S15) | the owner's call; on a no, S15's fallback | before T5 starts |
| The scope change: Codex with OpenAI, Antigravity with Google (S15) | the owner's call | before T8 merges |
| The threat-model cap at 4,100 (S2 item 47) | the lead's flagged pick, for review | any time |
| Mermaid blocks left out of the threat-model count (S2 item 48) | the lead's flagged pick, for review | any time |
| The poster's narrower coverage in Codex, which the install's shell policy makes: it no longer refuses a value the policy drops, though a command can still read it where it was set (S13, S15) | the owner's call | at T4's probe |
| Typed input in Codex: leave it open, or set `features.unified_exec_tty=false` (S15) | the owner's call, security | any time |
| Login shells in Codex: leave them on, or set `allow_login_shell = false` (S15) | the owner's call, security | any time |
| Codex lenses' approval and network-off limits, and leftover processes (S15) | the owner's call, security | with the lenses widening |
| The "guards unverified" line for own harnesses (S5) | an offer, unanswered; built as offered | any time |
| Two tag rulesets on every tag (S10): creating, the release app its one bypass once it exists; updating and deleting, no bypass | the owner's own act | before T6 merges |
| The release app as that bypass, and its key's reach (S2 item 49, S15) | the owner's call | before T9 |
| The raised budgets of two docs (S2 item 50) | a flagged pick, for review | any time |
| The release app (contents write, this repo only); the `release` environment, set to selected branches with the one rule `main` and no tag rule, before it holds the key; the key as its secret `PACT_RELEASE_APP_KEY`, never a repository secret, the downloaded file then deleted; the variable `PACT_RELEASE_APP_CLIENT_ID`. A leaked key: uninstall the app, delete the key, check the tags, branches, merges and releases it made | the owner's own acts | before T9 |
| Required reviewers on the `release` environment (S15) | an offer, unanswered; built without | before T9 |
| `PACT_RELEASES` set to `on` | the owner's own act | in T9 |
| S14's one-time removal; its step 4 moves the hand ports out of use | the owner's own machine | straight before T9's apply |
| Each install apply | the owner's typed command | in T9 |
| Trusting the Codex hook in `/hooks` | the owner's own act | after T9's apply |

### Stop and ask when

- Claude Code's rendered bytes can't match today's but for S7's changes;
- a harness's hook can't deny as S8 says, or fails open on a caught error;
- a hook command can't name an absolute path or clear `NODE_OPTIONS`;
- npm can't resolve `#semver:` against the repo's tags;
- the tag ruleset's bypass can name no actor narrower than every workflow;
- the owner declines a widening and its fallback can't be built;
- the threat-model edit can't fit its word budget;
- a known harness's docs and its behaviour on the owner's machine differ on
  a field S5 names.

## S21 Out of scope (deferred)

- A public release: a written uninstall, something that starts a lens
  session, and checks on own harnesses.
- Migration from the old layout, and a check for an old copy.
- A compaction hand-off outside Claude Code.
- The cleaner outside Claude Code.
- A second workflow for research or writing.
- Cloud sessions in Codex or Antigravity.
- Antigravity plugins.
- Project installs outside Claude Code.
- Own rules text for one harness only.
- A harness's own home variable, such as `CODEX_HOME`.
