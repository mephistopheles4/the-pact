---
description: The owner's "we're done, archive this session", meant to be typed by the owner.
disable-model-invocation: true
---

# /finis

Act only if the person's latest message names this command; otherwise say so and stop.

<!-- pact:if archive -->
We're done: archive this session.
<!-- pact:end -->
<!-- pact:unless archive -->
We're done.
<!-- pact:end -->

First check whether anything in it is outstanding, such as work not yet
committed or pushed, or a step left unfinished.
<!-- pact:if archive -->
If there is, say what it is and don't archive. If there isn't, archive the
session.
<!-- pact:end -->
<!-- pact:unless archive -->
If there is, say what it is. If there isn't, say: "Nothing is outstanding;
close this session."
<!-- pact:end -->
