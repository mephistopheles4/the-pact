# Spec: a portable table-of-contents script that a repo adopts by choice (V1)

Status: draft, revised from the research, after spec review rounds 1 and 2 (final), with round 2's trade-offs and lows folded in by the lead's pick. It counts once it is on `main`. It is stacked on the PR that adds `docs/toc.mjs`.

<!-- toc -->

- [S1 Objective](#s1-objective)
- [S2 Sources](#s2-sources)
- [S3 The balance](#s3-the-balance)
- [S4 Decisions](#s4-decisions)
- [S5 The config and the script's changes](#s5-the-config-and-the-scripts-changes)
- [S6 Adopting it in a repo](#s6-adopting-it-in-a-repo)
- [S7 Repos](#s7-repos)
- [S8 Keeping the copies current](#s8-keeping-the-copies-current)
- [S9 Trade-offs](#s9-trade-offs)
- [S10 Acceptance claims](#s10-acceptance-claims)
- [S11 Tickets](#s11-tickets)
  - [Needs the owner](#needs-the-owner)
  - [Stop and ask when](#stop-and-ask-when)
- [S12 Rollback and out of scope](#s12-rollback-and-out-of-scope)

<!-- /toc -->

## S1 Objective

`docs/toc.mjs` writes and checks generated tables of contents in this repo. This spec makes it portable, so that grimoire, stacks and athanor can each adopt it by choice. Each copies the same file and keeps its own small config.

The tables are for the models that read these repos, not for people. A table goes where Anthropic's guidance says it helps: a long reference doc that a model opens on demand and may read only in part. Adoption is opt-in per repo, and each repo picks its own docs. No repo, and no long doc, is required to carry a table. The pact text (the rules file, `review.md` and the agents) states no such rule, and this spec adds none.

Intent (the owner, relayed by the lead, 2026-11-23): "I like the pull request 654. I would like to find a little way to make sure that this gets maintained properly and we don't forget about it. And also, we only did that currently in the pact, but I also want it to be on all my other repositories too, please." Narrowed the same day: "Please don't overcorrect this as if it's a blanket rule." And: "I am trying to improve navigatability for you, not for me ... We are trying to find the right balance here."

## S2 Sources

Each was read on 2026-11-23. The quotes are verbatim.

- Anthropic, [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices):
  - "For reference files longer than 100 lines, include a table of contents at the top. This ensures Claude can see the full scope of available information even when previewing with partial reads."
  - The reason: Claude "might use commands such as `head -100` to preview content rather than reading entire files."
  - On SKILL.md: it "serves as an overview that points Claude to detailed materials as needed, like a table of contents in an onboarding guide." And: "Keep the `SKILL.md` body under 500 lines."
- Anthropic, [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview): a triggered skill's SKILL.md is read whole (its example is a `cat`). "Reference files load into context when read."
- Claude Code, [How Claude remembers your project](https://code.claude.com/docs/en/memory):
  - "Claude gets the whole of each CLAUDE.md file that loads at launch."
  - "imported files load together with the CLAUDE.md that imports them."
- Claude Code, [Tools reference](https://code.claude.com/docs/en/tools-reference): Read returns at most 25,000 tokens a call and pages a larger file with `offset` and `limit`.
- Anthropic, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (Sep 29, 2025):
  - "CLAUDE.md files are naively dropped into context up front."
  - "primitives like glob and grep allow it to navigate its environment and retrieve files just-in-time."
  - Retrieval "enables progressive disclosure—in other words, allows agents to incrementally discover relevant context through exploration."
- Anthropic, [Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) (Oct 16, 2025):
  - "it will load the skill by reading its full `SKILL.md` into context."
  - "When the `SKILL.md` file becomes unwieldy, split its content into separate files and reference them."

## S3 The balance

These findings come from S2. Where the sources are silent, the spec says so and leans to less.

- **Threshold: over 100 lines.** It is the only figure the sources give, and its reason is a partial preview. No published evaluation stands behind it. The sources measure in lines while Read pages by tokens, and they don't address that difference. Nothing sourced points to another figure, so the script's default stays at 100.
- **Docs that get a table:** long reference docs a model opens on demand, such as specs, guides, threat models and a skill's `references/` files.
- **Docs that get none:**
  - Files loaded whole, because a partial preview never happens to them: CLAUDE.md, what it imports (an AGENTS.md included), a SKILL.md body, agent definitions and commands. For these, the sources ask for short files with headers.
  - **SKILL.md bodies.** The docs make SKILL.md itself the table of contents for its skill, linking its references one level deep.
  - Docs written for people, such as a README. The sources are silent on them, so this leans to less.
- **Each repo decides.** The config says which of its docs are covered. The list above is the guidance, not a rule.

PR 654 follows the same balance in this repo. Its `AGENTS.md` and `README.md` are excluded, and the 100-line threshold stays.

## S4 Decisions

- **Vendored, not fetched.** Each adopting repo commits its own copy of `toc.mjs`. The check runs offline in that repo's CI, and nothing fetches across repos.
- **One file, a small config.** Every copy matches the pact's file except one header line, added at line 2 (after the shebang) when the file is copied. It matches `^// Source: the-pact [0-9a-f]{7,40}$`, and the script detects a copy by it. What differs between repos lives in the config.
- **Defaults are this repo's.** With no config, the script behaves exactly as it does in PR 654. A copy carries the Source line, so a copy with no config exits 2 with `toc.config.json: missing in a vendored copy`. A deleted config can't then fall back to this repo's exclusions and write tables into, say, a SKILL.md.
- **Anchor links.** The generated tables' links are right by construction. Hand-written anchor links are checked by this repo's own test only. Adopting repos don't get that check, which is out of scope (S12).

## S5 The config and the script's changes

The config lives in `toc.config.json`, in the folder that holds `toc.mjs`. Both keys are optional:

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `maxUncoveredLines` | integer ≥ 1 | 100 | A doc is covered once it has more lines than this, not counting its table |
| `exclude` | array of strings | this repo's `EXCLUDED` | Paths left out, repo-relative. An entry ending in `/` is a folder prefix. An entry starting with `**/` matches a file of that name in any folder, the root included, such as `**/SKILL.md`. Any other entry is one file |

- **Bad config.** An unknown key, a wrong type or a value out of range is an error. The script prints `toc.config.json: <key>: <problem>` and exits 2 before reading any doc. A file that isn't valid JSON prints `toc.config.json: not valid JSON: <the parser's message>`, and valid JSON whose top level isn't an object (`null`, `[]`) prints `toc.config.json: not an object`. Both also exit 2. A key that is set replaces its default whole; it never merges with it.
- **The repo root.** It is what `git rev-parse --show-toplevel` prints, run from the script's folder, so the script works at any depth. PR 654's code takes the parent of the script's folder; this replaces that. If git is missing, or the folder isn't in a git work tree, the script prints `toc.mjs: not in a git work tree` and exits 2.
- **Pure functions.** The core functions take the config as an argument, defaulting to this repo's values, so they stay pure and importable.
- **Nothing else changes.** The anchors, the markers, where the table sits, the no-H2 rule, the unclosed-marker report and `--check`'s exit codes stay as they are in PR 654.
- **New tests.** `gate/tests/toc.test.mjs` gains bad cases for:
  - a `maxUncoveredLines` of 50;
  - a folder entry in `exclude`, a file entry, and a `**/` entry matching both a nested file and a root file;
  - a bad key, malformed JSON and a top level that isn't an object, each exiting 2;
  - a copy with a Source line on line 2 and no config, exiting 2;
  - a folder outside any git work tree, exiting 2;
  - the script run from two levels deep in a temporary git repo.

## S6 Adopting it in a repo

Each adopting repo's ticket takes these steps:

1. **Check for marker clashes.** If any tracked Markdown file already uses `<!-- toc -->` or `<!-- /toc -->` (markdown-toc uses the same markers), stop and ask.
2. **Copy the script.** Copy `docs/toc.mjs` from the pact at a named commit into the repo's script folder, adding the Source line.
3. **Write the config.** Write `toc.config.json` from S3's balance: exclude logs, ADRs, test fixtures, files loaded whole (`**/CLAUDE.md`, `**/AGENTS.md`, `**/SKILL.md`, agent and command files) and `**/README.md`, unless the repo's ticket records a reason otherwise.
4. **Generate and review.** Run the script. The ticket lists each covered doc with its line count, as a checkpoint the owner reviews after.
5. **Keep the repo's own gates green.** Add the script file, and only that file, to each lint and format tool's ignore file, since the copy must stay unedited (stacks runs `prettier --check .`, `eslint .` and `lint:md`). Docs are never ignored. If a Markdown linter or formatter would rewrite a generated table, stop and ask. The repo's full lint job passes with the copy in place.
6. **Add the CI step.** Add `node <script folder>/toc.mjs --check` to CI, on every operating system the repo's CI runs.
7. **Prove it can fail.** Show the CI step failing on a deliberately stale table (a heading renamed), and show it passing once the table is regenerated. Record both runs on the ticket.
8. **Add the agent rule.** Add one line to the repo's agent instructions: after a heading change in a covered doc, run the script; changes to the vendored copy are read closely; to update the copy, copy the new file from the pact. If the repo has a word budget the line doesn't fit, stop and ask.

## S7 Repos

| Repo | Script folder | CI step | Notes |
| --- | --- | --- | --- |
| athanor | `scripts/` | `ci.yml`, beside its `node scripts/check-*.mjs` steps | Exclude `docs/adr/`. Two long ADRs have no H2, so they get no table anyway. |
| grimoire | `scripts/` | `check.yml`, from `scripts/check.mjs` or as its own step | Exclude `**/SKILL.md` (S3). Its long `references/` files are covered. |
| stacks | `scripts/` | `gates.yml`, as a `pnpm` gate script | Exclude `docs/log/` and `docs/adr/`. |

All three run CI on Ubuntu with Node 24. Each ticket confirms that and records it.

## S8 Keeping the copies current

- Each copy's Source line shows which pact commit it came from.
- `docs/reference.md` lists the adopting repos, each with its script path and a state, `planned` or `adopted`. T1 writes all three rows as `planned`. After a repo's PR merges, a one-line PR in this repo marks that row `adopted`.
- When this repo's `docs/toc.mjs` changes, the PR that changes it names each listed repo as behind, in its body. That rule is T1's line in AGENTS.md. A change to `docs/toc.mjs` alone owes no dated log, since it is neither the pact text nor the gate.
- No cross-repo check runs (S4).

## S9 Trade-offs

- **Portability against drift.** A vendored copy can fall behind. S8 makes that visible without a cross-repo fetch. No business driver is named, so this leans to what is cheaper to reverse: a copy is one file and one CI step.
- **Coverage against cost.** A table costs context each time its doc is read. S3 keeps tables out of files loaded whole and docs written for people, where the sources give no reason for one.

## S10 Acceptance claims

- C1: with no `toc.config.json`, the script's output in this repo is byte-identical to PR 654's, and `--check` exits 0.
- C2: each S5 key changes coverage as stated, and each S5 bad case is seen to fail before its code exists.
- C3: a bad config, malformed JSON, or a copy with no config exits 2. Its stdout holds only the config error, and no file is written.
- C4: run from two levels deep in a temporary git repo, the script finds that repo's root.
- C5: nothing in `claude/` changes, so the pact text gains no rule.
- C6: in each adopting repo, CI fails on a stale table and passes once it is regenerated, on each operating system its CI runs (S6 step 7), and its full lint job passes with the copy in place (S6 step 5).
- C7: in each adopting repo, no file S3 says to leave out holds a table, unless the ticket records why.
- C8: after T1, `docs/reference.md` lists athanor, grimoire and stacks as `planned`, with their script paths. AGENTS.md holds S8's rule. Both docs stay within their word budgets.

## S11 Tickets

The work is cut into tickets, each its own session. A repo ticket starts only after this spec is approved and T1 has merged.

- **T1 (this repo):** S5 and its bad cases, the list of adopters in `docs/reference.md` (three rows, `planned`), and S8's rule as one line in AGENTS.md. AGENTS.md has a 1,750-word budget and `docs/reference.md` a 2,200-word one. If either addition doesn't fit, T1 may shorten only its own new text; otherwise it stops and asks. Raising a budget is a spec change. T1 stacks on PR 654.
  - **Amended at T1 (the lead's pick, decision 63, accepted with no spec round at decision 77, flagged for the owner's review after).** `docs/reference.md` stood at 2,198 of its 2,200 words, so no three-row list fit and T1 stopped and asked. The budget in `gate/tests/doc-budget.test.mjs` is now 2,250, the smallest multiple of 50 above the doc's size with the list (the rule that file states). AGENTS.md fits its budget as it stands.
- **Filing.** Once this spec is approved, T1's session files T2 to T4 as PACT sub-issues of this spec's issue, one per repo.
- **T2 athanor, T3 grimoire, T4 stacks:** the S6 steps, one repo each. They are independent and can run side by side. When a repo's PR merges, a one-line PR here marks its row `adopted` (S8).

### Needs the owner

- **Spec approval**, at the end of its review rounds, before T1 starts.
- **The merge of each PR:** T1, then each repo's own, then the one-line `adopted` PR here that follows it. A repo PR is ready once its S6 step 7 evidence and covered-doc list are on its ticket.
- **Whether to file copy updates**, when a PR names repos as behind (S8).

### Stop and ask when

- A repo's CI can't run Node 24.
- A repo's own rules forbid a vendored script.
- A repo already uses the table markers (S6 step 1).
- A repo's rules forbid ignore entries for its lint or format tools, or a Markdown tool would rewrite a generated table (S6 step 5).
- A generated table would change an anchor that existing links use.

## S12 Rollback and out of scope

**Rollback.** For T1, revert its PR. For a repo ticket, revert that repo's PR, then set its row here back to `planned` with a one-line PR. The copies are independent, so no other repo is touched.

**Out of scope:**

- aviation-design-system, aymandiab.com, mephistopheles4, dynners-api and pact-probe-sandbox (the owner's narrowing).
- Any rule in the pact text that would make tables required anywhere.
- An anchor-link check in adopting repos.
- A cross-repo drift check.
