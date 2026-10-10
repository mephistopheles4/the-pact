# Triage calibration: a method to measure how often triage over-calls the tier

**2026-10-10** — the pact built a replayable way to measure how often triage proposes a heavier tier than the work needed (mephistopheles4/the-pact#214). The owner had observed that sessions propose thorough for most work and are poor at triage. No rule changed. The figures stay on the owner's machine, by the owner's word: "all benchmarks of this issue stay on this machine, jev forbids publishing benchmarks."

## What it set out to do

Put a baseline under any later change to the triage rules, so a downward rule is judged by a measured over-call rate and not by feel. The downward rule, and the risk floor as a deterministic list match, go to one later issue on the security route, because any edit to `claude/CLAUDE.md` regenerates `cloud-sessions/`, which AGENTS.md puts on that route.

## The method

- **The set.** Closed issues on the tracker, read as JSON, owner-authored only. Each request is the body as first filed, taken from the edit history. Issues where the security route actually ran, shown by an `adversarial-lens` or `data-lens` report in the comments, are set aside as risk-floor. Issues with no merged PR linked to them cannot be scored and are counted and dropped.
- **The outcome proxy.** The tier the work turned out to be, from the size and spread of its merged PRs: quick at 50 lines or fewer in 3 files or fewer, thorough above 400 lines or 15 files, standard between. Generated files and the close-out docs don't count. Tickets and spec rounds are left out of the main proxy because the tier itself produces them; a second rate adds them and names the bias. The report shows how the rate moves when the limits are halved and doubled.
- **The triagers.** A headless Claude call on Opus per issue, started from an empty folder outside any repo, with no tools, loading the installed pact and no repo rules or project memory. A local classifier, clef-flash on Ollama, as a second triager. The applied label is a third row.
- **The measure.** The over-call rate, the under-call rate and the 3×3 table, each with a 95% Wilson interval, and never accuracy. The report says when the set is too thorough-heavy to tell a calibrated triager from one that always says thorough.

## What the build found about the method

- **Closing links were missing.** Most issues carry no "Closes" link, so linking PRs to issues needed the PR title and branch name too. Many closed issues still had no merged PR, so they could not be scored.
- **A ticket's size is not its tier.** A ticket cut from a thorough spec is small by lines and carries its parent's tier by rule. The size proxy reads such tickets as quick or standard, which can look like an over-call that isn't. The rule issue should decide how a ticket's tier is judged.

## Results

The figures are not recorded here (see above). The owner reads them in the local report, and decides whether to file the rule issue from the report's drafted text.

## Record

Issue comments on mephistopheles4/the-pact#214: the spec, revision 3; the Lens dispositions; the owner's decisions from chat; the plan phase end; the build brief. The harness, the set and the results are in the owner's local results folder, with the replay kit.
