# Plan: decisions to ADRs, work to logs, and a coherence check against the research

*Status: draft 2, for `plan-reviewer` round 1. Written 2026-09-27. The owner first parked it until the usage reset, then chose to run it the same day while monitoring usage. C1–C3 are done.*

## Intent

1. **A clean docs tree.** Lasting decisions become one ADR (architecture decision record) each, in `docs/adr/`. Each finished piece of work becomes one dated narrative in `docs/log/`. `docs/plans/` holds only live plans.
2. **Coherence with the owner's private research.** The pact's decisions have to agree with the research they came from. Where they disagree, or where the research settled something the pact doesn't reflect, the owner decides which is right before any ADR is written.

## Non-goals

- **No change to `claude/`.** If the coherence check finds the pact's rules missing or contradicting a settled decision, that becomes a follow-up change with its own plan. `claude/` installs globally, so it doesn't ride along with a docs change.
- **No edit to the research.** It is read only, and one file in it is never edited under any circumstances (named in the `.private.md` file).
- **No new decisions.** ADRs record what was decided and why. Anything undecided goes to the owner, not into an ADR.
- **No stacks changes.** `mephistopheles4/stacks#398` covers stacks separately.

## Constraints

- **The research is private; the-pact will be public.** ADRs, logs, plans and commit messages may state a conclusion and its reasoning in the pact's own words. They must not quote the research, link to it, or name its local path or files. Anything that has to name them goes in a gitignored `*.private.md` file.
- **Verbatim artefacts leave the tree, not the history** (owner's choice, 2026-09-27). Each log entry cites the commit SHAs that hold the verbatim plans, reviews and probe records. Those links work once the repo is pushed.
- **CLAUDE.md's review rule still holds for this plan.** `plan-reviewer`'s findings are kept verbatim in a file while the work is live. When this work finishes, they follow the same rule as everything else: out of the tree, cited by commit.

## Decisions

### D1. Layout

| Path | Holds | Lifetime |
|---|---|---|
| `docs/adr/NNNN-<slug>.md` | One decision each | Permanent. A reversed decision gets a new ADR that supersedes it; the old one stays. |
| `docs/log/YYYY-MM-DD-<slug>.md` | One narrative per finished piece of work | Permanent |
| `docs/plans/` | Live plans and their review files | Until the work finishes, then distilled and deleted |
| `docs/tests/` | — | Removed. Probe records move into the log. |
| `docs/agents/` | Tracker and skills config | Unchanged |

**Why:** it matches stacks, so the same skills and habits work in both repos. Keeping plans only while live stops `docs/plans/` from growing into an archive nobody reads.

### D2. ADR format, as in stacks

Title as the decision in words. One paragraph stating it. A **Why** section. A **How this was decided** section that points to the log entry and the commits. Optional **Superseded by** line.

### D3. Log format, as in stacks

A title, then prose: what the work set out to do, what each review round caught, what was built, what the probes showed, and what is still open. It closes with a **Record** list: each commit SHA and what verbatim artefact it holds.

### D4. The ADR list (settled after C3, 2026-09-27)

| # | Decision | Source in this repo |
|---|---|---|
| 0001 | Agents carry plain job-title names | `3828f29`, plan 2026-09-26 |
| 0002 | Builders and checkers get explicit tool allowlists, not deny-lists | `3828f29`, `d0ae7f1` |
| 0003 | A missing tool is reported, never rebuilt through the shell | `918eeb3`, probe `eac4fbc`/`0266fe5` |
| 0004 | Builder hand-offs are gated on needs that arise after dispatch | `f2cee57`, `c0c8179` |
| 0005 | Builders open with a status line; blocked is relayed verbatim | `f2cee57`, `c0c8179`, probes to `507a6ab` |
| 0006 | This repo's rules live in root AGENTS.md; root CLAUDE.md imports it | `804e25a` |
| 0007 | Plans and reviews are process; only decisions are committed | this plan |
| 0008 | After two paper review rounds without READY, build a throwaway and use it | Owner's decision, confirmed at C3 on 2026-09-27; it predates this repo. The ADR says plainly that `claude/CLAUDE.md` does not yet offer it (follow-up F1), and that the 2026-09-27 gate plan went five paper rounds for that reason. |

Each ADR states the decision and its reasoning in the pact's own words. Where the reasoning came from the owner's private research, the ADR says "from the owner's research" and gives no file, path or quote.

### D5. The log list

- `2026-09-26-agent-names-and-allowlists.md`
- `2026-09-26-missing-tool-probe.md`
- `2026-09-27-human-in-the-loop-gate.md` — five review rounds, the reframe at round 3, both probe runs and the stale-definitions lesson.
- `2026-09-27-adr-and-log.md` — this work, written last.

### D6. The coherence check comes first, and its conflicts go to the owner

**Step C1: extract (read-only, `scout`).** Pull every settled decision, rule and stop signal from the research, each with a file:line reference. **Which files, and which are read only by targeted search, is listed in `2026-09-27-adr-and-log.private.md` beside this plan.** That file is gitignored (`*.private.md`), because naming the research's files in a public repo's history would leak them. The scout's extract stays out of the tree too: it goes to the session scratchpad.

**Step C2: compare (main session). Done 2026-09-27.** The scout's extract (≈51k tokens) is in the session scratchpad, not the tree. Result, paraphrased:

| Pact decision or research rule | Research | Verdict |
|---|---|---|
| 0001 Plain agent names | Silent; near it: plain names over internal codes | Consistent |
| 0002 Tool allowlists | Queued as next work; least-privilege is a candidate rule | Consistent — the pact did what the research queued |
| 0003 Report a missing tool | Silent; near it: "stops and reports" | Consistent |
| 0004 Gate on after-dispatch needs | Silent; near it: an agent can't pause mid-run, so it stops and reports with the question | Consistent — same premise |
| 0005 Status line, verbatim relay | Verbatim relay settled for reviewer findings | Consistent — the pact extends it to builders |
| 0006 Root AGENTS.md | Silent | Pact-only |
| 0007 Only decisions committed | Keep records for learning apart from records for judgment | Consistent — logs and ADRs are that split |
| Throwaway after two paper rounds | Settled | **Not reflected** in `claude/CLAUDE.md` |
| A check counts only once seen to fail | Settled | **Not reflected** in the probe rules |
| Review in layers | Settled: paper, hands-on, adversarial, claim-checking, test integrity | **Partly reflected** — no adversarial or claim-checking reviewer |
| Opus plus effort; reviewer independence; never merge findings; stop signals; human at every seam; size dials rigor; recommend before acting; ask before expensive work | Settled | Consistent |

The research holds one open conflict of its own: whether reviewer independence means a different model or a different session. It is not the pact's to settle.

**Step C3: owner decides. Done 2026-09-27.**
- **Throwaway after two rounds:** write ADR 0008 now, and queue the `claude/CLAUDE.md` change as follow-up F1.
- **Seen to fail:** add it to the probe rules in `AGENTS.md` (D8).
- **Review layers:** record the gap as follow-up F2 in the log; no ADR and no new agents here. The owner adds a third gap: **no mutation tester**.

**Why first:** an ADR written before the conflicts are settled would record a decision the owner may not hold.

### D7. Delete, don't archive

After the builder writes ADRs and logs, it deletes `docs/plans/2026-09-26-*`, `docs/plans/2026-09-27-human-in-the-loop-gate*`, and `docs/tests/`. This plan and its reviews stay until this work finishes, then go the same way in the last commit.

### D8. AGENTS.md follows

Update the root `AGENTS.md` sections "Where work lives" and "Testing a change to an agent or a rule" to point at `docs/adr/` and `docs/log/`. Plans live in `docs/plans/` only while live; probe records go in the work's log entry, with the expected result still committed before the run. Add one probe rule (C3): **a probe's pass counts only once the probe has been seen to fail** — a control run or a planted bad case that it catches.

### D9. Follow-ups, recorded in this work's log entry

Nothing below is built in this plan. Each becomes an issue once the tracker exists.

- **F1.** Add "build a throwaway and use it" to the options `claude/CLAUDE.md` offers after two review rounds (ADR 0008).
- **F2.** Review layers the pact lacks: an **adversarial** reviewer, a **claim-checking** reviewer, and a **mutation tester**.

## Needs a human

- **C3, the coherence conflicts** — *settled 2026-09-27* (see D6). All answers are in D4, D8 and D9.
- **The privacy check** — *after dispatch.* The owner reads the finished ADRs and logs for anything private before merge. Kept in the main session: the main session shows the owner the private-term search results (acceptance A4) and waits.
- **A private name is already in history** — *settled 2026-09-27: accepted, no history rewrite.* Commit `3828f29` added a plan that names the research folder on two lines. A full-history scan found nothing else: no research file names, contents or personal paths, in any commit or commit message. The owner already says publicly that they keep private research, so the folder name exposes little. D7 deletes the file from the tree; history keeps it.
- **Usage** — *settled 2026-09-27.* Weekly usage was 94%; the owner said to run the agents now and monitor usage. The main session checks usage after each agent and reports it.
- **Deleting the old plans and probe files** — *at sign-off.* Approved by the owner on 2026-09-27; reversible through git.
- **Builder steps** — *at sign-off*, once C3 is settled: exact files, sources and acceptance checks are in this plan.

## Order

1. `scout` runs C1. Main session writes C2 into this plan.
2. Owner settles C3. Main session updates D4 and D5.
3. `plan-reviewer` reviews this plan. Owner decides proceed, fix or kill.
4. `builder` writes the ADRs and logs, deletes the old files, updates AGENTS.md.
5. `result-checker` checks it. Owner reads the ADRs and logs for privacy and decides whether it's done.
6. Main session converts this plan into its own log entry and deletes it, then fast-forwards `main`.

## Acceptance

- **A1.** Every D4 row the owner kept has one ADR in `docs/adr/`, numbered in order, in D2's format.
- **A2.** Every D5 entry exists in `docs/log/`, in D3's format, with a Record list whose SHAs all resolve (`git cat-file -e <sha>`).
- **A3.** `docs/tests/` is gone. `docs/plans/` tracks nothing but this plan and its review files.
- **A4.** A search of every tracked file for the private terms listed in the `.private.md` file finds nothing. (`git grep`, so the gitignored file itself is not searched.)
- **A4a.** `git check-ignore docs/plans/2026-09-27-adr-and-log.private.md` confirms the private file is ignored, and `git log --all -- '*.private.md'` shows it was never committed.
- **A5.** Every relative link in `docs/`, `AGENTS.md` and `README.md` resolves to a file in the tree.
- **A6.** `git diff --stat` touches only `docs/` and `AGENTS.md`. Nothing in `claude/` changes.

## Unhappy paths

- **The research contradicts most of D4.** Stop after C2; the owner may want a different ADR list, or a `claude/` change first.
- **The scout's extract is too thin to judge.** Main session reads the cited lines itself before C2, rather than guessing.
- **A private detail is needed to explain a decision.** State the conclusion without the detail, and flag it to the owner.
- **Usage runs short mid-way.** The order above leaves a coherent state after each step; stop at the next boundary and report.

## Rollback

`git revert` the build commit. The deleted files come back from history.

## Stop conditions

Stop and tell the owner if: the builder returns anything but `STATUS: DONE`; review goes round twice without converging (and offer a throwaway try, per the pending D6 row); the diff touches `claude/`; A4 finds anything.
