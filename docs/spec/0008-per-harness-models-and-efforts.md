# Spec delta: per-harness agent models and tier efforts — V1

Status: draft, spec round 1 of 2. A delta on
[0007](0007-harness-agnostic-pact.md) S5, S6, S7 and S11; everything else
there holds. The lead took the picks marked "pick" as flagged checkpoints.
The spec counts once it is on `main`.

<!-- toc -->

- [D1 Objective](#d1-objective)
- [D2 Decisions](#d2-decisions)
- [D3 Current behaviour](#d3-current-behaviour)
- [D4 The description's new fields](#d4-the-descriptions-new-fields)
- [D5 Rendering](#d5-rendering)
- [D6 Scriptorium](#d6-scriptorium)
- [D7 Acceptance claims](#d7-acceptance-claims)
- [D8 Tickets](#d8-tickets)
- [D9 Trade-offs and open picks](#d9-trade-offs-and-open-picks)
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
- Scriptorium writes one page of the current setup across all three
  harnesses.

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
   high". Only Standard's Build moves. Quick, Thorough and the sensitive route
   stay as the configuration's tables say. Claude Code is unchanged.
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

## D4 The description's new fields

Each is optional. An own entry of a known id replaces the whole field, as S5
says for every field, under the same checks and `WARN`.

- **`agentModels`:** an object. Each key is a pact agent's name or `*`; each
  value is a role (`planning`, `executor`, `light`) or a model of the S5
  shape. An agent takes its own key, else `*`, else its role mapping (S6).
  It applies only where the agent's rendered source names a role: a model a
  configuration's `agents` setting names renders as written, as today. A key
  naming no pact agent gives a dry-run `WARN`; a gate test holds
  `known.json`'s keys to `claude/agents/`.
- **`tierEfforts`:** an object. Each key is a tier key (D5); each value is an
  object holding `plan`, `build` or both, each one of the five efforts.
- **`efforts`:** the efforts the harness takes, a non-empty list from the
  five, in order; absent means all five.
- **`<effort>` in a model.** A model in `models` may hold the text
  `<effort>` once; nowhere else may (pick). `agentModels` may not.

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
The builder's default tier ids are the same words.

**Tier efforts** rewrite only the effort word of cells, in the rules each
harness receives:

- In the tiers table (the first table whose header starts `| Tier |` and
  holds `Plan` and `Build`), the keyed row's `Plan` or `Build` cell.
- In the workflow table (the first whose header starts `| Stage |`), in the
  column headed by that tier's name, each cell whose text equals the tiers
  table's cell as it was before the rewrite. The builder fills the Build and
  Test stages from a tier's Build cell (`builder/parts.mjs`, a stage's
  `model: 'build'`), so a `build` key moves both, and effort is stated once
  (pick; the lead's answer named the Build row, D9).
- The sensitive route's column and paragraph are never rewritten.

The render refuses `tier-effort`, naming the harness and the key, when: no
tiers table is found; no row has the key; the keyed cell isn't
`<model>, <effort>`; or the row's Plan and Build cells are the same text and
the key sets only one of them, since the workflow cells can't be told apart.
A configuration that replaces the tiers or workflow block meets the same
checks.

**`<effort>` in the rules.** Where a model in the models line holds
`<effort>`, the line gains a second sentence: "Where a model holds
`<effort>`, put in the effort the table names, such as `<example>`." Its
example is that model with `medium`. A table cell whose model is a role that
maps to such a model and whose effort isn't in `efforts` gives a dry-run
`WARN` naming the harness, the cell's tier and stage, and the effort, never
the model (S6's rule against printing configured names).

**Agents.** The model each agent file gets is D4's `agentModels` pick, then
S6's mapping. A model holding `<effort>` takes the agent file's effort; an
effort outside `efforts` refuses `agent-effort`. Antigravity still drops the
effort line (S6).

**What stays per harness.** S7's "Tool limits, not choices" gains one
exception: a description's model and effort fields change only model and
effort words, never which parts or clauses a harness gets.

## D6 Scriptorium

- **Agent models.** A table with one row per pact agent and one column per
  harness the dry run would see. Each cell is a dropdown of the three roles,
  that harness's known models and a free entry, showing the model the
  install would write and, beside it, the effort (or "dropped" where the
  harness drops it). A change writes that harness's own override entry's
  `agentModels`; "as the role says" removes the agent's key.
- **Tier efforts.** For each harness, one row per tier with a Plan and a
  Build dropdown: "as the table says (`<effort>`)" and the harness's
  `efforts`. A change writes `tierEfforts`.
- **Known models.** Each harness's model dropdowns offer its `known.json`
  models plus, for Antigravity, `pro`, `flash` and `flash_lite`.
- **Across harnesses.** A read-only section, one column per harness: the
  models line, each tier's Plan and Build as the rules would read, and each
  agent's model and effort. Its values come from the page's copy of the
  renderer (`renderHarnesses`), never from a second computation.
- **The overview page** (pick). `node builder/build.mjs --overview <file>`
  writes that section alone as a page, from the configuration at its fixed
  path and the clone's `known.json`, and installs nothing. The last ticket
  publishes it once for the owner (D8, T2).
- **Saving keeps them.** A page rebuilt from a saved configuration shows and
  saves both fields unchanged.

## D7 Acceptance claims

- **C1** `agentModels`, `tierEfforts` and `efforts` parse as D4; a gate test
  sees `harness-shape` refuse each of: an agent key that isn't a name or `*`,
  an `agentModels` value with `<effort>`, a `tierEfforts` field other than
  `plan` or `build`, an effort outside the five, an empty `efforts`, and a
  model holding `<effort>` twice.
- **C2** Antigravity's rendered agents name `model: flash` for every agent but
  the security pair, `model: pro` for `adversarial-lens` and `data-lens`, and
  no effort line (render test).
- **C3** Antigravity's rendered rules name `gemini-4-neon-<effort>` and
  `gemini-4-hydrogen-<effort>` in the models line with D5's sentence, and no
  rendered file for any harness holds `carbon` (render test).
- **C4** With the default configuration, whose Standard Build is
  "executor model, high", Codex's rendered rules read "executor model,
  medium" in Standard's Build cell and in the workflow table's Standard Build
  and Test cells, and Claude Code's read high; every other cell is the same
  in both (render test).
- **C5** Claude Code's rendered files are byte for byte what they were before
  this change (0007's C3 fixture passes unchanged).
- **C6** `tier-effort` refuses each of D5's four cases (render test, one bad
  case each).
- **C7** A configuration's `agents` setting that names a model renders as
  written in all three harnesses, over `agentModels` (render test).
- **C8** An agent whose role maps to a `<effort>` model takes its file's
  effort; one outside `efforts` refuses `agent-effort`; a table cell at
  `max` for Antigravity's role models warns without naming the model.
- **C9** In the built page, setting an agent's model and a tier's effort for
  one harness writes only that harness's own entry; a page rebuilt from the
  saved configuration shows both (builder harness test).
- **C10** The Across-harnesses section and `--overview`'s page show, for each
  of the three harnesses, what `renderHarnesses` writes for the same
  configuration (builder test compares the two).
- **C11** In the owner's test home: a dry run and an apply
  install the change into all three harnesses; an Antigravity lens subagent
  reports a Hydrogen model and never Carbon.

## D8 Tickets

Standard tier, two sessions, each merging into `pact-105-codex-sol` before
its PR merges.

- **T1 The renderer.** D4 and D5: `gate/harnesses.mjs`,
  `gate/harness-render.mjs`, `harnesses/known.json`, their tests, 0007 S5,
  S6 and S7's text. C1 to C8.
- **T2 Scriptorium.** D6: `builder/build.mjs`, `builder/scriptorium.html`,
  the builder tests, 0007 S11, then the end-to-end run and the overview page
  published for the owner. C9 to C11. Needs T1.

Tests run as AGENTS.md says: `node gate/tests/run.mjs <tier>` with
`NODE_OPTIONS` cleared, through athanor locally; Test evidence is CI's three
jobs on the reviewed head.

## D9 Trade-offs and open picks

| Pull | Side taken | Driver |
| --- | --- | --- |
| Rewrite table cells vs a per-harness tiers block | Rewrite cells | Effort stated once; no second copy of the tables to drift |
| `<effort>` in a model vs one model per effort | `<effort>` | One field per role; the agy slugs follow one pattern |
| Workflow's Build row only vs every cell the tier's Build fills | Every such cell (Build and Test) | The builder fills both from one value; the lead's answer named Build only, so this is open for the owner |
| Overview as a build flag vs a one-off page | A build flag | The owner can regenerate it; cheap to drop |

Business driver: none written in the spec; leaning to what is cheaper to
reverse, as the pact says.

## D10 Out of scope (deferred)

- Per-agent effort per harness: not asked for (D2 item 4).
- Rewriting the sensitive route's efforts per harness: no decision asks it.
- Codex's `max` effort: unprobed; Codex keeps the five words as S6 says.
