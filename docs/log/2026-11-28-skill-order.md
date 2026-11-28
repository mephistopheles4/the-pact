# 2026-11-28: a stage's skills run in the order the owner sets (PACT-99)

Several skills can share a stage, and until now nothing said which runs first.
The order already in the builder file, the place of each skill in
`workflowGraph.skills`, is now the run order. No field was added, so every
older builder file loads as before and keeps the order it rendered in.

- **The page sets it.** The skill inspector shows `Runs i of m at <stage>`,
  with a note when it counts switched-off skills, and ↑ and ↓ that move the
  skill past its neighbour at the same stage; a switched-off skill's line
  says so. Focus stays on the button, or moves to its partner once the
  button is disabled, and a disabled arrow is drawn faint. A skill wired to
  another stage goes last there, unwiring and rewiring one included. The
  canvas cards keep their positions.
- **The rules say it.** A fixed paragraph, **Skill order**, follows "A skill I
  can't invoke": take a stage's skills in the table's order, skip one whose
  condition doesn't fit or that the owner declines, and run one whose
  condition names another skill, or that skill's work, with that skill.
  42 words; the word-budget test left with PACT-114. `docs/rule-reasons.md`
  carries its row.
- **The gate's tests change.** `neutral-home.test.mjs` gains one
  `NEUTRAL_RULES` pair for the paragraph, and the frozen fixture stays as it
  is. `builder-page.test.mjs` gains a stub-page test for the inspector and a
  test of `moveSkill` and `wireSkill`, which live in `builder/parts.mjs` so
  the page and the tests share them.
- **The presets keep their order,** which now carries meaning; the owner
  confirms it at review.

**Record:** PACT-99's comments signed `plan-pact-99`: the spec (`a4db28d9`),
Design round 1 (`a79cf014`, its reports `40a9cfa9`) and the final round 2
(`221ee023`).
