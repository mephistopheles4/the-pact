# Lenses are offers, and the sensitive route is recommended

The rules file no longer runs any lens by default. A session offers each lens with a one-line reason, and the owner answers. Sensitive work is no longer forced to the thorough route: a session that sees it says why in one line in its tier proposal and recommends the sensitive route, and the owner takes it or not. This supersedes [ADR 0060](0060-the-moves-are-the-owners-practices-and-the-pact-leans-on-judgment.md) in part, for the defaults sentence and the lens table, and [ADR 0046](0046-the-protected-set-is-five-items.md) in part, for what protected items 2 and 3 hold (#262, phase 1).

## What changed

- **The offers paragraph replaces the defaults.** The four sentences that had the QA pair read every result and the security pair read sensitive work give way to one paragraph in the Lenses section, outside every configurable part. It says:
  - a lens is offered with a one-line reason;
  - the owner answers in chat, or through a lead that relays the owner's words;
  - the security pair, named, comes with the sensitive route, and once more at Test if the owner didn't take it;
  - on a change of about one line not flagged sensitive, no lens may be needed, said aloud;
  - a repo's own rules requiring one of the pact's lenses hold;
  - a skill or command the owner typed in this session runs its own lenses unasked. That never lifts the sensitive-route flag, the Guards, the decisions that are always the owner's, or the review procedure's read before anything is posted.
- **The sensitive route.** The list (auth, secrets, crypto, input validation and data migrations) is what a session looks for, by that list or otherwise. A match obliges a one-line why and a recommendation of the route in the tier proposal: thorough, planned and built on Opus at high, with the security pair on the spec and the diff.
  - If the owner declines it, or nobody answers, the security pair is offered once more at Test on a list match.
  - Beyond that one offer, sensitivity doesn't stop the run.
  - A flag found later is said at the next hand-off or result until the owner answers.
- **A Workflow section,** fixed text for now, between "How much checking" and "Lenses". Its table has one row per stage, Plan to Maintain. It gives what each tier sets there, the Sensitive route's models, the lenses offered and when, and the other ways out.
- **The tier table** loses its Checking column, which the workflow table now carries. Thorough's Fits gains "cut into tickets, each its own session", so that statement isn't lost.
- **The lens table becomes a roster,** Lens and Asks, with FIG. 03's questions. The intro loses "say which you left out and why", and "Finish the build" offers the reviews rather than running them.
- **The rules file names no permission mode.** Leading work on autopilot is a skill's job.
- **The review procedure** describes how a lens runs, not whether. Its Posting section covers every report the session posts, those of lenses a skill runs included.
- **`AGENTS.md`'s protected set:**
  - Item 2 is the offers paragraph, all of it.
  - Item 3 is the list, the recommendation it obliges, the backstop at Test, and the flag never dropped.
  - A new line says the gate's tests are never a one-line change here.
- **Two tests read the rules file's source.** One checks that it names no permission mode. The other checks that the offers paragraph sits once in Lenses, outside every open mark, names both security lenses and holds the fence's four items, and that the sensitive default holds the one-line why and the backstop.

## Why

The owner's decisions on #262:
- Lenses should be offers, not a fixed sequence a session runs.
- The pact should name no auto mode of its own.

On sensitive work the owner's concern was two-sided:
- Claude classifies sensitive work badly, and forcing the thorough route on every match frustrates people who want the work to run on.
- Dropping the route lets sensitive changes slip.

The head chef's third way, with the owner's option B, rides the flag on a decision the owner already makes, the tier. It adds one backstop offer at Test, only for a declined or unanswered list match.

## What this loosens, and what covers it

Protected items 2 and 3 are loosened. No lens runs without the owner's yes, unless a repo rule requires it or a skill the owner typed runs it.

A sensitive change can now run with no security read in three cases:
- the owner declines twice, at the tier proposal and at Test;
- both offers go unanswered;
- the session misses the match.

What covers it:
- the list kept as what a session looks for;
- the flag a match obliges;
- the backstop at Test;
- the flag never dropped;
- a started skill never lifting the flag;
- a repo's own rules holding;
- this repo's security route, which still requires the security pair here.

The threat model's R20, R21 and R23 record the rest as judgment.

## Not chosen

- **The forced route of rev 3** (q2's option C): sensitive work always thorough, planned and built on Opus at high.
- **The third way with no backstop** (q2's option A).
- **A security-pair reread of the revised default before the build** (q6). The owner chose to have the pair read the phase 1 diff instead, knowing `AGENTS.md` asks for both pairs at spec time on a protected-set change.

## How this was decided

- **2026-10-11 and 2026-10-12** in mephistopheles4/the-pact#262: the owner's decisions on stages, agents and conditions, lenses as offers, and no auto mode of its own.
- **2026-10-12:** spec revisions 2 to 4 and update 1. The spec pair and the security pair read revision 2. On the owner's word, relayed by the head chef: q2 B, q4 A, q5 A, q6 no reread, then proceed. Phase 1 builds the text; phase 2 makes the four parts editable.
