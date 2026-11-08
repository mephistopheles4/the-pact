---
description: The owner's "accept all recommendations", meant to be typed by the owner.
disable-model-invocation: true
---

# /make-it-so

Accept every recommendation in your last message, and carry them out. After a
`/scry` answer, that is "Yes, 1 to N" to that answer. This never takes a step
that needs its own yes, nor a `/scry` ask already answered. Those steps are an
install apply, mise trust, a deletion by hand, a release or publish to users, a
message to someone outside the session, a merge whose change touches hooks,
settings or setup that runs as root (or anything else the project's rules on
the base branch say to read closely), and any step you can't undo or aren't
sure you can.
