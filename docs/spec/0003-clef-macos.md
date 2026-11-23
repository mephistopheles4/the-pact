# Spec delta: Clef on macOS (Apple Silicon, Metal) — V1

Status: draft, not yet reviewed. Amends [0002-clef-runner](0002-clef-runner.md);
everything 0002 says holds on macOS unless a section here replaces it. The spec
counts once it is on `main`.

## M1 Objective

0002 put macOS out of scope (S17) with no reason beyond the first target being
Windows, and `clef setup` refuses a Mac (`clef-platform`). A Mac user can't run
Clef, so can't use the tools that lean on it. This delta makes every `clef` mode
(`setup`, `verify`, `ensure`, `serve`, `stop`, `status`, `remove`) work on macOS
arm64, with Metal as the backend and `--cpu` forcing CPU, and keeps 0002's rule
that the server never outlives its supervisor, with controls that stand in for
Linux's `setpriv --pdeathsig` and the `/proc` sweep.

Who uses it: anyone on an Apple Silicon Mac who turns `clef` on. Intel Macs stay
out (M10).

## M2 Decisions

The session took these picks, each logged as a checkpoint:

1. **A delta spec, not an edit of 0002.** 0002 has shipped.
   This file holds the change; the PR that lands it also edits 0002's S2 pick 8
   and S17 to point here, and nothing else in 0002.
2. **Two platform keys, one archive.** `darwin-arm64-metal` and
   `darwin-arm64-cpu` both name `llama-b12211-bin-macos-arm64.tar.gz`, since
   llama.cpp ships one macOS arm64 build with Metal in it. The tag stays
   b12211: its macOS asset was published with the rest on 2026-11-08, so the
   14-day rule (0002 S2 pick 4) already holds.
3. **A keeper process as the first line** (M5), since macOS has no
   `pdeathsig`: a small node process between the supervisor and the server
   that ends the server when its link to the supervisor closes.
4. **A server record and a keyed probe as the second line** (M6), since macOS
   has no `/proc`: the sweep proves a process is this tool's server by asking
   it a question only the server holding the run's key can answer, and runs no
   helper program.
5. **Linux and Windows don't change.** The keeper and the record run on macOS
   only; the Linux `setpriv` path and `/proc` sweep and the Windows job object
   stay as they are.

## M3 The pin table (replaces 0002 S5's archive list for macOS)

- `PLATFORM_KEYS` gains `darwin-arm64-metal` and `darwin-arm64-cpu`.
- `SERVER.archives` gains one row per key, both naming the same asset, size,
  sha256 and `files`:

  | Archive | Size | sha256 starts |
  | --- | --- | --- |
  | `llama-b12211-bin-macos-arm64.tar.gz` | 16,711,245 | `4da4edb4` |

  The full sha256 is the release API's `digest`. The release is not marked
  immutable (as for the other four rows).
- `kind` is `tgz`; `exe` and `files` come from `gate/tests/clef-files-list.mjs`
  run for `darwin-arm64-metal`, which also prints the entry forms the archive
  uses (0002 S6). If it uses a form T1 doesn't support (a symlink for a
  versioned `.dylib` name, pax, GNU long names), stop and ask: a link entry is
  never written (0002 S6), so a dylib reached only through a link would not
  load.
- The shape check accepts two keys naming one asset only when their rows are
  equal field for field.
- The record of the pin cites, as 0002 S5 asks: the release page, the asset's
  `digest`, `created_at` and `updated_at`, each 14 days old or more.

## M4 Setup and serve on macOS (amends 0002 S6, S7)

- **The pick.** `pickPlatform` maps `darwin` with `arch === 'arm64'` to
  `darwin-arm64-metal` ("Apple Silicon: Metal"), or with `--cpu` to
  `darwin-arm64-cpu` ("CPU forced by --cpu"). `darwin` on `x64` refuses
  `clef-platform`. No probe runs on macOS: every Apple Silicon Mac has Metal.
- **The exec bit.** On macOS, as on Linux, the executable gets mode 0755.
- **The environment.** `PATH` is `/usr/bin:/bin`. No `DYLD_*` name is set or
  passed (the named list in 0002 S7 already passes none), and no
  `LD_LIBRARY_PATH`: the server finds its dylibs through its own
  `@loader_path` / `@rpath` entries. Build checks with the files-list run that
  the server's load commands name only `@rpath`, `@loader_path`, `/usr/lib/`
  and `/System/` paths, and stops and asks otherwise.
- **The arguments.** `-ngl 99` on Metal, as on Vulkan. On `darwin-arm64-cpu`,
  `--device none` (b12211 `common/arg.cpp` reads `none` as no device), since
  the Metal build would otherwise offload by default.
- **Quarantine.** A file node writes isn't given `com.apple.quarantine`, so
  Gatekeeper doesn't check the server at start. C-M9 checks it on the runner.
  The arm64 binaries carry the linker's ad-hoc signature, which the sha256
  check keeps byte for byte.
- **Starting programs.** 0002 S6's list gains one: on macOS the supervisor
  starts the keeper by `process.execPath`, with `execArgv` empty. Nothing else
  is added; no helper runs on macOS.

## M5 The keeper: the first line

- **What it is.** `clef.mjs keep`, a mode the supervisor starts on macOS with
  `child_process.fork` (IPC channel, `execPath` = `process.execPath`,
  `execArgv: []`, working folder `runtime/<tag>/`, `serveEnv`'s environment,
  the server's stdout and stderr piped through to the supervisor as today).
  Started with no IPC channel, `keep` refuses (`clef-keep`) and starts
  nothing, so it does nothing from a command line.
- **What it does.** It takes exactly one IPC message, the launch command the
  supervisor built (`launchCommand`'s `{file, args}`; no part from a caller),
  spawns the server non-detached with no shell, and sends back the server's
  pid. Then:
  - the IPC channel closes (the supervisor died, by any signal including
    `SIGKILL`): it sends the server `SIGKILL` and exits;
  - `SIGTERM` or `SIGINT`: it sends the server `SIGTERM`, waits up to 5 s,
    then `SIGKILL`, and exits;
  - the server exits: it exits with it.
  A second IPC message, or one that isn't that shape, ends the server and the
  keeper.
- **Why the keeper is the server's parent.** The server's pid is the keeper's
  unreaped child, so it can't be reused before the keeper kills it.
- **The supervisor's side.** `serverPid` in `run.json` and `/health` is the
  server's pid the keeper reported, never the keeper's. The supervisor's stop
  path sends the keeper `SIGTERM` (5 s, then `SIGKILL`). When the keeper exits
  on its own, the supervisor sends `SIGKILL` to `serverPid` at once (it is
  alive until killed, so its pid is still its own), records `run.fail` and
  stops, as for a server that exits.
- **What it doesn't cover.** The supervisor and the keeper both killed alone
  by `SIGKILL` (not as a process group). The second line covers that.

## M6 The server record and keyed probe: the second line

- **The record.** Once the keeper reports the server's pid, the supervisor
  writes `run.server`: `{run, pid, port}` (the server's own port), mode 0600.
  It is removed with `run.key` at every stop path that removes `run.key`, and
  `clef stop` removes it with `run.json` and `run.fail`.
- **The sweep on macOS**, in the same places and under the same lock as 0002
  S7's sweep (`ensure` before it spawns, `clef stop`, setup before it renames
  or removes a runtime folder, `clef remove`): with `run.server` present and
  no live supervisor for its `run`:
  1. `pid` not alive: remove the record; end nothing.
  2. Else ask `GET /props` on `127.0.0.1:<port>` twice, once with
     `Authorization: Bearer <run.key's key>` and once with none, each with
     0002's 5 s timeout. In b12211 `/props` needs the key (only `/health` and
     `/v1/health` are open, `server-http.cpp`), and the ready check runs
     before the key check, so a loading server answers 503 to both.
  3. Keyed 200 and keyless 401: `SIGKILL` to `pid`, remove the record.
  4. 503 to both, or no connection: ask again every second for up to 60 s,
     then treat as 5.
  5. Anything else: the listener isn't the run's server, so `pid` may be
     another process. Remove the record; end nothing.
  A sweep still at step 4 when its 60 s run out leaves the record: `ensure`
  prints `starting` and spawns nothing (the next `ensure` sweeps again);
  `stop` and `remove` print `orphan still loading; run stop again` and exit 1;
  setup refuses `clef-orphan`.
- **The key file.** `run.key` stays until the record is gone: the next
  supervisor writes a new key only after `ensure`'s sweep, under the lock.
- **No helper and no other command line.** The sweep reads only the clef
  folder's own files and talks only to the recorded loopback port.

## M7 CI (amends 0002 S13)

- A third job, `gate-macos`, on `macos-15` (arm64), runs the install dry run
  and `gate/tests/run.mjs full --skips gate/tests/macos-skips.txt`, with
  `gate`'s pinned actions and a time limit. `gate/tests/workflow.test.mjs`
  accepts it and gains its bad cases (dropped, other runner, fast tier, no
  skip list, no dry run), each seen to fail.
- `gate/tests/macos-skips.txt` works as `windows-skips.txt` does: the job fails
  on a skip the list lacks and on a listed skip that ran. Linux-only tests
  (`setpriv`, `/proc`) skip there by name.
- **The first build step is an experiment.** Push the job alone on the draft
  PR and run the full suite on the runner before any macOS code: macOS has a
  case-insensitive file system and other paths, and nobody has run the gate
  there. Each failure is fixed when it is a test assuming Linux, or listed
  with its reason. A failure in the installer's, the cleaner's or the gate's
  own checks, or more than 10 failures outside `clef`, is a stop-and-ask: it
  is a finding about those tools, not this change.
- **Test evidence becomes three jobs.** `AGENTS.md` and
  `docs/agents/gate-tests.md` say `gate`, `gate-windows` and `gate-macos`.
  Making `gate-macos` a required check is the owner's GitHub setting.
- GitHub's macOS runners have no usable Metal, so CI tests the CPU key and the
  stub server only. No CI step downloads the real archive (0002 S13 holds).

## M8 Docs and the threat model (amends 0002 S10, S11)

- `docs/clef.md`: macOS arm64 is built and tested in CI on CPU with a stub
  server, and not run end to end, on Metal or on CPU, until a Mac user does;
  `--cpu`; what the keeper and the record do; Intel Macs are not supported.
- The threat model: the server-lifetime control gains the macOS keeper and the
  keyed sweep; residual: the supervisor and the keeper both killed alone leave
  the server running until the next `ensure`, `stop` or setup. The file is at
  its 3,000-word cap, so the PR lists each cut, read as a control change.
- `docs/reference.md` changes only if its `clef` row names platforms.

## M9 Trade-offs

| Pull | Side taken | Driver |
| --- | --- | --- |
| A keeper process vs. a helper (`/bin/ps`, `kqueue` through a native add-on) | The keeper, in node | No new program to start or trust; the IPC close is the kernel's, as `pdeathsig` is |
| A keyed probe vs. reading process paths with `/bin/ps` | The keyed probe | Proves the process holds this run's key; `ps` output is a path match and starts a helper |
| Waiting out a loading orphan vs. killing on a 503 | Wait up to 60 s, then leave it | A 503 doesn't prove whose server it is |
| One platform key vs. two for one archive | Two keys | Keeps `setup.json`'s key and backend paired as on Windows and Linux |
| Metal tested in CI vs. stated as not run | Stated as not run | GitHub's macOS runners have no usable Metal |
| Intel Macs now vs. later | Later (M10) | No one has asked; the x64 build has no Metal |

## M10 Out of scope (deferred)

- Intel Macs (`darwin-x64`): the asset exists at b12211; add when someone asks.
- A Metal or CPU end-to-end run, until a Mac user runs C14 of 0002.
- Signing or notarising the server ourselves.
- The keeper on Linux or Windows.

## M11 Acceptance claims

- **C-M1** On `platform: 'darwin', arch: 'arm64'`, setup picks
  `darwin-arm64-metal`, or `darwin-arm64-cpu` with `--cpu`, and runs no
  process to pick; on `darwin` `x64` it refuses `clef-platform`.
- **C-M2** The shape check passes the two macOS rows, and refuses two keys that
  name one asset with any field different.
- **C-M3** Unpacking the macOS row sets mode 0755 on the executable (on
  `gate-macos` and `gate`).
- **C-M4** On `darwin`, the server's environment holds `PATH=/usr/bin:/bin`,
  no `LD_LIBRARY_PATH` and no `DYLD_*` name, with `DYLD_LIBRARY_PATH` and
  `DYLD_INSERT_LIBRARIES` set in the caller; 0002's C17 holds on `gate-macos`.
- **C-M5** The argument list holds `-ngl 99` on `darwin-arm64-metal` and
  `--device none` on `darwin-arm64-cpu`.
- **C-M6** On `gate-macos`, a stub server's supervisor sent `SIGKILL` leaves no
  stub process within 2 seconds; with the keeper sent `SIGKILL`, the
  supervisor ends the stub, records `run.fail` and exits; `clef stop` and the
  idle timeout end the stub through the keeper. `keep` started from a
  command line refuses `clef-keep` and starts nothing.
- **C-M7** With the supervisor and keeper both sent `SIGKILL`, the next
  `ensure` ends the stub only after the keyed probe answers 200 and the
  keyless one 401. A record whose pid is alive but whose port answers anything
  else, or nothing for 60 s, ends no process. A stub answering 503 holds
  `ensure` at `starting` with no spawn, and setup at `clef-orphan`. A sweep
  while another `ensure` holds `run.lock` ends nothing. Each case runs on
  `gate` through the seams too.
- **C-M8** `run.server` is mode 0600, and no `clef` mode's output or
  `serve.log` holds the key (0002 C13 holds on `gate-macos`).
- **C-M9** On `gate-macos`, a file the tool's fetch writes (from a stub
  `https:` origin) carries no `com.apple.quarantine` attribute.
- **C-M10** `gate-macos` runs the full tier with its skip list, and
  `workflow.test.mjs` refuses each bad case M7 lists.

## M12 Needs the owner

| What | Kind | When |
| --- | --- | --- |
| Making `gate-macos` a required check | the owner's GitHub setting | after the PR merges |
| Merging (`claude/tools/`, `.github/`, read closely) | checkpoint, pinned to the reviewed head | after Test |
| The threat-model edit and its cuts | checkpoint | in the PR |
| A Mac user's end-to-end run | the owner's call | after merge |

## M13 Stop and ask when

- the macOS archive keeps a dylib only behind a link entry, or its load
  commands name a path outside M4's list;
- the first `gate-macos` run hits M7's stop-and-ask line;
- `fork`'s IPC close doesn't fire on the runner when the supervisor gets
  `SIGKILL`;
- the threat-model edit can't fit its word budget.
