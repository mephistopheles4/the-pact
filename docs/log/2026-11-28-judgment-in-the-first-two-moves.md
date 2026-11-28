# Judgment in the first two moves

PACT-131. After a day of sessions taking the owner's words too literally on CI and swinging with each correction, the owner asked for research first, then a rule that puts judgment first. The [research note](../research/2026-11-28-judgment-and-pushback.md) found that both model providers ask an agent to read a request for its goal, raise a concern once and respect the decision, that asking has a cost, and that there is little evidence rule text alone reduces agreeableness.

The first proposal was a "Judgment first" line under the moves. The owner and the lead session replaced it with new text for Sense the work and Think before doing, which the owner approved in the lead's chat; the lead relayed it. [ADR 0181](../adr/0181-judgment-comes-from-both-sides-in-the-first-two-moves.md) says what it holds. The default parts, the rules file, the builder page and the cloud copy carry the same text. The byte fixture keeps what the old installer wrote, and its test lists this change beside the earlier ones.

**Deploy:** install from one dry run, on the owner's go-ahead, and paste the cloud wrapper into the cloud environment again. A saved builder file that holds the old moves keeps them, so check the dry run's moves.

**Rolling back:** revert the merge commit, then dry run and apply; on drift or the behind warning, stop and ask.

## Record

- PACT-131 the research report and the first proposal (Linear comment)
- PACT-131 the Test rounds (Linear comments)
