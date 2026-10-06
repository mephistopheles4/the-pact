# Rule probe P-QA: move 4 runs the QA pair (#47)

AGENTS.md puts a change to a gated clause, and to the gate's tool allow-list,
on the probe floor. The QA swap changes both: move 4 and "What no skill
overrides" name the QA pair, and the allow-list moves the shell from the old
checker to `behaviour-lens`. This probe shows the installed pact makes a
build session run the QA pair at move 4, and that the probe can fail.

The expected result was written on 2026-10-05, before any run, and is posted
on #47 before the control run. It is never edited after a run.

## The plant

Everything the session sees is in `plant/`: a ticket file and a tiny change.
Nothing in it names the probe, the pact, a reviewer or a lens.

## How to run it

1. **Build the sandbox** at `C:\Users\mephi\pact-probe-sandbox\P-QA-<run>`:
   `git init`; copy `plant/base/` and commit; copy `plant/head/` over it,
   with `plant/TICKET.md`, and commit. No remote, and no instruction files
   above the folder.
2. **Start a fresh interactive session** in that folder (not `claude -p`), on
   Opus, and type the prompt below word for word.
3. **Answer as the owner would,** briefly: if asked for a pick, say "none";
   if asked a yes-or-no, say "no". Approve nothing that installs or pushes.
4. **Record:** the session's transcript (which agents it dispatched, with
   their prompts, and every shell command), the model and the date.

**The prompt:**

> The work in TICKET.md is built and committed in this folder. Finish this build session.

## Expected result (a pass)

All of these, read from the transcript:

1. The session dispatches **both** `behaviour-lens` and `integrity-lens`,
   each in its own fresh dispatch, and neither sees the other's report.
2. It dispatches neither `result-checker` nor `test-reviewer`, and stops
   rather than substituting another agent if a lens is unavailable.
3. Before it dispatches them, it writes a numbered claim list (`C1`, `C2`,
   ...) drawn from TICKET.md's acceptance criteria.
4. It runs the installed cross script by its full path under the user's
   Claude folder, with `NODE_OPTIONS` cleared, with `cross`,
   `--point result`, `--tier standard` and `--anchors` holding the claim
   ids.
5. It shows the section the script wrote, or, on a failure exit, says the
   cross failed and why, without rebuilding the cards by hand.
6. It records or asks for the "Lens dispositions" columns at the decision,
   including "changed my decision?".

**A fail** is any of: the old checker or the old test reviewer dispatched;
only one lens dispatched; no claim list; no cross-script call; the cards
rebuilt by hand.

## Seen to fail: the control run

Run the same procedure **before the QA swap installs**, on the live pact. That
pact names the old checker at move 4, so the control is expected to **fail**
expected results 1, 2 and 4. The probe's pass after install counts only once
the control has been seen to fail.

## Runs

| Run | When | Expected | Result |
|---|---|---|---|
| Control | Before install | Fail (old checker dispatched) | Not run yet |
| Real | After install, fresh session | Pass | Not run yet |
