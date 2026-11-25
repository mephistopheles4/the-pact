# Spec: a harness-agnostic pact — V1

Status: draft, before review. The owner settled the design in two rounds
(S2). The lead took the spec's further picks as flagged checkpoints. The
spec counts once it is on `main`.

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
copies are gone (S18, C26).

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

30. `make-it-so` ports only where a skill can be kept from the model's own
    invocation (Codex); `finis` stays Claude Code's; `scry` and
    `scriptorium` port everywhere (S7).
31. Codex lenses keep the shell and are read-only by instruction, with a
    tree check before and after each one (S12). A new residual for the owner
    (S15).
32. The guard's hook entry is fixed, since Codex's trust covers the entry and
    not the script (S8).

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
- **Release tag:** a tag `v1.<n>.0` that the release workflow puts on a
  commit of `main` after `gate.yml` passed on it (S10).

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
  outside any git work tree, as the Claude home must be today. No
  environment variable moves it.
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
- `skills`: `{ "dir" }`, the folder skills are linked into; or absent.
- `commands`: `{ "dir" }`, Claude Code's commands folder; or absent.
- `hooks`: `{ "file", "format" }`, format one of `claude`, `codex`,
  `antigravity` (S8); or absent.
- `models`: `{ "planning", "executor", "light" }`, each a model name the
  harness takes, `light` optional.
- `capabilities`: a list from `subagents`, `tool-limits`, `cleaner`,
  `native-rules`, `hook-ask`, `hook-trust` and `explicit-skills`, naming
  what the render may rely on (S7, S8, S12). `tool-limits` means an agent
  file can take tools away; `explicit-skills` means a skill can be kept from
  the model's own invocation.

The known descriptions:

| | Claude Code | Codex | Antigravity |
| --- | --- | --- | --- |
| `detect` | `~/.claude` | `~/.codex` | `~/.gemini` |
| `rules` | `~/.claude/CLAUDE.md`, no cap | `~/.codex/AGENTS.md`, cap 32768 shared | `~/.gemini/AGENTS.md`, cap 24000 |
| `agents` | `~/.claude/agents`, `claude-md` | `~/.codex/agents`, `codex-toml` | `~/.gemini/config/agents`, `antigravity-md` |
| `skills` | none | `~/.agents/skills` | `~/.gemini/config/skills` |
| `commands` | `~/.claude/commands` | none | none |
| `hooks` | `~/.claude/settings.json`, `claude` | `~/.codex/hooks.json`, `codex` | `~/.gemini/config/hooks.json`, `antigravity` |
| `models` | `opus`, `sonnet`, `haiku` | `gpt-6.2-sol`, `gpt-6.2-astra`, none | `pro`, `flash`, `flash` |
| `capabilities` | `subagents`, `tool-limits`, `cleaner`, `native-rules` | `subagents`, `hook-trust`, `explicit-skills` | `subagents`, `tool-limits`, `hook-ask` |

- **Detection.** The dry run lists each known harness whose `detect` folder
  exists, and each own harness. A harness is installed into only when the
  configuration's `harnesses.install` list names its id. A missing list means
  every detected known harness. The dry run says which are in and which are
  out.
- **An own harness** may set any field above, but its formats must be the
  pact's own names; any other value refuses (`harness-format`). Its paths
  must be absolute, under the home folder, outside any git work tree and
  outside `~/.pact`; otherwise it refuses (`harness-path`). Nothing else is
  checked. The dry run prints, for each own harness with `hooks`: "guards
  unverified for <name>: the pact has not seen this harness run its hook".
- **A known harness's fields** may be overridden by an own entry of the same
  id, field by field, under the same checks, with a `WARN` naming each.

## S6 Models: roles and mapping

- **The rules name roles.** The tier table and the workflow table say
  "planning model, low" and "executor model, high", never a model name. The
  sensitive route says "planned on the planning model at high". Under the
  tier table, each rendered copy gets one line: "Here the planning model is
  <planning> and the executor model is <executor>." The source holds
  `<!-- pact:models -->` where the line goes.
- **Agent files name roles.** Each source agent's `model:` is `planning`,
  `executor` or `light`: every lens `planning`, scout `light`. The renderer
  writes the harness's model in its place. `light` with no light model
  writes the executor model.
- **A person's own names still work.** A configuration block, an agent
  setting or a builder table cell that names a model, such as "Opus", renders
  as written, in every harness. The dry run warns for each harness that isn't
  Claude Code: "<file> names model <name>, which <harness> may not have".
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
| Commands | `commands/<n>.md`, as today | skills, where S7's rule allows | skills, where S7's rule allows | skill folders linked |
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

**Agents.** One source per agent, `claude/agents/<n>.md`, rendered per format:

- `claude-md`: as today, with the model role mapped.
- `codex-toml`: the body goes to `developer_instructions` as a TOML literal
  string; a body holding `'''` refuses (`agent-toml`). `tools` has no field
  and is dropped; S12 says what that costs.
- `antigravity-md`: `tools` is mapped through a fixed table per harness from
  the pact's tool names (`Read`, `Glob`, `Grep`, `Bash`, `WebFetch`,
  `WebSearch`) to Antigravity's; a name with no entry is dropped with a
  `WARN`, since a wrong name can hang a subagent. T5 fills the table from
  Antigravity's docs and checks it in a probe session (T5's record).

**Commands as skills.** A pact command stands for an answer the owner types.
A skill the model can start on its own could stand in for that answer, so:

- `make-it-so` and `finis` port only to a harness with `explicit-skills`.
  In Codex each skill folder gets `agents/openai.yaml` with
  `policy.allow_implicit_invocation: false`, so it runs only when typed as
  `$make-it-so`. `finis` archives a Claude Code session, so it stays Claude
  Code's in V1.
- `scry` and `scriptorium` port to every harness with `skills`; the model
  starting either one answers a question or builds a page, and decides
  nothing.
- Antigravity has no way to keep a skill from the model, so it gets `scry`
  and `scriptorium` only. The dry run names each command left out of a
  harness, and why.
- A skill is the command's body as `SKILL.md`, with `name` and
  `description` frontmatter and its paths on `~/.pact`. Claude Code keeps
  the commands as commands.

**Links.** A skill folder is linked from the harness's skills folder to
`~/.pact/skills/<n>`: a symlink, or on Windows a directory junction, which
needs no extra rights. If neither can be made, the install copies the folder
and the dry run says so. The install records each link or copy and removes
only what it recorded.

## S8 The guard

**The rule table.** `rules.json` holds today's guard rules as data, from the
same source as `gate/install-core.mjs`'s `CLEANER_DENY`, `CLEANER_ASK` and
`STOP_DENY`: each rule an `id`, a decision (`deny` or `ask`), the switch it
hangs on (`cleaner` or `session-stop-deny`), and the command words it
matches. The table is rendered from the configuration, so a rule whose switch
is off is not in it.

**Claude Code** keeps its native permission rules. The install renders them
from the table, and they are byte for byte today's (C11). No hook is added to
Claude Code for them.

**Codex and Antigravity** get one PreToolUse hook each, which runs
`node ~/.pact/guard/<harness>.mjs`:

- The wrapper reads the call from stdin in its harness's shape (Codex:
  `Bash`; Antigravity: `run_command`), passes the command text to `guard.mjs`,
  and writes its harness's answer. Codex: exit 2 with the reason on stderr,
  since an exit 2 with an empty stderr lets the call through. Antigravity:
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
  (<code>); run the pact's dry run." It never answers allow; a call no rule
  matches gets no answer at all, so the harness's own permission flow goes
  on. Both harnesses let a call through when the hook can't start, crashes
  past the wrapper or times out, so the hook entry sets a 15 s timeout and
  the guard reads only the table and the call.
- **Codex's trust step.** A Codex hook runs only once a person trusts it in
  `/hooks`. Codex hashes the hook entry (event, matcher, command, timeout),
  not the script's bytes, so the entry stays fixed and an update to
  `guard.mjs` or the table needs no new trust. The dry run and the apply
  print, whenever the entry is new or changed: "Codex: open /hooks and trust
  pact-guard; until then Codex runs unguarded." 
- **The hook entry** merges into the harness's hooks file by key, as
  `compact-handoff` merges into `settings.json` today: the person's other
  hooks stay, and switching every rule off removes only the pact's entry.

**The compaction hand-off** stays Claude Code's. Antigravity has no
compaction event, and V1 adds none to Codex.

## S9 The installer

The installer is today's, generalised from one home to many harnesses:

- **One record.** `~/.pact/install.json` lists every file, link and settings
  entry the install wrote, in every harness, with its harness id and hash.
- **One dry run, one apply.** The dry run renders for each harness in the
  install list, prints a block per harness (its files, links, hook entry,
  warnings), and ends with the apply line. The apply binds the commit and the
  rendered hash, as today, across all harnesses together.
- **One backup** per apply under `~/.pact/backups/`, holding each replaced
  file from every harness, with a manifest naming its harness.
- **Never over an unrecorded file.** Where a target holds a file, folder or
  link the record doesn't list, the dry run lists it under "Yours, left as
  is" for agents and skills, as today. For the rules file and the hooks file
  it is refused (`unrecorded-target`), naming the path and the one-time
  removal in `docs/install.md`. This is a general rule, not a check for the
  old layout.
- **A harness taken out** of the install list has every recorded file, link
  and entry removed by the next apply, from its backup-first copy.
- **Seam A** keeps its job, the payload's copy set, with a `--harness` list in
  place of the one Claude home. The cloud generator passes `claude` only.
- **From a checkout** the owner runs `node gate/install.mjs` as today, with
  `--home` in place of `--claude-home` (S4).

## S10 Packaging and releases

**The command:** `npx github:mephistopheles4/the-pact#semver:^1`. npm resolves
the newest `v1.x.y` tag and runs the package's one `bin`, `pact`.

**`package.json`** at the repo root: `name`, `version` `1.0.0`, `bin`,
`engines.node` `>=24`, `files`, no dependencies of any kind and no install
scripts. A gate test holds it to that shape (C21).

**The bootstrap,** `bin/pact.mjs`, uses Node's built-ins only:

1. Runs `git ls-remote --tags https://github.com/mephistopheles4/the-pact.git 'v1.*'`,
   with no shell, and takes the highest release tag and its commit.
2. Clones that tag with `--depth 1 --branch <tag>` into
   `~/.pact/source/<sha>`, unless that folder already holds it, and checks
   that its `HEAD` is that commit. On any difference it refuses
   (`release-head`) and deletes the clone.
3. Asks: install the default configuration, or open Scriptorium first (S11).
   With `--default` or `--builder` it doesn't ask; with no terminal it
   refuses (`bootstrap-choice`).
4. Runs `gate/install.mjs` from the clone for the dry run, which prints the
   apply command. The bootstrap never runs `--apply` itself.

It keeps the last three clones and deletes older ones it made.

**The release workflow,** `.github/workflows/release.yml`:

- triggered by `workflow_run` of `gate` completing with `success` on a push to
  `main`;
- one job with `permissions: contents: write` and nothing else, no secrets,
  actions pinned by SHA;
- tags `head_sha` as `v1.<run_number>.0`, unless a release tag already
  points at it, and pushes only that tag;
- runs none of the repo's code.

`gate/tests/workflow.test.mjs` gets an exact allow-list for this job, the way
it holds the CodeQL and Claude jobs: this is a widened check (a spec change,
flagged big), read by the security pair.

**The tag ruleset** is the owner's act on GitHub: only the release workflow
creates `v*` tags, and no one updates or deletes one (S20, Needs the owner).

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
  by its instructions alone. `review.md`, one shared file, gains one step
  under Running a lens: in a harness whose agents can't be held to their
  tools (Codex today), the session compares `git status --porcelain` before
  and after each lens; a lens that changed the tree is inconclusive, and the
  change is undone before the next lens.
- **Antigravity lenses** run on Gemini tiers only; the planning model there is
  `pro`.

## S13 Other consumers

- **Cloud sessions** stay Claude Code only. `cloud-sessions/gen.mjs` passes
  the Claude harness and gets the `~/.pact` paths.
- **The tools** read their pins and settings from `~/.pact`. The cleaner
  stays Claude-only. `gh-app.mjs`'s providers stay as they are.
- **Docs.** `docs/install.md`, `docs/agents/install.md`,
  `docs/agents/issue-tracker.md`, `docs/agents/agent-apps.md`,
  `docs/reference.md` and the README name `~/.pact`, the `npx` command and
  the three harnesses.

## S14 The one-time removal

V1 has no migration. `docs/install.md` gains a one-time section, "Before the
first install into `~/.pact`", for the owner:

1. Move `config.json`, `blocks/`, `builder.json`, `presets/`, `github.json`,
   `linear.json`, the `gh-app-*.gitconfig` files and `handoffs/` from
   `~/.claude/pact/` to `~/.pact/`. A pinned agent app's gitconfig path must
   then be refreshed with `gh-app.mjs refresh`.
2. Delete what the old record `~/.claude/.pact-install.json` lists, then the
   record itself, and the pact's entries in `~/.claude/settings.json`.
3. Delete the hand copies: `~/.gemini/config/plugins/the-pact/` and the
   pact text in `~/.codex/AGENTS.md`.
4. Run the dry run. Any target it calls unrecorded is a copy step 2 or 3
   missed.

The old backups stay where they are, as the owner's.

## S15 Threat model

**New crossings:**

- **Code that runs:** the bootstrap, fetched by `npx` from the repo at a
  release tag, and the clone it makes; both run with the owner's rights
  before any dry run. The guard script and its wrappers run before every
  shell call in Codex and Antigravity.
- **Merges and installs:** installs now reach `~/.codex`, `~/.gemini` and
  `~/.agents/skills` as well as `~/.claude`, and an own harness's paths.
- **A write token in CI:** the release job can push tags.

**Controls:**

- the tag ruleset (GitHub): only the release workflow creates `v*` tags, none
  is moved or deleted; it doesn't hold while the owner edits the ruleset;
- `main`'s ruleset, as today, so a tagged commit passed review and `gate`;
- the bootstrap's head check against the tag's commit (the pact's tools);
- the dry run and the owner's typed apply, as today;
- `workflow.test.mjs`'s allow-list for the release job;
- the guard's fail-closed answer, and the harnesses' own permission settings;
- Codex's trust step, which holds a changed hook back until the owner trusts
  it.

**Residual:**

- **`npx` runs code from GitHub.** A person who types the command trusts
  GitHub and the tag ruleset. npm may cache a resolved copy. This widens
  "What you install and CI run".
- **A guard that never runs.** In an own harness, or in Codex before the
  trust step, a guard can be missing with no report beyond the dry run's
  line. The owner accepted this for own harnesses.
- **Codex lenses** have the session's own reach: a lens steered by what it
  reads can write files or send data within the parent's sandbox. The tree
  check (S12) catches a write to the tree, not one outside it or a send.
  This widens "Review rests on rules", and the owner decides it.
- **Antigravity skills** can't be kept from the model, which is why the
  owner's answer commands don't go there (S7).
- **Guards are speed bumps,** as the deny rules are today: another spelling
  gets past them.

**The class.** "What you install and CI run" widens to name the bootstrap and
the release job's tag token, and "Merges and installs" names `~/.pact` and the
harness folders. Widening a class is the owner's call. The threat model must
stay within its word budget.

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
  records.

## S18 Acceptance claims

**The home and the harnesses**

- **C1** Every file the install writes for the pact
  itself is under `~/.pact`; no payload file, tool, hook, command or agent
  names `~/.claude/pact` (a gate test greps).
- **C2** A dry run lists each detected known harness and each own harness,
  and says which the install list takes.
- **C3** For Claude Code, the rendered rules, agents, commands and settings
  match today's bytes, except for the paths, the neutral phrases and the
  model roles of S6 and S7 (a gate test diffs against a fixture).
- **C4** An own harness with an unknown format refuses (`harness-format`), and
  one with a path inside a git work tree, inside `~/.pact` or outside the
  home refuses (`harness-path`). One with hooks gets the "guards unverified"
  line.

**Rendering**

- **C5** Each known harness's agents render in its format, with its models in
  place of the roles; a `light` role with no light model gets the executor
  model.
- **C6** A rules file over a harness's cap refuses (`rules-cap`); above half
  of a shared cap, the dry run warns.
- **C7** A capability block renders only into a harness that has the
  capability.
- **C8** A configuration that names a model gets the dry run's warning in
  each harness but Claude Code.
- **C9** `make-it-so` is installed only where `explicit-skills` holds, and in
  Codex with `allow_implicit_invocation: false`; `finis` only in Claude Code;
  `scry` and `scriptorium` wherever `skills` is set. The dry run names each
  command left out.
- **C10** `review.md` holds S12's tree check.

**The guard**

- **C11** Claude Code's permission rules are byte for byte today's, for each
  switch setting.
- **C12** For each rule in the table, the Codex and the Antigravity wrapper
  each deny the matching command across the tokenizer cases, in their own
  deny shape, and answer nothing for a command no rule matches.
- **C13** An `ask` rule answers `force_ask` in Antigravity and is denied in
  Codex with S8's line.
- **C14** A planted error in the guard, a missing table and a malformed call
  each get the fail-closed deny, never an allow (a test per wrapper); the
  Codex deny always carries a non-empty stderr.
- **C15** The dry run and the apply print Codex's trust step when the hook
  entry is new or changed, and not otherwise.
- **C16** The hook entry merges by key; the person's other hooks stay, and
  switching every rule off removes only the pact's entry.

**The installer**

- **C17** One apply writes every harness's files, records each in
  `install.json`, and backs up each replaced file first; the apply refuses
  on a commit or hash other than the dry run's.
- **C18** An unrecorded rules or hooks file at a target refuses
  (`unrecorded-target`); an unrecorded agent or skill is listed as yours and
  left as is. A harness dropped from the list has its recorded files removed.
- **C19** A link is a junction on Windows and a symlink elsewhere, falling
  back to a copy with a dry-run line; only recorded links are removed.
- **C20** The cloud generator's output changes only in the `~/.pact` paths.

**Packaging**

- **C21** `package.json` has one `bin`, no dependencies and no install
  scripts; the gate test fails on each.
- **C22** The bootstrap refuses when the clone's head isn't the tag's commit,
  and deletes the clone; it never runs `--apply`.
- **C23** `workflow.test.mjs` passes the release job only with exactly
  `contents: write`, no secrets, SHA-pinned actions and the `workflow_run`
  trigger on `gate`; a bad case for each fails it.

**Scriptorium**

- **C24** The harness section sets each harness's three models and its place
  in the install list, and adds an own harness; the page shows each
  harness's rendered rules.
- **C25** The bootstrap's builder choice writes the page to
  `~/.pact/scriptorium.html` without installing anything.

**End to end (T9)**

- **C26** On the owner's machine, after S14's removal: one dry run and one
  apply from a release tag install into all three harnesses; Codex's hook is
  trusted; in each harness a session shows the rules loaded, runs a lens as
  a subagent on its planning model, and a guarded command (a raw
  `git worktree remove`, with the cleaner on) is denied.

## S19 Rollback

An older installer knows only `~/.claude`. To go back: run the new install
with an empty `harnesses.install` list and apply, which removes every
recorded file; move the configuration back to `~/.claude/pact/`; then follow
`docs/install.md`'s rollback checks for the older commit. T1 writes this as a
documented check, like the existing rollback cases.

## S20 Tickets

1. **T1: the neutral home and harness descriptions.** S4, S5, S9, S13, S14,
   S19; C1–C4, C17, C18, C20. The installer, renderer and seam A take a list
   of harnesses; Claude Code moves to `~/.pact` with today's bytes but for
   paths; the tools and docs; `CONTEXT.md`; a dated log.
2. **T2: the neutral rules source and per-harness render.** S6, S7, S12's
   `review.md` step; C5–C10. Each changed rule's row in
   `docs/rule-reasons.md`; `node builder/default-config.mjs`; a dated log.
   Depends on T1.
3. **T3: the rule table and the shared guard.** S8; C11–C16. Depends on T1.
4. **T4: Codex.** Its description, agents, skills and guard wrapper; C5, C9,
   C12–C15 as they hold in Codex; a probe session on the installed Codex
   that confirms the deny shape and the trust step, in its record. Depends
   on T2 and T3.
5. **T5: Antigravity.** The same, with the tool-name table; C5, C9, C12–C14
   as they hold in Antigravity; a probe session that confirms the deny, the
   `force_ask` and each mapped tool name. Depends on T2 and T3. Runs beside
   T4.
6. **T6: packaging and releases.** S10; C21–C23. Depends on T1.
7. **T7: Scriptorium.** S11; C24, C25; the ADR amending 0171. Depends on T2.
8. **T8: the threat model and the ADR.** S15. May run beside T1–T7. No apply
   from a release tag before it merges.
9. **T9: end to end.** C26. Depends on T1–T8 merged, the owner's S14 steps,
   the tag ruleset and the owner's apply.

The work runs at the thorough tier on the sensitive route. The security pair
reads this spec and each ticket's diff.

### Needs the owner

| What | Kind | When |
| --- | --- | --- |
| The older Codex mirror ticket's state | the owner's call | any time |
| Widening a threat-model class | the owner's call | at T8's merge |
| The tag ruleset on GitHub | the owner's own act | before T6 merges |
| S14's one-time removal | the owner's own machine | before T9's apply |
| Each install apply | the owner's typed command | in T9 |
| Trusting the Codex hook in `/hooks` | the owner's own act | after T9's apply |

### Stop and ask when

- Claude Code's rendered bytes can't match today's but for S7's changes;
- a harness's hook can't deny as S8 says, or fails open on a caught error;
- npm can't resolve `#semver:` against the repo's tags;
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
