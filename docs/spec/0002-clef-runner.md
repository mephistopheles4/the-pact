# Spec: a pinned llama-server runner for Clef, as an opt-in pact tool — V1

Status: draft, reviewed (round 1), on the sensitive route. The spec counts
once it is on `main`.

## S1 Objective

The pact ships `clef`, an opt-in pact tool that runs Clef, the local decision
model, with no Ollama. With the tool on and set up:

- the tool fetches one pinned `llama-server` build and one pinned Clef-Flash
  model file, each checked by size and sha256 before it is kept;
- `clef ensure` starts a small supervisor on `127.0.0.1` the first time a
  caller needs Clef, and the supervisor stops itself and the server after an
  idle timeout;
- clef-pilot, the owner's watch-only mod, asks the supervisor instead of
  Ollama.

With the tool off, the install renders and writes what it does today (C1).

Why: Ollama is a 1 GB+ install with a background service, and its format
churn already broke one Clef pull. The runner spike showed `llama-server`
gives the same answers from the same GGUF: the largest probability gap over
its 6 cases was 0.0024. With the pact's own runner, the owner can uninstall
Ollama, and others get Clef without it.

Who uses it: the owner first, on a Windows 11 machine with a GPU, and anyone
else who turns the tool on. People without a GPU are expected to leave it
off; on CPU a call takes about 2 s.

## S2 Decisions

From the owner, through the lead:

1. Ship it, and the owner's machine uses it right away.
2. It is opt-in. People without a GPU will turn it off, and that is fine.
3. When the runner is off, missing or not ready, the session's own model
   decides, with no subagent.
4. The sensitive route: the security pair reads this spec and each diff.
5. Sessions dogfood Clef for quick side calls during review once the runner
   works on the machine (T4 on), and the record says where Clef's answer was
   used and where the session model decided. An unsure answer still goes to
   the owner. Bounds, from review:
   - **Clef never settles** a security sort or `security?` mark, a finding's
     severity, or a checkpoint pick. Where Clef places a finding
     on a boundary (inbound, outbound or local), the session places it too,
     and a difference goes to the owner. A finding is never dropped on
     Clef's answer alone.
   - **The record names** each call's question, its answer band, and who
     decided: never its `state`, and never a clef-pilot log line.

The session took these picks, each logged as a checkpoint:

1. **The tools list, not a new switch.** `clef` joins `PACT_TOOLS`, off by
   default, like `poster` and `cleaner`. No new configuration key and no
   rules-file text.
2. **The install copies one script; setup fetches the rest.** An install
   apply writes `pact/tools/clef.mjs` only. The 25–39 MB server archive and
   the 6.7 GB model come from `clef setup`, which prints its plan and fetches
   only with `--yes`.
3. **One pin table, in the tool.** The install copies one file per tool, so
   the table lives in `claude/tools/clef.mjs`, in the shape of Grimoire's
   incantation runtime.
4. **Pins at least 14 days old,** for the server build and the model alike,
   counted per pinned file (S5). The spike's b12635 was published under an
   hour before this spec, so the first server pin is b12211 (2026-11-08). The
   model's commit is dated 2026-11-12, so the first pin record is dated
   2026-11-26 or later.
5. **The model:** ggml-org `Clef-Flash-GGUF`, `Clef-Flash-Q4_K_M.gguf`, at a
   full commit id, by sha256.
6. **A supervisor in front of the server.** The tool's own node process. It
   forwards two routes, checks a per-run token and the `Host` header, owns
   the idle timer and returns only what S7 lets through.
7. **Backend:** Vulkan when setup finds the Vulkan loader (S6), else CPU;
   `clef setup --cpu` forces CPU.
8. **Platforms:** Windows x64, run end to end in T4. Linux x64 is built and
   unit-tested in CI, and not run end to end in this work; `docs/clef.md`
   says so. macOS is out (S17).

## S3 Terms

- **The tool:** `claude/tools/clef.mjs`, installed to `pact/tools/clef.mjs`
  under the Claude home folder while `clef` is on the tools list.
- **The pin table:** the frozen objects in the tool that name the server
  build, each archive, each file kept from it, and the model (S5).
- **The clef folder:** `<Claude home>/pact-clef/`. It holds
  `runtime/<tag>/`, `models/<sha256>.gguf`, `partial/`, `setup.json` and,
  while running, `run.json`, `run.lock` and `serve.log`. No install writes
  or prunes it: the install's staged paths and its record name only paths
  under `pact/` and the files it lists, and T1 adds a test that holds an
  install from a home with a clef folder leaving that folder untouched.
- **The supervisor:** the process `clef serve` runs, started detached by
  `ensure`.
- **The server:** the `llama-server` child the supervisor starts.
- **Ready:** the server answers `GET /health` with 200 through the
  supervisor.
- **The six cases:** the spike's six cases (4 yes/no, 3 pick-one, one joint
  request), with its Ollama baseline. T4 copies them, as plain data, into
  `docs/clef-cases.json`; they hold no personal or secret text.

## S4 The tool on the tools list

- `PACT_TOOLS` gains `clef` in `gate/shared.mjs` and in the install's copy
  in `gate/install-core.mjs`, in T1, so seam A and the copy set accept the
  file from T1 on. The tests that list the tools (`tools.test.mjs`, the
  builder page's test) gain it there too. The renderer keeps it off by
  default.
- The dry run's WARN line, after where it installs, reads: " and, when you
  run its setup, downloads a llama.cpp server build (about 25–39 MB) and a
  Clef model (about 6.7 GB) from GitHub and Hugging Face, then runs them on
  this machine, listening on 127.0.0.1 only."
- Scriptorium's "Pact tools" box for `clef` carries the same sentence.
- The cloud copy never installs `clef`: `CLOUD_TOOLS` in
  `cloud-sessions/gen.mjs` stays empty and frozen.
- `docs/reference.md` gains `clef.mjs` in its `claude/tools/` row and its
  "Pact tools" section.
- `node builder/default-config.mjs` runs in the same change.

## S5 The pin table

```js
export const SERVER = Object.freeze({
  repo: 'ggml-org/llama.cpp', tag: 'b12211',
  archives: { 'win32-x64-cpu': {...}, 'win32-x64-vulkan': {...}, 'linux-x64-cpu': {...}, 'linux-x64-vulkan': {...} },
});
export const MODEL = Object.freeze({ repo: 'ggml-org/Clef-Flash-GGUF', commit: '<40 hex>', file: 'Clef-Flash-Q4_K_M.gguf', size: 6732781824, sha256: '<64 hex>' });
```

- **Paths are built, never written out.** A server archive's URL is
  `https://github.com/<SERVER.repo>/releases/download/<SERVER.tag>/<asset>`;
  the model's is
  `https://huggingface.co/<MODEL.repo>/resolve/<MODEL.commit>/<MODEL.file>`.
- **Redirect hosts,** fixed in the tool: `release-assets.githubusercontent.com`
  and `objects.githubusercontent.com` for GitHub; `us.aws.cdn.hf.co` for
  Hugging Face. Today the GitHub download answers 302 to the first, and the
  Hugging Face one answers 302 to `us.aws.cdn.hf.co`, with `X-Linked-ETag`
  equal to the sha256.
- **Each archive row** names its asset, size, sha256 (the release API's
  `digest`, in full), kind (`zip` or `tgz`), `exe` (the server's path in the
  archive), and `files`: each file kept, as `[path in archive, size,
  sha256]`.
- **What is kept:** every file in the archive folder that holds `exe` (the
  executable, every `ggml-*` and other library beside it, since llama.cpp
  loads its backends from there at run time), plus the archive's LICENSE.
  Nothing else.
- **First values,** from the GitHub release API for b12211 (sha256 in full
  in the table):

  | Archive | Size | sha256 starts |
  | --- | --- | --- |
  | `llama-b12211-bin-win-cpu-x64.zip` | 24,886,431 | `23729000` |
  | `llama-b12211-bin-win-vulkan-x64.zip` | 37,845,757 | `20954cba` |
  | `llama-b12211-bin-ubuntu-x64.tar.gz` | 23,109,987 | `962924b5` |
  | `llama-b12211-bin-ubuntu-vulkan-x64.tar.gz` | 35,924,677 | `9759acd2` |

  The model: commit `c3d92545…` (2026-11-12), 6,732,781,824 bytes, sha256
  starting `eef2968c`.
- **The `files` lists** are written once per pin by
  `gate/tests/clef-files-list.mjs`, a script the runner never runs (its name
  doesn't end `.test.mjs`) and the install never stages. It reads the
  verified archives and prints the rows.
- **A pin set or bumped is a PR that changes only the table and the files
  list,** read closely by the security pair. Its record cites:
  - the release page, and for each pinned asset its `digest`, `created_at`
    and `updated_at` from the release API, each 14 days old or more, and
    whether the release is marked immutable;
  - the HF commit id and its date (14 days or more), the file's sha256, and
    that the repo sits under the `ggml-org` account;
  - C14's run on the new pin, which T4 makes for the first pin.
- **The shape check,** in the tool and in a gate test, refuses: a `repo`
  other than `ggml-org/llama.cpp` or `ggml-org/Clef-Flash-GGUF` (the gate
  test holds both names as its own constants, so moving a source changes a
  test too); a tag not matching `^b[0-9]+$`; a commit not 40 lower-case hex;
  a sha256 not 64 lower-case hex; a size that isn't a positive integer; two
  rows for one platform key; and a file path that is empty, absolute, holds
  `..`, a backslash, any `:`, a NUL or a control character, ends in a dot or a
  space, or has a segment that is a Windows reserved name (`CON`, `PRN`,
  `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, any case, any extension).

## S6 Setup: the plan, the fetch, the checks

`node pact/tools/clef.mjs setup [--cpu] [--yes]`

### The plan

Without `--yes`, setup fetches nothing and writes nothing but the clef folder
itself. It prints:

- the platform key it picked and why: "Vulkan loader found" or "no Vulkan
  loader: CPU". The probe looks for a file, runs nothing: `vulkan-1.dll` in
  `%SystemRoot%\System32` on Windows; `libvulkan.so.1` in `/usr/lib`,
  `/usr/lib64`, `/usr/lib/x86_64-linux-gnu`, `/lib/x86_64-linux-gnu` on Linux;
- each file it would fetch, with its host, size and sha256 prefix;
- the free space on the clef folder's drive, and what it needs (the model plus
  the archive plus 10%);
- each file already present and checked, which it skips;
- the line `run again with --yes to fetch`.

Setup refuses, with no fetch: a platform with no row (`clef-platform`); too
little space (`clef-space`); a live supervisor (`clef-running`: "run `clef
stop` first").

### The fetch

- `https:` only, through node's `https` module, with no proxy. Each request
  starts at its built URL. A redirect is followed only to an absolute
  `https:` URL whose host is the request's own host or on S5's redirect
  hosts for that source, at most 4 times; a relative redirect resolves
  against the current URL and meets the same rule. Anything else refuses
  (`clef-redirect`).
- Headers sent: `user-agent: pact-clef-setup` and `accept-encoding:
  identity`, plus `range` on a resumed model fetch. No cookie, no token,
  nothing read from the environment.
- Each file streams into `partial/`, hashed as it arrives. A byte past the
  row's size aborts (`clef-size`). A size or sha256 that differs at the end
  deletes the partial file and refuses (`clef-hash`).
- The model fetch resumes: a partial model file continues with a `Range`
  request, and the hash covers the whole file, read back from disk at the
  end. A server that ignores the range restarts the file.
- A checked file moves into place by rename; a model goes to
  `models/<sha256>.gguf`.

### Unpacking

- An archive is unpacked only after its whole-file check passes, by the
  tool's own readers: zip (stored and deflate entries, through node's
  `zlib`) and tar.gz (ustar). No `tar`, `unzip` or shell runs. A zip64, pax
  or GNU long-name entry refuses (`clef-archive`) unless a pinned archive
  needs it, in which case T1 supports exactly that form and tests it.
- Only entries named in `files` are written. An entry name failing S5's path
  check refuses (`clef-archive`). A link entry is never written.
- Each written file is checked again against its own size and sha256, into
  `runtime/<tag>.partial/`. An existing `runtime/<tag>/` is renamed aside,
  the new folder renamed in, and the old one removed. On Linux the executable
  gets mode 0755.
- After a successful setup, runtime folders and model files the table no
  longer names are removed (they are the tool's own downloads, which a re-run
  of setup restores).
- `setup.json`, written last, records the platform key, the tag, the model
  sha256, the backend, and `node`: the absolute path of the node that ran
  setup (`process.execPath`), which callers use (S8).

### Verify

`clef verify` re-hashes every kept file and the model against the table,
prints one line per file, and exits non-zero on any mismatch. Files at rest in
the clef folder belong to the machine (S11), so `ensure` checks only that
`setup.json` matches the table's tag and model; it doesn't re-hash.

## S7 The supervisor

### Ensure

`node pact/tools/clef.mjs ensure [--wait <seconds>]` prints one JSON line,
`{"url", "state"}`, and **never a token**. The caller reads the token from
`run.json`. States:

| State | Means | Exit |
| --- | --- | --- |
| `ready` | the server answers `/health` with 200 | 0 |
| `starting` | a supervisor runs, the server isn't ready yet | 0 |
| `not-set-up` | no `setup.json`, a missing file, or `setup.json` names another tag or model than the table (`reason`: `pin-changed`); it never fetches | 3 |
| `failed` | the last start failed less than 10 minutes ago; `reason` is a fixed word (`exit`, `timeout`, `verify`) | 4 |

- **Live check.** A supervisor is live only when `run.json`'s `pid` is alive
  and is a node process whose command line names `clef.mjs serve`, and its
  `/health` returns the `run` id stored in `run.json` (16 random bytes, not
  the token). Any mismatch removes `run.json` and starts fresh.
- **Starting.** `ensure` takes `run.lock` (created exclusive; a lock whose
  pid is gone is stale and removed), starts `clef serve` detached with no
  shell, then waits up to `--wait` seconds (default 0, at most 60) for
  ready. A losing `ensure` never spawns: it waits up to `--wait` for
  `run.json`, then prints what it finds, or `starting` with no URL.
- **Backoff.** A failed start is recorded in `run.fail` (time and reason
  word). Within 10 minutes of it, `ensure` prints `failed` and doesn't
  start. `clef status` shows it; `clef stop` clears it.

### Serve

- **Where and with what.** The supervisor and the server run with their
  working folder set to `runtime/<tag>/`, and with a named environment only:
  `PATH`, `SYSTEMROOT`, `WINDIR`, `TEMP`, `TMP`, `HOME`, `USERPROFILE`,
  `LOCALAPPDATA`, plus `XDG_RUNTIME_DIR` and `LD_LIBRARY_PATH` set to the
  runtime folder on Linux. No `GGML_*`, `LLAMA_*`, `HF_*` or `NODE_*` name
  passes, so the backend loader finds only the pinned libraries and no
  environment setting adds an argument.
- **Tokens.** Two values from `crypto.randomBytes(32)`: the caller token and
  the server key. Compared with `crypto.timingSafeEqual`.
- **Ports.** The supervisor binds `127.0.0.1` on a port the OS picks. The
  server starts on another OS-picked loopback port with `--host 127.0.0.1`,
  `--api-key-file <clef folder>/run.key` (mode 0600 on Linux, removed at
  stop), `--no-webui`, `--no-slots`, `-ngl 99` on Vulkan, and
  `-c 16384 -ub 4096 -b 4096`. The argument list is fixed in the tool; no
  part comes from a caller. The key never appears on a command line.
- **Its output.** The server's stdout and stderr are read only to count lines
  and to find the ready line; their text is discarded. No verbose flag is
  passed.
- **`run.json`** holds `port`, `token`, `run`, `pid`, `serverPid`, `started`
  (mode 0600 on Linux; on Windows it inherits the profile folder's ACL).
- **Routes.** Only `GET /health` and `POST /v1/systemone`. Every request
  needs `Authorization: Bearer <caller token>` and a `Host` of
  `127.0.0.1:<port>`. A request with an `Origin` header, a body over 256 KB,
  or a POST whose `content-type` isn't `application/json` is refused. Each
  refusal is a fixed 4xx body naming a reason word, never echoing the
  request.
- **What it returns.** A 200 from the server is returned with its body only
  when the body parses as JSON whose `answers` maps each asked question id to
  either a finite number in [0,1] (`noul`, `score`) or a `choice` that is one
  of the `criteria` keys sent, with `probabilities` over those keys. Anything
  else, and every non-200, becomes a fixed `502 {"error":"no-answer"}`. No
  server text reaches a caller.
- **`serve.log`** holds counts, timings and reason words; no request or
  response body, token, key, header value or argument list, on every path
  including a failed start. It is capped at 1 MB.
- **Stopping.** After 30 minutes with no forwarded request, the supervisor
  ends the server, removes `run.json` and `run.key`, and exits. A server that
  exits on its own ends the supervisor, which records `run.fail`. On Windows
  the server is started in a job object that closes with the supervisor, so
  a supervisor that dies takes the server with it.
- **Test seams.** The origins, the `https:` rule, the executable path, the
  environment list and the idle timeout are parameters of the tool's exported
  functions only. No flag and no environment variable reaches them (C17).

### Stop, status, remove

- `clef stop` ends the supervisor and the server by the pids in `run.json`,
  each only after the same identity check as the live check, and removes
  `run.json`, `run.key` and `run.fail`.
- `clef status` prints setup's platform, tag, backend and model prefix, the
  run state, and the last failure word. It never prints a token, key or path
  outside the clef folder.
- `clef remove` prints the clef folder and its size. With `--yes` it stops a
  live supervisor, then deletes the clef folder without following a link out
  of it. A session running `clef remove --yes` takes a checkpoint (S16).
- **No service.** Nothing starts at login or boot. Only `ensure` starts it.

## S8 clef-pilot

clef-pilot is the owner's dev-mod in `~/.claude/dev-mods/`, outside this
repo, and it runs in every session, so T4's edit to it is a checkpoint (S16).
T4 keeps a copy of `register.ts` before the edit in its record folder.

- **Calls.** All three of today's call sites move: `decide` (with
  `--wait 20`), the watch path and the prompt-pin path (both `--wait 0`).
  clef-pilot runs `<setup.json's node> <Claude home>/pact/tools/clef.mjs
  ensure` through `$.process.run`, reads the token from `run.json`, and keeps
  both for later calls. It runs `ensure` again only on a connection error,
  a 401, or a `state` other than `ready`.
- **Body.** `{state, questions}`; the Ollama-only `model` and `keep_alive`
  fields go.
- **Answers.** It checks the answer as the supervisor does (S7, What it
  returns) and returns only numbers and option keys it sent.
- **Failures.** Every failure maps to a fixed reason word in its log and its
  reply: the watch and pin paths log "no answer" and never delay or block;
  `decide` denies with "clef-pilot: no decision (<word>). Decide another
  way." It never logs or returns `ensure`'s output, a token, or a server
  body.
- **Description.** `decide`'s description drops the security example ("is
  this finding security-related?") and the words "instead of ... stopping to
  ask the owner", and says what S2 decision 5 says Clef never settles.

## S9 Removal

Taking `clef` off the tools list removes the script at the next apply, as for
any pact tool, and leaves the clef folder. `docs/clef.md` says to run `clef
stop` and `clef remove --yes` first to free the disk.

## S10 Owner's doc

`docs/clef.md`, for the owner and anyone who turns the tool on:

- what it fetches and from where, and the disk it needs (about 7 GB);
- the RAM and VRAM T4 measures (C14);
- setup, verify, status, stop and remove; the CPU speed note;
- **how a caller uses it:** `ensure`'s JSON line and exit codes, the token in
  `run.json`, the two routes, the body shape and the answer check;
- Linux: built and unit-tested, not run end to end;
- the licenses: llama.cpp MIT, its LICENSE kept from the archive; Clef-Flash
  Apache-2.0, per its model card.

It is not an agent-facing doc, so it is not on the doc budget list.

## S11 Threat model

**New crossings:**

- **Code that runs:** a llama.cpp release build from GitHub and a model file
  from Hugging Face, fetched at setup and run with the owner's rights; the
  build parses the model.
- **Text into a session:** a Clef answer, held to numbers and the option keys
  the caller sent. Its input is the caller's `state`, which can carry outside
  text.
- **What leaves the machine:** setup's requests to the fixed hosts, carrying
  the built paths and fixed headers.

**Controls:**

- the pin table: fixed repos, size and sha256 per archive, per kept file and
  for the model, checked before anything is kept or run;
- 14 days' age per pinned file and model commit, and the security pair's read
  of each pin PR;
- fixed redirect hosts, `https:` only;
- the tool's own archive readers, which write only pinned names;
- a fixed working folder and a named environment for the supervisor and the
  server;
- the supervisor's answer check, and clef-pilot's;
- S2 decision 5's bounds on what Clef settles.

Files at rest in the clef folder belong to the machine: a program already
running as the owner is out of scope.

**Residual:**

- **A bad pinned build or model.** A malicious release that passes the age
  rule and review runs with the owner's rights whenever Clef starts; a
  crafted GGUF could exploit a parser bug in the pinned build.
- **Answers that steer.** Outside text in `state` can move Clef's numbers.
  clef-pilot is watch-only, `decide` returns a probability, and what the
  rules keep for the owner still goes to them.

**The class.** "What you install and CI run" widens to name the pinned
llama.cpp build and Clef model. Widening a class merges only on the owner's
own confirmation (a checkpoint). The threat model is near its word budget;
T3's PR lists each cut it makes to fit, and the security pair reads each cut
as a control change.

## S12 Trade-offs

| Pull | Side taken | Driver |
| --- | --- | --- |
| Newest build (the spike's b12635) vs. a 14-day-old one | 14 days old, per file, re-tested | A fresh upload has had no time to be caught if bad |
| Fetch at install vs. at setup | At setup, behind `--yes` | No install pulls 6.7 GB unasked |
| Re-hash at each start vs. at setup and verify | Setup and verify | Files at rest are the machine's; a 6.7 GB hash per start costs seconds to minutes |
| Supervisor in front vs. clients call llama-server | Supervisor | One place for the idle timer, token, routes and answer check |
| Q4_K_M (6.7 GB) vs. Q8_0 (9.7 GB) | Q4_K_M; C14 measures the match | Smaller and faster; the spike measured Q8 only |
| A Linux end-to-end run vs. unit tests only | Unit tests, stated in the doc | The owner's machine is Windows; nobody runs Linux here today |
| A process spawn per call vs. a kept URL | Kept URL, `ensure` on failure | A warm call is ~40 ms; a node start costs as much |

## S13 Target environments

- **The owner's Windows 11 x64 machine,** Node 24 under mise, a discrete GPU
  and a Vulkan loader. The node clef-pilot runs is the one setup recorded.
- **Linux x64** (Ubuntu 22.04 or later, glibc), CPU or Vulkan: CI's `gate`
  job runs the tests; no end-to-end run.
- **CI:** `gate` and `gate-windows`. No test downloads a real archive or
  model, or runs the real server; tests use fixtures and a stub server
  through S7's seams.

## S14 Acceptance claims

**Install**

- **C1** With `clef` off, a dry run and an apply render, write and record the
  same bytes as at the base, except the dry run's tools block, which gains a
  `clef: off` line.
- **C2** With `clef` on, the apply writes `pact/tools/clef.mjs` and no other
  new file, and the dry run prints S4's WARN line. The cloud copy never
  carries `clef`. An install leaves an existing clef folder untouched.

**Pins and setup**

- **C3** The shape check refuses each bad row S5 lists, and the shipped table
  passes it.
- **C4** Setup without `--yes` makes no network request and writes nothing
  but the clef folder. Setup refuses while a supervisor is live.
- **C5** A fetch follows a redirect to its own host or a listed host, and
  refuses one to any other host, to `http:`, or past 4 hops; it refuses a body
  longer than the row's size and a size or sha256 mismatch. Each refusal
  leaves no file in place.
- **C6** The readers write only entries named in `files`, refuse each bad name
  S5 lists and each unsupported entry form, never write a link entry, and
  re-check each written file's sha256.
- **C7** A model fetch broken off part-way resumes with a `Range` request and
  ends with a whole-file hash check.
- **C8** The Vulkan probe picks Vulkan when the loader file is present and CPU
  when it isn't, and runs no process.

**Supervisor**

- **C9** The supervisor binds `127.0.0.1` only. The server starts on loopback
  with the key in a file, never on its command line, with `--no-webui` and
  `--no-slots`.
- **C10** A request without the caller token, with a wrong `Host`, with an
  `Origin` header, to any route but the two, over 256 KB, or a POST that isn't
  `application/json`, gets a fixed 4xx and is never forwarded.
- **C11** Two `ensure` calls at once start one supervisor; the loser never
  spawns. A stale `run.json` whose pid is gone, or whose port answers without
  the run id, is replaced.
- **C12** After the idle timeout with no forwarded request, the supervisor ends
  the server and removes `run.json` and `run.key`. After `clef stop`, neither
  pid in `run.json` is alive (on `gate-windows` too).
- **C13** No `clef` mode's stdout or stderr holds the token or the key.
  `serve.log` holds no body, token, key, header value or argument list,
  including after a failed start. `clef status` prints neither.
- **C14** (T4, owner's machine) The six cases, through the supervisor on the
  pinned build and Q4_K_M, give the same answer as the spike's Ollama
  baseline on each: the same band (yes > 0.7, no < 0.3, else unsure) for a
  yes/no question, the same top option for a pick. The record states each gap,
  a warm `decide` time (budget: 100 ms), and peak RAM and VRAM.
- **C15** (T4) clef-pilot's `decide` answers through the runner; with the
  supervisor stopped, its first `decide` starts it. With the clef folder moved
  away, `decide` denies with a fixed word and the watch path logs "no answer"
  without delay.
- **C16** The supervisor returns a server answer only when it passes S7's
  check; a free-text choice, an out-of-range number, a server error or a
  non-JSON body becomes the fixed `no-answer`.
- **C17** Started from a folder holding a planted `ggml-*` library, with
  `GGML_BACKEND_PATH`, `LLAMA_ARG_*` and `NODE_OPTIONS` set, the stub server
  sees the runtime folder as its working folder and none of those names. No
  CLI flag or environment variable changes the origins, the `https:` rule,
  the executable path or the idle timeout.
- **C18** `ensure` after a failed start prints `failed` and starts nothing for
  10 minutes; `setup.json` naming another pin gives `not-set-up` with
  `pin-changed`.
- **C19** `clef remove` without `--yes` deletes nothing; with `--yes` it stops
  a live supervisor and deletes only the clef folder, following no link out of
  it.
- **C20** (T4) The first review record after T4 lists each Clef call made
  during it: the question, the band and who decided, with no `state`, or says
  none came up.

## S15 Rollback

- **A bad pin:** a revert PR that restores the previous table, then a dry
  run, the apply (a checkpoint), and `clef setup
  --yes` on each machine.
- **The pact past T1:** an older renderer refuses `clef` on the tools list.
  Take `clef` off the list and apply first, then roll back. T3 adds this
  check to `docs/install.md`'s "Roll back to an older version".
- **clef-pilot:** restore the copy of `register.ts` T4 kept.
- `clef stop` and `clef remove --yes` free the machine.

## S16 Tickets

1. **T1: the pin table, setup and verify.**
   - **Covers:** S4's `PACT_TOOLS` entry, S5, S6; claims C3 to C8, C2's
     clef-folder part.
   - **Work:** the tool's pin table, shape check, fetch, readers, setup,
     verify; `gate/tests/clef-files-list.mjs`; gate tests with fixtures. The
     pin record may be dated no earlier than 2026-11-26 (the model's age).
     No real download or server run in T1.
2. **T2: the supervisor.**
   - **Covers:** S7; claims C9 to C13, C16 to C19.
   - **Depends on:** T1 (stacked).
   - **Work:** `ensure`, `serve`, `stop`, `status`, `remove`; tests with a
     stub server. T2 confirms from b12211's own source that it has
     `--api-key-file`, `--no-webui` and `--no-slots`, and the same backend
     search as upstream; if not, it stops and asks.
3. **T3: the WARN line, the doc and the threat model.**
   - **Covers:** S4's rest, S9, S10, S11, S15's install check; claims C1, C2.
   - **Depends on:** T2 (stacked).
   - **Work:** the WARN line, Scriptorium, `node builder/default-config.mjs`,
     `docs/reference.md`, `docs/clef.md`, the `docs/install.md` check, the
     threat-model edit with its list of cuts, a dated log, and an ADR for the
     14-day pin age (it constrains every later pin PR).
4. **T4: the owner's machine.**
   - **Covers:** S8; claims C14, C15, C20.
   - **Depends on:** T1 to T3 merged, then the owner's apply from `main`.
   - **Work:** `clef setup --yes`, `docs/clef-cases.json` and the six-case
     run, the clef-pilot edit, the end-to-end record, and dogfooding in the
     next review. Uninstalling Ollama is then the owner's own act.

The work runs at the thorough tier on the sensitive route. The security pair
reads this spec and each ticket's diff. Merge order is bottom first: T1, T2,
T3.

### Needs the owner

| What | Kind | When |
| --- | --- | --- |
| Merging T1 and T2 (`claude/tools/`, read closely) | checkpoint, pinned to the reviewed head | after each Test |
| Merging T3 (gate code, a threat-model class widened) | checkpoint; the class widening waits for the owner's confirmation | after T3's Test |
| The first pin and its record | checkpoint | in T1's PR |
| Turning `clef` on in Scriptorium | the owner's own config | before T4's apply |
| The install apply | checkpoint | in T4 |
| `clef setup --yes` and starting the server | checkpoint; a permission prompt or classifier block on it stops the session | in T4 |
| Editing clef-pilot, which runs in every session | checkpoint | in T4 |
| A session running `clef remove --yes` (downloads git can't restore) | checkpoint | whenever |
| Uninstalling Ollama | the owner's own machine | after T4 |

### Stop and ask when

- b12211 doesn't serve `/v1/systemone` for Clef, lacks a flag S7 names, or
  C14 fails on it;
- a download redirects to a host S5 doesn't list;
- the classifier or a permission prompt blocks starting the server;
- `$.process.run` ends the detached supervisor when it returns, or
  `$.http.fetch` sends an `Origin` header;
- the threat-model edit can't fit its word budget.

## S17 Out of scope (deferred)

- macOS, Windows on ARM, CUDA or ROCm builds; a Linux end-to-end run.
- Clef 27B, other quants, and the mmproj (image) file.
- A pact hook that calls Clef on every tool call.
- Auto-update of pins.
- Re-hashing kept files before each start.
- Sharing one server between users of one machine.
