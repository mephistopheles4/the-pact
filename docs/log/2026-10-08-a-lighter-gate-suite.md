# A lighter gate suite

**2026-10-08** — The gate suite no longer builds a 579-file repo for every install test, and its documented commands cap it at four test files at once (mephistopheles4/the-pact#133).

- **Throwaway repos:** the install tests' repo builder leaves out `gate/tests`, which the install script skips before any check. A repo went from 579 files to 52. `install.test.mjs` now uses the shared harness's builder and helpers instead of its own copies.
- **The cap:** `--test-concurrency=4` in AGENTS.md and the Linux container script. See [ADR 0025](../adr/0025-the-gate-suite-runs-capped-on-the-current-node-lts.md).
- **A new test:** a file planted under `gate/tests` in a throwaway repo must not enter the recorded gate. Before this change the test folder's presence guarded that skip implicitly; leaving the folder out would have lost the guard. The test passes on the real script and fails with the skip line deleted.
- **No gate code changed.** The security route stayed off, by the owner's word at sign-off.

## What it set out to do

The full suite (about 1,440 tests) made the owner's PC unresponsive beside other Claude sessions. Six install-related files took 93% of the time, because each case builds a throwaway git repo and runs the install script through pwsh.

## What was measured

Node 24.14.1, 32 logical processors, one test file set per run. Peaks are machine-wide counts and include other sessions.

| Run | Wall | Peak node |
| --- | --- | --- |
| main, default, quiet | 546 s | 63 |
| branch, default | 436 s | 73 |
| branch, cap 4 | 498 s | 30 |
| branch, cap 2 | 729 s | 42 |
| branch, cap 4, two copies at once | 719 s and 712 s | 66 |

Test names and statuses were identical to main in every run (1,442 cases, 7 skips, no failures).

## What was found

- **The flag fails on Node 20.0.** It starts at 20.10. The owner answered by asking to be on the Node LTS with Volta.
- **Move 4, integrity lens:** dropping the test folder removed the only test of the install script's skip. Fixed with the new test above.

## Record

Issue comments on mephistopheles4/the-pact#133:

- `6055181912` — the build state and the measured table.