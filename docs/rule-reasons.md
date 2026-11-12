# Why each rule is in the pact

The pact states only what nothing else covers. Each rule in the rules
file, as rendered from the default configuration with both pact tools on, has
a row here naming the gap it covers that no other guardrail does: not Claude
Code's harness, and not the pact's own threat model, poster, cleaner, gate or
hooks. A rule nobody can write a row for is a duplicate and goes. A rule the
threat model names as one of its controls never counts as covered by it,
since the threat model relies on it.

A rule is each `##` section, and each paragraph or list item that opens with
bold text, named by that text. The renderer's configuration notice is not a
rule. A plain paragraph or a table row has no row of its own: its section's
row carries its reason, and review checks it (`AGENTS.md`, Reviewing a change
here). Where a row says "the owner's", the gap is that no tool can know the
owner's own choice.

This file is never installed.

| Rule | Gap no other guardrail covers |
| --- | --- |
| The moves | The owner's own practices. No tool knows how the owner works. |
| Sense the work | Sizing, and a bug traced before any fix, are the owner's practices, not a tool's. |
| Think before doing | An intent clear enough to defend. No check can test that. |
| Checkpoint the seams | It weighs hand-offs and decisions, not only tool actions, by how hard each is to undo. The harness's confirm-first rule covers tool actions only. |
| Stay the owner | What counts as evidence: checks that could have failed. A passing check is all a tool reports. |
| How Claude helps | What stays the owner's, and where the record's and the tools' how-to lives. |
| Nudge once | How much to remind the owner of a dropped move. Nothing else knows the moves. |
| Always mine | The owner's map of decisions. The harness defers to durable authorization, and this list is that authorization's limits. Installing a new program is not on the list. The pact install (dry run, then apply on the owner's go-ahead) and mise trust stay, in `AGENTS.md`. |
| Keep the record | Points to review.md's Posting section, which no tool loads. It holds the record's rules: no tool keeps the owner's words, so without the quote a paraphrase becomes the intent. |
| Post through the poster | Says the tool is on, and points to what it can't check, in review.md: the scratch folder, deleting the file after, not working around a refusal. |
| Remove worktrees only through the cleaner | It ties a removal to the owner's yes, which the cleaner can't tell (threat model, Removals lose local work). |
| How much checking | The tiers, the sensitive route, and the effort line. A session is told its model but not its effort. |
| Workflow | The owner's stages and which lens goes where. No tool sequences the work. |
| Lenses | The lens roster: the owner's choice of reviewers, which no tool holds. |
| Lenses are offers | The protected set: lenses are offered, and the owner answers. |
| Before you run a lens or post to the record, read `~/.claude/pact/review.md` | Points to the procedure, which no tool loads. |
| Qualities | The owner's quality list, with the lens that checks each. No tool measures them. |
| Trade-off points | What a spec must record about trade-offs. No tool reads a spec. |
| Business drivers | Which driver decides, and the default when none is written. No tool weighs a trade-off. |
| Cost limits | What review may spend, and what happens at each limit. The harness meters usage, not review. |
| One rule | No finding is dropped silently at a limit. Nothing else routes findings. |
| The security bar | When a security fix is due. No tool weighs a fix's cost against its risk. |
| An empty limit | Who decides an unset limit. Nothing else would. |
| A security finding | The definition the sorter uses, and that it places a finding on a boundary as the guide says, so a path wholly on the machine is no finding. The classifier judges actions, not findings. |
| Accepted threat classes | What a finding inside a class needs, and who adds a class. The threat model holds the classes, and this rule says what they do. |
| Publishing a weakness in someone else's software | Secret scanning and push protection match credentials, and the read before a push checks only for secrets and personal details, so a weakness page can reach a public branch. The guide holds it back until its maker's tracker does too, or the owner has reported it privately. |
| Guards | The stops the owner keeps, beyond the harness's confirm-first. |
| Stop and ask me | A fixed stop that holds where the harness would take a durable authorization. |
| A standing goal | What sets one, and that a session then decides, on judgment, what the rules would bring to the owner and logs it. The harness's own goal command only keeps a session going; the pact's stops still hold it, and only the pact's text lets a session decide past them. It also says how later words narrow a goal, which no other guardrail does. |
| Working for a goal | Who answers for the owner in a session the goal's holder started: the holder, by its reply to an item the session sent, one hop, logged as the holder's, never as the owner's, and below the owner's own words in the session's chat. No guardrail lets a session's starter answer for the owner; only a reply counts. The usage go-ahead and a worktree removal stay the owner's. |
| A free hand | Nothing else lets a session take its own picks, on lens offers and design questions, short of a full goal. |
| Usage still holds | A goal parks the work before usage runs out. The harness doesn't park work before a limit. |
| Usage | A pause on weekly usage. The harness has no such pause. |

## What no read looks for

No read before a post looks for a path on this machine, and the read before a push looks for neither its paths nor its names ([ADR 0143](adr/0143-no-read-looks-for-this-machines-paths.md)). A user or host name, inside a path or on its own, is not a personal detail for the read before posting ([ADR 0145](adr/0145-record-mode-writes-the-output-as-printed.md)). A rewrite of either read adds no path item.
