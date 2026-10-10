# Review is nine lenses in pairs, joined by the cross script

The pact's reviewers are nine lenses. A lens is a reviewer agent that asks one question from one angle. Eight of them run in four pairs, and `unstated-lens` runs alone.

- **The QA pair, at move 4 at every tier:** `behaviour-lens` runs the change against the claims; `integrity-lens` asks whether the tests behind a pass can fail.
- **The spec pair, at move 2 at the thorough tier:** `executability-lens` asks whether the spec, built as written, would run end to end; `good-enough-lens` asks what could be cut or deferred.
- **The security pair, on the security route at any tier, on the spec and on the diff:** `adversarial-lens` lists the attack paths no control stops; `data-lens` finds where the data can leak.
- **The standards pair, at move 4 at the standard and thorough tiers:** `conventions-lens` checks the diff against the repo's written rules; `reader-lens` checks the next reader can act on it.
- **`unstated-lens`, alone, at moves 2 and 4 at the standard and thorough tiers:** what need did nobody write down? Its verdict never changes a pair's.

How they run:

- **Each lens runs fresh and alone, once.** Neither lens of a pair sees its partner's report. A pair with either lens missing is unavailable as a whole, and no other agent stands in.
- **Where two lenses cross is the signal.** In a joining pair, both lenses reporting one anchor is shown first: an attack path that reaches sensitive data, a claimed pass on a check that cannot fail, a rule break that also loses the reader. The spec pair is a tension pair: where both call one section, the owner settles it.
- **Each report ends in one findings block,** and the installed cross script, `~/.claude/pact/cross.mjs`, checks and joins a pair's two blocks. It fails closed: a malformed report, a report from the wrong lens or a security report at the wrong tier is refused, no section is written, and the session never rebuilds the cards by hand.
- **The lenses read; they do not build.** Each holds the tools its question needs, bounded by the gate's allow-list; only `behaviour-lens` holds a shell.
- **The gate keeps the roster.** It holds one list of the old reviewers' names and refuses any pact or agent file that names a reviewer that is not installed.

They replaced four reviewers. The QA pair replaced the result checker and the test reviewer (#47), the spec pair and `unstated-lens` the plan reviewer (#99), and the security pair the security reviewer (#100). The standards pair is new (#101).

## Why

- **Two angles are more independent than two runs.** Two runs of one reviewer share its blind spots. The N-version studies found that independently built checks still fail together, and that deliberately different methods can do better. A lens pair gets its independence from asking different questions, so one run of each is enough.
- **A lens finds misfits.** A reviewer can rarely prove work right, but can often prove it wrong. A crossing is two different misfits meeting at one place, which is where the owner should look first.
- **The owner leads from reports.** Narrow questions give short reports with one subject each, and the cross script puts the joined result in one place on the issue.
- **Fail closed, because a report is data.** A lens report can carry text planted in the work it read. The script checks every field against a strict shape and character rules before anything is posted, so a bad report cannot reach the issue as live markdown.
- **The roster was a hypothesis, selected by use.** The owner chose to dogfood it on real work rather than run a selection experiment, since a lens can be deleted at any time.

## What use showed

Three periodic reviews ran before #189 retired them ([ADR 0051](0051-review-bookkeeping-keeps-only-what-feeds-a-decision.md)):

- **The QA pair, closing #47 (2026-10-06):** 3 real reports each. The owner kept both lenses.
- **Closing #99 (2026-10-07):** 12 more real reviews across four repos. No signal that a lens might not pay fired, and 73 auto-takes stood with none reversed. The owner kept all five lenses then in use.
- **Closing #100 (2026-10-08):** 4 real security-pair reviews, with 22 and 14 findings and 4 crossings shown. The owner kept both security lenses.

No lens was added, merged, retuned or cut at any of them. The standards pair arrived after the last one.

## Status

Accepted. Builds on [ADR 0012](0012-reports-for-two-readers.md)'s two-section report, whose opening order [ADR 0054](0054-the-cross-script-places-the-verdict.md) changes. The lenses' placement is [ADR 0017](0017-lens-files-ship-unsealed.md), their red step [ADR 0016](0016-each-lens-opens-with-a-red-step.md), their settings [ADR 0027](0027-every-pact-lens-is-configurable-with-opinionated-defaults.md), and how a change to one is proved [ADR 0045](0045-agent-and-rule-changes-are-proved-by-review-not-by-probe.md). What each pair checks is in [ADR 0021](0021-executability-is-judged-at-spec-time.md), [ADR 0024](0024-the-data-lens-checks-encryption-and-approved-flows.md) and [ADR 0044](0044-the-standards-pair-judges-written-rules-and-named-tells.md).

## How this was decided

- **2026-10-01** — Raised by the owner in mephistopheles4/the-pact#35, and grilled into the roster the same day.
- **2026-10-03** — A throwaway answered the cross script's open questions after two review rounds without convergence; a roster research report shaped revision 6.
- **2026-10-04** — The owner chose dogfooding over a selection experiment, and signed off revision 7 of the spec.
- **2026-10-04 to 2026-10-09** — Built as seven tickets: #44 and #45 (the cross script and the roster), #46 (the probe rule), #47 (the QA pair), #99 (the spec pair and `unstated-lens`), #100 (the security pair) and #101 (the standards pair). #102 closed it out.
