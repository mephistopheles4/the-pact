# Spec delta: Clef everywhere — Linux end to end, no setpriv dependency, arm64, Intel Macs, a doc for anyone — V1

Status: approved at 9987584 after spec round 2 (final), the lead's decision
86, flagged for the owner's review. **Amended at T1** by the lead's decision
93, flagged for the owner's review (no spec round; the security pair reads it
at T1's Test): U5's allowed list gains the OpenSSL 3 and Visual C++ runtime
names its first report found, U4 gains a Visual C++ runtime check at setup, C-U3 a
claim for it, and U9 names both as system needs with the glibc floors. Amends
[0002-clef-runner](0002-clef-runner.md) and builds on
[0003-clef-macos](0003-clef-macos.md); everything they say holds unless a
section here replaces it. The spec counts once it is on `main`.

<!-- toc -->

- [U1 Objective](#u1-objective)
- [U2 Decisions](#u2-decisions)
- [U3 The pin table (amends 0002 S5)](#u3-the-pin-table-amends-0002-s5)
- [U4 Setup and serve on the new platforms (amends 0002 S6, S7)](#u4-setup-and-serve-on-the-new-platforms-amends-0002-s6-s7)
- [U5 What the system must hold, at pin time](#u5-what-the-system-must-hold-at-pin-time)
- [U6 The server's lifetime without setpriv (amends 0002 S7)](#u6-the-servers-lifetime-without-setpriv-amends-0002-s7)
- [U7 The end-to-end run (amends 0002 S13)](#u7-the-end-to-end-run-amends-0002-s13)
- [U8 Performance budget (amends 0002 S7's forward timeout)](#u8-performance-budget-amends-0002-s7s-forward-timeout)
- [U9 Docs (amends 0002 S10)](#u9-docs-amends-0002-s10)
- [U10 The experiment, and what it found](#u10-the-experiment-and-what-it-found)
- [U11 Coordination with 0003](#u11-coordination-with-0003)
- [U12 Out of scope (deferred)](#u12-out-of-scope-deferred)
- [U13 Trade-offs](#u13-trade-offs)
- [U14 Tickets](#u14-tickets)
- [U15 Acceptance claims](#u15-acceptance-claims)
- [U16 Needs the owner](#u16-needs-the-owner)
- [U17 Stop and ask when](#u17-stop-and-ask-when)
- [U18 A server that ends while loading](#u18-a-server-that-ends-while-loading)
- [U19 Rollback (amends 0002 S15)](#u19-rollback-amends-0002-s15)

<!-- /toc -->

## U1 Objective

The repo is public, but Clef was built around one machine: the owner's Windows
x64 desktop with a GPU. Linux x64 is built and unit-tested and had never run
end to end. Setup refuses any Linux machine without `/usr/bin/setpriv`. There
are no arm64 builds for Linux or Windows. Every live check ran on the owner's
machine, and `docs/clef.md` reads as written for it.

Running the real pinned server on CI's machines (U10) found that b12211, with
0002 S7's arguments at the time (`-c 16384 -ub 4096 -b 4096`), aborts while loading the model on three of four runners:
Linux x64 on a Xeon with AMX, Linux arm64 and Windows arm64. So Linux x64 as
pinned today does not run on every x64 CPU either.

This delta makes Clef set up, serve and answer on every platform below, each
run end to end in CI with the real pinned server and model on CPU, macOS
apart:

| OS | Arch | Backends | End to end in CI |
| --- | --- | --- | --- |
| Windows | x64 | CPU, Vulkan | CPU |
| Windows | arm64 | CPU | CPU |
| Linux (glibc) | x64 | CPU, Vulkan | CPU, with and without `setpriv` |
| Linux (glibc) | arm64 | CPU | CPU |
| macOS | arm64 | Metal, CPU | out of scope, by the owner's call (U12); `gate-macos` runs 0003's suite |
| macOS (Intel) | x64 | CPU | out of scope, by the owner's call (U12) |

Who uses it: anyone who turns `clef` on, on any of these machines.

Business driver: universal. The repo is public, so Clef must work for anyone
who installs it, not only on the owner's machine. Where two qualities pull,
the side that keeps Clef working on more machines wins, then the side
cheaper to reverse.

## U2 Decisions

The session took these picks, each logged as a checkpoint:

1. **A delta spec.** 0002 has shipped and 0003 is in review. The PR that lands
   this also edits 0002 S2 pick 8, S12's Linux row, S13 and S17 to point here,
   and 0003 M4's Rosetta refusal and M12's "the keeper on Linux" and "Intel
   Macs" lines. It changes nothing else in them.
2. **Platforms.** The rows above. The other builds b12211 ships stay out,
   each for its reason (U12).
3. **No `setpriv`: the keeper.** On Linux, when `/usr/bin/setpriv` is
   absent, the supervisor starts the server through 0003 M5's keeper, as it
   does on macOS. `/usr/bin/setpriv` stays the first line where it exists,
   since the kernel ends the server even when the supervisor and the keeper
   are both killed. The `/proc` sweep stays the second line on every Linux
   machine. Setup no longer refuses `clef-setpriv`.
4. **New rows:** `linux-arm64-cpu`, `win32-arm64-cpu` and `darwin-x64-cpu`,
   all from tag b12211, all published 2026-11-08, so past the 14-day rule.
   **No arm64 Vulkan rows** until a machine can run C14 on them (the lead's
   decision 67): an unchecked backend's answers would reach users at once.
5. **`--no-repack` on every CPU key** (U4), 0003's `darwin-arm64-cpu`
   included. It is what makes b12211 load on AMX and arm64 CPUs. GPU keys
   don't get it: the evidence is all on CPU.
6. **A longer forward timeout on CPU** (U8): 180 s on CPU keys, 60 s on GPU
   keys. A 4-core Intel Mac took up to 70 s per answer.
7. **A server that ends while loading says so** (U18), with the platform and
   a request for a field report, since the owner will rely on field reports
   from platforms nobody here runs (the lead's decision 67).
8. **The end-to-end run is its own workflow,** `clef-e2e.yml`, not a job in
   `gate.yml`. It fetches 6.7 GB per job and takes minutes, so it runs only
   when the files it covers change, and it is not a required check. It keeps
   every lockdown rule every workflow keeps. For a change to the files it
   covers, the Test record cites its run beside `gate`'s; T3 writes that into
   `AGENTS.md` and an ADR (U7).
9. **The answer is checked, not only the shape.** Each end-to-end job asks the
   six cases in `docs/clef-cases.json` and fails when a band or a top option
   differs from the recorded baseline (U7).
10. **What the system must hold** is found at pin time and written in the
    doc: the shared libraries each build loads from outside its folder, and
    the glibc floor. Setup refuses a musl Linux and a glibc below the floor
    with a reason that says so.
11. **The threat model doesn't change.** Its class "What you install and CI
    run" already names the pinned llama.cpp build and decision model. CI runs
    them on GitHub's runners with a read-only token and no secret. The
    security pair reads this claim in spec round 2.
12. **The doc reads for anyone.** The owner's numbers become one example
    machine among others; the CI runners' measured numbers are others.

## U3 The pin table (amends 0002 S5)

- `PLATFORM_KEYS` gains `linux-arm64-cpu`, `win32-arm64-cpu` and
  `darwin-x64-cpu`.
- `SERVER.archives` gains one row each:

  | Key | Archive | Size | sha256 starts | Created and updated |
  | --- | --- | --- | --- | --- |
  | `linux-arm64-cpu` | `llama-b12211-bin-ubuntu-arm64.tar.gz` | 18,759,007 | `6eed2da0` | 2026-11-08 |
  | `win32-arm64-cpu` | `llama-b12211-bin-win-cpu-arm64.zip` | 13,236,751 | `bf52f656` | 2026-11-08 |
  | `darwin-x64-cpu` | `llama-b12211-bin-macos-x64.tar.gz` | 12,455,590 | `6055cc67` | 2026-11-08 |

  The full sha256 is the release API's `digest`. Each row is written in two
  steps: first `asset`, `size`, the full `sha256` and `kind` (from the asset's
  extension); then `exe` and `files` from running
  `gate/tests/clef-files-list.mjs` on that partial row.
- **`glibc` on every Linux row,** the two existing `linux-x64-*` rows
  included: the floor U5 finds, as a string such as `'2.35'`. The shape check
  refuses a `linux-*` row without it, or with one not matching
  `^2\.[0-9]+$`. Adding the field to the shipped rows is part of this
  delta's stated pin exception.
- **The Intel Mac build has no Metal library** (U10 found no
  `libggml-metal` in it), so `darwin-x64-cpu` gets neither `-ngl` nor
  `--device`.
- **A stated exception to 0002 S5's pin-PR rule,** as 0003 M3 makes for
  macOS. The rows land in T1's code PR. In its Test round the security pair
  reads them as it reads a pin PR, with its own fetch of each asset's
  `digest`, `created_at` and `updated_at`, and of whether the release is
  immutable.
- **C14 at T1.** U10's six-case runs on the real server, cited in T1's pin
  record by run link and commit, stand for C14: `linux-arm64-cpu` and
  `win32-arm64-cpu` on CI's arm64 runners, `darwin-x64-cpu` on
  `macos-15-intel` (a one-off, not a CI job: U12). The record copies U10's
  numbers and each run's commit, since run logs expire. T3's end-to-end jobs
  then re-run them on every change.
- **The shipped rows change by `glibc` alone.** T1's pin record shows the
  shipped rows' `asset`, `size`, `sha256`, `kind`, `exe` and `files` unchanged
  from `main`, by a byte compare, with `glibc` the only field added.

## U4 Setup and serve on the new platforms (amends 0002 S6, S7)

- **The pick.** `pickPlatform` accepts `arch` `x64` or `arm64` on `win32` and
  `linux`, and builds the key from it. On arm64, a Vulkan loader found by the
  probe still picks CPU, and the `why` line reads "arm64: CPU (Vulkan on
  arm64 is not checked yet)". Any other arch on those systems refuses
  `clef-platform`, naming the arch. On `darwin`, `x64` picks `darwin-x64-cpu`
  with no probe, and `--cpu` changes nothing. This replaces 0003 M4's Rosetta
  refusal. node can't tell Rosetta from an Intel Mac without a helper process,
  so the plan's `why` line reads "x64 node: CPU build; on Apple Silicon, use
  an arm64 node for Metal" instead of refusing.
- **The Vulkan probe.** On Linux x64 it keeps today's folders. Arm64 doesn't
  probe, since it never picks Vulkan.
- **The C library.** On Linux, setup reads
  `process.report.getReport().header.glibcVersionRuntime`. When it is absent
  (a musl system such as Alpine), setup refuses `clef-platform`: "the pinned
  Linux builds need glibc; this system has none". When it is below the
  picked row's `glibc`, setup refuses `clef-platform`, naming both versions
  and saying to use a newer glibc distribution. Versions compare by major,
  then minor, each as an integer (`2.4` is below `2.35`).
  The check runs before any fetch. The value is a parameter of `planSetup`,
  so tests hand it in.
- **Node under emulation.** Setup picks by `process.arch`, so an x64 node on
  a Windows arm64 machine picks the x64 build, which runs under emulation.
  The plan's `why` line says "x64 node: x64 build". The doc says to use an
  arm64 node. On `win32` `x64`, when `os.machine()` reports `arm64`, setup
  picks CPU even with a Vulkan loader, with the `why` line "x64 node on an
  arm64 machine: CPU", since arm64 Vulkan is not checked. If T1 finds
  `os.machine()` can't tell under emulation, the doc states the gap instead.
  (T1 built the `why` line as "x64 node on an arm64 machine: CPU" whenever
  `os.machine()` reports `arm64`, since that line says more than "x64 node: x64
  build" and the two never both apply.)
- **The Visual C++ runtime (amended at T1, decision 93).** On `win32`, before
  any fetch, setup refuses `clef-platform` when `MSVCP140.dll` or
  `VCRUNTIME140.dll`, or on an x64 row `VCRUNTIME140_1.dll`, is missing from
  `%SystemRoot%\System32`. The reason names the Microsoft Visual C++
  Redistributable and the files missing. The file test goes through
  `planSetup`'s `exists` seam, and `systemRoot` is a parameter. Linux has no
  matching setup check for OpenSSL 3: library search paths vary by
  distribution (U13), so the doc names it instead (U9).
- **`--no-repack`.** `serverArgs` adds `-nr` when the backend is `cpu`, as
  its last item, after 0003's `--device none`. b12211 aborts
  while loading Clef-Flash (`GGML_ASSERT(*cur_backend_id != -1)` in
  `ggml_backend_sched_split_graph`) when the CPU backend repacks weights
  (AMX on x64, REPACK on arm64). U10 measured the cost on a CPU where both
  load. Agreed with 0003's session (U11): CPU keys only, 0003's
  `darwin-arm64-cpu` included; Vulkan and Metal keys stay as they are.

## U5 What the system must hold, at pin time

`gate/tests/clef-files-list.mjs` gains a report, read in node from the kept
files, printed in the pin record, beside 0003 M4's Mach-O check. It runs on
every row, the shipped ones included, as T1's first step, before any setup
code changes:

- **ELF** (Linux rows): each kept ELF file's `DT_NEEDED` names that no kept
  file provides, and the highest `GLIBC_` version in its version needs. The
  highest across the row is that row's `glibc` (U3). A kept ELF file whose
  machine field doesn't match the row's arch (`EM_X86_64` or `EM_AARCH64`)
  is flagged. It also prints, per allowed outside name, the highest version
  need: `GLIBCXX_` and `CXXABI_` for `libstdc++.so.6`, `GCC_` for
  `libgcc_s.so.1`, `GOMP_` for `libgomp.so.1`. The doc lists them (U9); setup
  checks only glibc.
- **Mach-O** (`darwin-x64-cpu`): 0003 M4's check holds, with the thin arch
  taken from the row: `x86_64` (CPU type `0x01000007`) here, `arm64` on
  0003's rows. `machoFlags` gains an `arch` option. A fat file is flagged on
  both.
- **PE** (Windows rows): each kept PE file's import names that no kept file
  provides, and its machine field, which must be `AMD64` or `ARM64` as the row
  says (flagged otherwise; an `ARM64EC` or `ARM64X` image is flagged too).
- **Allowed outside names.** Linux: `libc.so.6`, `libm.so.6`,
  `libpthread.so.0`, `libdl.so.2`, `librt.so.1`, `ld-linux-*.so.*`,
  `libstdc++.so.6`, `libgcc_s.so.1`, `libgomp.so.1`, and on Vulkan rows
  `libvulkan.so.1`. Windows: `KERNEL32.dll`, `ADVAPI32.dll`, `USER32.dll`,
  `SHELL32.dll`, `OLE32.dll`, `WS2_32.dll`, `ntdll.dll`, `bcrypt.dll`,
  `api-ms-win-*`, `ucrtbase.dll`, and on Vulkan rows `vulkan-1.dll`. macOS:
  0003 M4's prefixes. A name outside the list is a stop-and-ask, brought with
  the report before setup code is written; the list grows only by a spec
  change. (The Windows builds ship their own `libomp.dll`, a kept file.)
  **Amended at T1 (decision 93):** the list also holds `libssl.so.3` and
  `libcrypto.so.3` on Linux; `MSVCP140.dll`, `VCRUNTIME140.dll`,
  `VCRUNTIME140_1.dll`, `CRYPT32.dll` and `PSAPI.DLL` on Windows; and
  `bcryptprimitives.dll` and `iphlpapi.dll` on Windows for `llama-connect.exe`
  alone. T1's first report found each: the Linux server needs OpenSSL 3, and
  the Windows builds import the Visual C++ runtime, which no archive carries.
- `docs/clef.md` names, per platform, the system libraries from this report a
  user must have (U9).
- A gate test with fixtures shows each flag raised: an ELF needing
  `libfoo.so.1`, an ELF of the wrong machine, a PE importing `MSVCP150.dll`
  (decision 93 moved this fixture off `MSVCP140.dll`, now allowed),
  a PE of the wrong machine, and an x86_64 Mach-O checked as arm64.

## U6 The server's lifetime without setpriv (amends 0002 S7)

- **The pick, made once per start.** 0003's `lifetimeLine({ platform })`
  (on 0003's branch since d735bef) returns `job-object` on `win32` and
  `keeper` on `darwin`. T2 adds an `exists` parameter, which `serve` passes,
  and makes it return `setpriv` on `linux` when `/usr/bin/setpriv` exists, and
  `keeper` on `linux` otherwise.
  `serve` takes its launch and stop paths from it, never from `platform`
  alone.
- **On `keeper`,** 0003 M5 holds as written: the fork, the one message, the
  `{pid}` and `{gone}` rules and the supervisor's side. On Linux the server
  is spawned by the keeper with no `setpriv` in front. On Linux the keeper is
  forked without `LD_LIBRARY_PATH`, so its node never loads a kept library;
  the message already carries the server's environment.
- **The second line on Linux** stays 0002 S7's `/proc` sweep, on both lines.
  The sweep reads each candidate's parent from `/proc/<pid>/stat` and that
  parent's own parent from `/proc/<ppid>/stat`. When the grandparent is a live
  supervisor, the parent is its keeper and the server is not an orphan. No
  `cmdline` or `exe` of another process is read (0002 S7). A keeper whose supervisor is gone ends
  its server itself; the sweep ends any server it missed. 0003 M6's record
  and keyed probe stay darwin's only.
- **The refusal goes,** in both places: `planSetup` and `main` no longer
  refuse `clef-setpriv`. The word leaves the tool's header list and
  `docs/clef.md`.
- **Skip lists.** Each new test that runs only on Linux joins
  `gate/tests/windows-skips.txt` and `gate/tests/macos-skips.txt` by name.
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
  3. `ensure --wait 60`, repeated until `ready` or 5 minutes pass; `failed`
     ends the step at once with its reason. Record the time to ready.
  4. Read the token from `run.json` and the key from `run.key` in node. Ask each of the six cases in
     `docs/clef-cases.json` through the supervisor's `POST /v1/systemone`.
     Check each answer's shape as the supervisor's own check does (0002 S7)
     and its band or top option against `baseline`. Record each answer's
     time.
  5. **The lifetime line.** On Linux, read the server's parent from
     `/proc/<serverPid>/stat`. On the `setpriv` line it must equal
     `run.json`'s `pid`. On the keeper line it must not equal it, and the
     parent's own parent must.
  6. Read the server's peak resident memory: `VmHWM` in
     `/proc/<serverPid>/status` on Linux, and `PeakWorkingSet64` through a
     PowerShell `Get-Process` call made by this script (never by the tool) on
     Windows.
  7. `status` (holds the key and `cpu`), `stop`, then check that `serverPid`,
     `pid` and, on the keeper line, the keeper are gone within 5 s;
     `remove --yes`, then check the clef folder is gone.
  8. Print one record line per step: the key, the times, the bands, the peak
     memory, and the runner's OS, CPU model and count, and RAM. Before
     printing, it checks the line holds neither `run.json`'s token nor
     `run.key`'s value. Every line the script writes goes through one
     exported writer, `writeLine`, which refuses such a line: record lines,
     failure messages, and the child output it relays. It relays child
     output only on a failure, and prints no answer body.
- **Its checks are pure functions** (`judgeCase`, `lineCheck`, `goneCheck`)
  exported from the script, so a gate test,
  `gate/tests/clef-e2e.test.mjs`, shows each failing on a bad case: a wrong
  band, a wrong top option, a joint case with one question wrong, a missing
  field in the answer, an answer past U8's budget, a parent that doesn't fit
  the line, a pid left alive, and a line holding the token, which
  `writeLine` refuses.
- **A fetch that fails** (a Hugging Face 429, a network fault) fails the job
  with setup's `clef-fetch`. One re-run of the job is allowed; a second
  failure is a stop-and-ask.
- **The workflow,** `.github/workflows/clef-e2e.yml`:
  - triggers: `pull_request` and `push` to `main`, each with a `paths` filter
    naming `claude/tools/clef.mjs`, `docs/clef-cases.json`,
    `gate/tests/clef-e2e.mjs`, `gate/install.mjs`, `gate/install-run.mjs`,
    `gate/install-core.mjs`, `gate/install-io.mjs`, `gate/paths.mjs`, every
    other module `install-run.mjs` loads (named in T3 from the code), and the
    workflow file itself;
  - `workflow_dispatch`, so a change on GitHub's runners can be checked by
    hand at no cost until used;
  - `concurrency: group: clef-e2e-${{ github.event_name == 'pull_request' && github.ref || github.sha }}`,
    cancelling an older run on a pull request. It never starts `gate-`:
    `gate.yml`'s group is repo-wide, and sharing it would cancel `gate`;
  - `permissions: contents: read`, actions pinned to the same SHAs as
    `gate.yml`, `persist-credentials: false`, no cache, no upload, no secret;
  - five jobs, each `timeout-minutes: 45`, Node 24, running
    `env -u NODE_OPTIONS node gate/tests/clef-e2e.mjs "$RUNNER_TEMP/clef-e2e" <key>`,
    with `shell: bash` on the Windows jobs' run steps (U10 confirmed Git Bash
    and an arm64 node on `windows-11-arm`):

    | Job | Runner | Key | Before the run |
    | --- | --- | --- | --- |
    | `clef-e2e-linux-x64` | `ubuntu-24.04` | `linux-x64-cpu` | — |
    | `clef-e2e-linux-x64-keeper` | `ubuntu-24.04` | `linux-x64-cpu` | `sudo mv /usr/bin/setpriv /usr/bin/setpriv.off` |
    | `clef-e2e-linux-arm64` | `ubuntu-24.04-arm` | `linux-arm64-cpu` | — |
    | `clef-e2e-windows-x64` | `windows-2025` | `win32-x64-cpu` | — |
    | `clef-e2e-windows-arm64` | `windows-11-arm` | `win32-arm64-cpu` | — |

  - The job ids and names start `clef-e2e-`, so none is named `gate`,
    `gate-windows` or `gate-macos`, which `workflow.test.mjs` already
    refuses in any other workflow file.
- **`workflow.test.mjs`** gains, for `clef-e2e.yml`: its job set and runners
  held exactly, the `paths` filter and triggers held exactly, the
  concurrency group held exactly, each job's run line (with its key) held
  exactly, no `if:` or `continue-on-error`, `shell: bash` on each Windows run
  step, and the one `sudo` line held to the keeper job. Each check is seen to
  fail on a bad case: a sixth job, a missing path, a group starting `gate-`,
  a job with `continue-on-error`, a run line with another key, a `sudo` line
  in another job, another runner, and a Windows step without `shell: bash`.
- **Test evidence.** T3 edits `AGENTS.md`'s "Running the gate's tests": for a
  change the `paths` filter covers, the Test record also cites the five
  `clef-e2e` job links on the reviewed head. An ADR, indexed, records the
  rule, and a dated log in `docs/log/` records the gate change.
- **0002 S13's "no test downloads a real archive"** still holds for the gate
  suite. `clef-e2e.mjs` is not a gate test.

## U8 Performance budget (amends 0002 S7's forward timeout)

- **The forward timeout:** 180 s on CPU keys, 60 s on GPU keys
  (`FORWARD_TIMEOUT_MS` picked by `setup.json`'s backend). An answer past it
  stays `502 no-answer`. A caller's `decide` on CPU can therefore wait up to
  180 s, outside text in `state` included; the doc says so, and this is
  accepted (the lead's decision 71). clef-pilot's own client timeout lives
  outside this repo.
- **The run fails past these:** time to ready, 5 minutes (0002's start
  timeout of 180 s still bounds the server's own start); each answer, U8's
  forward timeout for its key.
- **Peak resident memory** is recorded, with no limit. A runner with too
  little memory fails at ready or at the first answer, and that failure is
  the finding.

## U9 Docs (amends 0002 S10)

`docs/clef.md` is rewritten for anyone:

- **A platform table** (U1's), saying for each row what CI ran end to end and
  what was not run (Vulkan on every machine but the owner's; Metal; macOS on
  CPU; arm64 Vulkan, not offered yet).
- **What your machine needs:** about 7.6 GB of disk; 16 GB of RAM (with
  `-nr` the server peaked at 5 to 7 GB on 16 GB runners; the doc gives each
  runner's peak); a Node 24 that matches your CPU's arch; and per platform the system
  libraries U5 found and the glibc floor, with how to check a library is
  there (`ldconfig -p | grep <name>` on Linux), and the `GLIBCXX_`,
  `CXXABI_`, `GCC_` and `GOMP_` floors U5 prints. **Amended at T1 (decision
  93):** it names OpenSSL 3 (`libssl.so.3`, `libcrypto.so.3`) on Linux and the
  Microsoft Visual C++ Redistributable on Windows as system needs, and the
  glibc floors T1's report found: 2.34 for Linux x64 and 2.38 for Linux arm64
  (Ubuntu 24.04 or newer, Debian 13 or newer; Ubuntu 22.04 arm64 is refused).
- **Example machines:** the owner's (Windows x64, Vulkan) as it reads today,
  marked as one example; and each CI runner's CPU model and count, RAM, time
  to ready, median answer time and peak memory from the latest green U7
  run, with the run's date.
- **Speed on CPU:** a CPU answer can take up to 3 minutes on a slow machine
  (U8, the lead's decision 71); the example machines give real times.
- **The lifetime lines:** setpriv where it exists, else the keeper, with the
  residual (U6).
- **A server that ends while loading** (U18): what you see, and where to send
  a field report.
- **Removed:** "Windows x64 is the target", "Linux x64 … has not been run end
  to end", and the `clef-setpriv` line.
- The header list in `claude/tools/clef.mjs` drops `clef-setpriv`.
- `docs/install.md` changes only if a line names Clef's platforms.

## U10 The experiment, and what it found

Run before the spec's approval, with the lead's OK (decision 64), on a
throwaway `pact-e2e-experiment` branch with no PR, never merged, deleted
once the spec is approved. Its workflow runs on a push to that branch only and
keeps the lockdown every workflow keeps. On each runner it fetched the pinned
archive and the model through the tool's own fetch (size and sha256 checked),
started `llama-server` with 0002 S7's arguments at the time
(`-c 16384 -ub 4096 -b 4096`) on CPU, asked the six cases on
`/v1/systemone` and printed the time to ready, each answer's time and band,
and the peak memory. On `windows-2025` it also ran the tool itself (setup,
ensure, the cases, stop, remove).

Runs 45208391301, 45209572497 and 45211390912 on that branch. Times are
from the server's start to ready, and per answer; memory is the server's
peak resident set (GiB).

| Runner | CPU, cores, RAM | 0002's arguments | With `-nr` |
| --- | --- | --- | --- |
| `windows-2025` | AMD EPYC 7763, 4, 16 GB | the tool, end to end: ready 5 s; answers 16–23 s; six bands match; peak 7.6. The server alone: ready 5 s, answers 16–25 s (median 18), peak 7.6 | ready 3 s; answers 15–23 s (median 17); six match; peak 5.1 |
| `ubuntu-24.04` | Intel Xeon 6975P-C (AMX), 4, 15 GB | aborts while loading | ready 2 s; answers 8–11 s (median 8); six match; peak 6.7 |
| `ubuntu-24.04-arm` | Neoverse N2, 4, 16 GB | aborts while loading | ready 2 s; answers 13–21 s (median 19); six match; peak 6.7 |
| `windows-11-arm` | Cobalt 100, 4, 16 GB | aborts while loading | ready 4 s; answers 12–18 s (median 16); six match; peak 5.1 |
| `macos-15-intel` | Intel i7-8700B, 4, 14 GB | loads; ready 113 s; answers 34–70 s with verbose logging; six match | not run |

`-nr` costs nothing measurable where both load (Windows x64: median 17 s
against 18 s) and lowers the peak (5.1 against 7.6).

The abort is the same on every failing runner, with `--fit off` and with
`-ub`/`-b` 512 as well. The CPU backend loads; the assert is raised while the
first graph is scheduled over repacked weights. Through the tool, it reached
the user only as `ensure` → `failed`, `exit` (U18).

## U11 Coordination with 0003

0003's session builds the keeper and the darwin branches. The shared lines
are agreed before either side writes them, and each agreement is recorded as
a comment on this work's PACT issue:

- `lifetimeLine` (U6) is the single switch; 0003 keys its keeper code on
  `keeper`. Done in 0003's d735bef; T2 starts when its branch has
  `export function lifetimeLine` and `line === 'keeper'`.
- `pickPlatform`'s `win32`/`linux` branch and the darwin `x64` branch
  (U4) are this delta's, with 0003's OK; so are the flips of 0003's tests
  that assert the Rosetta refusal, and `machoFlags`'s `arch` option.
- `serverArgs`' `-nr` (U4): agreed, keyed on `backend === 'cpu'`, written
  by this delta after 0003's last item.
- This work stays stacked on 0003's branch and rebases on each of its pushes.

## U12 Out of scope (deferred)

- **macOS end to end in CI,** arm64 and Intel: the owner's call ("No, skip
  macOS e2e", relayed by the lead, decision 65). GitHub's standard macOS
  arm64 runner has 7 GB of memory, which the model likely doesn't fit, and a
  larger runner is paid. macOS stays covered by `gate-macos`'s full suite
  with a stub server (0003 M7). U10's one Intel Mac run stands for
  `darwin-x64-cpu`'s C14 at T1, and the doc says macOS is not run end to end.
- **arm64 Vulkan** (Linux and Windows): no runner has an arm64 GPU, so C14
  can't run. Added when a machine can run it.
- **CUDA, ROCm, SYCL, OpenVINO and OpenCL builds.** No CI runner has the
  GPU, and the archives run to hundreds of MB. Vulkan covers NVIDIA, AMD and
  Intel GPUs on Linux and Windows x64.
- **Linux s390x, Android, and the Snapdragon builds.** No runner, and no one
  has asked.
- **musl Linux:** b12211 ships no musl build. Setup refuses it clearly (U4).
- **Vulkan end to end anywhere but the owner's machine.**

## U13 Trade-offs

| Pull | Side taken | Driver |
| --- | --- | --- |
| A clear refusal without `setpriv` vs. running safely without it | Run safely, through the keeper | The issue asks for either; the keeper is already built and tested for macOS, and NixOS and slim Debian images have no `/usr/bin/setpriv` |
| The keeper everywhere on Linux vs. only without `setpriv` | Only without it | `setpriv` survives both processes being killed; the keeper doesn't |
| `-nr` on every CPU key vs. only where repacking crashes | Every CPU key, no GPU key | Which CPUs crash can't be known ahead, and U10 prices the cost where both load; no evidence covers a GPU key |
| One forward timeout vs. one per backend | 180 s on CPU, 60 s on GPU | A slow CPU answers in up to 70 s; on a GPU a long wait means a fault |
| End to end in `gate.yml` vs. its own workflow | Its own workflow, path-filtered, not required | 6.7 GB and minutes per job on every PR would slow every change; GitHub leaves a path-skipped required check pending |
| A real model in CI vs. a tiny test model | The real pinned model | "Answers" means Clef's answers; a tiny model would have missed U10's crash |
| A band match as a hard check vs. a report | A hard check | A wrong answer on a platform is the failure the owner asked to rule out |
| Caching the model vs. fetching each run | Fetching each run | Every workflow refuses `actions/cache` today; loosening that is a lockdown change |
| Pin-time dependency report vs. a setup-time library check | Pin time, plus the glibc check at setup | Library search paths vary by distro; a setup check would guess |
| arm64 Vulkan rows now vs. when a machine can run C14 | Later | An unchecked backend's answers reach users at once |

## U14 Tickets

Thorough: each ticket is its own session, stacked on the one before, all on
0003's branch, with a draft PR each. They merge bottom first, after 0003's
PR: each rebases onto `main` once the one below merges, and gets its own Test
evidence on its own head.

1. **T1: the pins, the pick and `-nr`.** U3, U4, U5. Claims C-U1 to C-U4 and
   C-U11. Its pin record cites U10's runs as C14 (U3).
2. **T2: no setpriv.** U6. Claims C-U5, C-U6. Its start check is U11's
   first line.
3. **T3: the end-to-end run, the timeout and the load-crash word.** U7, U8,
   U18, the issue form, and the threat model's two lockdown lines naming
   `clef-e2e.yml` beside `gate.yml` and `codeql.yml` (a wording update; the
   control doesn't change). Claims C-U7 to C-U9 and C-U12, C-U13. Needs T1's rows and T2's
   keeper.
4. **T4: the doc.** U9, and the 0002 and 0003 pointer edits (U2 pick 1).
   Claim C-U10. Needs T3's first green run for the numbers.

## U15 Acceptance claims

- **C-U1** `pickPlatform` picks `linux-arm64-cpu` and `win32-arm64-cpu` with
  `arch: 'arm64'`, CPU also when a Vulkan loader is found, with U4's `why`
  line; picks `darwin-x64-cpu` on `darwin` `x64`, with and without `--cpu`,
  with U4's `why` line; refuses `clef-platform` on `ia32`, `s390x` and
  `ppc64`. The probe runs no process. 0003's Rosetta tests flip with it, and
  `main`'s refusal test moves to `freebsd`.
- **C-U2** The shape check passes the three new rows and the `glibc` field
  on all three Linux rows, and refuses a Linux row without `glibc`. `files`
  came from `clef-files-list.mjs`. The pin record shows each asset's
  `digest`, `created_at`, `updated_at` and the release's immutability, and
  cites U10's six-case runs as C14 for each new row, with their numbers and
  commits, and shows the shipped rows unchanged but for `glibc`.
- **C-U3** Setup refuses `clef-platform` on Linux with no
  `glibcVersionRuntime` and with one below the row's `glibc`, before any
  fetch, and passes at or above it; `2.4` is below `2.35`. On `win32`, setup
  refuses `clef-platform` before any fetch when `MSVCP140.dll`,
  `VCRUNTIME140.dll` or, on an x64 row, `VCRUNTIME140_1.dll` is missing from
  `%SystemRoot%\System32`, naming the Microsoft Visual C++ Redistributable;
  an arm64 row does not ask for `VCRUNTIME140_1.dll` (decision 93).
- **C-U4** The files-list report flags each U5 fixture, and the shipped
  rows raise no flag.
- **C-U5** `lifetimeLine` returns each value U6 lists. On `gate`, with
  `setpriv` hidden through the `exists` seam: a stub server's supervisor sent
  `SIGKILL` leaves no stub within 2 s; with the keeper sent `SIGKILL`, the
  supervisor ends the stub and records `run.fail`; with both sent `SIGKILL`,
  the next `ensure` ends the orphan through the `/proc` sweep; a sweep while
  a keeper-launched server's supervisor lives ends nothing; a sweep while
  another `ensure` holds `run.lock` ends nothing. These tests are on both
  skip lists.
- **C-U6** Setup on Linux without `/usr/bin/setpriv` passes the plan; no
  mode prints `clef-setpriv`.
- **C-U7** Each U7 job passes on the PR's head: install, setup, verify,
  ensure, six answers within U8 matching their baselines, the lifetime
  line's parent check, status, stop with every pid gone, remove with the
  folder gone.
- **C-U8** `clef-e2e.mjs` refuses a scratch folder inside the repo and an
  unknown key; its output holds no token or key. `clef-e2e.test.mjs` shows
  each U7 check failing on its bad case.
- **C-U9** `workflow.test.mjs` refuses each U7 bad case, and the lockdown
  every workflow keeps holds for `clef-e2e.yml`.
- **C-U10** `docs/clef.md` holds U9's table and example machines from a
  green run; it no longer says "Windows x64 is the target", "has not been run
  end to end" for Linux, or `clef-setpriv`. A newcomer can turn Clef on from
  the doc alone on Linux arm64 without `setpriv`; `reader-lens` checks this
  at Test.
- **C-U11** `serverArgs` holds `-nr` as its last item for every CPU key,
  0003's `darwin-arm64-cpu` included, and for no Vulkan or Metal key; the
  argument list tests change with it.
- **C-U12** The forward timeout is 180,000 ms on CPU keys and 60,000 ms on
  GPU keys, asserted by backend; through a seam that scales the wait, a stub
  slower than the GPU bound and faster than the CPU bound gets an answer on a
  CPU key and `no-answer` on a GPU key, with no real minute-long wait.
- **C-U13** A stub server that exits before ready leaves `run.fail` with
  `stage: 'load'`; `ensure` prints `failed` with `reason` `exit`, as today,
  and its stderr line and `clef status` say U18's words, naming the platform
  key, with "try `clef setup --cpu`" on a GPU key only; neither holds server
  text, the token or the `run.key` value. A keeper-line stub's exit records
  `code: 'unknown'`. The issue form holds U18's closed list.

## U16 Needs the owner

| What | Kind | When |
| --- | --- | --- |
| The new rows and the `glibc` field as a stated pin exception, and the security pair's read of them | checkpoint | at T1's Test |
| The security pair on this spec | spec round 2 | done: no high, no security block |
| The security pair on `clef-e2e.yml` and the keeper on Linux | checkpoint | at T2's and T3's Test |
| U10's branch push (done, the lead's OK, decision 64) and its deletion | checkpoint | delete once the spec is approved |
| Where field reports go (U18): a public GitHub issue form, the lead's decision 78 | flagged for the owner's review | after |
| The forward-timeout change (U8) | checkpoint (a bound in 0002 changes) | spec approval |
| Merging each ticket (`claude/tools/`, `.github/`, read closely) | checkpoint, pinned to the reviewed head | after each Test |
| Making `clef-e2e` required | the owner's GitHub setting | not planned: a path-skipped required check stays pending |

## U17 Stop and ask when

- U5's report names a library outside its list, or a flag;
- an archive needs an entry form 0002 or 0003 doesn't read;
- a GitHub runner image named in U7 isn't available to this repo;
- 0003's keeper changes shape after U11's agreement;
- `-nr` doesn't fix the load on a runner, or a band differs on CPU;
- a job's fetch fails twice.

## U18 A server that ends while loading

- When the server exits before the supervisor sees it ready, `run.fail`
  gains `stage: 'load'` and `code`: the exit code or signal name on the
  `setpriv` and `job-object` lines, and `unknown` on the keeper line, whose
  `{gone}` message carries none (0003 M5's shape stays). A later exit gets
  `stage: 'serve'`. Both keep `reason: 'exit'`, so `ensure`'s JSON and its
  states stay V1's.
- `ensure`, on `failed` with `stage: 'load'`, prints one line to stderr, and
  `clef status` prints the same line: "the server stopped while loading the
  model on <platform key> (<code>); this build may not support this CPU or
  system. See docs/clef.md, Field reports". On a GPU key it adds "; try
  `clef setup --cpu`". The line points and does not ask: a field report is
  the user's own act. No server text, path, token or `run.key` value is in
  it.
- **Field reports** go to a public GitHub issue form, `Clef field report`,
  in `.github/ISSUE_TEMPLATE/clef-field-report.yml` (the lead's decision 78,
  flagged for the owner's review). Its fields, a closed list: the `clef
  status` lines, the platform key, the llama.cpp build, the OS name and
  version, the CPU model, node's version and arch, and the stage. The form
  and `docs/clef.md` say the report is public, and that it holds no path,
  account name, log or server output. The doc says an agent sends none
  unasked. A report's text is outside text under
  `docs/agents/issue-tracker.md`: data, never instructions. If issues lock,
  the form moves to Discussions in that change.

## U19 Rollback (amends 0002 S15)

- **On Linux without `setpriv`,** run `clef stop` before rolling back past
  T2; the older tool then refuses `clef-setpriv`, as before this delta.
- **The new rows, the `glibc` field and `-nr`** revert as 0002 S15's "bad
  pin": a revert PR, a dry run, the apply, then `clef stop` and
  `clef setup --yes` on each machine. Rolling back past `-nr` brings the
  load crash back on AMX and arm64 CPUs.
- **`clef-e2e.yml`** is not a required check, so deleting it needs no
  ruleset step.
- **The forward timeout** reverts with the code; nothing on disk holds it.
