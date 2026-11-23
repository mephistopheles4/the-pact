# Spec: a pinned llama-server runner for Clef, as an opt-in pact tool — V1

Status: draft, reviewed (two rounds and a security further read of four Code Rabbit CLI fixes), on the sensitive route; the owner kept the dogfooding bounds (S12). The spec counts
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
     decided: never its `state`, and never a clef-pilot log line. A question
     about an open security finding is recorded by the record's marker; one
     that names a secret, a personal detail or a revealing path is summarised,
     not quoted. An `unsure` band names the owner as who decided.
   - **Which review dogfoods:** the first review after T4, whichever lenses
     run it, since the runner exists only from T4. The security pair reads
     T1 to T3 before then and so can't use Clef in this work. T4 checks that a
     lens subagent can call `decide`.

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
   model's age counts from the Hugging Face Hub's own record of the pinned
   file's last change: the `lastCommit` date the tree API returns for that
   file at the pinned commit. For a file uploaded through `huggingface_hub`
   that is a server time. The first model pin, `Clef-Flash-Q4_K_M.gguf`
   (sha256 `eef2968c…`), last changed 2026-10-25 at commit `6e2a164d`, so it
   is already more than 14 days old.
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
- **The six cases:** the spike's six cases, with its Ollama baseline, from
  the spike's round-2 findings on the tracker: two yes/no, three pick-one, and
  one joint request of two yes/no questions. T4 writes them, as plain data,
  into `docs/clef-cases.json`, and its record says each was read for
  personal, secret and path text before the push.

## S4 The tool on the tools list

- Everything in S4 lands in T1, since the tools list, the WARN text, the
  Scriptorium list and the default configuration are held equal by tests.
- `PACT_TOOLS` gains `clef` in `gate/shared.mjs` and in the install's copy
  in `gate/install-core.mjs`, so seam A and the copy set accept the file. The
  tests that list the tools (`tools.test.mjs`, the builder page's test) gain
  it too. The renderer keeps it off by default.
- The dry run's WARN line (`TOOL_WARNS.clef`), after where it installs,
  reads: " and, when you
  run its setup, downloads a llama.cpp server build (about 25–39 MB) and a
  Clef model (about 6.7 GB) from GitHub and Hugging Face, then runs them on
  this machine, listening on 127.0.0.1 only."
- Scriptorium's "Pact tools" box for `clef` (its `OPT_TOOLS` row) carries
  the same sentence.
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
  After building, the tool checks that the URL's `pathname` starts with
  `/<repo>/releases/download/<tag>/` or `/<repo>/resolve/<commit>/` and that
  it has no query or fragment; otherwise it refuses (`clef-pin`).
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
  doesn't end `.test.mjs`) and the install never stages. It fetches all four
  archives through the tool's exported fetch (the same redirect rule and
  whole-file hash check) into a scratch folder outside the repo, and prints
  the rows. It also prints which entry forms each archive uses (S6). Running
  it is the only real download before T4.
- **A pin set or bumped is a PR that changes only the table and the files
  list,** read closely by the security pair. The first pin, in T1, is the
  one exception: it lands with the tool. Before a later pin PR merges, C14
  runs on the new pin from the branch's own `claude/tools/clef.mjs`, run
  directly on the owner's machine as a checkpoint. Its record cites:
  - the release page, and for each pinned asset its `digest`, `created_at`
    and `updated_at` from the release API, each 14 days old or more, and
    whether the release is marked immutable;
  - the HF commit id, the file's sha256, and that the repo sits under the
    `ggml-org` account. The model's age counts from the `lastCommit` date the
    Hub's tree API returns for the pinned file at the pinned commit
    (`/api/models/<repo>/tree/<commit>?expand=true`), 14 days or more before
    the record's date. For a `huggingface_hub` upload that is a server time;
    a commit pushed with git carries a date its pusher chose, so the record
    also says which route the commit came by when the Hub's page shows it;
  - C14's run on the new pin, which T4 makes for the first pin.
- **The shape check,** in the tool and in a gate test, refuses: a `repo`
  other than `ggml-org/llama.cpp` or `ggml-org/Clef-Flash-GGUF` (the gate
  test holds both names as its own constants, so moving a source changes a
  test too); a tag not matching `^b[0-9]+$`; an `asset` or `MODEL.file` that
  isn't one plain segment of letters, digits, `.`, `_` and `-` (never `.` or
  `..`), or an `asset` not starting `llama-<tag>-bin-`; a commit not 40 lower-case hex;
  a sha256 not 64 lower-case hex; a size that isn't a positive integer; two
  rows for one platform key; and a file path that is empty, absolute, holds
  `..`, a backslash, any `:`, a NUL or a control character, ends in a dot or a
  space, or has a segment that is a Windows reserved name (`CON`, `PRN`,
  `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, any case, any extension).

## S6 Setup: the plan, the fetch, the checks

`node pact/tools/clef.mjs setup [--cpu] [--yes]`

Every `clef` mode (`setup`, `verify`, `ensure`, `serve`, `stop`, `status`,
`remove`) first sets its working folder to the clef folder, and starts no
program by a bare name: `serve` is started by `process.execPath`, the server
by its absolute path under `runtime/<tag>/`, and, on Linux only,
`/usr/bin/setpriv` by that absolute path (S7). Nothing else is started.

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
- the node path it will record in `setup.json` (S8 runs it);
- the line `run again with --yes to fetch`.

Setup refuses, with no fetch: a platform with no row (`clef-platform`); too
little space (`clef-space`); a live supervisor (`clef-running`: "run `clef
stop` first"); a node path inside the folder the command was started from
(`clef-node`); Linux without `/usr/bin/setpriv` (`clef-setpriv`, S7).

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
  needs it: T1's files-list run reports the forms the four b12211 archives
  use, and T1 supports and tests exactly those.
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
| `failed` | the last start failed less than 10 minutes ago; `reason` is a fixed word (`exit`, `timeout`) | 4 |

- **Live check.** No other process's command line is read, and no helper
  runs. A supervisor is live only when `run.json`'s `pid` is alive and its
  `/health`, asked with the token, returns `{run, pid, serverPid}` equal to
  `run.json`'s (`run` is 16 random bytes, not the token). Any mismatch, or no
  answer, removes `run.json` and starts fresh.
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
  `SYSTEMROOT`, `WINDIR`, `TEMP`, `TMP`, `HOME`, `USERPROFILE`,
  `LOCALAPPDATA` and `XDG_RUNTIME_DIR` from the caller; `PATH` set, not
  passed: `%SystemRoot%\System32;%SystemRoot%` on Windows, `/usr/bin:/bin` on
  Linux; and on Linux `LD_LIBRARY_PATH` set to the runtime folder. No
  `GGML_*`, `LLAMA_*`, `HF_*`, `VK_*` or `NODE_*` name passes, so no
  environment setting adds an argument or a library folder.
- **Tokens.** Two values from `crypto.randomBytes(32)`: the caller token and
  the server key.
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
- **What it returns.** The supervisor builds a new body from checked values
  only; the server's body is never passed on. For each asked question id
  (tested with `Object.hasOwn`), it takes a finite number in [0,1] (`noul`,
  `score`), or a `choice` that is one of the `criteria` keys sent with
  `probabilities` holding a finite number in [0,1] for each sent key and no
  other key. Anything else, and every non-200, becomes a fixed
  `502 {"error":"no-answer"}`. No server text reaches a caller.
- **`serve.log`** holds counts, timings and reason words; no request or
  response body, token, key, header value or argument list, on every path
  including a failed start. It is capped at 1 MB.
- **Stopping.** After 30 minutes with no forwarded request, the supervisor
  ends the server, removes `run.json` and `run.key`, and exits. A server that
  exits on its own ends the supervisor, which records `run.fail`. The server
  is spawned non-detached, so on Windows libuv's kill-on-close job object
  ends it when the supervisor dies. On Linux the supervisor ends it on
  `SIGTERM`, `SIGINT` and exit, and, since a `SIGKILL` runs no handler, the
  server is started through `/usr/bin/setpriv --pdeathsig KILL --` (by that
  absolute path, from node's main thread), so the kernel kills it when the
  supervisor dies. Setup refuses a Linux machine without `/usr/bin/setpriv`
  (`clef-setpriv`). As a second line, `ensure`, `clef stop` and setup end
  every orphan, only while holding `run.lock`: a process whose
  `/proc/<pid>/exe` lies under `<clef folder>/runtime/` (any tag, or a
  deleted target there) and whose parent is not a live supervisor. Setup
  sweeps before it renames or removes a runtime folder.
- **Off the list.** At start, the supervisor records the size, mtime and
  sha256 of its own script, the file it was started from (`import.meta.url`,
  never a path rebuilt from the environment). Before each forwarded request
  and once a minute, it checks that file again. When the file is gone or
  changed (`clef` came off the tools list, or an apply changed the tool or
  its pins), it ends the server, removes `run.json` and `run.key`, and exits;
  the next `ensure` then runs the installed tool.
- **Test seams.** The origins, the `https:` rule, the executable path, the
  environment list and the idle timeout are parameters of the tool's exported
  functions only. No flag and no environment variable reaches them (C17).

### Stop, status, remove

- `clef stop` runs the live check, then ends only the supervisor pid its
  `/health` just reported; the supervisor's own handlers and the job object
  end the server. With no live supervisor it ends nothing, and removes
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
T4 keeps a copy of `register.ts` before the edit in the session's own job
folder under `~/.claude/`, never committed or posted; the record cites only
that it exists. The security pair reads T4's clef-pilot edit as a diff
against that copy.

- **Calls.** All three of today's call sites move: `decide` (with
  `--wait 20`), the watch path and the prompt-pin path (both `--wait 0`).
  clef-pilot runs `<setup.json's node> <Claude home>/pact/tools/clef.mjs
  ensure` through `$.process.run`, and reads the URL and token from
  `run.json`. Before each call it checks that `clef.mjs` is still installed;
  when it isn't, Clef is off: clef-pilot drops its kept URL and token, makes
  no call and runs no `ensure`, and the session's own model decides (S2
  decision 3). Otherwise it reads `run.json` again (a small file read)
  and runs `ensure` when the file is missing or its `port` or `run` changed,
  and after any connection error, 401 or no-answer.
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
any pact tool, and leaves the clef folder. A running supervisor sees its
script gone and stops (S7), and clef-pilot stops calling (S8).
`docs/clef.md` says to run `clef stop` and `clef remove --yes` first to free
the disk.

## S10 Owner's doc

`docs/clef.md`, for the owner and anyone who turns the tool on:

- what it fetches and from where, and the disk it needs (about 7 GB);
- the RAM and VRAM T4 measures (C14);
- setup, verify, status, stop and remove; the CPU speed note;
- **how a caller uses it:** `ensure`'s JSON line and exit codes, the token in
  `run.json`, the two routes, the body shape and the answer check. This
  interface is V1's and changes only through a spec change, which adds a
  `v` field to `run.json`;
- Linux: built and unit-tested, not run end to end;
- the licenses: llama.cpp MIT, its LICENSE kept from the archive; Clef-Flash
  Apache-2.0, per its model card.

It is not an agent-facing doc, so it is not on the doc budget list.

## S11 Threat model

**New crossings:**

- **Code that runs:** a llama.cpp release build from GitHub and a model file
  from Hugging Face, fetched at setup and run with the owner's rights; the
  build parses the model.
- **Text into a session:** a decision model's answer, held to numbers and the option keys
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
- **Answers that steer.** Outside text in `state` can move the decision model's numbers.
  clef-pilot is watch-only, `decide` returns a probability, and what the
  rules keep for the owner still goes to them.

**The class.** "What you install and CI run" widens to name the pinned
llama.cpp build and decision model. The pact text, `review.md` and the threat
model name the role, "a decision model", never the product; Clef is named
only in the tools list, `claude/tools/clef.mjs`, `docs/clef.md` and the pin
facts, so another System 1 model can replace it by a setting and a runner.
Widening a class merges only on the owner's own confirmation (a checkpoint). The threat model is near its word budget;
T3's PR lists each cut it makes to fit, and the security pair reads each cut
as a control change.

## S12 Trade-offs

| Pull | Side taken | Driver |
| --- | --- | --- |
| Newest build (the spike's b12635) vs. a 14-day-old one | 14 days old, per file, re-tested | A fresh upload has had no time to be caught if bad |
| Clef settles security sorts and severity vs. Clef advises and the session settles | The session settles; Clef's placement is a second opinion (S2 decision 5). For the owner to confirm, since it narrows the dogfooding ask | Outside text in `state` can push Clef to a confident wrong answer |
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
  the matching run id and pids, is replaced. `run.json` naming a live process
  that isn't the supervisor leaves that process alive after `ensure` and
  `clef stop` (on `gate-windows` too).
- **C12** After the idle timeout with no forwarded request, the supervisor ends
  the server and removes `run.json` and `run.key`. After `clef stop`, or after
  the supervisor is killed, the server is gone (on `gate-windows` too). On
  `gate`, a stub server's supervisor sent `SIGKILL` leaves no stub process
  within 2 seconds; with `--pdeathsig` taken out in a test seam, the next
  `ensure` ends the orphan, also when its tag's folder was renamed or removed;
  a sweep while another `ensure` holds `run.lock` kills nothing. Setup on
  Linux without `/usr/bin/setpriv` refuses `clef-setpriv`. Removing or
  changing the supervisor's own script under it stops it and removes
  `run.json` within a minute, with `CLAUDE_CONFIG_DIR` set to a different
  folder.
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
  without delay. With `clef.mjs` removed and a stale `run.json` left, it
  makes no call to the kept port and runs no `ensure`.
- **C16** The supervisor returns only a body it built from checked values; a
  free-text choice, an out-of-range number or probability, an extra field, a
  server error or a non-JSON body becomes the fixed `no-answer`.
- **C17** Every `clef` mode, started from a folder holding a planted `ggml-*`
  library, `node` and helper programs, with `GGML_BACKEND_PATH`,
  `LLAMA_ARG_*`, `NODE_OPTIONS` and a `PATH` naming that folder, runs nothing
  from that folder; the stub server sees the runtime folder as its working
  folder, the fixed `PATH`, and none of those names. No CLI flag or
  environment variable changes the origins, the `https:` rule, the executable
  path or the idle timeout. Setup refuses a node path inside the starting
  folder.
- **C18** `ensure` after a failed start prints `failed` and starts nothing for
  10 minutes; `setup.json` naming another pin gives `not-set-up` with
  `pin-changed`.
- **C19** `clef remove` without `--yes` deletes nothing; with `--yes` it stops
  a live supervisor and deletes only the clef folder, following no link out of
  it.
- **C20** (T4) The first review record after T4 lists each Clef call made
  during it: the question (under S2 decision 5's rules), the band and who
  decided, with no `state`, each `unsure` naming the owner; or says none came
  up.
- **C21** The shape check refuses an `asset` or model file name with a `/`,
  `..`, `%`, `?` or `#`, and a built URL whose path leaves its repo, tag or
  commit.

## S15 Rollback

- **A bad pin,** including the first pin failing C14 in T4: a revert PR that
  restores the previous table (for the first pin, one that sets the next
  eligible build), then a dry run, the apply (a checkpoint), and on each
  machine `clef stop` then `clef setup --yes` (setup refuses `clef-running`
  otherwise).
- **A pin bump:** after its apply, `clef status` and `ensure` report
  `pin-changed` until `clef stop` then `clef setup --yes` run;
  `docs/clef.md` says so.
- **The pact past T1:** an older renderer refuses `clef` on the tools list.
  Take `clef` off the list and apply first, then roll back. T3 adds this
  check to `docs/install.md`'s "Roll back to an older version".
- **clef-pilot:** restore the copy of `register.ts` T4 kept.
- `clef stop` and `clef remove --yes` free the machine.

## S16 Tickets

The work is cut into four tickets, each its own session, merged bottom first
(T1, T2, T3, then T4), each stacked on the one before. Each ticket's plan
lives on its sub-issue of the tracker item; this spec holds only what each
must meet.

1. **T1: the tool on the list, the pin table, setup and verify.** Covers S4,
   S5, and S6 but its live-supervisor refusal; claims C1, C2, C3, C4's first
   sentence, C5 to C8, C21. Its pin record shows each pinned file's age (S2 pick 4, S5).
   It runs no server.
2. **T2: the supervisor.** Covers S7 and S6's live-supervisor refusal;
   claims C4's second sentence, C9 to C13, C16 to C19. Its record cites the
   lines of b12211's own source that show `--api-key-file`, `--no-webui` and
   `--no-slots`, and that with no `GGML_*` variable the backends load only
   from the executable's folder and the working folder; if one doesn't hold,
   it stops and asks.
3. **T3: the doc and the threat model.** Covers S9, S10, S11 and S15's
   install check. Its threat-model edit lists every cut, and an ADR records
   the 14-day pin age, since it constrains every later pin PR.
4. **T4: the owner's machine.** Covers S8; claims C14, C15, C20. It starts
   after T1 to T3 merge and the owner applies from `main`. Its PR holds
   `docs/clef-cases.json` and the end-to-end record.

The work runs at the thorough tier on the sensitive route. The security pair
reads this spec, each ticket's diff and T4's clef-pilot edit.

### Needs the owner

| What | Kind | When |
| --- | --- | --- |
| Merging T1 and T2 (`claude/tools/`, read closely) | checkpoint, pinned to the reviewed head | after each Test |
| Merging T3 (a threat-model class widened) | checkpoint; the class widening waits for the owner's confirmation | after T3's Test |
| Merging T4 (`docs/clef-cases.json`, public) | checkpoint, pinned to the reviewed head | after T4's Test |
| A later pin PR's C14 run from the branch | checkpoint | before that PR merges |
| The dogfooding bounds in S2 decision 5 | the owner's call (S12) | before T4 |
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

- macOS, Windows on ARM, CUDA or ROCm builds.
- A Linux end-to-end run, until someone turns `clef` on on Linux or CI gains
  a Linux machine that can run the model.
- Clef 27B, other quants, and the mmproj (image) file.
- A pact hook that calls Clef on every tool call.
- Auto-update of pins.
- Re-hashing kept files before each start.
- Sharing one server between users of one machine.
