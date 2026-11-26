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
28. Packaging: an `npx` bootstrap that clones the newest stable release tag,
    and a release workflow that tags passing commits on `main` as release
    candidates (S10, item 71). Its write
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
    and T5 raise `docs/install.md`'s budget from 9,550 to 10,450, for T4's
    skill links, guard and shell policy and T5's Antigravity text beside T6's
    and T7's, and `docs/reference.md`'s from 2,400 to 2,450 on their merges
    with T6 and T7 (`gate/tests/doc-budget.test.mjs`, PACT-110).
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
    Replaced by item 74: candidate names are open to any writer, and only the
    owner creates the rest.
50. Trade-off: the word budgets of `docs/install.md` (8,700 to 9,100, then
    9,500 with T3's text and 9,550 with T7's, before item 47's later raise) and
    `docs/reference.md` (2,300 to 2,400, then 2,450 with T7's) rise, and
    nothing is cut to make room, on the owner's rule; PACT-110 cleans up.
51. Trade-off: the builder kit gains `gate/install-core.mjs`,
    `gate/harnesses.mjs`, `gate/harness-render.mjs` and
    `harnesses/known.json`, so the page chooses and renders harnesses as the
    install does (T7, S11). Three more gate files then install. The owner
    hasn't answered it.

**Ticket T9's picks, the lead's decision 125, flagged:**

52. Trade-off: the threat model's cap rises to 4,200 and `docs/install.md`'s
    budget to 10,650, on the owner's word-cap rule (PACT-109, PACT-110).
53. Security: the tree check also wraps each `scout` pass, and stops, running
    no more git, when a hash check fails (S12).
54. Security: undoing an apply and a full uninstall take only the pact's hook
    out of a hooks file (`docs/install.md`, Undo an apply).
55. Security: `~/.pact` outside Claude Code's protected paths stays an open gap
    in the threat model; no ask rule is added.

**The owner's later pick, relayed by the lead (its decision 132):**

56. Security, a control loosened: the tree check only detects. The lead's
    say-back: "keep a simple check: one command records the repo's state before
    a lens runs and compares it afterwards. The backup copies and the restore
    step go. A lens that changes something is still caught, but your
    uncommitted work can't be put back for you automatically." The owner:
    "Yes, please. That sounds good." It replaces the copies and the restore of
    items 38, 44 and 53 (S12).
57. The owner's pick, relayed by the lead (its decision 135): Antigravity's
    planning model is Gemini 4 Neon and its executor model Gemini 4 Hydrogen,
    each a slug that takes its effort from the tier table; every lens and
    `scout` runs on `flash` and the security pair on `pro`. A per-agent entry,
    `agentModels`, carries it (the session's pick, flagged). Never Carbon.
58. The lead's pick, flagged for the owner (its decision 139): a per-harness
    tier effort, and the page setting each harness's agent models and efforts,
    move to a ticket of their own, merged before this work's pull request.
59. Trade-off: `docs/install.md`'s budget rises to 10,700, on the owner's
    word-cap rule (PACT-110).
60. Security, the lead's pick, flagged for the owner (its decision 146): the
    tree check runs exactly as printed, and reads the folder from its last
    argument, after end-to-end sessions piped the script to `node` (S12).
61. The same pick: a `codex-toml` agent file says to search and read with
    shell commands that only read files, after an end-to-end `scout` refused for lack of
    the tools its instructions name (S7).
62. Trade-off: `docs/rule-reasons.md`'s budget rises to 1,250, on the
    owner's word-cap rule (PACT-110).

**The owner's picks on a trusted machine, relayed by the lead (its decisions
152, 163, 164 and 165), a control loosened, flagged:**

63. Security: the owner's machine is trusted. Programs, processes and agents
    the owner starts there, sessions and lenses included, are guarded against
    their mistakes, never against their turning hostile; one steered by
    outside text stays in scope (the lead's pick on Test round 1). The owner: "Whatever
    I start running on my machine, whether it's a process or an agent, we
    shouldn't be fighting it ... when we protect against mistakes, we don't
    need to be as robust as protecting against attackers." Guards against
    outside text, outsiders' code, a clone's files and programs, downloads,
    the network and release tags stay. The audit table on the issue lists each
    cut.
64. Security: the tree check (S12) catches a lens's mistakes, not a hostile
    lens. Its second run may be read from anywhere, and a lens that forges it
    is accepted under Review rests on rules; this closes the open medium of
    the lead's decision 152.
65. Security: the install keeps its temp-then-replace write and every check on
    what comes from the clone, and loses its race, swap, re-hash, self-differs,
    hard-link, file-mode and preload checks; of the project folder's link
    checks, the first look stays and its re-checks go (S9). Clef's supervisor takes no token: any program on the
    machine may call it, and `Host` and `Origin` still keep web pages out (spec
    0002). The cleaner loses its swap and hooks re-checks, the poster its read
    re-check, and the hand-off folder its owner-only mode. `gh-app`'s refusals
    of `auth`, `extension`, `alias`, `config` and a leading flag stay: they keep
    the bot's token out of the owner's own `gh` login and settings (decision
    165).
66. No rule keeps the owner's user name, home path or live settings' names
    out of a post or a commit, and none replaces it (the lead's pick on Test
    round 1, flagged). "Never post a secret" stays.
67. Spec 0008's `tierEfforts` is deleted (decision 163): a stage names only the
    planning or executor model, and Test stays on the executor model.
68. Security, the lead's decision 166: a Codex lens that can read and send
    keys, PR 676's high, is closed as accepted under the trusted machine:
    outside text stays data (whose text counts), and no network block is
    added (S15, Codex lenses).
69. A known test limit: the Codex end-to-end run reads the real `~/.agents`,
    since Codex finds that folder through the Windows profile, not
    `USERPROFILE`. It isn't isolated, and no fix is planned (C26).
70. Security, the lead's decision 168, the owner: "I agree. Cut it off."
    Agents in a project need its environment variables, so the install no
    longer writes Codex's `shell_environment_policy` line or its warning; the
    setting is the owner's. PR 676's items 4, 5 and 11 are accepted under the
    trusted machine, with no poster key scan in its place (S13, C33).
71. The lead's decision 167, the owner: "I don't want people to immediately
    get the changes I'm doing. Perhaps something like release candidates or
    beta versions." And: "we don't really need to do any rules for pinning.
    Anyone could always specify a specific version or even a release
    candidate." Each green push to `main` tags a candidate; the bootstrap
    takes stable by default, `--channel beta` or `--release <tag>` on request;
    the owner promotes a candidate by a `workflow_dispatch` (the lead's pick,
    flagged); majors stay out of the job (S10, C22, C34). Item 74 replaces
    the promotion.
72. The lead's decision 174, the owner: "Sounds good, go for it." The
    release job splits in two: candidates from a `workflow_run` in the
    `release-candidate` environment with no reviewer, so agents' merges still
    get them; promotion from a `workflow_dispatch` in `release`, with the owner
    as its required reviewer. Both deploy from `main` only, and each holds its
    own copy of the key (S10, C23). Replaced by item 74.
73. Security, the lead's decision 176, the owner: "yes with the changes",
    on the eagle-eye box's six open rows. Typed input in Codex stays open,
    with nothing built. Antigravity stays in the default install, and "A
    session takes checkpoints alone" widens to name it. Before an owner-typed
    skill's read in Antigravity, only the skill's first line asks: the
    guard's `force_ask` on read tools is cut. The advice on secrets in
    Antigravity's shells goes, and the owner accepts the variables there
    under the trusted machine, as for Codex (item 70; the lead's reading,
    Test round 2). `~/.pact` gets no ask rule, and the gap is named.
    The raised word caps stay, trimmed after the merge (S15).
74. The lead's decision 177, the owner, which replaces item 72 and item 71's
    promotion: no release app, no key, no deployment environment. Each green
    push to `main` tags a candidate with the release job's own token. A
    stable tag is made only by the owner's `node gate/release-promote.mjs
    <rc>`, under their own account, which keeps the old promotion's
    refusals (the builder's pick, flagged: a stable tag can't be deleted).
    Two tag rulesets, the owner's to set, let only the repository admin create
    any tag but a candidate and stop every tag being updated, deleted or
    force-pushed.
    Candidate names stay open (the lead's decision 186). The channel picks
    stay (S10, C23).
75. Security, the lead's decision 181, the owner: "Accepted." A session
    holding the owner's git or `gh` credentials can make a stable tag, and a
    Codex lens may read with `git`, which runs a program a `.git` folder's
    config names when that folder came from outside. Both are accepted (S15).
76. The owner's decisions 193 and 194, typed, on Test round 2: the lead's
    two round-1 picks stand (items 63 and 66), and seven duplicate tests and
    plants go. "Yes, add it": promotion refuses a candidate whose commit
    isn't on `main` (S10, C34).

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
- **Release tag:** a tag named exactly `v1.<n>.0`, a stable release, or
  `v1.<n>.0-rc.<k>`, a release candidate. The release job puts a candidate on
  `main`'s tip once `gate.yml` passed on the push, and a stable tag on a
  candidate's commit only when the owner runs it by hand (S10). The highest
  stable `<n>` is the current release.

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
- The backups folder keeps `docs/install.md`'s "never sync, share or
  commit", which names the old folder too; its files take default modes (S2
  item 65).
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
  harness takes, `light` optional. A name may hold `<effort>` once: it takes
  its effort from the tier table, or for an agent from its file (S6).
- `agentModels`: a model per agent, by its name, with `*` for every agent it
  doesn't name; optional. No value holds `<effort>`. A key naming no pact
  agent gives a dry-run `WARN`.
- `efforts`: the efforts the harness takes, a non-empty list from the five
  (`low`, `medium`, `high`, `xhigh`, `max`), each once, in that order;
  optional, all five when absent.
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
| `models` | `opus`, `sonnet`, `haiku` | `gpt-6.2-sol`, `gpt-6.2-sol`, none | `gemini-4-neon-<effort>`, `gemini-4-hydrogen-<effort>`, `flash` |
| `agentModels` | none | none | `*`: `flash`; `adversarial-lens` and `data-lens`: `pro` |
| `efforts` | none | none | `low`, `medium`, `high`, `xhigh` |
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
  id, field by field, under the same checks, with a `WARN` naming each. Its
  `agentModels` goes over the known one name by name, and its `models` leave
  it as it is: an Antigravity agent file takes a tier and never a session's
  model. Its `efforts` replaces the known list whole.

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
  configuration that replaces the tiers block can't drop it (C29). Where a name
  holds `<effort>`, the line goes on: "For `<effort>`, take the effort the tier
  table gives." Where the
  names come from the configuration, the dry run warns, without naming them,
  that the rules hold them as written and sessions may quote them.
- **Agent files name roles.** Each source agent's `model:` is `planning`,
  `executor` or `light`: every lens `planning`, scout `light`. The renderer
  writes the harness's model in its place. `light` with no light model
  writes the executor model. A harness's `agentModels` entry for the agent wins
  over its role's model; a model the source names outright stays.
- **A person's own names still work.** A configuration block, an agent
  setting or a builder table cell that names a model, such as "Opus", renders
  as written, in every harness. The dry run warns for each harness that isn't
  Claude Code: "`<file>` names model `<name>`, which `<harness>` may not have".
- **Effort.** Claude Code and Codex agents keep `effort` (Codex as
  `model_reasoning_effort`, the same five words). Antigravity agents have no
  effort field, so it is dropped there.
- **A model holding `<effort>`,** reached through an agent's role, takes the
  agent file's effort; no effort, or one outside `efforts`, refuses
  (`agent-effort`). A tiers or workflow table cell whose role maps to such a
  model, at an effort outside `efforts`, gives a dry-run `WARN` naming the
  tier, the stage and the effort, never the model.
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

One exception is a choice: a description's model and effort fields (S5) change
only model and effort words, never which parts or clauses a harness gets.

**Agents.** One source per agent, `claude/agents/<n>.md`, rendered per format:

- `claude-md`: as today, with the model role mapped.
- `codex-toml`: the body goes to `developer_instructions` as a TOML literal
  string; a body holding `'''` refuses (`agent-toml`). `tools` has no field
  and is dropped. Such an agent reads through its shell alone, so its
  instructions open with one line saying it has no `Read`, `Glob` or `Grep`
  tool, to search and read with shell commands that only read files, not
  `git` (which can run programs a repo's config names), and that reading so
  is no command to stop at. Every agent file sets `features.apps`, `features.plugins`,
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
- A session can still find the file and read it; the guard asks nothing
  before a read (S2 item 73). Only the skill's own first line stands in the
  way (S15).
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
hangs on (`cleaner` or `session-stop-deny`), and the command
words it matches. The table is rendered from the configuration, so a rule whose switch
is off is not in it. With no rule on, no harness gets a hook.

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
  running. The wrapper reads the call from stdin in its harness's shape,
  passes the command text or the typed text to `guard.mjs`,
  and writes its harness's answer. The `manage_task` actions agy lists as
  typing nothing (`list`, `status`, `kill`) get no answer; another action,
  or a matched call whose text the wrapper can't find, is denied. Codex's hooks see no typed text (T4's probe).
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
   with no shell, keeps only release tags, and takes one with its commit:
   by default the highest stable `v1.<n>.0`; with `--channel beta` the newest
   tag, by `<n>` then `<k>`, a stable outranking its own candidates; with
   `--release <tag>` exactly that tag, refusing (`release-none`) when it is
   missing, never a higher one. A bad value, a major other than 1, or both
   options refuses (`bootstrap-args`) before any fetch. It prints the tag it
   took.
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

- triggered by `workflow_run` of `gate` completing, nothing else. The job's
  `if` requires the repository variable `PACT_RELEASES` set to `on`, which
  the owner sets in T9, `conclusion == 'success'`, `event == 'push'`,
  `head_branch == 'main'` and `head_repository.full_name ==
  github.repository`;
- one job, the candidate job, so a merge by any session still gets a
  candidate. Its own token, `github.token`, holds `contents: write` and
  nothing else; the top level reads. No secret, no deployment environment,
  no app token; no checkout;
- reads `main`'s tip through the API and tags only when `head_sha` is that
  tip, so a re-run of an old gate run tags nothing. On a push it tags
  `v1.<n>.0-rc.<k>`: `<n>` one past the highest stable `v1.<n>.0`, or 1 when
  none exists, `<k>` one past the highest candidate of that `<n>`, never the
  run number, so a renamed workflow can't restart it. A push never makes a
  stable tag or a major;
- runs in a `release` concurrency group that never cancels, and reads the tip
  again just before it creates the tag, so two close runs can't put the
  higher number on the older commit;
- creates the tag through the API (`git/refs`), unless a release tag already
  points at `head_sha`;
- runs none of the repo's code.

**Promotion** is the owner's, from a checkout of `main`, under their own
account: `node gate/release-promote.mjs v1.<n>.0-rc.<k>` tags that
candidate's commit `v1.<n>.0`, with `GH_TOKEN` or else `gh auth token`. It
fails with no tag when the input isn't a candidate's name, the token is
empty, the candidate is missing, its commit isn't on `main`, `v1.<n>.0`
exists, or `<n>` isn't the next minor (C34). A stable tag can't be deleted,
so the refusals stay (the owner's decision 194).

`gate/tests/workflow.test.mjs` bans `workflow_run` in every workflow today.
This change exempts one file, `release.yml`, with an exact allow-list for its
job, the way it holds the CodeQL and Claude jobs. That loosens a check, so it
is a spec change, flagged big and read by the security pair. A second file
using `workflow_run` still fails (C23).

**The tag rulesets** are the owner's acts on GitHub, by name pattern
(fnmatch; `*` stops at `/`):

- **A:** every tag but `v1.*.0-rc.*`; Restrict creations; the one bypass is
  the Repository admin role, the owner. Every tag, not `v*.*.0` alone, since
  npm takes any tag ending in a version: a `v1.9.1` or `x1.99.0` from the
  agent app would otherwise be what `npx` runs.
- **B:** every tag; Restrict updates, Restrict deletions and Block force
  pushes; no bypass.
Candidate names stay open (the lead's decision 186). So anyone with write
access, the agent app or a change merged to `main` that uses the release
job's token, can make a tag the candidate pattern matches but npm reads as
stable, such as `v1.2.3+x.0-rc.1`: accepted with a change merged to `main`
(S15). A writer can also make a correctly named candidate on any commit,
an unreviewed one included; `--channel beta` takes it, and promotion
refuses it unless its commit is on `main`. A writer can also plant a
candidate that stalls the job for a minor:
one with a ten-digit `<k>`, which the job's own pattern skips, or one on
`main`'s coming tip, which the job then leaves alone. Accepted with open
names; the recovery is the owner's: lift ruleset B, delete the tag, restore
B.

## S11 Scriptorium

- **The harness section.** One row per harness the dry run would see, known
  and own: its name, whether it is in the install list, and its three
  models, each a dropdown of that harness's known models plus a free entry.
  An "Add a harness" row takes an own harness's fields (S5). Antigravity's
  model dropdowns also offer `pro`, `flash` and `flash_lite`.
- **Agent models** ([spec 0008](0008-per-harness-models-and-efforts.md)
  D6). A row per pact agent and a column per harness set `agentModels`. A
  change writes one key of the harness's own entry.
- **Across harnesses.** A read-only column per known and own harness: its
  models line, each tier's cells and each agent's model and effort. `node
  builder/build.mjs --overview <file>` writes this alone, from the home
  configuration, to a new page outside any repo, and installs nothing.
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
  (Codex today), where the rules file also sends `scout` to it, the session
  runs one command before each lens and each `scout` pass. It catches a
  lens's mistakes, not a hostile lens (S2 item 64). It runs the
  command exactly as printed, never cut out, piped or edited. It starts it
  from the home folder and gives it the work tree's top folder, so no
  program or version pin in the tree picks the `node` that runs it. The command
  reads that folder as its last argument, so a run that pipes the script to
  `node` anyway still reads it, and a run naming no folder fails. It
  prints one hash for each top-level entry of the work tree, ignored files
  included, for git's `HEAD`, `config`, `config.worktree`, `commondir`,
  `hooks`, the hooks folder git's config names, `info`, refs (a linked
  worktree's own too), stash log, index entries and the files of a half-done merge or
  rebase, and last one hash of the whole record. It finds git's folders from
  `.git` itself, since in a linked worktree it is a file. It records a link or
  junction as its target, never following it. It runs git only to name the
  hooks folder and list the index, last, with fsmonitor off and from the
  system folder (`/` elsewhere than Windows), so neither a program a lens named
  in git's config nor a `git.exe` it left in the tree runs. That git fetches
  nothing (no lazy fetch, no protocol allowed), since a partial clone's fetch
  runs programs the config names; a sparse index is listed as it stands, and
  anything git writes to its error stream fails the run. A file it can't
  read, or a name that isn't text, fails the run.

  After the pass the session stops any process the agent left running, runs the
  same command again before any other git, and compares: the same last line
  means no change. On any difference or a failed run, it stops: it runs no git
  in that tree, changes nothing, counts the
  pass inconclusive and reports to the owner which lines differ. It keeps no
  copy and restores nothing.
- **If the owner declines** widening "Review rests on rules" for Codex lenses
  (S15), T4 removes `subagents` from Codex's known description, so Codex
  gets the no-subagents line and each lens runs in a separate session.
- **Antigravity lenses** run on Gemini tiers only: `pro` for the security
  pair and `flash` for every other lens and `scout` (`agentModels`, S5), while
  the session's own planning and executor models are named slugs. Which model a
  tier runs depends on the release and the sign-in. Their agent files list their tools (S7); each also gets
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
- **Codex's shell environment policy** is the owner's: the install writes
  none, so Codex's shells get every variable, as agents in a project need
  (S2 item 70). An apply whose record marks the line an earlier install wrote
  removes that line alone, backed up, and leaves a changed one (C33).
- **The poster** refuses a post holding a live secret found in its own
  environment (S15).
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
  shell call in Codex and Antigravity, and in Antigravity before typed
  input.
- **Merges and installs:** installs now reach `~/.codex`, `~/.gemini` and
  `~/.agents/skills` as well as `~/.claude`, and an own harness's paths.
- **A write token in CI:** the release job tags with its own `contents: write` token.
- **What leaves the machine:** Codex and Antigravity sessions send their
  context to OpenAI and Google: the rendered rules, pins, private tracker
  text, hand-offs and private code among it.

**Controls:**

- the tag rulesets (GitHub): every tag but a candidate created only by the
  owner, none updated, deleted or force-pushed. They don't hold while the
  owner edits or disables them, and a session holding the owner's
  credentials counts as the owner (S2 item 75, S10);
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
- the hook command's and the bootstrap's guard against a `node` or `git` in
  the working folder (S8, S10).

**Residual:**

- **`npx` runs code from GitHub.** A person who types the command trusts
  GitHub and the tag rulesets. npm may cache a resolved copy. The head check
  compares ids from the same server, so it checks consistency, not
  integrity. This widens "What you install and CI run".
- **The release job's token** does all `contents: write` does while the job
  runs: it can push a branch no ruleset covers, and make a tag the candidate
  pattern matches, one npm may read as stable included, as can the agent app
  (S10). A change merged to `main` can use it. Before the rulesets exist it can also make a stable
  tag, or move or delete one. This widens "What you install and CI run",
  accepted (S2 item 74).
- **A guard that never runs.** In an own harness, or in Codex before the
  trust step, a guard can be missing with no report beyond the dry run's
  line. The owner accepted this for own harnesses.
- **Codex lenses** have the session's own reach. A lens steered by what it
  reads can write files or send data within the parent's sandbox, and read
  what the owner's account can: the agent app's key in Credential Manager,
  `~/.codex/auth.json`, `gh`'s token and `~/.pact`. The tree check (S12)
  sees a change to the work tree's files, ignored ones included, and to git's
  config, hooks, `info`, `HEAD`, refs, index entries and half-done merges and
  rebases, not the index's cached trees, which the next commit reuses. It undoes none, so uncommitted work a lens changed stays changed. It
  doesn't see a write elsewhere, git's objects, a submodule's git folder and
  another worktree's included, or a read or a send. MCP servers come from the parent and run
  outside the sandbox, so the
  owner's option is to run Codex lenses only with the parent's network off
  and no MCP server in its profile. T4's probe found that neither holds it
  everywhere: an interactive session asks before a lens's MCP call unless the
  server marks the tool read-only, `codex exec` runs at `never` and asks about
  nothing, and on native Windows the `unelevated` sandbox with network off
  still let a raw loopback connection through. This widens "Review rests on
  rules": the owner's call, asked before T4 starts.
- **An Antigravity session can still start an owner's command.** The skill's
  own switch keeps it out of what the model sees, but a read tool, a shell
  read, a copy elsewhere or a child `agy` run passes it, and the guard asks
  nothing before a read (S2 item 73). So a session there may start `make-it-so` on its own; the skills'
  first line (S7) is a rule the model keeps, not a control. After `scry`,
  `make-it-so` means "yes, 1 to N", open security picks included, and the
  record then shows it as the owner's answer. Or it starts `finis` and ends
  the work. In that harness only, the owner's typed answer stops being a
  sure sign the owner gave it. This spec's answer is that nothing a session
  starts itself is the owner's word for an install apply or mise trust; no rule
  a session loads says so, and nothing enforces it. What is left
  fits "A session takes checkpoints alone", which widens to name it, and
  Antigravity stays in the default install list (S2 item 73).
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

**The class and the scope.** "What you install and CI run" widens to name the
bootstrap and the release job's token, and "Merges and installs" names
`~/.pact` and the harness folders. Scope gains Codex with OpenAI's models and
servers, and Antigravity with Google's, out of scope as Anthropic's are. The
harness controls name both harnesses' controls and when each doesn't hold.
Widening a class and changing the scope are the owner's calls. The threat model must stay within its word budget:
4,200 words of prose (S2 items 47 and 52), raised on the owner's
word-cap rule. S2 items 47, 50 and 52 record the two docs' budgets.

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
- **Codex CLI** at the version T4 records, **Antigravity** as its CLI, agy
  1.5.17, headless on Windows. T5's probe ran on agy 1.2.14.

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
  permission-request tool, and opens its instructions with S7's line on
  reading through the shell. An Antigravity lens whose mapped tools come out
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
- **C10** `review.md` holds S12's tree check, around each lens and `scout`
  pass: one command, run as printed from outside the tree before and after,
  taking the folder as its last
  argument, whose record
  covers every file and git's config, hooks, `info`, `HEAD`, refs, index
  entries and half-done merges and rebases, stays the same across a `git
  status`, runs no
  program git's config names or the tree holds, and fails rather than record
  less. Any difference stops the session, which restores nothing and reports
  it.
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
  wrapper judges typed input the same way.
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
- **C33** An apply never writes a shell policy into `.codex/config.toml`; one
  whose record marks the line an earlier install wrote removes that line alone,
  backed up, leaves a changed one with no stop, and records no mark.
- **C20** The cloud generator's output changes only in the `~/.pact` paths.
- **C31** After an apply with an empty install list, `install.json` lists
  nothing and every recorded target is gone; `docs/install.md`'s rollback
  brings the hand copies back from their backup (a documented check).

**Packaging**

- **C21** `package.json` has one `bin`, no dependencies and no install
  scripts; the gate test fails on each.
- **C22** The bootstrap takes the highest stable tag, `v1.<n>.0`, by
  default, the newest candidate or stable with `--channel beta`, and exactly
  the tag `--release` names, never a higher one; it ignores every other name,
  refuses a bad option, a major or both options, and prints the tag; it refuses when the clone's
  head isn't the tag's commit, and deletes the clone; it never runs
  `--apply`; the apply line it leads to runs from another folder; a fake
  `git` in the folder it runs from never runs.
- **C34** A push to `main` tags only `v1.<n>.0-rc.<k>`, never a stable tag
  or a major; `gate/release-promote.mjs` naming a candidate tags its commit
  `v1.<n>.0`, and refuses a bad name, an empty token, a missing candidate,
  one whose commit isn't on `main`, a released minor or one past the next,
  with no tag.
- **C23** `workflow.test.mjs` passes the release workflow only with its one
  job, the candidate job on `workflow_run` of `gate`: a job token of
  `contents: write` alone, `github.token` as the tag step's token, a
  top level that reads, no secret, no environment, no app token, no
  `workflow_dispatch`, SHA-pinned actions, no checkout, and each of S10's
  `if` conditions; a bad case for each fails it, and so do a second job, a
  missing `release` concurrency group, a second workflow file that uses
  `workflow_run`, and another workflow that reads a secret or names an
  environment.
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

- **C27** `docs/threat-model.md` names the bootstrap, the release job's
  token and the tag rulesets, `~/.pact`
  and the harness folders in their classes, both harnesses' controls with
  when each doesn't hold, the scope line, and each owner answer. The word
  budgets went with PACT-114 (decision 197), so no count holds it.

**End to end (T9)**

- **C26** On the owner's machine, after S14's removal: one dry run and one
  apply from a release tag install into all three harnesses; Codex's hook is
  trusted; in each harness a session shows the rules loaded, runs a lens as
  a subagent on its planning model, and a guarded command (a raw
  `git worktree remove`, with the cleaner on) is denied. The Codex and
  Antigravity rules name no Claude model, and the dry run warns of no own
  model name. On the owner's no to a widening: Codex runs a lens in a
  separate session, and Antigravity is installed only when the list names
  it. A known test limit: Codex reads the real `~/.agents` here, whatever
  `USERPROFILE` says, so the run isn't isolated from it (S2 item 69).

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
   an empty tool list means. Depends on T2, T3 and the owner's answer on
   Antigravity skills. Runs beside T4.
6. **T6: packaging and releases.** S10; C21–C23, C28, C32; which actor the
   tag ruleset's bypass can name, in its record. Depends on T1.
7. **T7: Scriptorium.** S11; C24, C25; the ADR amending 0171. Depends on T2.
8. **T8: the threat model and the ADR.** S15; C27. May run beside T1–T7.
9. **T9: end to end.** C26. Depends on T1–T8 merged, the owner's answers
   below, the tag ruleset, the owner's S14 steps and the owner's apply.
   First it lists the remote's tags and the rulesets by API: the one on
   creating covers every tag but a candidate, with only the Repository admin
   as its bypass; the one on updating and deleting covers every tag, with
   none; and no tag but a release ends in a version. It also lists the
   repository secrets and the deployment environments by name, never value:
   none is a release key, and there is no environment.
   Then the owner sets `PACT_RELEASES`, a push to `main` or a re-run of
   `gate` at the tip makes `v1.1.0-rc.1`, and the owner's
   `node gate/release-promote.mjs v1.1.0-rc.1` makes `v1.1.0`.

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
| Widening "A session takes checkpoints alone" for Antigravity skills (S15) | widened, Antigravity in the default install (S2 item 73) | closed |
| The scope change: Codex with OpenAI, Antigravity with Google (S15) | the owner's call | before T8 merges |
| The threat-model cap at 4,200 and `docs/install.md`'s budget (S2 items 47 and 52) | kept, trimmed after the merge (S2 item 73) | closed |
| The tree check around `scout` and the open `~/.pact` gap (S2 items 53 and 55; item 56 drops item 53's undo) | the gap named, no ask rule (S2 item 73); the tree check the lead's flagged pick | any time |
| Mermaid blocks left out of the threat-model count (S2 item 48) | the lead's flagged pick, for review | any time |
| Typed input in Codex: leave it open, or set `features.unified_exec_tty=false` (S15) | left open, nothing built (S2 item 73) | closed |
| Login shells in Codex: leave them on, or set `allow_login_shell = false` (S15) | moot: Codex's shells get every variable (S2 item 70) | closed |
| Codex lenses' approval and network-off limits, and leftover processes (S15) | accepted, the trusted machine (S2 item 68) | closed |
| `send_message` and `manage_task` for every Antigravity lens (S7, S12) | the owner's call, security | with the lenses widening |
| The "guards unverified" line for own harnesses (S5) | an offer, unanswered; built as offered | any time |
| Tag rulesets A and B (S10, S2 item 74): A, every tag but `v1.*.0-rc.*`, Restrict creations, bypass Repository admin; B, every tag, Restrict updates, Restrict deletions and Block force pushes, no bypass | the owner's own act | before T9 |
| The raised budgets of two docs (S2 item 50) | kept, trimmed after the merge (S2 item 73) | closed |
| If a release app was made: uninstall and delete it, delete its key and the downloaded key file, and delete the `release-candidate` and `release` environments (S2 item 74) | the owner's own acts | before T9 |
| `PACT_RELEASES` set to `on` | the owner's own act | in T9 |
| S14's one-time removal; its step 4 moves the hand ports out of use | the owner's own machine | straight before T9's apply |
| Each install apply | the owner's typed command | in T9 |
| Trusting the Codex hook in `/hooks` | the owner's own act | after T9's apply |

### Stop and ask when

- Claude Code's rendered bytes can't match today's but for S7's changes;
- a harness's hook can't deny as S8 says, or fails open on a caught error;
- a hook command can't name an absolute path or clear `NODE_OPTIONS`;
- npm can't resolve `#semver:` against the repo's tags;
- the ruleset on creating tags can't take the Repository admin role as its
  one bypass;
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
