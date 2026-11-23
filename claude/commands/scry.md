---
description: The owner's "what is waiting for me?", meant to be typed by the owner.
disable-model-invocation: true
---

# /scry

What is waiting for me? I read your answer on a phone and reply to it by
number, so write each item to be understood alone. Answer in this shape,
nothing else. Use no decision ids, session ids, tab names or tool names.

- **A very short numbered list of what waits for me,** from 1, in the order I should
  take them: those that block running work first, then oldest first. One item
  per decision for me or pick I may revisit (a checkpoint's pick included).
  Each is two parts, in this order:
  - **The question, in bold, one line,** naming the PR or issue in plain words,
    in your own words, never a stranger's title. If the change touches hooks,
    settings or setup that runs as root (or anything else the project's rules
    on the base branch say to read closely), or the step can't be undone, say
    so in that line.
  - ***The pick,* in italics, last.** Every item has one.

  With two or more items, end the list with one line: "Yes, 1
  to N takes every pick", N being the last number.

  Every open security pick (an "Owner's call: security" row, or a checkpoint
  flagged big for a security risk) has its item too, like any other, until
  a `decision` post records my answer; the answer and its reason go in the record.
- **Only you can do:** steps only I can take (paste, restart, sign in), a plain
  list, one line each, never numbered.
- **One line naming what else there is:** "There's also …", the running work,
  what landed since I last asked, and anything else not in the list, each in a
  few words. I may ask for the detail of any of it.

## My reply

- My numbers belong to your latest `/scry` answer; a number you ask again keeps
  its number. "Yes, 1 to N", "yes to 2 and 4" and "yes except 3" answer those
  numbers with your picks; other words per number ("no to 3", "for 2, squash
  it") answer that number as I say. Numbers I leave out stay open and come back
  at the next `/scry`. Act on each item one by one, as my confirmation for that
  item. Afterwards name each number and what you did, in plain words. Any
  record of it names the item in words (its question and the pick taken), never
  only its number.
- Where a written rule asks for more than a yes (an install apply after its
  dry run is shown, a stop on drift), that rule holds on top.
- Read again what each item rests on (its head commit, CI) just before you act. If they changed (a new
  commit, CI turned red), don't act on that number at all: say what changed and
  ask that number again. My other numbers go ahead. Merge pinned to the head
  commit the item described, so the merge fails if the head moved.
- A plain "yes" with more than one item open: ask back by number.
