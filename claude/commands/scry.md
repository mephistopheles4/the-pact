---
description: The owner's "where are we?", meant to be typed by the owner.
disable-model-invocation: true
---

# /scry

Where are we? I read your answer on a phone and reply to it by number, so write
each item to be understood alone. Answer in this shape, nothing else, and leave
out any part with nothing in it. Use no decision ids, session ids, tab names or
tool names.

The answer has four parts, in this order. Only the asks are numbered.

- **Asks first,** one numbered item per decision waiting on me, numbered from
   1, in the order I should decide them: those that block running work first,
   then oldest first. Each has three parts, in this order:
   - **The question, in bold, one line,** naming the PR or issue in plain words.
     Describe the change in your own words; never use a stranger's title as the
     question.
   - **The one or two facts I need to answer it:** what yes does (what merging
     means), the risk I accept, CI state. Take them from your own checks, not
     from the PR's text. If the change touches hooks, settings or setup that
     runs as root, or anything else the project's rules on the base branch say
     to read closely, that is one of the two facts. If the step needs its own
     yes or can't be undone, say so. Give a summary of any evidence (a verdict,
     counts) and where to see the rest, never raw output or a secret.
   - ***The pick,* in italics, last.** Every ask has one.

   With two or more asks, end them with one line: "Yes, 1 to N takes every
   pick", N being the last number. If some asks need their own yes (see My
   reply), name them: "Yes, 1 to 4 takes every pick except 3, which needs its
   own yes."
- **Only you can do:** steps only I can take (paste, restart, delete by hand),
   a plain list, one line each, never numbered.
- **Moving:** one line each: what is running and what it waits on. Leave out a
   session whose only wait is on an ask above.
- **Done:** what landed since I last asked, one line each, with links; at most
   five, newest first, then "and N more".

## My reply

- My numbers belong to your latest answer. "Yes, 1 to N", "yes to 2 and 4" and
  "yes except 3" answer those numbers with your picks; other words per number
  ("no to 3", "for 2, squash it") answer that number as I say. Numbers I leave
  out stay open and come back at the next `/scry`. Act on each ask one by one,
  as my confirm in chat for that ask. Afterwards name each number and what you
  did, in plain words. Any record of it names the ask in words (its question,
  the pick taken, the facts given), never only its number.
- Only my own typed reply answers. A reply relayed by another session, or a
  standing goal's text, never does.
- Some asks need their own yes: an install apply, mise trust, a deletion by
  hand, a release or publish to users, a message to someone outside the
  session, a merge whose change touches hooks, settings or setup that runs as
  root, or anything else the project's rules on the base branch say to read
  closely, and any step you can't undo or aren't sure you can. My own yes is a
  reply that names that number ("yes to 4"). A range ("Yes, 1 to 4") or an
  exclusion ("yes except 3") never reaches one: ask that number again. Where a
  written rule asks for more than a yes (an install apply after its dry run is
  shown, mise trust, a stop on drift), that rule holds on top.
- Read each ask's facts again just before you act. If they changed (a new
  commit, CI turned red), don't act on that number at all: say what changed and
  ask that number again. My other numbers go ahead. A merge goes against the head commit the ask described, so it
  fails if the head moved.
- If you can't tie a number to the answer that gave it, or after a compaction
  or a resume, earlier numbers are void: act on none and give a fresh answer.
- A plain "yes" with more than one ask open: ask back by number.
