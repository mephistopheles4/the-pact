# The weekly usage limit can be off

#501. A user configuration may set `"usage-pause": false`, and the weekly usage line then renders empty. This amends [0137](0137-a-standing-goal-keeps-going-on-judgment.md), which kept usage a hard limit under a standing goal and did not take "a separate configuration setting".

## What changes

- With the weekly limit off, "Usage still holds" binds to the 5-hour session line if one is set, and to nothing if neither is. The rules text is unchanged for every configuration, so the renders of every number and every absent key keep their bytes.
- The threat model's standing-goal line reads "usage holds only as a rule, and only while a usage limit is set".
- The default stays on at 75%, an absent key still means the default, and a project can never turn the limit off.

## Why

The owner asked for the weekly limit to get a toggle like the session limit's, in Scriptorium and in the configuration. Setting the limit to 100 already made the pause unreachable, so what off removes is the weekly figure and the line that the call to stop is the owner's.

## What was weighed

- **Off as an absent key.** Not taken: an absent key already means 75%.
- **Off as 0.** Not taken: 0 is a valid line ("always wait").
- **Rewording the rules text for the off case.** Not taken: it would change the renders every existing configuration keeps. The spec pair and the security pair read this; the reader-lens finding that three lines then point at a weekly line that is absent is left to the owner.

## What it costs

A fooled session that writes `false` into a user configuration removes the weekly pause for later goal-driven work. The dry run warns, and the install waits for the owner's go-ahead.
