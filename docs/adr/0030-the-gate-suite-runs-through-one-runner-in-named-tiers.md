# The gate suite runs through one runner, in named tiers

"The full suite" is one command everywhere: `node gate/tests/run.mjs full`. The everyday run while building is `node gate/tests/run.mjs changed`. A runner in the gate's tests folder picks each tier's files, always runs them at the cap of four files at once, and never reports a pass it didn't earn.

- **The tiers.** Only top-level test files in `gate/tests/` count; nothing under `fixtures/` is a test file.
  - **full:** every top-level test file.
  - **install tier:** every test file whose imports reach `install-harness.mjs`, directly or through any helper, or whose own text names the install script, written out or in pieces. It's computed from the sources on every run, never kept as a list.
  - **fast:** full minus the install tier.
  - **changed:** the everyday run while building (#145). It is `fast` plus the tests the changed paths can reach, with the reason for each file.
    - **The changed paths:** what differs from the merge-base of HEAD and `--base`, in the working tree or the index, plus untracked files git doesn't ignore. A deletion or a rename counts by both paths.
    - **The base:** with no `--base`, it's the branch `refs/heads/main`, so a tag named `main` can't stand in. It's resolved to a commit before any other git call.
    - **The repo:** git runs without inherited `GIT_` variables. The runner refuses with exit 2 unless it sits at the top of its own repo, since paths read from an enclosing repo would carry a prefix, and gate code would stop selecting `full`.
    - **The picks:** a changed test file runs itself. A changed module in the tests folder runs every test that imports it, through any chain, and every test that names it by a form holding its file name, such as one that starts it by path. A test that names only the tests folder doesn't count. A change to the gate's code or the install script runs `full`. A payload path runs the smoke file plus every test that names it. Any other path runs the tests that name it. A test names a path when its source, or a helper it imports, holds the path's file name or any run of two or more of its segments, written out or as string literals in a row.
    - **Unmapped paths:** a path no rule maps runs `fast`, plus the smoke file under the copy list, and is printed as unmapped.
    - **A bound:** more than 2,000 changed paths select every test, with no per-path mapping.
    - **Why fast is in it:** the spec's rule was to include `fast` if it ran in 60 s or less on a quiet machine, and picks only otherwise. It took 50.1 s (#145).
  - **The smoke file:** `install-smoke.test.mjs` holds the install's happy path: the clean dry run, `-Apply` byte for byte, and a quiet next dry run. It's in the install tier, so a later tier for payload changes can run it alone.
- **How it starts node.** The runner starts the Node running it (`process.execPath`) with `--test`, `--test-concurrency=4`, the reporter if one is given, and an explicit list of files, each with its folder in front. It uses no shell and no glob, so it works the same on Node 20.10 and later (the cap flag needs 20.10) and in any shell. `NODE_OPTIONS` and `NODE_TEST_CONTEXT` are cleared for that Node, so an inherited filter, shard, preload or test-runner context can't narrow the tests' run or rewrite its output. Clearing them for the child can't reach the runner's own process, so AGENTS.md gives the runner's command in a PowerShell and a POSIX form that clear `NODE_OPTIONS` first, as the pact does for the cross script, and a guard checks both forms.
- **It fails closed.**
  - **Exit 2, and node never starts:** an empty pick, a top-level test-file name outside a plain set, an unknown tier, reporter or option, or a record path inside the repo.
  - **Exit 1:** node exits non-zero, is killed, or fails to start.
  - **Exit 0:** only after node ran a non-empty list and exited 0.
  - **A pass** is exit 0 together with the runner's last line ending in `pass`. An exit 0 with no result line is not one. The runner compares its own path and the one it was started by as real paths, so a start through a link, a junction or a short name still runs.
  - **The last line on stderr** names the tier, the file count and the result. The runner's own lines go to stderr, so node's reporter output on stdout stays clean TAP or junit.
- **Record mode.** `--record <file>` writes a copy of everything printed to a file outside the repo. The repo, home and temp folders, in their usual forms, the user name and the host name are replaced by placeholders. If a drive-letter, home-prefix, Git Bash, WSL or network-share path survives, or the user or host name as a word, the runner writes nothing and exits 3. A record path is checked against the repo as a real path. Test output posted on an issue comes only from record mode.
- **Only changed reads git.** `fast` and `full` read the file system alone, and run in a folder with no git repo.
- **While building:** run `changed`.
- **When the full suite runs:** once at move 4; before an install; after a rebase or merge that brought in other work; and after a final change set. It doesn't run before and after each change. A run of fewer files is never move-4 evidence.
- **On the probe floor.** `gate/tests/run.mjs` and `gate/tests/copy-list.mjs` are named on AGENTS.md's probe floor, with the two test files that hold their bad cases, `run.test.mjs` and `run-guards.test.mjs`. A change to the tiers, the exit handling, how node is started or record mode takes the security route and needs a bad case seen to fail.

## Why

- **Sessions waited minutes on tests they didn't need.** The full suite took 1,794 s under load and 714 s quiet (the T1 baseline). Every one of its 50 slowest tests runs the real install script through pwsh. The owner wants fast sessions without cutting a test: "write 5k of them if they actually have value but I also want my session to go fast".
- **One definition of "the full suite".** Before this, AGENTS.md gave a quoted glob for Node 24, an unquoted one for a POSIX shell under Node 20, and a `Get-ChildItem` form for PowerShell. The Linux container had a fourth. Each could drift, and none failed closed. An explicit file list from one module removes the glob and its caveat.
- **A pass must mean the suite ran.** Two full runs on #97 ended with node's exit -1 and no summary. A runner that only checks for "no failures" can report a pass for a run that never finished. The runner's pass needs a real exit 0 from node, on a non-empty list.
- **Posted records must not leak local paths.** Test output carries the home folder, the temp folder and the user name. A scrub that fails closed keeps them off the issue tracker.
- **The tiers are part of the gate's proof.** Narrowing "full" would quietly shrink what move 4 checks, so the runner and the copy list it shares with the harness sit on the probe floor.

## How this was decided

- **2026-10-08** in mephistopheles4/the-pact#140 (spec revision 4, signed off by the owner), built in #144. The everyday `changed` tier was built in #145, which re-timed `fast` and chose its shape by the spec's 60-second rule. Cheaper install tests are #146 and #147.
- **A known limit: some everyday changes cost about a full suite.** A path that a shared helper names picks every test that imports the helper. `helpers.mjs` reads every agent file and the cross script, so a change under `claude/` or `cross/` picks nearly the full tier. `copy-list.mjs` names the tests folder, which it tells the install to skip, so a fixture edit, or a deleted or renamed test file, picks every install test. The rule is right that those tests read the helper. It over-picks, never under-picks. #151 tracks the finer split, as part of the test-architecture revision on #140.
- **Still holds:** [ADR 0029](0029-the-gate-suite-runs-capped-on-the-current-node-lts.md), on the cap of four and the current Node LTS. The runner now carries the cap for every documented run.
- **Amended by [ADR 0034](0034-test-helpers-split-by-what-they-touch.md) (#151):** `helpers.mjs` is split by what each part touches, and only `payload.mjs` reads the agents. So an agent-file change picks only the tests that read them, 6 of the 9 install files among them. A change to `claude/CLAUDE.md` still picks nearly every test, since nearly every test reads it.
