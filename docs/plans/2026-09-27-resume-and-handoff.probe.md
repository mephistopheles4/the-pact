# Probe A4: handover notes (2026-09-27)

**Written before the run.** Plan: `2026-09-27-resume-and-handoff.md`, acceptance A4. Installed from `9dcd6d8`; each live file's hash matched its repo copy.

**The brief, identical in both runs** (it does not mention notes):

> Working directory: <the worktree>. Use PowerShell. Task: report how many lines `README.md` has, using `(Get-Content README.md).Count`. Do not edit, create or delete any file. Done-criteria: you report the number and the command's exit status.

## Control — this session (definitions loaded before the install)

**Expected:** a `STATUS` line, and **no** handover notes: none of the headings **Learned**, **Dead ends**, **Touched** or **Next**, and no **Sources** line. This is the run in which the probe is seen to fail.

**Stop** if the control shows handover notes: the probe can't then tell the new definition from the old one.

## Test — a fresh session started by the owner

**Expected:** a `STATUS` line, and the final message ends with all four headings and a **Sources** line.

**Stop** if any of the four headings or the Sources line is missing, even with `STATUS: DONE`.

## What this record holds

For each run: the STATUS line, which headings and whether the Sources line are present, and the Sources value. The content under the headings is withheld, per the plan. Each full report is kept verbatim in the gitignored `2026-09-27-resume-and-handoff.probe.private.md`.
