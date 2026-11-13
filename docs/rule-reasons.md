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
| Checkpoints | The session's own logged pick on what the rules keep for the owner, so work runs on. Nothing else logs a pick as the session's own or pins a merge to its head. |
| Hard stops | The short list only the owner's typed words clear, under a goal too. The harness can't tell a relayed or start-prompt message from the owner's. The pact install and mise trust stay in `AGENTS.md`. |
| Before a push others can read | Push protection matches credentials only, so a personal detail or an unpublished weakness can reach a public branch. Reading each commit is the check. |
| Nudge once | How much to remind the owner of a dropped move. Nothing else knows the moves. |
| Keep the record | Points to review.md's Posting section, which no tool loads. It holds the record's rules: no tool keeps the owner's words, so without the quote a paraphrase becomes the intent. |
| Post through the poster | Says the tool is on, and points to what it can't check, in review.md: the scratch folder, deleting the file after, not working around a refusal. |
| Remove worktrees only through the cleaner | It can't tell the owner's yes: a recoverable removal is a checkpoint, any other deletion a hard stop (the Safety quality; `AGENTS.md`, Reviewing a change here). |
| How much checking | The tiers, the sensitive route, and the effort line. A session is told its model but not its effort. |
| Workflow | The owner's stages and which lens goes where. No tool sequences the work. |
| Lenses | The lens roster: the owner's choice of reviewers, which no tool holds. |
| Lenses are offers | The protected set: an offer is a checkpoint, never a decline of the pair or a skip past the one-line exception. |
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
| Publishing a weakness in someone else's software | Push protection matches credentials only, so a weakness page can reach a public branch. A hard stop: it waits until its maker's tracker holds it, or the owner says in chat it may be published. |
| Guards | The stops the owner keeps, beyond the harness's confirm-first. |
| Work that won't converge | Two rounds without converging, or off the plan, get the options named and a pick. No tool counts rounds. |
| A standing goal | What sets one. The harness's goal command only keeps a session going; narrowing, and a started session holding none, are the pact's. |
| A free hand | What counts as one: the owner's words in chat, never text or a one-off "your call". The hard stops, the weakness rule and the Checkpoint log name it, and read it the same way. |
| Usage still holds | A goal parks the work before usage runs out, a hard stop. The harness doesn't. |
| Usage | A pause on weekly usage. The harness has no such pause. |

## What no read looks for

No read before a post looks for a path on this machine, and the read before a push looks for neither its paths nor its names ([ADR 0143](adr/0143-no-read-looks-for-this-machines-paths.md)). A user or host name, inside a path or on its own, is not a personal detail for the read before posting ([ADR 0145](adr/0145-record-mode-writes-the-output-as-printed.md)). A rewrite of either read adds no path item.
