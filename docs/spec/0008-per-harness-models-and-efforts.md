# Spec delta: per-harness agent models and tier efforts — V1

Status: draft, after spec round 2 of 2 (final), with its fixes taken as
the lead's flagged picks. A delta on
[0007](0007-harness-agnostic-pact.md) S5, S6, S7, S11 and S17; everything
else there holds. The lead took the picks marked "pick" as flagged
checkpoints. The spec counts once it is on `main`.

<!-- toc -->

- [D1 Objective](#d1-objective)
- [D2 Decisions](#d2-decisions)
- [D3 Current behaviour](#d3-current-behaviour)
- [D4 The description's new fields](#d4-the-descriptions-new-fields)
- [D5 Rendering](#d5-rendering)
- [D6 Scriptorium](#d6-scriptorium)
- [D7 Acceptance claims](#d7-acceptance-claims)
- [D8 Tickets, the owner and rollback](#d8-tickets-the-owner-and-rollback)
- [D9 Trade-offs](#d9-trade-offs)
- [D10 Out of scope (deferred)](#d10-out-of-scope-deferred)

<!-- /toc -->

## D1 Objective

Scriptorium can pick each harness's three role models (0007 S11). It can't
set one harness's model for one agent, or one harness's effort for one tier.
The owner wants Scriptorium to fully support Claude Code, Codex and
Antigravity before 0007's work merges. When this is done:

- a harness description can name a model per agent and an effort per tier
  cell, and the install renders them;
- Scriptorium shows and sets both, for each harness;
- Scriptorium writes one local page of the current setup across all three
  harnesses, which reaches the owner as D8 says.

## D2 Decisions

The owner's words, relayed by the lead, and the lead's picks:

1. **Antigravity's map.** Planning on Neon, building on Hydrogen; "all the
   lenses would have flash and the security pair would have pro". Scout goes
   on `flash` too. Never Carbon.
2. **Antigravity's slugs carry the effort:** `gemini-4-neon-<effort>` and
   `gemini-4-hydrogen-<effort>`, each in `low`, `medium`, `high` and `xhigh`
   (`agy models`, agy 1.5.17). Its agent aliases resolve on their own:
   `pro` to Hydrogen xhigh, `flash` to Hydrogen high.
3. **Codex's tiers:** "drop standard to Sol medium and keep the others at
   high". Only Standard's Build moves, in the tiers table and the workflow
   table's Build row. Quick, Thorough and the sensitive route stay as the
   configuration's tables say. Claude Code is unchanged.
4. **Per-agent model only.** No per-agent effort per harness. Codex keeps its
   agent efforts as each agent file sets them.
5. **Where it lives:** the per-agent entry and the tier efforts are fields of
   a harness description (`harnesses/known.json`, or an own entry that
   overrides it field by field, 0007 S5).

## D3 Current behaviour

- A description's `models` names three role models (0007 S5). The renderer
  writes one models line into the rules and maps each agent's role to the
  harness's model (S6).
- A configuration's `agents` setting names a model or effort per agent, the
  same in every harness (S6, "A person's own names still work").
- The tier and workflow tables are one text for every harness (S7, "Tool
  limits, not choices").
- `gate/harnesses.mjs` refuses a field it doesn't know (`harness-field`).

## D4 The description's new fields

Each is optional. An own entry of a known id replaces the whole field, as S5
says for every field, under the same checks and `WARN`. An empty object is
valid for `agentModels` and `tierEfforts`, and is how an own entry switches a
known one off.

- **`agentModels`:** an object. Each key is a pact agent's name
  (`[a-z][a-z0-9-]{0,63}`) or `*`; each value is a role (`planning`,
  `executor`, `light`) or a model of the S5 shape without `<effort>`. An agent
  takes its own key, else `*`, else its role mapping (S6). An agent whose
  model a configuration's `agents` setting sets, role or name, keeps that
  setting: the install hands the harness render the list of agents the
  configuration set. A key naming no pact agent gives a dry-run `WARN`.
- **`tierEfforts`:** an object. Each key is a tier key (D5),
  `[a-z0-9]+(-[a-z0-9]+)*`; each value is an object holding `plan`, `build`
  or both, each one of the five efforts.
- **`efforts`:** the efforts the harness takes, a non-empty list from the
  five, each once, in the five's order; absent means all five.
- **`<effort>` in a model.** A model in `models` may hold the text
  `<effort>` once; nowhere else may (pick).

A shape outside these refuses `harness-shape`, as S5's other fields do.

The known descriptions after this change:

| | Claude Code | Codex | Antigravity |
| --- | --- | --- | --- |
| `models` | unchanged | unchanged | `gemini-4-neon-<effort>`, `gemini-4-hydrogen-<effort>`, `flash` |
| `agentModels` | none | none | `*`: `flash`; `adversarial-lens`, `data-lens`: `pro` |
| `tierEfforts` | none | `standard`: `build` `medium` | none |
| `efforts` | none | none | `low`, `medium`, `high`, `xhigh` |

## D5 Rendering

**The tier key.** A tier row's key is its bold name in the tiers table, lower
case, with each run of spaces as one hyphen: `**Standard**` is `standard`.
The builder's default tier ids are the same words, but a renamed tier's key
follows its name.

**Tier efforts** rewrite only the effort word of cells, in the rules each
harness receives:

- In the tiers table (the first table whose header starts `| Tier |` and
  holds `Plan` and `Build`), the keyed row's `Plan` or `Build` cell.
- In the workflow table (the first whose header starts `| Stage |`), in the
  column headed by that tier's name, the cell of the row named after the
  same stage: a `plan` key moves the Plan row, a `build` key the Build row.
  No other row moves (D2 item 3; whether Test follows Build waits on the
  owner, D8).
- The sensitive route's column and paragraph are never rewritten.

What happens when a key finds nothing depends on who set it:

- **An own entry's key** refuses `tier-effort`, naming the harness and the
  key, when no tiers table is found, no row has the key, or the keyed cell
  isn't `<model>, <effort>`.
- **A known description's key** that finds nothing gives a dry-run `WARN`
  naming the harness and the key, and the rules render without it, so a
  configuration that renames or drops Standard still installs Codex.
- A workflow table, or a row of it, that isn't there is skipped; a cell there
  that isn't `<model>, <effort>` is handled as the key's setter says above.

**`<effort>` in the rules.** Where a model in the models line holds
`<effort>`, the line gains a second sentence: "Where a model holds
`<effort>`, put in the effort the table names, such as `<example>`." Its
example is the planning model with `medium`, else the first model holding
`<effort>`. A tiers or workflow table cell whose model is a role that maps to
such a model, and whose effort isn't in `efforts`, gives a dry-run `WARN`
naming the harness, the cell's tier and stage, and the effort, never the
model (S6's rule against printing configured names). Only table cells are
scanned.

**Agents.** The model each agent file gets is D4's pick, then S6's mapping.
A model holding `<effort>` takes the agent file's effort; no effort, or one
outside `efforts`, refuses `agent-effort`. Antigravity still drops the effort
line (S6). Codex's agent files are unchanged by this delta.

**What stays per harness.** S7's "Tool limits, not choices" gains one
exception: a description's model and effort fields change only model and
effort words, never which parts or clauses a harness gets.

## D6 Scriptorium

- **Agent models.** A table with one row per pact agent and one column per
  harness the dry run would see. Each cell is a dropdown showing the model
  the install would write, known values included, and beside it the effort
  (or "dropped" where the harness drops it). Its options are the three
  roles, that harness's known models, a free entry, and "as the default
  says (`<model>`)", naming what applies with no key of the agent's own: `*`,
  else the role. A cell whose agent the configuration's `agents` setting
  sets shows "set by the configuration" and is locked: the install keeps that
  setting (D4).
- **Tier efforts.** For each harness, one row per tier with a Plan and a
  Build dropdown: the effective effort, known values included, "as the table
  says (`<effort>`)" and the harness's `efforts`. The page writes the D5 key
  of the tier's current name; a key with no row shows as an error on that
  harness's row.
- **Writing an override.** The first change to either field for a known
  harness seeds the own entry's field from the effective one, known values
  included, then applies the change, so one change leaves every other
  agent's and tier's value as it was. Choosing "as the default says" or "as
  the table says" removes only that key. Renaming a tier moves its key in
  every own entry; dropping a tier removes its key.
- **Known models.** Each harness's model dropdowns offer its `known.json`
  models plus, for Antigravity, `pro`, `flash` and `flash_lite`.
- **Across harnesses.** A read-only section, one column per harness: the
  models line, each tier's Plan and Build as the rules would read, and each
  agent's model and effort, for each of the three known harnesses and each
  own one, detected or not. Its values come from the page's copy of the
  renderer (`renderHarnesses`), never from a second computation, handed the
  configuration's set agents as the install hands them.
- **The overview page** (pick). `node builder/build.mjs --overview <file>`
  writes that section alone as a standalone page, and installs nothing. It
  reads the home configuration whole (`config.json`, its blocks and its
  `agents` setting) as the installer's renderer reads it, with the clone's
  `known.json` and `claude/` sources, and runs `renderHarnesses` on the
  result: the setup the install would write now. It holds models, efforts,
  tier and agent names only, never a path from the configuration or the
  install record. It takes no `--builder`, `--check`, `--texts` or `--out`,
  and refuses as `--out` does (`outProblem` with no builder to compare, never
  overwriting, never into a git work tree).
- **Saving keeps them.** A page rebuilt from a saved configuration shows and
  saves both fields unchanged.

## D7 Acceptance claims

- **C1** `agentModels`, `tierEfforts` and `efforts` parse as D4. A gate test
  sees `harness-shape` refuse each of: an agent key that isn't a name or `*`,
  an `agentModels` value with `<effort>`, a `tierEfforts` key outside its
  shape, a `tierEfforts` field other than `plan` or `build`, an effort outside
  the five, an empty or repeated `efforts`, and a model holding `<effort>`
  twice. An empty `agentModels` or `tierEfforts` parses. A key naming no
  agent gives the `WARN`, and a gate test, seen failing on a known.json copy
  with a misspelt key, holds `known.json`'s keys to `claude/agents/`.
- **C2** Antigravity's rendered agents name `model: flash` for every agent but
  the security pair, `model: pro` for `adversarial-lens` and `data-lens`, and
  no effort line (render test).
- **C3** Antigravity's rendered rules name `gemini-4-neon-<effort>` and
  `gemini-4-hydrogen-<effort>` in the models line with D5's sentence, its
  example `gemini-4-neon-medium`, and no rendered file for any harness holds
  `carbon` (render test).
- **C4** With the default configuration, whose Standard Build is
  "executor model, high", Codex's rendered rules read "executor model,
  medium" in Standard's Build cell and in the workflow table's Standard Build
  cell, and Claude Code's read high; every other cell, Test included, is the
  same in both (render test).
- **C5** Claude Code's rendered files, and Codex's agent files, are byte for
  byte what they were before this change (0007's C3 fixture and a Codex
  agent fixture pass unchanged).
- **C6** An own entry's `tierEfforts` refuses `tier-effort` in each of D5's
  three cases, and a known key with no matching row warns and installs: a
  configuration whose tiers rename Standard installs Codex with the `WARN`
  (render test, one case each).
- **C7** A configuration's `agents` setting that names a model, or a role,
  renders as set in all three harnesses, over `agentModels` (render test).
- **C8** An agent whose role maps to a `<effort>` model takes its file's
  effort; one outside `efforts`, or none, refuses `agent-effort`; a table
  cell at `max` for Antigravity's role models warns without naming the model.
- **C9** In the built page, setting one agent's model and one tier's effort
  for one harness writes only that harness's own entry, and every other
  agent's and tier's rendered value stays as it was; renaming a seeded
  Standard moves its key, the old one is gone and the dry run doesn't
  refuse; an agent the configuration's `agents` setting sets shows that
  model, locked, in every harness; a page rebuilt from the saved
  configuration shows both (builder harness test).
- **C10** The Across-harnesses section and `--overview`'s page show, for each
  of the three harnesses, what `renderHarnesses` writes for the same
  configuration; with a home configuration whose tiers differ from the
  default, `--overview` shows the configured cells; with a home path in the
  install record, the page holds no path; `--overview` into a git work tree,
  or onto an existing file, refuses (builder test).
- **C11** Before the parent branch merges: a dry run and an apply into a
  `--home` test folder render all three harnesses, with C2 to C4's cells in
  the staged files (T2's end to end). The live check joins 0007's C26, run
  at its T9 after that apply, on agy 1.5.17: an Antigravity lens subagent's
  run shows a Hydrogen model and never Carbon, read from agy's own session
  record, not the model's word.

## D8 Tickets, the owner and rollback

Standard tier, two sessions, each merging into `pact-105-codex-sol` at its
reviewed head before that branch's PR merges.

- **T1 The renderer.** D4 and D5: `gate/harnesses.mjs`,
  `gate/harness-render.mjs`, `gate/install-run.mjs` (the set-agents list),
  `harnesses/known.json`, their tests, 0007 S5, S6, S7 and S17's text (agy
  1.5.17). C1 to C8. In the same change: a dated log (a gate change), a
  `docs/rule-reasons.md` row for D5's rendered sentence, and
  `node docs/toc.mjs`; `node builder/build.mjs`, committing
  `builder/scriptorium.html`, since the page carries the renderer, with any
  import T1 adds handed in by `renderCode`.
- **T2 Scriptorium.** D6: `builder/build.mjs`, `builder/scriptorium.html`,
  the builder tests, 0007 S11, then C11's `--home` run. C9 to C11. Needs T1.
  In the same change: `node builder/default-config.mjs`.

Tests run as AGENTS.md says: `node gate/tests/run.mjs <tier>` with
`NODE_OPTIONS` cleared, through athanor locally; Test evidence is CI's three
jobs on the reviewed head.

**Needs the owner:**

| What | Recommendation | When |
| --- | --- | --- |
| Whether the workflow's Test row follows Standard's Build | No, as the lead relayed (D2 item 3); a yes is one rewrite rule and one test | Before T1 merges |
| The overview page reaching the owner | Attach the `--overview` page to the Linear issue, never a GitHub issue or PR, after the read before posting; cite the attachment in T2's record | Before T2 closes |
| Each merge into `pact-105-codex-sol` | Pinned to its reviewed head | At each ticket's Deploy |
| C11's live Antigravity check | Runs as one more C26 line in 0007's T9, after its apply; before then the `--home` run stands for it | At T9 |

**Stop and ask when:** a harness's rendered rules go over their `cap` after
D5's sentence; agy refuses a slug or alias in an agent file or a session;
C5's bytes change; or an older configuration stops installing.

**Rollback.** An installer from before this delta refuses the three fields
(`harness-field`), and would write a model holding `<effort>` as it stands.
To go back: run the four checks in `docs/install.md`'s rollback section;
remove `agentModels`, `tierEfforts` and `efforts` from every `harnesses.own`
entry, and replace each own `models` value holding `<effort>`; revert the
merges; run a dry run, then apply on the owner's go-ahead. Done when the
apply exits zero, no own model holds `<effort>`, and a second dry run shows
no drift.

## D9 Trade-offs

| Pull | Side taken | Driver |
| --- | --- | --- |
| Rewrite table cells vs a per-harness tiers block | Rewrite cells | Effort stated once; no second copy of the tables to drift |
| `<effort>` in a model vs one model per effort | `<effort>` | One field per role; the agy slugs follow one pattern |
| Workflow's Build row only vs every cell the tier's Build fills | Build only | The lead's relayed answer; open for the owner (D8) |
| A known key that misses: refuse vs warn | Warn and skip | A person's own tiers must not break a default install |
| Overview as a build flag vs a one-off page | A build flag | The owner can regenerate it; cheap to drop |

Business driver: D1's, full support for all three harnesses before the
parent branch merges; else what is cheaper to reverse.

## D10 Out of scope (deferred)

- Per-agent effort per harness: not asked for (D2 item 4).
- Rewriting the sensitive route's efforts per harness: no decision asks it.
- Codex's `max` effort: unprobed; Codex keeps the five words as S6 says.
