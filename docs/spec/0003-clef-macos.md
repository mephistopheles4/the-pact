# Spec delta: Clef on macOS (Apple Silicon, Metal) — V1

Status: draft, revised after spec round 1 (executability-lens, unstated-lens,
adversarial-lens). Amends [0002-clef-runner](0002-clef-runner.md); everything
0002 says holds on macOS unless a section here replaces it. The spec counts
once it is on `main`.

## M1 Objective

0002 put macOS out of scope (S17), giving no reason except that Windows was the
first target, and `clef setup` refuses a Mac (`clef-platform`). A Mac user
can't run Clef, so can't use the tools that lean on it. This delta makes every
`clef` mode (`setup`, `verify`, `ensure`, `serve`, `stop`, `status`, `remove`)
work on macOS arm64, with Metal as the backend and `--cpu` forcing CPU. It
keeps 0002's rule that the server never outlives its supervisor. Two new
controls stand in for Linux's `setpriv --pdeathsig` and the `/proc` sweep.

Who uses it: anyone on an Apple Silicon Mac who turns `clef` on. Intel Macs stay
out (M12).

## M2 Decisions

The session took these picks, each logged as a checkpoint:

1. **A delta spec, not an edit of 0002.** 0002 has shipped. The PR that
   lands this also edits two places in 0002 to point here: S2 pick 8 and S17.
   It changes nothing else in 0002.
2. **Two platform keys, one archive.** `darwin-arm64-metal` and
   `darwin-arm64-cpu` both name `llama-b12211-bin-macos-arm64.tar.gz`, because
   llama.cpp ships one macOS arm64 build and Metal is built into it. The tag
   stays b12211. Its macOS asset was published with the other four on
   2026-11-08, so it already meets the 14-day rule (0002 S2 pick 4).
3. **A keeper process as the first line** (M5). macOS has no `pdeathsig`, so a
   small node process sits between the supervisor and the server. It ends the
   server when its link to the supervisor closes.
4. **A server record and a keyed probe as the second line** (M6). macOS has no
   `/proc`. To tell whether a process is this run's server, the sweep checks
   that it refuses wrong keys and accepts the run's key. It runs no helper
   program.
5. **Linux and Windows don't change,** except where M4 says: a shared fix to
   the tar reader, and case folding. The Linux `setpriv` path and `/proc`
   sweep stay, and so does the Windows job object.
6. **The threat model stays as it is,** except its ruleset line. Server
   lifetime is the machine's own business there: an orphan listens only on
   loopback, behind its key and an origin no page has. So the keeper and the
   record are documented in `docs/clef.md`.

## M3 The pin table (amends 0002 S5)

- `PLATFORM_KEYS` gains `darwin-arm64-metal` and `darwin-arm64-cpu`.
- `SERVER.archives` gains one row for each key. Both rows name the same
  asset, size, sha256 and `files`:

  | Archive | Size | sha256 starts | Created |
  | --- | --- | --- | --- |
  | `llama-b12211-bin-macos-arm64.tar.gz` | 16,711,245 | `4da4edb4` | 2026-11-08 |

  The full sha256 is the release API's `digest`. Like the other four rows,
  the release is not marked immutable.
- `kind` is `tgz`. `exe` and `files` come from running
  `gate/tests/clef-files-list.mjs` for `darwin-arm64-metal`.
- The shape check accepts two keys that name one asset only when their rows
  are equal field for field.
- **A stated exception to 0002 S5's pin-PR rule, like T1's first pin.** The
  macOS rows land in the code PR. In that PR's Test round, the security pair
  reads them as it reads a pin PR: it does its own fetch of the asset's
  `digest`, `created_at` and `updated_at` from the release API and compares
  them with the record. C14 can't run without a Mac, so it waits for a named
  trigger. On the first Mac where `clef setup --yes` runs, C14 runs before
  that machine uses Clef's answers, and the first record to use those answers
  cites C14's result.

## M4 Setup and serve on macOS (amends 0002 S6, S7, S13)

- **The pick.** `pickPlatform` maps `darwin` with `arch === 'arm64'` to
  `darwin-arm64-metal` ("Apple Silicon: Metal"), or to `darwin-arm64-cpu`
  with `--cpu` ("CPU forced by --cpu"). `darwin` on `x64` refuses
  `clef-platform` with this text: "no build for Intel Macs; on Apple Silicon,
  run setup with an arm64 node, not one under Rosetta". No probe runs on
  macOS, because every Apple Silicon Mac has Metal.
- **The archive reader** (shared with Linux). One link to a kept file uses
  T1's copy field (`destNames`), as `libggml-base.so.0` does today. A chain
  of links that needs two copies is a stop-and-ask. A pax record that holds
  only `SCHILY.xattr.*`, `LIBARCHIVE.*`, `mtime`, `atime` or `ctime` is read
  and ignored. A pax record that holds `path`, `linkpath`, `size` or any
  other key refuses (`clef-archive`).
- **The Mach-O check, at pin time.** `clef-files-list.mjs` reads, in node,
  the load commands of the server and of every kept Mach-O file, and prints
  them in the pin record. It flags:
  - an `LC_LOAD_DYLIB`, `LC_LOAD_WEAK_DYLIB`, `LC_REEXPORT_DYLIB` or
    `LC_LAZY_LOAD_DYLIB` that names a path outside `@rpath/`,
    `@loader_path/`, `@executable_path/`, `/usr/lib/` and `/System/`;
  - an `LC_RPATH` that isn't `@loader_path` or `@executable_path` and doesn't
    stay inside the kept folder;
  - an `@rpath/` name that doesn't resolve to a kept file.

  A flag is a stop-and-ask. The run also prints the `minos` of the server's
  `LC_BUILD_VERSION`, which sets the floor in M4's target line. A test with a
  fixture holding `/usr/local/lib/x.dylib` shows a flag being raised.
- **The exec bit.** The executable gets mode 0755 on macOS, as on Linux.
- **The environment.** `PATH` is `/usr/bin:/bin`. On macOS, `TMPDIR` passes
  from the caller, because it names the user's private temp folder and
  without it the process falls back to `/tmp`. No `DYLD_*` name is set or
  passed, and no `LD_LIBRARY_PATH`. The server finds its dylibs through the
  `@loader_path` and `@rpath` entries that the Mach-O check covers.
- **Case folding.** `insideOf` and the checks built on it (`clef-node`,
  `clef-home`, the unpack containment) fold case on `darwin` as well as
  `win32`, as `gate/paths.mjs` already does, because APFS is case-insensitive
  by default.
- **The arguments.** `-ngl 99` on Metal, as on Vulkan. `darwin-arm64-cpu`
  gets `--device none` instead, because the Metal build would otherwise
  offload by default. b12211's `common/arg.cpp` reads `none` as no device.
- **Quarantine.** node doesn't give the files it writes a
  `com.apple.quarantine` attribute, so Gatekeeper doesn't check the server at
  start (C-M9). The arm64 binaries carry the linker's ad-hoc signature, and
  the sha256 check keeps it byte for byte.
- **Starting programs.** 0002 S6's list gains one entry: on macOS the
  supervisor starts the keeper by `process.execPath`, running its own script
  (`import.meta.url`) with `execArgv: []`. No helper runs on macOS.
- **Target environment.**
  - macOS arm64 at or above the build's `minos`, with Node 24.
  - Memory is not measured. Model, context and Metal buffers share unified
    memory, so `docs/clef.md` says 16 GB is the expected floor.
  - Verification runs on CI only, since there is no local Mac. The end-to-end
    run waits for M3's trigger.

## M5 The keeper: the first line

- **Entry.** `main` dispatches `keep` before any folder work. Without an IPC
  channel (`process.send` undefined), `keep` refuses `clef-keep`. It reads
  nothing from the environment, works out no clef folder and creates no
  folder.
- **Start.** The supervisor forks it with these options:
  - an IPC channel;
  - working folder `runtime/<tag>/`;
  - environment `serveEnv(...)`;
  - `stdio: ['ignore', 'pipe', 'pipe', 'ipc']`. The supervisor counts the
    lines on these pipes as it does today.
- **The one message.** The supervisor sends `{file, args, cwd, env}`, built
  entirely by the supervisor: `launchCommand`'s command, `runtime/<tag>/`
  and `serveEnv(...)`. The keeper spawns the server non-detached, with no
  shell. The server takes the keeper's stdout and stderr as its own, and the
  keeper writes nothing to them. The keeper then sends `{pid}`, or
  `{error: 'spawn'}` and exits. A second message, or one of another shape,
  ends the server and the keeper.
- **Then:**
  - **The IPC channel closes** (the supervisor died, by any signal): the
    keeper sends the server `SIGKILL` and exits.
  - **`SIGTERM` or `SIGINT`:** the keeper sends the server `SIGTERM`, waits
    up to 5 s, then sends `SIGKILL`. It sends `{gone}` once it has reaped the
    server, then exits.
  - **The server exits:** the keeper sends `{gone}` and exits.
- **Why the keeper is the server's parent.** Until the keeper reaps the
  server, the server's pid can't be reused.
- **The supervisor's side.**
  - It accepts `{pid}` only as the first message, and only as an integer of 2
    or more that is neither its own pid nor the keeper's. That pid is
    `serverPid` in `run.json` and `/health`.
  - With no `{pid}` within 10 s, it records `run.fail` (`exit`) and stops.
  - Its stop path sends the keeper `SIGTERM`, waits 7 s (longer than the
    keeper's 5 s), then sends `SIGKILL`.
  - On any keeper exit without `{gone}`, it sends `SIGKILL` to `serverPid`.
    Only a killed keeper exits without `{gone}`, and then the server lived
    until that moment. It never signals `serverPid` after `{gone}`.
  - When the keeper exits on its own, it records `run.fail` and stops, as for
    a server that exits.
- **What the keeper doesn't cover:** the supervisor and the keeper both
  killed alone by `SIGKILL` (not as a process group), and an orphan from the
  moment between the server's spawn and the writing of `run.server`. M6
  covers the first. `docs/clef.md` names both as residual.

## M6 The server record and keyed probe: the second line

- **The record.** Once the supervisor accepts `{pid}`, it writes
  `run.server`: `{run, pid, port, started}`, where `port` is the server's own
  port. The file has mode 0600. It and `run.key` are removed together, and
  only after the sweep in the next item finds nothing left to end.
- **The sweep on macOS.** It runs where 0002 S7's sweep runs, under the same
  lock: in `ensure` before it spawns, in `clef stop`, in setup before it
  renames or removes a runtime folder, and in `clef remove`. It runs when
  `run.server` is present and no live supervisor has its `run`. The steps,
  in order:
  1. If `started` is before this boot (`now - os.uptime()`), or `pid` isn't
     alive: remove the record and `run.key`, and end nothing.
  2. Ask `GET /props` on `127.0.0.1:<port>` with no key, then with a fresh
     random key. Each request has 0002's 5 s timeout. In b12211 only
     `/health` and `/v1/health` are open (`server-http.cpp`), so `/props`
     needs the key. The ready check runs before the key check, so a server
     that is still loading answers 503.
  3. Both answer 401: ask once more with the run's key, from `run.key`. A 200
     means `SIGKILL` to `pid`, then remove the record and `run.key`. Any other
     answer goes to step 6.
  4. Both answer 503: the server is still loading. Ask again every second,
     within the caller's bound: `--wait` in `ensure`, which always asks at
     least once, or 60 s in `stop`, `remove` and setup. When the bound runs
     out, keep the record and `run.key`, as step 7 says.
  5. No connection: try again for 2 s (the server listens before it loads the
     model), then go to step 6.
  6. Anything else: the listener isn't the run's server, so `pid` may be
     another process. Remove the record and `run.key`, and end nothing.
  7. A record kept at step 4: `ensure` prints `starting` and spawns nothing.
     `stop` prints `orphan still loading (pid <n>); run stop again` and exits
     1, removing nothing. `remove --yes` deletes nothing and exits 1. Setup
     refuses `clef-orphan`. `clef status` prints the orphan's pid. A server
     stuck at 503 stays until it is ended, or until a reboot clears its
     record at step 1. `docs/clef.md` says so.
- **The key.** The real key goes out only after the listener has refused both
  no key and a wrong key, and only to the recorded loopback port. Once its
  server is gone the key is dead, because the next supervisor writes a new
  one after `ensure`'s sweep, under the lock.
- **No helper, and no command line read.** The sweep reads only the clef
  folder's own files and talks only to the recorded loopback port.

## M7 CI (amends 0002 S13)

- A third job, `gate-macos`, runs on `macos-15` (arm64), with
  `timeout-minutes: 45`. Its steps:
  - `gate`'s pinned actions, with `node-version: '24'`;
  - `gate`'s dry-run lines (`mkdir -p "$RUNNER_TEMP/pact-home"` and the
    install dry run);
  - `env -u NODE_OPTIONS node gate/tests/run.mjs full --skips gate/tests/macos-skips.txt`.
- `gate-macos` joins `GATE_JOBS` in `gate/tests/workflow.test.mjs`. For each
  bad case `gate-windows` has, it gets a twin, each seen to fail. That
  includes a look-alike `gate-macos` job or check in another workflow, pins
  that differ from `gate`'s, a renamed check, `if:` or `continue-on-error` on
  the job, another Node version, a fast tier, no skip list and no dry run.
- `gate/tests/macos-skips.txt` works as `windows-skips.txt` does. The job
  fails on a skip the list lacks, and on a listed skip that ran. The
  Linux-only tests (`setpriv`, `/proc`) are skipped there by name.
- **The first build step is an experiment.** Push the job and the allow-list
  change together on the draft PR, before any macOS code, and run the full
  suite on the runner. Sort each failure:
  - A test that assumes Linux, where the fix lies in the test alone: fix it.
  - A failure that needs a code change outside `clef`: put it on the list
    with its reason.
  - A `clef` test that fails because the macOS code isn't written yet: list
    nothing, since the build fixes it.

  Stop and ask on any failure in the installer's, the cleaner's or the gate's
  own checks, or on more than 10 failures outside `clef`.
- **Test evidence becomes three jobs.** Every live mention of the two jobs
  gains `gate-macos`: `AGENTS.md` (both lines), `docs/agents/gate-tests.md`,
  and `docs/threat-model.md`'s ruleset line. The threat-model line changes
  in the same step in which the owner makes `gate-macos` a required check.
  A new ADR, indexed, supersedes ADR 0141's two-job rule, and a dated log in
  `docs/log/` records the gate change.
- GitHub's macOS runners have no usable Metal, so CI tests the CPU key and
  the stub server only. No CI step downloads the real archive (0002 S13
  holds).

## M8 Docs (amends 0002 S10)

- `docs/clef.md` gains:
  - macOS arm64: built and tested in CI on CPU, with a stub server, and not
    run end to end on Metal or on CPU;
  - the macOS floor, and the 16 GB expectation;
  - `--cpu`;
  - the keeper and the record, and their residuals (M5, M6);
  - how to clear an orphan stuck while loading;
  - the new words: `clef-keep`, `clef-orphan`, and the `stop` and `remove`
    exit 1;
  - Intel Macs and Rosetta.
- The header list in `claude/tools/clef.mjs` gains the new refusal words.
- `docs/install.md`'s "macOS: not tried" becomes "macOS: the dry run runs in
  CI; an apply has not been tried".
- `docs/reference.md` changes only if its `clef` row names platforms.

## M9 Rollback (amends 0002 S15)

- **Once `gate-macos` is required:** the owner removes it from the ruleset
  first, and the revert PR follows. Otherwise the revert can't pass a check
  it deletes.
- **On a Mac,** before rolling back past this change, run `clef stop`, then
  `clef remove --yes` to free the disk. An older tool refuses `darwin` and
  never sweeps `run.server`.

## M10 Trade-offs

| Pull | Side taken | Driver |
| --- | --- | --- |
| A keeper process vs. a helper (`/bin/ps`, or `kqueue` through a native add-on) | The keeper, in node | No new program to start or trust. The IPC channel's close comes from the kernel, as `pdeathsig` does |
| A keyed probe vs. reading process paths with `/bin/ps` | The keyed probe, after a wrong-key refusal | It proves the listener holds the run's key; `ps` only matches a path, and starts a helper |
| Waiting out a loading orphan vs. killing on a 503 | Wait within the caller's bound, then keep the record | A 503 doesn't prove whose server it is |
| Lifetime controls in the threat model vs. in `docs/clef.md` | `docs/clef.md` | The threat model counts an orphan on loopback as the machine's, and the file is at its cap |
| One platform key vs. two for one archive | Two keys | Keeps `setup.json`'s key and backend paired, as on Windows and Linux |
| Metal tested in CI vs. stated as not run | Stated as not run | GitHub's macOS runners have no usable Metal |
| Intel Macs now vs. later | Later (M12) | No one has asked, and the x64 build has no Metal |

## M11 Accepted-risk candidates (Hardening, limit 0; not built unasked)

- The keeper spawns whatever command its one message names. A command line
  can hand it a channel through `NODE_CHANNEL_FD`, so a check that `file` is
  the runtime executable would close that. It adds no new reach, since a
  steered session can already run `node -e`.
- Writing `run.server` before the keeper spawns would close the moment named
  in M5.

## M12 Out of scope (deferred)

- Intel Macs (`darwin-x64`). The asset exists at b12211; add it when someone
  asks.
- A Metal or CPU end-to-end run, until M3's trigger.
- Signing or notarising the server ourselves.
- The keeper on Linux or Windows.

## M13 Acceptance claims

- **C-M1** On `platform: 'darwin', arch: 'arm64'`, setup picks
  `darwin-arm64-metal`, or `darwin-arm64-cpu` with `--cpu`, and runs no
  process to pick. On `darwin` `x64` it refuses `clef-platform` with M4's
  Rosetta text. The existing cases in `gate/tests/clef.test.mjs` that treat
  darwin as unsupported change with it (the `platform-key` bad case moves to
  an invalid key).
- **C-M2** The shape check passes the two macOS rows, and refuses two keys
  that name one asset when any field differs.
- **C-M3** The tar reader keeps one linked file through the copy field,
  ignores an xattr-only pax record, and refuses a pax `path`, `linkpath` or
  `size` record. The files-list check flags a fixture whose load command
  names `/usr/local/lib/x.dylib`, and one with an absolute `LC_RPATH`.
- **C-M4** Unpacking the macOS row sets mode 0755 on the executable. On
  `darwin`, the server's environment holds `PATH=/usr/bin:/bin` and the
  caller's `TMPDIR`. It holds no `LD_LIBRARY_PATH`, no `DYLD_*` name and no
  `NODE_*` name, even with `DYLD_LIBRARY_PATH` and `DYLD_INSERT_LIBRARIES`
  set in the caller. The keeper's own environment is `serveEnv`'s. 0002's
  C17 holds on `gate-macos` with `CLAUDE_CONFIG_DIR` set to a home that isn't
  the default, and `keep` creates no folder.
- **C-M5** The argument list holds `-ngl 99` on `darwin-arm64-metal`, and
  `--device none` on `darwin-arm64-cpu`.
- **C-M6** On `gate-macos`:
  - a stub server's supervisor sent `SIGKILL` leaves no stub process within
    2 s, while the stub writes in a loop;
  - with the keeper sent `SIGKILL`, the supervisor ends the stub, records
    `run.fail` and exits;
  - a stub that exits on its own gets no signal from the supervisor, counted
    through the kill seam;
  - a stub that ignores `SIGTERM` is gone after `clef stop`;
  - the idle timeout ends the stub;
  - a missing stub executable leaves `run.fail` (`exit`) and no keeper;
  - `keep` started from a command line refuses `clef-keep` and starts
    nothing.
- **C-M7** With the supervisor and the keeper both sent `SIGKILL`, the next
  `ensure` ends the stub only after it refuses no key and a wrong key and
  then accepts the run's key. These records end no process and are removed:
  - a stub that answers 200 to any bearer;
  - a pid that is alive with its port closed for 2 s;
  - a record dated before boot.

  A stub answering 503 keeps the record and `run.key`, and gives these
  results:
  - `ensure --wait 0` prints `starting` within 1 s and spawns nothing;
  - `stop` exits 1 with both files still present;
  - `remove --yes` exits 1 with the folder still present;
  - setup refuses `clef-orphan`.

  A sweep while another `ensure` holds `run.lock` ends nothing. Each case
  also runs on `gate` through the seams, and each is seen to fail when its
  rule is swapped.
- **C-M8** `run.server` is mode 0600. No `clef` mode's output, and nothing
  in `serve.log`, holds the key (0002 C13 holds on `gate-macos`).
- **C-M9** On `gate-macos`, a file the tool's fetch writes (from a stub
  `https:` origin) carries no `com.apple.quarantine` attribute.
- **C-M10** On `gate-macos`, `verify` re-hashes the darwin row's fixture.
  `status` prints `darwin-arm64-*` and its backend. `remove --yes` sweeps
  through M6, then deletes the folder.
- **C-M11** On `darwin`, `planSetup` refuses `clef-node` for an `execPath`
  that differs from the starting folder only in case.
- **C-M12** `gate-macos` runs the full tier with its skip list, and
  `workflow.test.mjs` refuses each bad case M7 lists.

## M14 Needs the owner

| What | Kind | When |
| --- | --- | --- |
| The macOS rows as a stated pin exception, and the security pair's read of them | checkpoint | at Test |
| The security pair (adversarial-lens, data-lens) on the diff: `gate.yml`, the keeper, the sweep, the tar reader | checkpoint | at Test |
| Merging (`claude/tools/`, `.github/`, read closely) | checkpoint, pinned to the reviewed head | after Test |
| Making `gate-macos` a required check, with the threat-model ruleset line | the owner's GitHub setting | after merge |
| The threat-model scope pick (M2 pick 6) | the owner's call | before merge |
| C14 on the first Mac (M3's trigger) | checkpoint | on first macOS setup |

## M15 Stop and ask when

- the macOS archive needs a chain of links, or a pax key outside M4's list;
- the Mach-O check flags anything;
- the first `gate-macos` run hits M7's stop line;
- `fork`'s IPC channel doesn't close on the runner when the supervisor gets
  `SIGKILL`.
