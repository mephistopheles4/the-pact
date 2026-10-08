# The gate suite runs through one runner, in named tiers

"The full suite" is one command everywhere: `node gate/tests/run.mjs full`. A runner in the gate's tests folder picks each tier's files, always runs them at the cap of four files at once, and never reports a pass it didn't earn.

- **The tiers.** Only top-level test files in `gate/tests/` count; nothing under `fixtures/` is a test file.
  - **full:** every top-level test file.
  - **install tier:** every test file whose imports reach `install-harness.mjs`, directly or through any helper, or whose own text names the install script, written out or in pieces. It's computed from the sources on every run, never kept as a list.
  - **fast:** full minus the install tier.
  - **The smoke file:** `install-smoke.test.mjs` holds the install's happy path: the clean dry run, `-Apply` byte for byte, and a quiet next dry run. It's in the install tier, so a later tier for payload changes can run it alone.
- **How it starts node.** The runner starts the Node running it (`process.execPath`) with `--test`, `--test-concurrency=4`, the reporter if one is given, and an explicit list of files, each with its folder in front. It uses no shell and no glob, so it works the same on Node 20 and Node 24 and on any shell. `NODE_OPTIONS` and `NODE_TEST_CONTEXT` are cleared, so an inherited filter, shard, preload or test-runner context can't narrow the run or rewrite its output.
- **It fails closed.**
  - **Exit 2, and node never starts:** an empty pick, a top-level test-file name outside a plain set, an unknown tier, reporter or option, or a record path inside the repo.
  - **Exit 1:** node exits non-zero, is killed, or fails to start.
  - **Exit 0:** only after node ran a non-empty list and exited 0.
  - **The last line on stderr** names the tier, the file count and the result. The runner's own lines go to stderr, so node's reporter output on stdout stays clean TAP or junit.
- **Record mode.** `--record <file>` writes a copy of everything printed to a file outside the repo. The repo, home and temp folders, in their usual forms, and the user name are replaced by placeholders. If a drive-letter or home-prefix path survives, the runner writes nothing and exits 3. Test output posted on an issue comes only from record mode.
- **No git.** `fast` and `full` read the file system alone.
- **When the full suite runs:** once at move 4; before an install; after a rebase or merge that brought in other work; and after a final change set. It doesn't run before and after each change. A run of fewer files is never move-4 evidence.
- **On the probe floor.** `gate/tests/run.mjs` and `gate/tests/copy-list.mjs` are named on AGENTS.md's probe floor. A change to the tiers, the exit handling, how node is started or record mode takes the security route and needs a bad case seen to fail.

## Why

- **Sessions waited minutes on tests they didn't need.** The full suite took 1,794 s under load and 714 s quiet (the T1 baseline). Every one of its 50 slowest tests runs the real install script through pwsh. The owner wants fast sessions without cutting a test: "write 5k of them if they actually have value but I also want my session to go fast".
- **One definition of "the full suite".** Before this, AGENTS.md gave a quoted glob for Node 24, an unquoted one for a POSIX shell under Node 20, and a `Get-ChildItem` form for PowerShell. The Linux container had a fourth. Each could drift, and none failed closed. An explicit file list from one module removes the glob and its caveat.
- **A pass must mean the suite ran.** Two full runs on #97 ended with node's exit -1 and no summary. A runner that only checks for "no failures" can report a pass for a run that never finished. The runner's pass needs a real exit 0 from node, on a non-empty list.
- **Posted records must not leak local paths.** Test output carries the home folder, the temp folder and the user name. A scrub that fails closed keeps them off the issue tracker.
- **The tiers are part of the gate's proof.** Narrowing "full" would quietly shrink what move 4 checks, so the runner and the copy list it shares with the harness sit on the probe floor.

## How this was decided

- **2026-10-08** in mephistopheles4/the-pact#140 (spec revision 4, signed off by the owner), built in #144. The everyday `changed` tier is #145's. Cheaper install tests are #146 and #147.
- **Still holds:** [ADR 0029](0029-the-gate-suite-runs-capped-on-the-current-node-lts.md), on the cap of four and the current Node LTS. The runner now carries the cap for every documented run.
