# Checkpoints are events; hard stops wait

#554, ticket 2 (#557), thorough tier, the sensitive route. The rules file's owner waits were about twenty, and most existed only to force a checkpoint; at the owner's level 3 they stopped work that could go on. This decision sorts every owner wait into one of two kinds. A short list of **hard stops** waits for the owner's own typed words in the session's chat, under a standing goal or a free hand too, and whatever the `checkpoint-stops` setting says. Everything else is a **checkpoint**: where the configuration makes checkpoints events, the session takes its own pick, logs it as its own, flagged, and goes on; where they wait, as the setting's line says, each checkpoint waits for the owner's word in chat. The setting is on unless a configuration turns it off ([the setting](../install.md), ticket 1, #556).

It amends [0125](0125-a-standing-goal-gives-one-bounded-step-at-a-stall.md) (the stall step), [0128](0128-the-pact-names-no-lead-session-and-keeps-chat-only-where-it-closes-a-gap.md) (the owner's answer on offers, and "in chat" on a merge), [0133](0133-the-rules-file-keeps-only-what-the-owner-kept.md) (what the rules file keeps), [0137](0137-a-standing-goal-keeps-going-on-judgment.md) (what a goal decides), [0146](0146-a-standing-goal-reaches-the-sessions-its-holder-starts.md) (the started session's holder) and [0149](0149-a-free-hand-answers-offers-and-design-questions-with-the-sessions-own-pick.md) (the free hand's never-answer list).

## What changes

- **The rules file.** "Always mine", "Stop and ask me", "Working for a goal" and the free hand's never-answer list go. Two bullets, **Checkpoints** and **Hard stops**, replace them in How Claude helps; "Work that won't converge" is a checkpoint; the goal and free-hand bullets keep every safeguard 0146 and 0149 set, reworded; "Usage still holds" and the usage line say a hard stop; the cleaner part says a recoverable removal is a checkpoint and any other a hard stop. The word budget is unchanged.
- **The hard stops.** An install apply; a weakness in others' software before its maker's tracker holds it; a secret; the usage pause; a post or message beyond the work's record and branches in the owner's repos; making anything public, or a merge that deploys or might; a merge touching hooks, settings, CI, root setup or what the base branch's rules say to read closely; merging a pull request the owner didn't open or a commit not theirs, or marking outside text ready for an agent; a merge editing a threat model's classes, boundaries or scope; trusting a project's config; getting past a permission prompt or classifier block; a check the session can't clear without skipping, loosening or removing it; a withheld pick that leaves a security path open; a result it can't explain; a deletion nothing can restore, and any act it can't undo or isn't sure it can.
- **The log.** review.md's Posting gains the checkpoint log: the pick as the session's own, a one-line why, the goal or free hand it ran under, flagged. An open security pick's line in a public record is exactly "Owner's call: security, see chat", with the why in chat and in a private note, and `/scry` lists it until the owner answers; a withheld pick's line is exactly "withheld, see chat".
- **The commands.** `/make-it-so` and `/scry` name the hard stops by reference and keep no step list; `/scriptorium`'s save is a checkpoint that keeps the previous file as `builder.json.bak`.
- **The read-back.** Where checkpoints are events, a pending read-back blocks no seam; where they wait, it blocks as before, and under a goal still waits for the owner (#553).
- **The protected set.** `AGENTS.md` items 1 and 2 say a lens offer, the tier and the route are checkpoints, never a decline of the route or the pair, never a skip past the one-line exception.

## What the owner confirms at merge

The merge of this change is a hard stop, since it edits a threat model's classes. The merge ask names each of these:

- **Two widened accepted classes.** "A standing goal decides alone" and "A free hand answers offers" become one class, **A session takes checkpoints alone**, covering any session, where checkpoints are events, on its own logged pick, a pick that leaves a security path open included, and never a hard stop; and the rewrite of **Text steers a session**, whose steps kept for the owner become the hard stops and whose pointer goes to the merged class. The merged class sits at likelihood 0.45 and impact 0.70, the goal holder's judgment.
- **One weakened guide.** review.md's Threat model step 5, "Bring me", becomes "Bring me, as a checkpoint", except a change to the scope or the classes, which is a hard stop.
- **Two weakened controls.** The merge rule, "a merge waits for the owner's confirm in chat": a merge is now a checkpoint unless it is on the hard-stop list, pinned to its reviewed head. The removal rule, "a rule ties each removal to that yes": a recoverable removal through the cleaner is a checkpoint, and any other deletion a hard stop.
- **The rest of what is removed or weakened:** finding dispositions and control removals, now checkpoints; the free hand's never-answer list, now the hard stops; the payload's mise item, now the tool-neutral trust item; "anything published", narrowed to posts beyond the record, making things public and the push read; the Guards' "stop and ask me", now a checkpoint, its "hard to reverse" case a hard stop; a token-spending batch run under a free hand, which waits only past the usage line; the readiness label on the owner's own issues; and the read-back block where checkpoints are events.

## Considered options

- **Keep every wait and add a setting.** Rejected: the setting alone leaves twenty waits to label; the sort says which are not decisions.
- **Make an open security pick a hard stop.** Rejected by the goal holder: it is a checkpoint flagged big, listed in `/scry`'s Asks until the owner answers, and a withheld one that leaves a path open is a hard stop.
- **A trash checkpoint for deletions.** Not built: no trash is named on every platform.

## Consequences

- **Checkpoints wait by default.** A configuration with no `checkpoint-stops` waits at every checkpoint; the default configuration sets it false. The owner's own saved configuration needs `checkpoint-stops: false` to get events after the install.
- **Nothing installs until the chain merges.** The install apply stays the owner's hard stop.
- **Rollback:** set `checkpoint-stops: true` and install, to wait again; the cut text returns only by reverting this change, after the four checks in [Roll back to an older version](../install.md#roll-back-to-an-older-version).
