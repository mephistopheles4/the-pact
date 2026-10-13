# The qualities are a list, not a ranking

The Qualities part, and a project's own list, no longer say they are ranked. Row order carries no meaning, and Scriptorium drops the buttons that moved a quality up or down (#279, the owner's decision in chat).

## What changed

- **The words go.** "ranked" leaves the rules file's Qualities section, the fixed sentence above a project's own list, CONTEXT.md's **Quality**, the README, the install how-to and `builder/parts.mjs`'s comments.
- **The builder** no longer numbers the Qualities rows or offers ↑ and ↓ on them. Rows keep the order they are added in, which the rules file shows as written.

## Why

- **Nothing acted on the order.** The rules file said "ranked", but no rule said what the order did: sizing, writing claims and naming an offer's quality all read the list without it. The review procedure hands each lens only the rows that name it, so no lens saw where its quality stood.
- **A word with no rule behind it misleads.** A person who reorders the list expects something to change; nothing did.

## What was weighed

- **Giving the order a job:** at a trade-off point with no business driver, the higher-ranked quality would be the session's recommended side (#278). Not taken: the owner chose to drop the ranking instead (chat, 2026-10-13).

Amends [ADR 0068](0068-qualities-a-ranked-list-each-lens-checks-against.md), whose title and text describe a ranked list.
