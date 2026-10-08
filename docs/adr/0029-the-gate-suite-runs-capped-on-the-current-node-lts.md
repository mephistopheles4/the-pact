# The gate suite runs capped, on the current Node LTS

The documented commands that run the gate suite carry `--test-concurrency=4`, and AGENTS.md says to run the tests on the current Node LTS (Node 24 "Krypton" as of 2026-10-08), installed with Volta.

- **The cap.** Four test files at once, in the quoted-glob form, the Node 20 PowerShell form and the Linux container script. The default on the owner's PC was about 31 files at once.
- **The limit.** The cap reaches documented runs only. A bare `node --test` still runs at the default. Revisit if a move 4 or a lens run is seen running the suite uncapped.
- **The Node floor.** The flag needs Node 20.10 or later; older Node 20 rejects it. The install script's own Node check is gate code and still accepts any Node 20 or later.

## Why

- **The suite made the owner's PC unresponsive.** Measured on a quiet machine, a cap of 4 cut the peak count of node processes from 73 to 30 and cost about 60 s (436 s to 498 s). A cap of 2 cost about 230 s more. Two suites at cap 4 together peaked at 66.
- **Node cannot set it any other way.** The flag is not accepted in `NODE_OPTIONS`, and the repo has no package file, so it sits on the command line.
- **The LTS choice is the owner's:** "we can install newer node versions with Volta, we should definitely be on Lts" (relayed word for word).

## How this was decided

- **2026-10-08** in mephistopheles4/the-pact#133. The owner's spec call was "go with recommendations on 133"; the cap of 4 is the spec's default, taken because the owner did not pick 2.