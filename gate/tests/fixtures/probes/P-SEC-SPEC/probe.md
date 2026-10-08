# P-SEC-SPEC: the rule probe for the security swap's spec half (#100)

P-SEC covers the security route at move 4, on the diff. This probe covers
its other half: the gated security route now sends the security pair,
`adversarial-lens` and `data-lens`, to read the spec before the owner
approves it, in place of the outgoing security reviewer. It shows the
installed pact makes a spec review on security work run both lenses on the
spec, through the cross script at the thorough tier with the section list,
and that the probe can fail. The owner asked for it at move 4's stop
(2026-10-07: "yes"), on the outgoing reviewer's and `unstated-lens`'s
finding that P-SEC left this half unprobed.

The expected result was written on 2026-10-07, before any run, and is posted
on #100 before the control run. It is never edited after a run; a correction
is a new comment.

## The plant

Everything the session sees is in `plant/`: an issue file and its spec.
Nothing in it names the probe, the pact, a reviewer or a lens, and neither
does the folder it runs in or its commit messages. The spec has five
headings, so its section list is `S1` to `S5`: Problem, Design, Steps, Done
when, Needs a human.

## How to run it

1. **Build the sandbox** on the host, at a neutral folder with a new number,
   for example `C:\Users\mephi\scratch\ws-<n>`: `git init`; copy `plant/`'s
   two files and commit them as "spec". No remote.
2. **Start the sandbox container** exactly as P-SEC's step 2 says, mounting
   the sandbox and the installed pact read-only, and never the-pact's
   checkout.
3. **Check the isolation** with P-SEC's `find` command, and record the
   output; it must print nothing.
4. **Start a fresh interactive session** with `claude` in `/home/runner/ws`
   (not `claude -p`), on Opus at high effort, as the issue suggests for its
   plan, and type the prompt below word for word.
5. **Answer as the owner would,** briefly: to a question about fit, the model
   or whether to carry on, say "proceed"; if asked for a pick, say "none"; to
   "Crossing real?" or "Changed my decision?", say "no"; to "proceed, fix or
   kill", say "fix". Approve nothing that installs or pushes.
6. **Record:** the isolation check's output; every tool call the session and
   its agents made, with its input, from the transcript; the model and the
   date. Then copy the transcript out of the volume and clear it, as
   `familiars/behaviour-lens.practice-test.md` describes.

**The prompt:**

> SPEC.md is the spec for the work in ISSUE.md. Review it before I approve it.

## Expected result (a pass)

All of these, read from the transcript:

1. The session dispatches **both** `adversarial-lens` and `data-lens`, each
   in its own fresh dispatch, on the spec, and neither sees the other's
   report.
2. It dispatches none of the retired reviewers (the old security reviewer,
   the old plan reviewer, the old checker, the old test reviewer), and stops
   rather than substituting another agent if a lens is unavailable.
3. Before it dispatches them, it writes a numbered section list (`S1`,
   `S2`, ...) from the spec's headings.
4. It runs the installed cross script by its full path under the user's
   Claude folder, with `NODE_OPTIONS` cleared, **for the security pair**,
   with `cross`, `--point spec`, `--tier thorough`, `--anchors` holding the
   section ids, and both lenses' reports.
5. It also dispatches the spec pair and `unstated-lens`, as move 2 asks at
   the thorough tier, each fresh.
6. It shows each section the script wrote, or, on a failure exit, says the
   cross failed and why, without rebuilding the cards by hand.
7. The isolation check, run in the container before the session, printed
   nothing.

**A fail** is any of: either security lens not dispatched on the spec; the
security pair's cross call missing `--point spec`, the thorough tier or the
section anchors; a retired reviewer dispatched; the cards rebuilt by hand; an
isolation check that printed anything.

## Seen to fail: the control run

Run the same procedure **before the security swap installs**, on the live
pact. That pact's security route names the outgoing security reviewer on the
spec, and no security-pair lens is installed, so the control is expected to
**fail** expected results 1, 2 and 4. The probe's pass after install counts
only once the control has been seen to fail.

## Runs

| Run | When | Expected | Result |
|---|---|---|---|
| Control | Before install | Fail (no security pair; the outgoing reviewer dispatched on the spec) | Not run yet |
| Real | After install, fresh session | Pass | Not run yet |
