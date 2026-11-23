# Spec: a portable table-of-contents script that a repo adopts by choice (V1)

Status: draft, not yet reviewed. It counts once it is on `main`. It is stacked on the PR that adds `docs/toc.mjs`.

## S1 Objective

`docs/toc.mjs` writes and checks generated tables of contents in this repo. This spec makes it portable, so that grimoire, stacks and athanor can each adopt it by choice. Each copies the same file unchanged and keeps its own small config.

Adoption is opt-in per repo. No repo, and no long doc, is required to carry a table. The pact text (the rules file, `review.md` and the agents) states no such rule and gains none from this spec.

Intent (the owner, relayed by the lead, 2026-11-23): "I like the pull request 654. I would like to find a little way to make sure that this gets maintained properly and we don't forget about it. And also, we only did that currently in the pact, but I also want it to be on all my other repositories too, please." Narrowed the same day: "I don't think that we need to be so aggressive that we would add it to my Mephistopheles README or the aviation design system. My website probably doesn't need it either. Please don't overcorrect this as if it's a blanket rule."

## S2 Decisions

- **Vendored, not fetched.** Each adopting repo commits its own copy of `toc.mjs`. Its check runs offline in that repo's CI, and nothing fetches across repos at run time.
- **One file, many configs.** The script is byte-identical in every repo. What differs lives in a JSON config beside it.
- **Defaults are this repo's.** With no config file, the script behaves exactly as it does in PR 654, so this repo needs no config.
- **The copy names its source.** Each copy's header carries the pact commit it was taken from. Updating means copying the new file and its new header line.

## S3 The config

The config lives in `toc.config.json`, in the folder that holds `toc.mjs`. Every key is optional:

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `maxUncoveredLines` | integer ≥ 1 | 100 | A doc is covered once it has more lines than this, its table not counted |
| `exclude` | array of strings | this repo's `EXCLUDED` | Paths left out; an entry ending in `/` is a folder prefix, any other entry is one file |
| `include` | array of strings | `[""]` (the whole repo) | Folder prefixes that are covered; a path must start with one of them |
| `levels` | `[2, 3]` or `[2]` | `[2, 3]` | Which heading levels the table links |

An unknown key, a wrong type, or a value out of range is an error. The script prints `toc.config.json: <key>: <problem>` and exits 2 before reading any doc. A config replaces each default whole for the keys it sets; it never merges with the defaults.

The repo root is the nearest folder above the script that holds a `.git` entry, as today's `trackedDocs` assumes. The script may sit at any depth; `docs/toc.mjs` and `scripts/toc.mjs` both work.

## S4 The script's changes

- It reads `toc.config.json` if present, as S3 says. The core functions take the config as an argument, defaulting to this repo's values, so they stay pure and importable.
- Its header comment gains one line, `Source: the-pact <short hash>`, and a pointer to this spec.
- Nothing else changes: the anchors, markers, placement, no-H2 rule, unclosed-marker report and `--check` exit codes stay exactly as they are in PR 654.
- `gate/tests/toc.test.mjs` gains bad cases for the config: a doc covered under `include` and one outside it, an `exclude` file entry, `levels: [2]`, and a bad key that exits 2.

## S5 Adopting it in a repo

Each adopting repo's ticket does the same steps:

1. Copy `docs/toc.mjs` from the pact at a named commit to the repo's script folder.
2. Write `toc.config.json` for the repo. Its exclusions follow the ones this repo chose (ADR 0168): logs, ADRs, fixtures, and files an agent loads whole (`CLAUDE.md`, `AGENTS.md` if the repo chooses), unless the repo decides otherwise.
3. Run the script, then review the tables.
4. Add `node <script folder>/toc.mjs --check` to the repo's CI.
5. Add a bad case the repo's own suite or CI is seen to fail on: a stale table.
6. Add one line to the repo's agent instructions: after a heading change, run the script; to update it, copy the new file from the pact.

## S6 Repos

| Repo | Script folder | CI step | Open questions |
| --- | --- | --- | --- |
| athanor | `scripts/` | `ci.yml`, beside its `node scripts/check-*.mjs` steps | Exclude `docs/adr/`. Two long ADRs have no H2 anyway. |
| grimoire | `scripts/` | `check.yml`, from `scripts/check.mjs` or as its own step | **For the owner:** should each skill's `SKILL.md` be excluded and `references/` kept? A `SKILL.md` is loaded whole when its skill runs, like the pact's rules file, and Anthropic's guidance targets reference files. |
| stacks | `scripts/` | `gates.yml`, as a `pnpm` gate script | Exclude `docs/log/` and `docs/adr/`. |

## S7 Trade-offs

- **Portability against drift.** A vendored copy can fall behind the pact's. The header line shows how far behind it is, and an update is a copy. No cross-repo check runs (S2). Driver: no business driver is named, so this leans to what is cheaper to reverse. A copy is one file and its CI step.
- **One file against per-repo tuning.** The config holds what differs. Everything else stays identical, so a fix in the pact carries over by copying.

## S8 Acceptance claims

- C1: with no `toc.config.json`, the script's output in this repo is byte-identical to PR 654's, and `--check` exits 0.
- C2: each S3 key changes coverage or the table as stated, and each S4 bad case is seen to fail.
- C3: a bad config exits 2 before any doc is read, naming the key.
- C4: the script runs from any folder depth inside a repo.
- C5: nothing in `claude/` changes (the pact text gains no rule).

## S9 Tickets

The work is cut into tickets, each its own session. A repo ticket starts only after this spec is approved and T1 has merged.

- **T1 (this repo):** S3 and S4, the bad cases, and this spec's index line. It stacks on PR 654.
- **T2 athanor, T3 grimoire, T4 stacks:** the S5 steps, one repo each. They are independent and can run side by side. T3 waits for the owner's answer on `SKILL.md`.

### Stop and ask when

- A repo's CI can't run Node 24.
- A repo's own rules forbid a vendored script.
- A generated table would break an anchor that existing links use.

## S10 Rollback

T1: revert its PR. A repo ticket: revert that repo's PR. The copies are independent, so one revert touches no other repo.

## S11 Out of scope

aviation-design-system, aymandiab.com, mephistopheles4, dynners-api and pact-probe-sandbox (the owner's narrowing). Any rule in the pact text that would make tables required anywhere.
