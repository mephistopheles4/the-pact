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
| How the agent helps | What stays the owner's, and where the record's and the tools' how-to lives. |
| Checkpoints | What the rules keep for the owner is the session's own pick, logged and flagged, so work runs on and the owner reviews after; the pact adds no stop of its own, and the harness's permission prompts and blocks still stop a session. Nothing else logs it or pins a merge to its head. |
| Nudge once | How much to remind the owner of a dropped move. Nothing else knows the moves. |
| Keep the record | Points to review.md's Posting section, which no tool loads, and says where the record is: the work's record, else chat. It holds the record's rules: no tool keeps the owner's words, so without the quote a paraphrase becomes the intent; and the read-back, not a listed set of items, sets the work's edge and its acceptance, which no check reads. |
| Post through the poster | Says the tool is on, and points to what it can't check, in review.md: the scratch folder, deleting the file after, not working around a refusal. |
| Remove worktrees only through the cleaner | It can't tell the owner's yes: each removal is a checkpoint (the Safety quality; `AGENTS.md`, Reviewing a change here). The line names the command: a lead may run a cleaner only when the user-level rules name its program, and the bare line named neither. |
| How much checking | The tiers, the sensitive route, and the effort line. A session is told its model but not its effort. The tables name roles and one line names the harness's models for them, since no harness maps a role to a model. |
| For `<effort>`, take the effort the tier table gives (the models line) | A model named with `<effort>` is no name a session can use, and no harness reads the effort from the tables. |
| Workflow | The owner's stages and which lens goes where. No tool sequences the work. |
| A skill I can't invoke | The harness blocks invoking a skill with model invocation off, and a plugin skill can be missing from the session's list; without the rule the stage stalls or the skill is skipped silently. Naming the skill in the workflow is the owner's consent to run it. |
| Lenses | The lens roster: the owner's choice of reviewers, which no tool holds. Where a harness has no subagents, it says each lens runs in a session of its own, which no harness arranges. |
| Lenses are offers | An offer is a checkpoint, answered by whoever steers the session: the owner, or the grimoire head chef's lead in Turbo mode. |
| Before you run a lens or post to the record, read `~/.pact/review.md` | Points to the procedure, which no tool loads. |
| The tree check (`review.md`, Running a lens), and the rules line sending `scout` to it | A harness that can't hold an agent to its tools leaves a lens or `scout` able to write. Nothing else notices what one changed, git's config and hooks included. It only detects; nothing undoes it. A `scout` pass may run with the procedure unread. |
| The placement call's bound (`review.md`, the threat model, step 2) | Outside text in a caller's `state` can steer a decision model to a confident wrong placement. Nothing else compares its answer with the session's own, or stops a finding being dropped on it. |
| Qualities | The owner's quality list, with the lens that checks each. No tool measures them. |
| Trade-off points | What a spec must record about trade-offs. No tool reads a spec. |
| Business drivers | Which driver decides, and the default when none is written. No tool weighs a trade-off. |
| Cost limits | What review may spend, and what happens at each limit. The harness meters usage, not review. |
| One rule | No finding is dropped silently at a limit. Nothing else routes findings. |
| The security bar | When a security fix is due. No tool weighs a fix's cost against its risk. |
| An empty limit | Who decides an unset limit. Nothing else would. |
| Guards | The calls the owner keeps, as logged picks, beyond the harness's confirm-first. |
| Work that won't converge | Two rounds without converging, or off the plan, get the options named and a pick. No tool counts rounds. |
| A standing goal | What sets one, and that a session started for it carries it. The harness's goal command only keeps a session going. |
| Usage still holds | A goal parks the work before usage runs out. The harness doesn't. |
| Usage | A checkpoint on weekly usage. The harness has no such line. |

## What no read looks for

No read before a post looks for a path on this machine ([ADR 0143](adr/0143-no-read-looks-for-this-machines-paths.md)). A user or host name, inside a path or on its own, is not a personal detail for the read before posting ([ADR 0145](adr/0145-record-mode-writes-the-output-as-printed.md)). A rewrite of that read adds no path item.
