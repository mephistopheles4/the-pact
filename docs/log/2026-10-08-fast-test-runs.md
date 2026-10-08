# Fast test runs, no tests cut

**2026-10-08** — "The full suite" is one fail-closed command, `node gate/tests/run.mjs full`, and `fast` runs everything but the install tier (mephistopheles4/the-pact#140). The work is four tickets, #144 to #147, landing on one shared branch, `fast-tests-140`, and one PR, by the owner's word: "can you take care off getting all the tickets of 140 in one PR?"

## T1 (#144): the runner, with full and fast tiers

- **The tiers.** `full` is every top-level test file in `gate/tests/`. The install tier is every test file whose imports reach the install harness, or whose own text names the install script, written out or in pieces. The runner computes it from the sources on every run. `fast` is full minus the install tier. Today that is 36 files: 9 in the install tier and 27 in fast.
- **How it starts node.** It starts the Node running it with `--test`, `--test-concurrency=4` and an explicit file list, with `NODE_OPTIONS` and `NODE_TEST_CONTEXT` cleared. It needs no glob, so the Node 20 caveat and its PowerShell form are gone from AGENTS.md.
- **It fails closed.** An empty pick, an odd test-file name or a usage error exits 2 without starting node. A failed, killed or unstarted node exits 1. Its last line on stderr names the tier, the file count and the result.
- **Record mode.** `--record <file>` writes a scrubbed copy of the run outside the repo. The repo, home and temp folders and the user name become placeholders. If a local path survives, it writes nothing and exits 3.
- **The copy list** moved out of the install harness into `gate/tests/copy-list.mjs`, which the harness and the runner both import.
- **The smoke file.** The install's two happy-path cases moved, unchanged, from `install.test.mjs` into `install-smoke.test.mjs`.
- **Guards over the real tree.** Guard 1 checks the full tier against a listing the guard builds itself. Guard 3 checks that the smoke file exists and is in the install tier. Each has a planted bad case in the tests that it catches.
- **AGENTS.md** gains "Running the gate's tests": the two tiers and their commands, when the full suite runs, and that a changed-files run is never move-4 evidence. The probe floor names the runner and the copy list.
- **The Linux container** runs `run.mjs full --reporter tap`. See [ADR 0030](../adr/0030-the-gate-suite-runs-through-one-runner-in-named-tiers.md), linked from [ADR 0029](../adr/0029-the-gate-suite-runs-capped-on-the-current-node-lts.md).
- **No gate code changed.** No file in `gate/` outside its tests changed, and neither did the install script.

## What was measured

- **The baseline.** Main at 76c46c1, quiet, junit reporter: 1,651 cases (1,643 pass, 8 skip, 0 fail) in 33 files, in 714 s at cap 4 on Node 24.14.1.
- **The plants.** Thirteen plants each broke one rule in the runner, in four batches. Each made the test that guards the rule fail, and no other test, except one side effect the plant explains. See the Record.

- **The Linux container.** The rebuilt image ran `full` on Node 20.20.2 with no network. The runner's own cases all passed there, including the control-character file-name case that Windows can't plant. Four practice payload cases failed, because the practice scorer's payload rule needs `node:sqlite`, which Node 20 lacks. Main fails the same four in the same image, so they predate this work.

## What was found

- **Node 20 refuses a test-name filter in `NODE_OPTIONS`.** The first container run failed the inherited-filter case with exit 9 before the runner started. That case now skips on such a Node. A preload planted in `NODE_OPTIONS` covers inherited options on every Node, and it fails with the clearing removed.
- **A test file can put itself in the install tier.** The runner's own tests plant files that name the install script, so those plants live in fixture text files, and the runner applies its literal rule to a test file's own source only. A guard checks that the runner's test files stay in `fast`.

## Record

Issue comments on mephistopheles4/the-pact#140:

- `6064072969` — the spec, revision 4.
- `6064376515` — the tickets.
- `6064677579` — the one-PR plan.
- `6064685906`, `6064686449`, `6064686799` — the T1 baseline case list.
- `6065051673` — the T1 Linux container run.

Issue comments on mephistopheles4/the-pact#144:

- `6064783590` — the plants' method and expected results, posted before any run.
- `6064874466` — the plant results.
- `6064976269`, `6064998338` — plant batch E, for the preload case: expected result and result.
