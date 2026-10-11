# Triage calibration: a method to measure how often triage over-calls the tier

**2026-10-10** — the pact built a replayable way to measure how often triage proposes a heavier tier than the work needed (mephistopheles4/the-pact#214). The owner had observed that sessions propose thorough for most work and are poor at triage. No rule changed. The figures stay on the owner's machine, by the owner's word: "all benchmarks of this issue stay on this machine, jev forbids publishing benchmarks." (Jev is TypeSafe's classifier; it was not run here, and the same ban is applied to all of #214's figures.)

## What it set out to do

Put a baseline under any later change to the triage rules, so a downward rule is judged by a measured over-call rate and not by feel. The downward rule, and the risk floor as a deterministic list match, go to one later issue on the security route, because any edit to `claude/CLAUDE.md` regenerates `cloud-sessions/`, which AGENTS.md puts on that route.

## The method

- **The set.** Closed issues on the tracker, read as JSON, owner-authored only. Each request is the body as first filed, taken from the edit history. Issues where the security route actually ran, shown by an `adversarial-lens` or `data-lens` report in the comments, are set aside as risk-floor. Issues with no merged PR linked to them cannot be scored and are counted and dropped.
- **The outcome proxy.** The tier the work turned out to be, from the size and spread of its merged PRs: quick at 50 lines or fewer in 3 files or fewer, thorough above 400 lines or 15 files, standard between. Generated files and the close-out docs don't count. Tickets and spec rounds are left out of the main proxy because the tier itself produces them; a second rate adds them and names the bias. The report shows how the rate moves when the limits are halved and doubled.
- **The triagers.** A headless Claude call on Opus per scored issue, started from an empty folder outside any repo, with no tools, loading the installed pact and no repo rules or project memory. The spec planned a seeded sample of thorough issues beside every quick and standard one; the scored set came out small enough that every scored issue went to Claude, so no sample or seed was used. A local classifier, clef-flash on Ollama, is the second triager and runs on the whole scored set. Clef-flash's pull needed the owner's approval, and its run follows that approval.
- **Left out.** The jev classifier experiment (TypeSafe's classifier; the issue's fourth proposal) is not part of #214. If wanted, it is its own issue, and its results stay on the owner's machine.
- **The measure.** The over-call rate, the under-call rate and the 3×3 table, each with a 95% Wilson interval, and never accuracy. The applied tier label is a third row in the report. The report says when the set is too thorough-heavy to tell a calibrated triager from one that always says thorough.

## What the build found about the method

- **Closing links were missing.** Most issues carry no "Closes" link, so linking PRs to issues needed the PR title and branch name too. Many closed issues still had no merged PR, so they could not be scored.
- **A ticket's size is not its tier.** A ticket cut from a thorough spec is small by lines and carries its parent's tier by rule. The size proxy reads such tickets as quick or standard, which can look like an over-call that isn't. The rule issue should decide how a ticket's tier is judged.

## Results

The figures are not recorded here (see above). The owner reads them in the local report, and decides whether to file the rule issue from the report's drafted text, which also carries the ticket-tier lesson above. The owner's conclusions follow as a comment on #214, in the owner's words, after that reading.

## Record

Issue comments on mephistopheles4/the-pact#214:

- **Plan briefs:** plan brief 6103211823; build brief 6103392950.
- **Spec:** revision 1, 6103314386; revision 2, 6103330562; revision 3, 6103349569.
- **Review:** `unstated-lens` on the spec, 6103327308; Lens dispositions, 6103330685.
- **Owner decisions, from chat:** 6103349686 and 6103352120. **Plan phase end:** 6103354458.
- **Move 4:** QA pair 6103701489; `unstated-lens` 6103701717; standards pair 6103701863; Lens dispositions 6103704452; build state and kit location 6103704636.

The replay kit (script, prompt, set with each issue's outcome tier, proxy settings), the results and the report are in the owner's local results folder, outside the repo.
