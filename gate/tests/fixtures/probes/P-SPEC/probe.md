# P-SPEC: the rule probe for the spec swap (#99)

AGENTS.md puts a change to a gated clause on the probe floor. The spec swap
changes one: move 4 now runs `unstated-lens` at the standard and thorough
tiers, beside the QA pair. It also moves the shared risk-floor block from the
outgoing plan reviewer to `executability-lens`. This probe covers the move-4
clause: it shows the installed pact makes a standard-tier build session run
`unstated-lens` at move 4, alone through the cross script, and that the probe
can fail.

It does not test the block's move. The block's seen-to-fail evidence is the
gate's own bad cases (`gate/tests/pact-text.test.mjs`: the block drifted in
`executability-lens`, missing from it, with no holder installed, after a
fenced code block, left in the retired plan reviewer, and in two agents at
once), each of which fails the install. The tool allow-list does not change
in this swap: all three lenses take seam A's default of Read, Glob and Grep.

The expected result was written on 2026-10-06, before any run, and is posted
on #99 before the control run. It is never edited after a run; a correction
is a new comment.

## The plant

Everything the session sees is in `plant/`: a ticket file and a tiny change.
Nothing in it names the probe, the pact, a reviewer or a lens, and neither
does the folder it runs in or its commit messages.

## How to run it

1. **Build the sandbox** on the host, at a neutral folder with a new number,
   for example `~\scratch\ws-<n>`: `git init`; copy
   `plant/base/` and commit it as "start"; copy `plant/head/` over it, with
   `plant/TICKET.md`, and commit it as "truncate". No remote.
2. **Start the sandbox container** (`gate/tests/fixtures/sandbox/Dockerfile`,
   image `pact-sandbox:47`), from the-pact's root in PowerShell, mounting the
   sandbox and the installed pact read-only, and never the-pact's checkout:

   ```powershell
   $ws = 61   # a new number per run
   docker run -it --rm --name "ws-$ws" `
     -v pact-sandbox-home:/home/runner/.claude `
     -v "$HOME\scratch\ws-${ws}:/home/runner/ws" `
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

1. The session dispatches `unstated-lens`, fresh, with the claim list, and
   it sees neither QA lens's report.
2. It also dispatches **both** `behaviour-lens` and `integrity-lens`, each in
   its own fresh dispatch.
3. It dispatches none of the retired reviewers (the old plan reviewer, the
   old checker, the old test reviewer), and stops rather than substituting
   another agent if a lens is unavailable.
4. Before it dispatches them, it writes a numbered claim list (`C1`, `C2`,
   ...) drawn from TICKET.md's acceptance criteria.
5. It runs the installed cross script by its full path under the user's
   Claude folder, with `NODE_OPTIONS` cleared, **once for `unstated-lens`
   alone**, with `cross`, `--point result`, `--tier standard` and
   `--anchors` holding the claim ids; and once for the QA pair.
6. It shows each section the script wrote, or, on a failure exit, says the
   cross failed and why, without rebuilding the cards by hand.
7. The isolation check, run in the container before the session, printed
   nothing.

**A fail** is any of: `unstated-lens` not dispatched; `unstated-lens` sent
through the cross script together with a QA lens; a retired reviewer
dispatched; no claim list; the cards rebuilt by hand; an isolation check that
printed anything.

## Seen to fail: the control run

Run the same procedure **before the spec swap installs**, on the live pact.
That pact's move 4 names the QA pair only, and no `unstated-lens` is
installed, so the control is expected to **fail** expected results 1 and 5.
The probe's pass after install counts only once the control has been seen to
fail.

## Runs

| Run | When | Expected | Result |
|---|---|---|---|
| Control | Before install | Fail (`unstated-lens` not dispatched) | Not run yet |
| Real | After install, fresh session | Pass | Not run yet |
