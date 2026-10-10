# The cross script places the verdict, so a lens report opens without one

A lens report keeps [ADR 0012](0012-reports-for-two-readers.md)'s two sections, **For the owner** first and **For the session** second. But **For the owner** no longer opens with the verdict word. It opens with what is wrong, why it matters and what it suggests, and holds no verdict word at all. The verdict lives only in the report's findings block, as its `verdict` field.

- **The cross script places the verdict.** It reads each lens's `verdict`, checks that it agrees with the findings, and joins a pair's two into the stricter one, in the order `blocking`, `inconclusive`, `findings`, `clear`. `unstated-lens`'s verdict shows on its own and never changes a pair's.
- **Where the verdict shows depends on the tier.** At the quick tier the section is one line that leads with it. At the standard tier it follows the map and leads the cards. At the thorough tier it is folded below the map and the cards, so the owner reads the evidence first.
- **A headline holds no verdict word.** Every lens's text bans "high", "blocking", "clear", "safe" and "ignore" in a finding's headline, because a headline shows before the owner reads the verdict.

This supersedes ADR 0012 in part: its opening order, and its four reviewer names. Its two readers, its verbatim posting and the way the session helps the owner decide all still hold.

## Why

- **A verdict read first anchors everything after it.** The owner leads from reports and often decides from a summary. A report that opens with "clear" invites a rubber stamp; at the thorough tier the evidence comes before the verdict, so the owner forms a view of their own first.
- **One place, one rule.** A pair has two lenses, so a verdict at the top of each report would put two verdicts in two places, and nothing would check the prose against the findings. The script computes the pair's verdict once, from the blocks, and refuses a block whose verdict disagrees with its findings.
- **The two-reader split still earns its place.** The owner reads plain sentences; the session reads the evidence and locations. Only the first line of the owner's section moved.

## What use showed

- **The shape held on real work.** Across the three periodic reviews on #47 and #35 (see [ADR 0053](0053-review-is-nine-lenses-in-pairs-joined-by-the-cross-script.md)), every cross refusal was a length or character limit in a findings block, never the report's order: a non-risk note over 200 characters, a headline over 120, and a symbol holding a hyphen. Each lens's text now names the script's limits in exact words.
- **The owner reads the joined table.** At the first periodic review the owner said: "I've been using the visual check to compare the findings with the table, and that's usually all I need to look at." The thorough pick, which asked where the owner expected the problem before the verdict, was then removed ([ADR 0051](0051-review-bookkeeping-keeps-only-what-feeds-a-decision.md)); the folded verdict stayed.
- **Sample A stayed the target** for the QA pair's report layout. The owner wanted use or a prototype to settle it, and neither changed it.

## Status

Accepted. Supersedes [ADR 0012](0012-reports-for-two-readers.md) in part.

## How this was decided

- **2026-10-04** — Decided in revision 7 of mephistopheles4/the-pact#35's spec ("The verdict", "The cross script", and the Further Notes on ADR 0012), which the owner signed off. The cross script was built in #44.
- **2026-10-05 to 2026-10-09** — Each lens was written to it, from the QA pair (#47) to the standards pair (#101).
- **2026-10-10** — Recorded by #102, which closed #35.
