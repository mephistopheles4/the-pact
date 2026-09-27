# Decisions to ADRs, work to logs, and a check against the owner's private research

**2026-09-27** — The docs tree was rebuilt around two kinds of record: one ADR per lasting decision in `docs/adr/`, and one dated narrative per finished piece of work in `docs/log/`. The finished plans, reviews and probe files left the tree, and each log entry cites the commits that keep them verbatim ([ADR 0007](../adr/0007-only-decisions-are-committed.md)). Before any ADR was written, the pact's decisions were checked against the owner's private research, and one gap became a decision of its own ([ADR 0008](../adr/0008-throwaway-after-two-paper-rounds.md)).

## What it set out to do

The owner wanted a clean start. `docs/plans/` and `docs/tests/` had grown into an archive of finished work, and the decisions in them could only be found by reading the plans that made them. The owner also asked that the work be checked for coherence with their private research: the pact's decisions should agree with the research they came from, and where they don't, the owner decides which is right.

Weekly usage stood at 94% when this started. The plan was written and parked until the usage reset. The owner then chose to run it the same day while watching usage, which the main session reported after each agent. It ended at around 95%.

## A leak, caught, and the rule it produced

While writing the plan, the main session put the name of a private research file in a plan line and committed it. Its own leak check caught it within minutes, and the commit was amended before anything referenced it. That led to two rules for the rest of the work:
- **Anything that must name the research goes in a gitignored `*.private.md` file** beside the plan, never in a tracked one.
- **Only the main session opens private material** and runs the private-term search. The builder and checker briefs said not to open it, and not to name it.

A full-history scan then found one surviving private reference: the research folder's name, on two lines of the 2026-09-26 plan added in `3828f29`. The owner accepted it, since they already say publicly that they keep private research. History was not rewritten. This work deleted that plan from the tree; history keeps it.

## The coherence check

A read-only `scout` pulled every settled decision, rule and stop signal from the research, with references, into the session scratchpad; nothing from it entered the tree. The main session compared it with the pact, and the owner settled the conflicts.

- **Consistent:** plain agent names, tool allowlists (the research had queued them as next work), reporting a missing tool, the gate on after-dispatch needs, the status line and verbatim relay, and keeping decisions apart from narrative. The research is silent on several of these, but each agrees with a nearby rule in it. It is also consistent on model and effort, reviewer independence, never merging findings, the stop signals, a human at every seam, rigour sized to the change, recommending before acting, and asking before expensive work.
- **Pact-only:** the root `AGENTS.md` layout, on which the research is silent.
- **Not reflected: throwaway after two paper rounds.** Settled in the research, missing from `claude/CLAUDE.md`. The owner chose to write ADR 0008 now and queue the `claude/CLAUDE.md` change as follow-up F1.
- **Not reflected: a check counts only once it has been seen to fail.** The owner added it to the probe rules in `AGENTS.md`.
- **Partly reflected: review in layers.** The pact has paper, hands-on and test-integrity review, but no adversarial or claim-checking reviewer. The owner recorded this as follow-up F2, with no ADR and no new agents here, and added a third gap: no mutation tester.

The research holds one open question of its own, whether reviewer independence means a different model or a different session. It is not the pact's to settle.

## What each review round caught

**Round 1 (`plan-reviewer`, draft 2): three blockers.**
- **A link check that could not pass.** `AGENTS.md` already links `CONTEXT.md`, which is created only when first needed, in a section the builder was not allowed to edit. Fixed by exempting targets created on demand.
- **No check on the final state.** This work's own log entry was to be written after the checker ran, and then `main` would move with nothing re-checking the last commit. That entry is also the one most likely to leak. Fixed by a builder second pass, and a final check plus the owner's privacy read before `main` moves.
- **Nothing kept private material with the main session.** Fixed by the rule above, and by confirming, without writing it down, that the private-term list covers the research folder's name.

**Round 2 (draft 3): `READY`.**

## What was built

**Pass 1** (`builder`, `4ed79b7`) wrote ADRs 0001 to 0008 and three log entries, deleted the finished plans and `docs/tests/`, and pointed `AGENTS.md` at `docs/adr/` and `docs/log/`. It also added the seen-to-fail probe rule. `result-checker` confirmed every step-4 check (`5ae404d`) and raised four minor wording advisories. The main session ran the private-term search and the ignore check on the private file; both were clean.

**Pass 2** (`builder`) had scope added by the owner after the checker ran (`8bf8e08`):
- **The four advisories, fixed.** ADR 0004 now says round 1 of the gate plan was about the relay. ADR 0006 describes root `CLAUDE.md` accurately. The agent-names log names the rename as the security review's one new risk. ADRs 0007 and 0008 link this entry.
- **Two gaps pass 1 had flagged, closed.** A fifth log entry, [the repo rules and tracker](2026-09-27-repo-rules-and-tracker.md), for ADR 0006's work, and `AGENTS.md`'s "Domain docs" section no longer says `docs/adr/` is yet to be created.
- **This entry,** then the deletion of this plan, its reviews and the check report.

## What the checks showed

This was a docs change, so it had acceptance checks, not probes: one ADR per decision in the agreed format, every Record SHA resolving, `docs/plans/` emptied, every relative link resolving, and nothing changed outside `docs/` and `AGENTS.md`. The link check ran against the index, not the disk, because Windows file lookups ignore case.

## What is still open

- **F1.** Add "build a throwaway and use it" to the options `claude/CLAUDE.md` offers after two review rounds ([ADR 0008](../adr/0008-throwaway-after-two-paper-rounds.md)).
- **F2.** Review layers the pact lacks: an adversarial reviewer, a claim-checking reviewer, and a mutation tester.
- **The final check and the owner's privacy read.** At the time of writing, the main session had still to run the end-state checks and the private-term search on the final commit. The owner then reads every ADR and log entry before `main` moves.

Each follow-up becomes an issue once the tracker exists.

## Record

- `d692989` — verbatim: the plan at draft 1, parked until the usage reset.
- `b773cf8` — the owner's call not to rewrite history for the research folder's name, recorded in the plan.
- `c115eee` — the coherence check's result and the owner's calls, recorded in the plan (draft 2).
- `af2c056` — verbatim: `plan-reviewer` round 1, on draft 2.
- `8e899b7` — verbatim: the plan at draft 3, with round 1's fixes.
- `b11335c` — verbatim: `plan-reviewer` round 2, `READY`.
- `4ed79b7` — pass 1: ADRs 0001 to 0008, three log entries, the deletions and the `AGENTS.md` update.
- `5ae404d` — verbatim: `result-checker`'s report on pass 1.
- `8bf8e08` — the owner's scope addition for pass 2, recorded in the plan.
- The commit that adds this entry — pass 2: the advisory fixes, the fifth log entry, this entry, and the deletion of the plan, its reviews and the check report.
