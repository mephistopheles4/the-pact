# The review lenses: nine lenses in pairs replace four reviewers

**2026-10-10** — #35 is closed out. The pact's four reviewers are replaced by nine lenses: four pairs and `unstated-lens` on its own, joined by the installed cross script (mephistopheles4/the-pact#35, the spec; #102, the close-out).

- **The roster:** the QA pair (`behaviour-lens`, `integrity-lens`), the spec pair (`executability-lens`, `good-enough-lens`), the security pair (`adversarial-lens`, `data-lens`), the standards pair (`conventions-lens`, `reader-lens`), and `unstated-lens`. See [ADR 0053](../adr/0053-review-is-nine-lenses-in-pairs-joined-by-the-cross-script.md).
- **The report:** two sections, as before, but **For the owner** opens without a verdict word; the cross script places the verdict. See [ADR 0054](../adr/0054-the-cross-script-places-the-verdict.md), which supersedes [ADR 0012](../adr/0012-reports-for-two-readers.md) in part.
- **Eight issues, 2026-10-04 to 2026-10-10,** cut from the spec's tickets 1, 2 and 4 to 7 (revision 7 has no ticket 3): ticket 1 became #44 and #45, ticket 2 became #46 and #47, and tickets 4 to 7 are #99 to #102. Each swap has its own log entry, listed below.
- **Three periodic reviews kept every lens.** #189 then retired the periodic review, the security sets and the probes, so the close-out had less to do than its ticket planned.

## What it set out to do

The pact's reviewers were chosen quickly. On 2026-10-01 the owner asked to redesign them as lenses: narrower reviewers, each looking from one angle, paired so that where two independent lenses cross is the signal. An attack path that reaches sensitive data is the example: an adversarial lens and a data lens each see half of it. The owner also wanted reports that are more human and more visual, so that a reader thinks before agreeing.

## How it was planned

- **A grilling, then a spec.** The roster came out of a grilling on 2026-10-01. The spec went through seven revisions, each read by the plan reviewer and the security reviewer of the time.
- **A throwaway after two rounds.** Rounds 1 and 2 did not converge, so a throwaway branch built the cross script's riskiest parts. It showed that backslash escaping fails on GitHub, that code spans hold, and that a script-written fold needs blank lines around it. Revision 3 folded that in.
- **Roster research.** Before tickets were cut, the owner paused for research on the roster (2026-10-03). It drew on ISO/IEC 25010, SEI's ATAM and ARID, perspective-based reading, and devil's advocacy. Revision 6 followed; three of its ideas went to #43.
- **Dogfooding, not an experiment.** The owner chose to install the roster and select it by use, with standing measures and periodic reviews, rather than run a selection experiment first (2026-10-04). Revision 7 wrote that in, and the owner signed it off the same day.

## How it was built

- **#44 and #45, the cross script and the roster.** The script checks and joins a pair's findings blocks and fails closed. The install copies it to one fixed path and hashes it; the gate learned the roster and refuses a named reviewer that is not installed. See [the log entry](2026-10-04-install-cross-script-and-roster.md).
- **#46, the probe rule.** AGENTS.md's probe rule was amended to the spec's floor, and the protected set was written. The owner widened the floor during the build. #189 later replaced the probe floor with the security route ([ADR 0045](../adr/0045-agent-and-rule-changes-are-proved-by-review-not-by-probe.md)).
- **#47, the QA pair.** The first swap, with each lens's red step ([ADR 0016](../adr/0016-each-lens-opens-with-a-red-step.md)) and the lens files unsealed in `claude/agents/` ([ADR 0017](../adr/0017-lens-files-ship-unsealed.md)). See [the log entry](2026-10-06-qa-pair-swap.md).
- **#99, the spec pair and `unstated-lens`.** They replaced the plan reviewer ([ADR 0021](../adr/0021-executability-is-judged-at-spec-time.md)). See [the log entry](2026-10-07-spec-pair-swap.md).
- **#100, the security pair.** It replaced the security reviewer ([ADR 0024](../adr/0024-the-data-lens-checks-encryption-and-approved-flows.md)). See [the log entry](2026-10-08-security-pair-swap.md).
- **#101, the standards pair.** New to move 4 ([ADR 0044](../adr/0044-the-standards-pair-judges-written-rules-and-named-tells.md)). See [the log entry](2026-10-09-standards-pair.md), which landed with #102.
- **#102, the close-out.** What it did is below.

## What the periodic reviews showed

- **Closing #47 (2026-10-06):** 3 real reports from each QA lens; 6 findings from `behaviour-lens`, none from `integrity-lens`; 1 cross refusal, for a non-risk note over 200 characters. The owner kept both: "I guess it's the only way we could stay sure."
- **Closing #99 (2026-10-07):** 12 more real reviews across four repos; 73 auto-takes, none reversed; 1 confirmed escape, which fell to `behaviour-lens`. The owner kept all five lenses then in use: "yup agreed".
- **Closing #100 (2026-10-08):** 4 real security-pair reviews, 22 and 14 findings, none `high`, 4 crossings shown. The owner kept both: "i agree".

No lens was added, merged, retuned or cut. Every cross refusal across the three was a length or character limit in a findings block.

## What #102 did, and what it no longer had to

#102's ticket was written on 2026-10-06. #189 (the prune) landed before it was built, and its brief from the lead listed what was left. Each item, checked against main:

- **The README's roster description:** already done. #202's README describes the nine lenses as a whole, in the figure and its text.
- **The name search:** already passing. The roster test finds none of the four old names outside the skipped records, the roster list's defining line and its own test file.
- **#81, `blocked: needs` in `behaviour-lens`:** already in its text, at the missing-tool rule and stop S2. #81 was closed, and its practice case B5 went with #189.
- **The auto-take wording:** both QA-pair contracts now say the main session acts on its recommendation per finding and marks it `auto`, with the owner's "done" unchanged. Both lens files' hand-back paragraphs now say so too, in the words the other seven lenses use; `conventions-lens` found them missing at move 4. Their "You advise; the owner decides" stays, as in all nine lenses: it is about the owner's "done", not each finding.
- **The QA pair's limits:** both lens files now name every cross-script limit on the findings block, in the newer lenses' exact words. The owner chose to add them ("add them"). That closes item 5 of #47's measure fixes.
- **`behaviour-lens`'s question 14:** its contract no longer says a model change makes its security-set results stale, since #189 deleted the security set.
- **#101's close-out:** its log entry and ADR, from closed PR #178, renumbered from 0036 to 0044. Its probe run and periodic review are marked moot.
- **Moot after #189:** `behaviour-lens`'s security-set rerun, the fix path, the closing periodic review, the thorough pick (#164), and the measure fixes #47's review fed in (items 1 to 4, 6 and 7), which the five-column Lens dispositions table and ADR 0051 made moot.

## What is still open

- **The install** of the two changed QA lens files: a dry run, the owner's go-ahead in chat, and a hash check that exits zero. Until then every project runs the old lens text.
- **The cloud wrapper:** after the merge, the owner pastes `cloud-sessions/cloud-setup-wrapper.sh` into the cloud environment's setup field again, and checks the first session's setup log for the line `pact cloud copy` with the new marker.
- **Closing:** #102, #35 and the rollout map #58 close on the owner's word once the finishing PR merges.
- **#69:** sealing `behaviour-lens`, which waits on grimoire#166.
- **#117:** with no tracker, sessions point at the cross section's file instead of showing it.
- **`adversarial-lens`'s next change:** its headline rule should name the "in clear" trap that failed D1 once (#100's periodic review).
- **Disclosure:** on a public repo, verbatim security reports can disclose unfixed weaknesses. The spec named this as open and outside #35.

## Record

Issue comments on mephistopheles4/the-pact#35:

- `5934004307`, `5942318524` — the starting brief, and the grilling outcome: the roster.
- `5943158905`, `5943209335`, `5943232679` — revision 1, and round 1 of the plan and security reviews.
- `5943279543`, `5943349315`, `5943357212`, `5943510279` — revision 2, round 2, and the state: a throwaway next.
- `5971555190`, `5971555342` — the security review of the throwaway's diff, and what the throwaway answered.
- `5972207208`, `5972254378`, `5972277374`, `5972282527`, `5972992910` — revision 3, round 3, its state, and the owner's decisions.
- `5973078266`, `5973121143`, `5973143445`, `5973148752` — revision 4, round 4, and its state.
- `5973280779`, `5973280938`, `5973316735`, `5973327673`, `5973330734` — revision 5 in two parts, round 5, and its state.
- `5974325886`, `5974466196` — `to-tickets` paused for the roster research, and the research report.
- `5980080891`, `5980081081`, `5980130831`, `5980140701`, `5980151354` — revision 6 in two parts, round 6, and its state.
- `5980561962`, `5980630168` — the owner's dogfooding choice, and the inputs for revision 7.
- `5980776564`, `5980776753`, `5980826227`, `5980838615`, `5980859262` — revision 7 in two parts, round 7, and its state.
- `5981119820` — revision 7 signed off; tickets 1 and 2 published as #44 to #47.
- `5981771351` — the owner's decision during #46: a wider probe rule.
- `5981837597` — the reading list.
- `6008892766`, `6026676994` — #47's notes for tickets 4 to 7, and their publication as #99 to #102.
- `6026780786` — the QA pair's first periodic review: the owner's decision. Its measures are on #47, comment `6026731551`.
- `6039666370`, `6039781449` — the periodic review closing #99, and the owner's decision.
- `6051965421`, `6052024992` — the periodic review closing #100, and the owner's decision.

Issue comments on mephistopheles4/the-pact#102:

- `6026768159`, `6026781023` — added scope: remove the pick (done by #164), and the measure fixes fed in from #47's first periodic review.
- `6102271163` — the lead's brief for this build, after #189.
- `6102457009` — the owner's decisions from chat: add the QA pair's limits, and keep #101's close-out; what main already held.
- `6102497867`, `6102498028`, `6102498163` — move 4: the security pair and the standards pair on the diff, and `unstated-lens` on the result.
- The claim list, the Lens dispositions, the full suite and the install record follow on #102.
