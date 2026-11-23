# Spec delta: Clef everywhere — Linux end to end, no setpriv dependency, arm64, Intel Macs, a doc for anyone — V1

Status: draft. Amends [0002-clef-runner](0002-clef-runner.md) and builds on
[0003-clef-macos](0003-clef-macos.md); everything they say holds unless a
section here replaces it. The spec counts once it is on `main`.

## U1 Objective

The repo is public, but Clef was built around one machine: the owner's Windows
x64 desktop with a GPU. Linux x64 is built and unit-tested and has never run
end to end. Setup refuses any Linux machine without `/usr/bin/setpriv`. There
are no arm64 builds for Linux or Windows. Every live check ran on the owner's
machine, and `docs/clef.md` reads as written for it.

This delta makes Clef set up, serve and answer on every platform below, each
run end to end in CI with the real pinned server and model on CPU:

| OS | Arch | Backends | End to end in CI |
| --- | --- | --- | --- |
| Windows | x64 | CPU, Vulkan | CPU |
| Windows | arm64 | CPU, Vulkan | CPU |
| Linux (glibc) | x64 | CPU, Vulkan | CPU, with and without `setpriv` |
| Linux (glibc) | arm64 | CPU, Vulkan | CPU |
| macOS | arm64 | Metal, CPU | 0003 carries it; a real-server run waits on the owner's call on a larger runner (U12) |
| macOS (Intel) | x64 | CPU | CPU, on `macos-15-intel` if U10 shows it fits |

Who uses it: anyone who turns `clef` on, on any of these machines.

## U2 Decisions

The session took these picks, each logged as a checkpoint:

1. **A delta spec.** 0002 has shipped and 0003 is in review. The PR that lands
   this also edits 0002 S2 pick 8, S12's Linux row, S13 and S17 to point here,
   and 0003 M12's "the keeper on Linux" line. It changes nothing else in them.
2. **Platforms.** The rows above: four here, macOS arm64 through 0003, and
   Intel Macs on CPU here, since b12211 ships `llama-b12211-bin-macos-x64.tar.gz`.
   The other builds b12211 ships stay out, each for its reason (U12).
3. **No `setpriv`: the keeper.** On Linux, when `/usr/bin/setpriv` is
   absent, the supervisor starts the server through 0003 M5's keeper, as it
   does on macOS. `/usr/bin/setpriv` stays the first line where it exists,
   since the kernel ends the server even when the supervisor and the keeper
   are both killed. The `/proc` sweep stays the second line on every Linux
   machine. Setup no longer refuses `clef-setpriv`.
4. **arm64 rows** for Linux and Windows, CPU and Vulkan, and one
   `darwin-x64-cpu` row, all from tag b12211.
   Their assets were published on 2026-11-08, so they meet the 14-day rule.
5. **The end-to-end run is its own workflow,** `clef-e2e.yml`, not a job in
   `gate.yml`. It fetches 6.7 GB per job and takes minutes, so it runs only
   when the files it covers change, and it is not a required check. It keeps
   every lockdown rule every workflow keeps. A change to the files it covers
   cites its run as Test evidence beside `gate`'s.
6. **The answer is checked, not only the shape.** Each end-to-end job asks the
   six cases in `docs/clef-cases.json` and fails when a band or a top option
   differs from the recorded baseline (U7).
7. **What the system must hold** is found at pin time and written in the doc:
   the shared libraries each build loads from outside its folder, and the
   glibc floor. Setup refuses a musl Linux and a glibc below the floor with a
   reason that says so.
8. **The threat model doesn't change.** Its class "What you install and CI
   run" already names the pinned llama.cpp build and decision model. CI runs
   them on GitHub's runners with a read-only token and no secret.
9. **The doc reads for anyone.** The owner's numbers become one example
   machine among others; the CI runners' measured numbers are others.

## U3 The pin table (amends 0002 S5)

- `PLATFORM_KEYS` gains `linux-arm64-cpu`, `linux-arm64-vulkan`,
  `win32-arm64-cpu`, `win32-arm64-vulkan` and `darwin-x64-cpu`.
- `SERVER.archives` gains one row each:

  | Key | Archive | Size | sha256 starts | Created |
  | --- | --- | --- | --- | --- |
  | `linux-arm64-cpu` | `llama-b12211-bin-ubuntu-arm64.tar.gz` | 18,759,007 | `6eed2da0` | 2026-11-08 |
  | `linux-arm64-vulkan` | `llama-b12211-bin-ubuntu-vulkan-arm64.tar.gz` | 29,209,302 | `60cd8d01` | 2026-11-08 |
  | `win32-arm64-cpu` | `llama-b12211-bin-win-cpu-arm64.zip` | 13,236,751 | `bf52f656` | 2026-11-08 |
  | `win32-arm64-vulkan` | `llama-b12211-bin-win-vulkan-arm64.zip` | 25,768,892 | `06c268aa` | 2026-11-08 |
  | `darwin-x64-cpu` | `llama-b12211-bin-macos-x64.tar.gz` | 12,455,590 | `6055cc67` | 2026-11-08 |

  The full sha256 is the release API's `digest`. `kind`, `exe` and `files`
  come from running `gate/tests/clef-files-list.mjs` for the five keys.
- **One key for Intel Macs.** llama.cpp's macOS x64 build is expected to
  carry no Metal backend; the files list confirms it. If it holds
  `libggml-metal`, the row's server gets `--device none`, as 0003's
  `darwin-arm64-cpu` does; else it gets neither `-ngl` nor `--device`.
- **A stated exception to 0002 S5's pin-PR rule,** as 0003 M3 makes for macOS.
  The five rows land in the code PR. In its Test round the security pair reads
  them as it reads a pin PR, with its own fetch of each asset's `digest`,
  `created_at` and `updated_at`. For the two CPU rows, the end-to-end job's
  six-case run (U7) stands for C14, and for `darwin-x64-cpu` when its job
  runs. The two Vulkan rows have no machine to run
  on (GitHub's arm64 runners have no GPU): C14 for them waits for the first
  arm64 machine with a Vulkan driver where setup picks Vulkan, and runs before
  that machine uses Clef's answers.

## U4 Setup on the new platforms (amends 0002 S6)

- **The pick.** `pickPlatform` accepts `arch` `x64` or `arm64` on `win32` and
  `linux`, and builds the key from it. Any other arch on those systems
  refuses `clef-platform`, naming the arch. On `darwin`, `x64` picks
  `darwin-x64-cpu` with no probe, and `--cpu` changes nothing; this replaces
  0003 M4's Rosetta refusal. node can't tell Rosetta from an Intel Mac
  without a helper process, so the plan's `why` line reads "x64 node: CPU
  build; on Apple Silicon, use an arm64 node for Metal" instead of refusing.
  The darwin lines are agreed with 0003's session (U11).
- **The Vulkan probe.** On Linux it looks for `libvulkan.so.1` in `/usr/lib`,
  `/usr/lib64`, and the multiarch folders for the running arch only
  (`x86_64-linux-gnu` on x64, `aarch64-linux-gnu` on arm64, under both
  `/usr/lib` and `/lib`). On Windows it is unchanged.
- **The C library.** On Linux, setup reads
  `process.report.getReport().header.glibcVersionRuntime`. When it is absent
  (a musl system such as Alpine), setup refuses `clef-platform`: "the pinned
  Linux builds need glibc; this system has none". When it is below the floor
  U5 finds, setup refuses `clef-platform` naming both versions. The check
  runs before any fetch. It is a parameter of `planSetup`, so tests hand in
  the value.
- **Node under emulation.** Setup picks by `process.arch`, so an x64 node on
  a Windows arm64 machine picks the x64 build, which runs under emulation.
  The plan's `why` line says "x64 node: x64 build". The doc says to use an
  arm64 node.

## U5 What the system must hold, at pin time

`gate/tests/clef-files-list.mjs` gains a report, read in node from the kept
files, printed in the pin record, beside 0003 M4's Mach-O check:

- **ELF** (Linux rows): each kept ELF file's `DT_NEEDED` names that no kept
  file provides, and the highest `GLIBC_` version in its version needs. The
  highest across the row is that row's glibc floor, written in the row as
  `glibc` (for example `'2.35'`) and checked by U4. A kept ELF file whose
  machine field doesn't match the row's arch (`EM_X86_64` or `EM_AARCH64`)
  is flagged.
- **Mach-O** (`darwin-x64-cpu`): 0003 M4's check holds, with the thin
  arch taken from the row: `x86_64` (CPU type `0x01000007`) here, `arm64`
  on 0003's rows. A fat file is flagged on both.
- **PE** (Windows rows): each kept PE file's import names that no kept file
  provides, and its machine field, which must be `AMD64` or `ARM64` as the row
  says (flagged otherwise; an `ARM64EC` or `ARM64X` image is flagged too).
- **Allowed outside names.** Linux: `libc.so.6`, `libm.so.6`,
  `libpthread.so.0`, `libdl.so.2`, `librt.so.1`, `ld-linux-*.so.*`,
  `libstdc++.so.6`, `libgcc_s.so.1`, `libgomp.so.1`, and on Vulkan rows
  `libvulkan.so.1`. Windows: `KERNEL32.dll`, `ADVAPI32.dll`, `USER32.dll`,
  `WS2_32.dll`, `ntdll.dll`, `bcrypt.dll`, `api-ms-win-*`, `ucrtbase.dll`, and
  on Vulkan rows `vulkan-1.dll`. A name outside the list is a stop-and-ask;
  the list grows only by a spec change.
- `docs/clef.md` names, per platform, the system libraries from this report a
  user must have (U9).
- A test with fixtures shows each flag raised: an ELF needing `libfoo.so.1`,
  an ELF of the wrong machine, a PE importing `MSVCP140.dll`, and a PE of the
  wrong machine.

## U6 The server's lifetime without setpriv (amends 0002 S7)

- **The pick, made once per start.** `lifetimeLine({ platform, exists })`
  returns `job-object` on `win32`, `keeper` on `darwin`, `setpriv` on `linux`
  when `/usr/bin/setpriv` exists, and `keeper` on `linux` otherwise. `serve`
  takes its launch and stop paths from it, never from `platform` alone. This
  is the one seam 0003's darwin branches and this delta share (U11).
- **On `keeper`,** 0003 M5 holds as written: the fork, the one message, the
  `{pid}` and `{gone}` rules and the supervisor's side. On Linux the server
  is spawned by the keeper with no `setpriv` in front.
- **The second line on Linux** stays 0002 S7's `/proc` sweep, on both lines.
  A server whose parent is a keeper is not an orphan while that keeper's
  parent is a live supervisor. A keeper whose supervisor is gone ends its
  server itself; the sweep ends any server it missed. 0003 M6's record and
  keyed probe stay darwin's only.
- **The refusal goes.** `planSetup` and `main` no longer refuse
  `clef-setpriv`. The word leaves the tool's header list and `docs/clef.md`.
- **What the keeper doesn't cover on Linux:** the supervisor and the keeper
  both killed alone by `SIGKILL`; the next `ensure`, `stop`, `remove` or
  setup ends the orphan through the `/proc` sweep. `docs/clef.md` names it.

## U7 The end-to-end run (amends 0002 S13)

- **The script,** `gate/tests/clef-e2e.mjs`: a script the runner never runs
  (its name doesn't end `.test.mjs`) and the install never stages. It takes a
  scratch folder outside the repo and a platform key, and refuses anything
  else. Its steps, each failing the run on a wrong result:
  1. Make a throwaway Claude home in the scratch folder, with
     `pact/config.json` holding `"tools": ["clef"]`. Run the install's dry
     run, then the apply command it printed, against that home. Check that
     `pact/tools/clef.mjs` exists and equals the repo's copy.
  2. From a sibling folder (never one holding the home), with
     `CLAUDE_CONFIG_DIR` set to the home: `setup --cpu` (the plan; checks the
     picked key equals the one passed), then `setup --cpu --yes`, then
     `verify`.
  3. `ensure --wait 60`, repeated until `ready` or 5 minutes pass. Record the
     time to ready.
  4. Read the token from `run.json` in node. Ask each of the six cases in
     `docs/clef-cases.json` through `POST /v1/systemone`. Check each answer's
     shape as the supervisor's own check does (0002 S7) and its band or top
     option against `baseline`. Record each answer's time.
  5. On Linux, read the server's peak resident memory (`VmHWM` in
     `/proc/<serverPid>/status`) after the cases. On Windows, read the peak
     working set from `GetProcessMemoryInfo` through a PowerShell
     `Get-Process` call made by this script, never by the tool.
  6. `status` (holds the key and `cpu`), `stop`, then check `serverPid` and
     `pid` are gone within 5 s; `remove --yes`, then check the clef folder is
     gone.
  7. Print one record line per step: the key, the times, the bands, the peak
     memory, and the runner's OS, CPU count and RAM. It prints no token, key,
     body or path outside the scratch folder.
- **The workflow,** `.github/workflows/clef-e2e.yml`:
  - triggers: `pull_request` and `push` to `main`, each with a `paths` filter
    naming `claude/tools/clef.mjs`, `docs/clef-cases.json`,
    `gate/tests/clef-e2e.mjs` and the workflow file itself;
  - `permissions: contents: read`, actions pinned to the same SHAs as
    `gate.yml`, `persist-credentials: false`, no cache, no upload, no secret;
  - six jobs, each `timeout-minutes: 45`, Node 24, running
    `env -u NODE_OPTIONS node gate/tests/clef-e2e.mjs "$RUNNER_TEMP/clef-e2e" <key>`:

    | Job | Runner | Key | Before the run |
    | --- | --- | --- | --- |
    | `clef-e2e-linux-x64` | `ubuntu-24.04` | `linux-x64-cpu` | — |
    | `clef-e2e-linux-x64-keeper` | `ubuntu-24.04` | `linux-x64-cpu` | `sudo mv /usr/bin/setpriv /usr/bin/setpriv.off` |
    | `clef-e2e-linux-arm64` | `ubuntu-24.04-arm` | `linux-arm64-cpu` | — |
    | `clef-e2e-windows-x64` | `windows-2025` | `win32-x64-cpu` | — |
    | `clef-e2e-windows-arm64` | `windows-11-arm` | `win32-arm64-cpu` | — |
    | `clef-e2e-macos-x64` | `macos-15-intel` | `darwin-x64-cpu` | — |

    The macOS job is in only if U10 shows the model fits that runner; else
    the doc states Intel Macs as not run end to end.

    The keeper job also checks, after `ensure`, that the server's parent is a
    node process (the keeper) and not `setpriv`.
  - The job ids and names start `clef-e2e-`, so none is named `gate`,
    `gate-windows` or `gate-macos`, which `workflow.test.mjs` already
    refuses in any other workflow file.
- **`workflow.test.mjs`** gains, for `clef-e2e.yml`: its job set and runners
  held exactly, the `paths` filter held exactly, and the one `sudo` line held
  to the keeper job. Each check is seen to fail on a bad case: a sixth job, a
  missing path, a `sudo` line in another job, and another runner.
- **0002 S13's "no test downloads a real archive"** still holds for the gate
  suite. `clef-e2e.mjs` is not a gate test.
- **The first build step is an experiment** (U10).

## U8 Performance budget

Measured by U7 on each runner and written in the doc; the run fails past
these:

- time to ready: 5 minutes (0002's start timeout of 180 s still bounds the
  server's own start);
- each answer: under 0002's forward timeout of 60 s. An answer past it is a
  `no-answer`, which fails the run;
- peak resident memory: recorded, with no limit. A runner with too little
  memory fails at ready or at the first answer, and that failure is the
  finding.

## U9 Docs (amends 0002 S10)

`docs/clef.md` is rewritten for anyone:

- **A platform table** (U1's), saying for each row what CI ran end to end and
  what was not run (Vulkan on every platform but the owner's, Metal).
- **What your machine needs:** about 7.6 GB of disk, a Node 24 that matches
  your CPU's arch, and per platform the system libraries U5 found and the
  glibc floor. How to check a library is there (`ldconfig -p | grep` on
  Linux).
- **Example machines:** the owner's (Windows x64, Vulkan) as it reads today,
  marked as one example; and each CI runner's CPU count, RAM, time to ready,
  median answer time and peak memory from the latest green U7 run, with the
  run's date.
- **The lifetime lines:** setpriv where it exists, else the keeper, with the
  residual (U6).
- **Removed:** "Windows x64 is the target", "Linux x64 … has not been run end
  to end", and the `clef-setpriv` line.
- The header list in `claude/tools/clef.mjs` drops `clef-setpriv`.
- `docs/install.md` changes only if a line names Clef's platforms.

## U10 The first build step: an experiment

Before any code, push a throwaway branch (never merged, no PR) holding a
workflow that runs on a push to that branch only, with the lockdown above. On
each of the six runners it fetches the pinned archive for the runner and the
pinned model, checks both by size and sha256, starts `llama-server` with
0002 S7's arguments on CPU, asks the six cases on `/v1/systemone`, and prints
the time to ready, each answer's time and band, and the peak memory. On the
x64 runners it also runs the tool itself (setup, ensure, the cases, stop,
remove), since those rows exist today. The branch is deleted after.

Sort the result:

- every runner within U8 and every band matching: build as specified;
- a runner past U8, out of memory or out of disk: stop and ask, with the
  numbers (options: drop that runner's job and state it as not run, a smaller
  context on CPU, or a larger runner);
- a band that differs on CPU: stop and ask, with the numbers (options: the
  check compares within a margin, or the baseline gains a CPU column).

## U11 Coordination with 0003

0003's session builds the keeper and the darwin branches. This delta's
shared lines are `pickPlatform`'s `linux` branch, `launchCommand` and `serve`'s
launch and stop paths. The shape is agreed before either side writes them:
`lifetimeLine` (U6) is the single switch, and 0003's darwin code keys on
`keeper`, not on `darwin`. This work stays stacked on 0003's branch and
rebases on each of its pushes.

## U12 Out of scope (deferred)

- **macOS arm64 end to end in CI:** pending the owner's call on a paid,
  larger runner. GitHub's standard macOS arm64 runner has 7 GB of memory,
  which the model and its context likely don't fit.
- **CUDA, ROCm, SYCL, OpenVINO and OpenCL builds.** No CI runner has the
  GPU, and the archives run to hundreds of MB. Vulkan covers NVIDIA, AMD and
  Intel GPUs on Linux and Windows.
- **Linux s390x, Android, and the Snapdragon builds.** No runner, and no one
  has asked.
- **musl Linux:** b12211 ships no musl build. Setup refuses it clearly (U4).
- **Vulkan end to end anywhere but the owner's machine.**

## U13 Trade-offs

| Pull | Side taken | Driver |
| --- | --- | --- |
| A clear refusal without `setpriv` vs. running safely without it | Run safely, through the keeper | The issue asks for either; the keeper is already built and tested for macOS, and NixOS and slim Debian images have no `/usr/bin/setpriv` |
| The keeper everywhere on Linux vs. only without `setpriv` | Only without it | `setpriv` survives both processes being killed; the keeper doesn't |
| End to end in `gate.yml` vs. its own workflow | Its own workflow, path-filtered, not required | 6.7 GB and minutes per job on every PR would slow every change; a required check can't be path-filtered |
| A real model in CI vs. a tiny test model | The real pinned model | "Answers" means Clef's answers; a tiny model tests the server, not the six cases |
| A band match as a hard check vs. a report | A hard check, with U10's sort first | A wrong answer on a platform is the failure the owner asked to rule out |
| Caching the model vs. fetching each run | Fetching each run | Every workflow refuses `actions/cache` today; loosening that is a lockdown change |
| Pin-time dependency report vs. a setup-time library check | Pin time, plus the glibc check at setup | Library search paths vary by distro; a setup check would guess |
| Vulkan arm64 rows now vs. when a machine can run them | Now, stated as not run | One table for every platform; the pin facts are the same as the CPU rows' |

## U14 Tickets

Thorough: each ticket is its own session, stacked on the one before, all on
0003's branch.

1. **T1: arm64 and Intel Mac pins, and the pick.** U3, U4, U5. Claims C-U1 to C-U4. Runs U10's
   experiment first.
2. **T2: no setpriv.** U6. Claims C-U5, C-U6. Starts once 0003's keeper is on
   its branch.
3. **T3: the end-to-end run.** U7, U8. Claims C-U7 to C-U9. Needs T1's rows and
   T2's keeper.
4. **T4: the doc.** U9, and the 0002 and 0003 pointer edits (U2 pick 1).
   Claim C-U10. Needs T3's first green run for the numbers.

## U15 Acceptance claims

- **C-U1** `pickPlatform` picks the arm64 keys on `win32` and `linux` with
  `arch: 'arm64'`, CPU with `--cpu`, Vulkan when the probe finds the loader;
  picks `darwin-x64-cpu` on `darwin` `x64`, with and without `--cpu`, with
  U4's `why` line;
  refuses `clef-platform` on `ia32`, `s390x` and `ppc64`. The Linux probe
  looks in the running arch's multiarch folders only, and runs no process.
- **C-U2** The shape check passes the five new rows. `files` came from
  `clef-files-list.mjs`; the pin record shows each asset's `digest`,
  `created_at` and `updated_at`.
- **C-U3** Setup refuses `clef-platform` on Linux with no
  `glibcVersionRuntime` and with one below the row's `glibc`, before any
  fetch, and passes at or above it.
- **C-U4** The files-list report flags each U5 fixture, and the shipped
  rows raise no flag.
- **C-U5** `lifetimeLine` returns each value U6 lists. On `gate`, with
  `setpriv` hidden through the `exists` seam: a stub server's supervisor sent
  `SIGKILL` leaves no stub within 2 s; with the keeper sent `SIGKILL`, the
  supervisor ends the stub and records `run.fail`; with both sent `SIGKILL`,
  the next `ensure` ends the orphan through the `/proc` sweep; a sweep while
  another `ensure` holds `run.lock` ends nothing. 0003's C-M6 cases that are
  not darwin's own run on `gate` on the keeper line.
- **C-U6** Setup on Linux without `/usr/bin/setpriv` passes the plan; no
  mode prints `clef-setpriv`.
- **C-U7** Each U7 job passes on the PR's head: install, setup, verify,
  ensure, six answers within U8 matching their baselines, status, stop with
  both pids gone, remove with the folder gone. The keeper job shows the
  server's parent is the keeper.
- **C-U8** `clef-e2e.mjs` refuses a scratch folder inside the repo and an
  unknown key; its output holds no token or key (checked by the script
  against `run.json`'s values before it prints).
- **C-U9** `workflow.test.mjs` refuses each U7 bad case, and the lockdown
  every workflow keeps holds for `clef-e2e.yml`.
- **C-U10** `docs/clef.md` holds U9's table and example machines from a
  green run; it no longer says "Windows x64 is the target", "has not been run
  end to end" for Linux, or `clef-setpriv`.

## U16 Needs the owner

| What | Kind | When |
| --- | --- | --- |
| The arm64 and Intel Mac rows as a stated pin exception, and the security pair's read of them | checkpoint | at T1's Test |
| The security pair on `clef-e2e.yml` and the keeper on Linux | checkpoint | at T2's and T3's Test |
| U10's sort, if a runner or a band fails | checkpoint | after the experiment |
| Merging each ticket (`claude/tools/`, `.github/`, read closely) | checkpoint, pinned to the reviewed head | after each Test |
| Making `clef-e2e` required, if ever | the owner's GitHub setting | not planned |

## U17 Stop and ask when

- U10 sorts to a stop;
- U5's report names a library outside its list, or a flag;
- an arm64 archive needs an entry form 0002 or 0003 doesn't read;
- a GitHub arm64 runner image isn't available to this repo;
- 0003's keeper changes shape after U11's agreement.
