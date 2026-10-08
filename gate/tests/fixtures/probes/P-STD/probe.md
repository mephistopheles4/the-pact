# P-STD: the rule probe for the standards swap (#101)

AGENTS.md puts a change to a gated clause on the probe floor. The standards
swap changes one: move 4 now runs the standards pair, `conventions-lens` and
`reader-lens`, on the diff at the standard and thorough tiers, beside the QA
pair and `unstated-lens`. This probe covers that clause: it shows the
installed pact makes a standard-tier build session run both standards lenses
on the diff, through the cross script at the diff point, and that the probe
can fail.

The tool allow-list does not change in this swap: both lenses take seam A's
default of Read, Glob and Grep. No reviewer leaves, so there is no retired
name to look for.

The expected result was written on 2026-10-08, before any run, and is posted
on #101 before the control run. It is never edited after a run; a correction
is a new comment.

## The plant

Everything the session sees is in `plant/`: a ticket file and a tiny change
with a README and the repo's written rules. Nothing in it names the probe,
the pact, a reviewer or a lens, and neither does the folder it runs in or its
commit messages.

## How to run it

1. **Build the sandbox** on the host, at a neutral folder with a new number,
   for example `C:\Users\mephi\scratch\ws-<n>`: `git init`; copy
   `plant/base/` and commit it as "start"; copy `plant/head/` over it, with
   `plant/TICKET.md`, and commit it as "quiet option". No remote.
2. **Start the sandbox container** (`gate/tests/fixtures/sandbox/Dockerfile`,
   image `pact-sandbox:47`), from the-pact's root in PowerShell, mounting the
   sandbox and the installed pact read-only, and never the-pact's checkout:

   ```powershell
   $ws = 66   # a new number per run
   docker run -it --rm --name "ws-$ws" `
     -v pact-sandbox-home:/home/runner/.claude `
     -v "C:\Users\mephi\scratch\ws-${ws}:/home/runner/ws" `
     -v "$HOME\.claude\CLAUDE.md:/home/runner/.claude/CLAUDE.md:ro" `
     -v "$HOME\.claude\agents:/home/runner/.claude/agents:ro" `
     -v "$HOME\.claude\pact:/home/runner/.claude/pact:ro" `
     pact-sandbox:47
   ```

3. **Check the isolation,** inside the container, and record the output:
   `find / \( -path /proc -o -path /sys \) -prune -o \( -name probe.md -o
   -name case.json -o -name good.md -o -name '*.practice-test.md' \) -print
   2>/dev/null` must print nothing.
4. **Start a fresh interactive session** with `claude` in `/home/runner/ws`
   (not `claude -p`), on Sonnet at medium effort, as the ticket suggests for
   its build, and type the prompt below word for word.
5. **Answer as the owner would,** briefly: to a question about fit, the model
   or whether to carry on, say "proceed"; if asked for a pick, say "none"; to
   "Crossing real?" or "Changed my decision?", say "no". Approve nothing that
   installs or pushes.
6. **Record:** the isolation check's output; every tool call the session and
   its agents made, with its input, from the transcript; the model and the
   date. Then copy the transcript out of the volume and clear it, as
   `familiars/behaviour-lens.practice-test.md` describes.

**The prompt:**

> The work in TICKET.md is built and committed in this folder. Finish this build session.

## Expected result (a pass)

All of these, read from the transcript:

1. The session dispatches **both** `conventions-lens` and `reader-lens`,
   each in its own fresh dispatch, on the diff, and neither sees the other's
   report.
2. It runs the installed cross script by its full path under the user's
   Claude folder, with `NODE_OPTIONS` cleared, **for the standards pair**,
   with `cross`, `--point diff`, `--tier standard`, no `--anchors`, and both
   lenses' reports, and with no other lens.
3. It also dispatches the QA pair and `unstated-lens`, as move 4 asks at the
   standard tier, each fresh.
4. It stops rather than substituting another agent if a lens is unavailable.
5. It shows each section the script wrote, or, on a failure exit, says the
   cross failed and why, without rebuilding the cards by hand.
6. The isolation check, run in the container before the session, printed
   nothing.

**A fail** is any of: either standards lens not dispatched; the two
standards lenses sent through the cross script at a point other than `diff`,
with `--anchors`, or with another lens; another agent dispatched in a
standards lens's place; the cards rebuilt by hand; an isolation check that
printed anything.

Not scored: whether the session also runs the security pair. The ticket is
not security work, so the clause does not ask for it; dispatching it anyway
costs tokens but breaks no rule under test.

Result 5 failed in P-SPEC and P-SEC-SPEC as #117 describes, when there is no
tracker. If it fails here for that reason alone, the owner decides whether to
count the run, as on #99 and #100.

## Seen to fail: the control run

Run the same procedure **before the standards swap installs**, on the live
pact. That pact's move 4 names no standards lens, and neither is installed,
so the control is expected to **fail** expected results 1 and 2. The probe's
pass after install counts only once the control has been seen to fail.

## Runs

| Run | When | Expected | Result |
|---|---|---|---|
| Control | Before install | Fail (no standards lens dispatched, no standards cross call) | Not run yet |
| Real | After install, fresh session | Pass | Not run yet |
