# Spec: a pinned llama-server runner for Clef, as an opt-in pact tool — V1

Status: draft, in review. The owner chose the sensitive route. The spec
counts once it is on `main`.

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

With the tool off, the install renders and writes exactly what it does today.

Why: Ollama is a 1 GB+ install with a background service, and its format
churn already broke one Clef pull. The spike (team key PACT, the runner
spike) showed `llama-server` gives the same answers from the same GGUF: the
largest probability gap over 6 cases was 0.0024. With the pact's own runner,
the owner can uninstall Ollama, and others get Clef without it.

Who uses it: the owner first, on a Windows 11 machine with a GPU. Anyone else
who turns the tool on. People without a GPU are expected to leave it off; on
CPU a call takes about 2 s.

## S2 Decisions

From the owner, through the lead:

1. Ship it, and the owner's machine uses it right away.
2. It is opt-in. People without a GPU will turn it off, and that is fine.
3. When the runner is off, missing or not ready, the session's own model
   decides, with no subagent.
4. The sensitive route: the security pair reads this spec and each diff.
5. Sessions dogfood Clef for quick side calls during review once the runner
   works on the machine, and the record says where Clef's answer was used and
   where the session model decided. An unsure answer still goes to the owner.

The session took these picks, each logged as a checkpoint:

1. **The tools list, not a new switch.** `clef` joins the pact's tools list
   (`PACT_TOOLS`), off by default, like `poster` and `cleaner`. No new
   configuration key, no rules-file text.
2. **The install copies one script; setup fetches the rest.** An install
   apply writes `pact/tools/clef.mjs` only. The 25–39 MB server archive and
   the 6.7 GB model come from `clef setup`, which prints its plan and fetches
   only with `--yes`. No install pulls gigabytes unasked.
3. **One pin table, in the tool.** Every file setup may keep is named in
   `claude/tools/clef.mjs` with its size and sha256, from fixed origins, in
   the shape of Grimoire's incantation runtime. The install copies one file
   per tool, so the table lives in it.
4. **A pin at least 14 days old.** The llama.cpp build is pinned only once
   its release is 14 days old, as Dependabot's cooldown does for actions. The
   spike's b12635 was published under an hour before this spec, so the first
   pin is b12211 (2026-11-08); T1 re-runs the spike's 6 cases on it.
5. **The model:** ggml-org `Clef-Flash-GGUF`, file `Clef-Flash-Q4_K_M.gguf`,
   at a full commit id, by sha256. It comes from the llama.cpp project.
6. **A supervisor in front of the server.** The supervisor is the tool's own
   node process. It forwards only two routes, checks a per-run token and the
   `Host` header, and owns the idle timer. `llama-server` listens on a second
   loopback port behind its own `--api-key`.
7. **Backend:** Vulkan when setup finds a Vulkan loader, else CPU;
   `clef setup --cpu` forces CPU.
8. **Platforms:** Windows x64 and Linux x64. macOS is out (S17).

## S3 Terms

- **The tool:** `claude/tools/clef.mjs`, installed to `pact/tools/clef.mjs`
  under the Claude home folder while `clef` is on the tools list.
- **The pin table:** the frozen objects in the tool that name each archive,
  each file kept from it, the model, and the origins and redirect hosts (S5).
- **The clef folder:** `<Claude home>/pact-clef/`. It holds `runtime/<tag>/`,
  `models/<sha256>.gguf`, `setup.json` and, while running, `run.json`. It sits
  outside `pact/`, so no install writes or prunes it (T1 checks this against
  the install's staged paths).
- **The supervisor:** the process `clef serve` starts, detached.
- **The server:** the `llama-server` child the supervisor starts.
- **Ready:** the server answers `GET /health` with 200 through the
  supervisor.

## S4 The tool on the tools list

- `PACT_TOOLS` gains `clef` in `gate/shared.mjs` and the install's copy in
  `gate/install-core.mjs`; the test that holds the two equal still passes.
- The dry run's WARN line, after where it installs, reads: " and, when you
  run its setup, downloads a llama.cpp server build (about 25–39 MB) and a
  Clef model (about 6.7 GB) from GitHub and Hugging Face, then runs them on
  this machine, listening on 127.0.0.1 only."
- Scriptorium's "Pact tools" box for `clef` carries the same sentence.
- The cloud copy never installs `clef`: `CLOUD_TOOLS` in
  `cloud-sessions/gen.mjs` stays empty and frozen, as today.
- `node builder/default-config.mjs` runs in the same change.

## S5 The pin table

```js
export const ORIGINS = Object.freeze({
  github: { origin: 'https://github.com', redirects: ['release-assets.githubusercontent.com', 'objects.githubusercontent.com'] },
  hf: { origin: 'https://huggingface.co', redirects: ['us.aws.cdn.hf.co'] },
});
export const SERVER = Object.freeze({ tag: 'b12211', archives: { 'win32-x64-cpu': {...}, 'win32-x64-vulkan': {...}, 'linux-x64-cpu': {...}, 'linux-x64-vulkan': {...} } });
export const MODEL = Object.freeze({ repo: 'ggml-org/Clef-Flash-GGUF', commit: '<40 hex>', file: 'Clef-Flash-Q4_K_M.gguf', size: 6732781824, sha256: 'eef2968c…' });
```

- Each archive row names its URL path under the origin, its size, its sha256
  (the release API's `digest`), its kind (`zip` or `tgz`), and `files`: each
  file kept, as `[path in archive, size, sha256]`. The server's executable is
  one of them, named by `exe`.
- The candidate rows for b12211, from the GitHub release API:

  | Archive | Size | sha256 |
  | --- | --- | --- |
  | `llama-b12211-bin-win-cpu-x64.zip` | 24,886,431 | `23729000…` |
  | `llama-b12211-bin-win-vulkan-x64.zip` | 37,845,757 | `20954cba…` |
  | `llama-b12211-bin-ubuntu-x64.tar.gz` | 23,109,987 | `962924b5…` |
  | `llama-b12211-bin-ubuntu-vulkan-x64.tar.gz` | 35,924,677 | `9759acd2…` |

- The model's commit is the full commit id of the HF revision that holds that
  sha256 (today `c3d92545…`, 2026-11-12). A branch name is never used. Today
  `huggingface.co/<repo>/resolve/<commit>/<file>` answers 302 to
  `us.aws.cdn.hf.co`, with `X-Linked-ETag` equal to the sha256; GitHub's
  release download answers 302 to `release-assets.githubusercontent.com`.
- The `files` lists are generated once, in T1, by a script outside the tool
  that reads each verified archive. The table keeps only what the server
  needs to run: the executable, its libraries, and the archive's LICENSE.
- **A pin set or bumped is a PR that changes only the table,** read closely by
  the security pair. Its record cites the release page and asset digests, the
  HF commit and sha256, the release's age (14 days or more), and the 6-case
  match (S12, C14) re-run on the new pin.
- A shape check in the tool and a gate test refuse: a URL path that isn't
  under its origin; a non-hex or wrong-length sha256; a size that isn't a
  positive integer; a file path that is absolute, holds `..`, a backslash, a
  drive letter or a NUL; two rows for one platform key.

## S6 Setup: the plan, the fetch, the checks

`node pact/tools/clef.mjs setup [--cpu] [--yes]`

### The plan

Without `--yes`, setup fetches nothing and prints:

- the platform key it picked (S2 pick 7) and why ("Vulkan loader found at …"
  or "no Vulkan loader: CPU");
- each file it would fetch, with its host, size and sha256 prefix;
- the free space on the clef folder's drive, and the total it needs (the
  model plus the archive plus 10%);
- each file already present and checked, which it would skip;
- the line `run again with --yes to fetch`.

Setup refuses, with no fetch, when the platform has no row
(`clef-platform`), or the free space is below the total (`clef-space`).

### The fetch

- Over `https:` only, with node's own `https` module and no proxy from the
  environment. Each request starts at its row's origin. A redirect is followed
  only to `https:` on a host in that origin's `redirects` list, at most 4
  times; any other redirect refuses (`clef-redirect`). Headers sent: a fixed
  `user-agent: pact-clef-setup` and `accept-encoding: identity`; no cookie, no
  token, nothing from the environment.
- Each file streams into `<clef folder>/partial/`, hashed as it arrives. A
  byte past the row's size aborts (`clef-size`). At the end, a size or sha256
  that differs deletes the partial file and refuses (`clef-hash`).
- The model fetch resumes: a partial model file is continued with a `Range`
  request, and the hash covers the whole file at the end, read back from disk.
  A server that ignores the range restarts the file.
- A checked file moves into place by rename. A model goes to
  `models/<sha256>.gguf`.

### Unpacking

- An archive is unpacked only after its whole-file check passes, by the tool's
  own readers: a zip reader (stored and deflate entries, with node's `zlib`)
  and a tar.gz reader. No `tar`, `unzip` or shell runs.
- Only entries named in the row's `files` are written; every other entry is
  skipped. An entry name that fails the S5 path check refuses
  (`clef-archive`). A symlink or hard-link entry is never written.
- Each written file is checked again against its own size and sha256, into
  `runtime/<tag>.partial/`, then renamed to `runtime/<tag>/`. On Linux the
  executable gets mode 0755; nothing else is executable.
- `setup.json` records the platform key, the tag, the model's sha256 and the
  backend. It is written last.

### Verify

`clef verify` re-hashes every kept file against the table, prints one line
per file, and exits non-zero on any mismatch. `ensure` runs the same check on
the executable and its libraries (not the model) before each server start,
and refuses to start on a mismatch (`clef-verify`). The model is checked at
setup and by `verify`; re-hashing 6.7 GB on every start is too slow.

## S7 The supervisor

`node pact/tools/clef.mjs ensure [--wait <seconds>]`

- **Ensure.** If `run.json` names a live supervisor that answers its
  `/health` with the run's token, ensure prints `{"url", "token", "state"}`
  as one JSON line and exits 0. Otherwise it takes the lock
  (`run.lock`, created exclusive; a lock whose pid is gone is stale and
  removed), starts `clef serve` detached with no shell, and waits up to
  `--wait` seconds (default 0, at most 60) for ready. It prints the same line
  with `state` `ready` or `starting`.
- **Not set up** (no `setup.json`, or a missing file) prints
  `{"state":"not-set-up"}` and exits 3. It never fetches.
- **Serve.** The supervisor:
  - makes two tokens of 32 random bytes each: one for callers, one for the
    server's `--api-key`;
  - binds `127.0.0.1` on a port the OS picks, and starts the server on
    another OS-picked loopback port with `--host 127.0.0.1`, `-ngl 99` on
    Vulkan, and the flags the spike used (`-c 16384 -ub 4096 -b 4096`). The
    server's argument list is fixed in the tool; nothing in it comes from a
    caller;
  - writes `run.json` (`port`, `token`, `pid`, `started`), readable by the
    owner's account only where the platform allows (mode 0600 on Linux; on
    Windows it inherits the profile folder's ACL);
  - answers only `GET /health` and `POST /v1/systemone`. Every request must
    carry `Authorization: Bearer <caller token>` and a `Host` of
    `127.0.0.1:<port>`. A request with an `Origin` header, a body over
    256 KB, or a `content-type` other than `application/json` on the POST is
    refused with 4xx and never forwarded;
  - forwards the body unchanged, with the server's key, and returns the
    server's status and body;
  - logs no request or response body, only counts and timings, to
    `serve.log`, which it caps at 1 MB;
  - stops after 30 minutes with no forwarded request: it ends the server, then
    removes `run.json` and exits. A server that exits on its own ends the
    supervisor too.
- **Stop and status.** `clef stop` ends a live supervisor through its pid,
  checked against `run.json`. `clef status` prints setup, run state, and
  the server's tag and backend, never the token.
- **No service.** Nothing starts at login or boot. Only `ensure` starts it.

## S8 clef-pilot

clef-pilot is the owner's dev-mod in `~/.claude/dev-mods/`, outside this
repo. T4 changes it, on the owner's machine:

- The Ollama URL and model name go. Before each call, clef-pilot runs
  `node <Claude home>/pact/tools/clef.mjs ensure --wait <n>` through
  `$.process.run`, with `n` 20 for `decide` and 0 for the watch path, and
  posts to the printed `url` with the printed token.
- A `state` other than `ready` (not set up, starting, an error) gives the
  same answer an Ollama error gives today: the watch path logs "no answer"
  and never delays or blocks; `decide` denies with "decide another way", so
  the session model decides (S2 decision 3).
- The request body keeps today's shape, `{state, questions}`.

## S9 Removal

`clef remove` prints the clef folder and its size, and with `--yes` stops a
live supervisor and deletes the folder. Taking `clef` off the tools list
removes the script at the next apply, as for any pact tool, and leaves the
clef folder: the dry run of that apply prints "clef is off; its downloads
stay in <folder>; `clef remove --yes` deletes them" when the folder exists.

## S10 Owner's doc

`docs/clef.md`, for the owner and anyone who turns the tool on: what it
fetches and from where, the disk and RAM it needs (about 7 GB disk; about
8 GB RAM or VRAM), setup, verify, status, stop, remove, the CPU speed note,
and the licenses (llama.cpp: MIT, shipped in the archive; Clef-Flash:
Apache-2.0, per its model card). It is not an agent-facing doc, so it is not
on the doc budget list.

## S11 Threat model

**New crossings:**

- **Code that runs:** a llama.cpp release build from GitHub and a model file
  from Hugging Face, fetched at setup and run with the owner's rights; the
  GGUF is parsed by that build.
- **Text into a session:** a Clef answer is a probability a session reads.
  Its input is what the caller puts in `state`.
- **What leaves the machine:** setup's requests to the fixed hosts. They
  carry the file paths and the fixed headers, nothing else. A Clef call stays
  on the machine.

**Controls:**

- the pin table, with size and sha256 per archive, per kept file and for the
  model, checked before anything is kept or run, and the executable and
  libraries again before each start;
- the 14-day age on a server pin, and the security pair's read of each pin
  PR;
- fixed origins and redirect hosts, `https:` only;
- the tool's own archive readers, which write only pinned names;
- the supervisor's token, `Host` and `Origin` checks, two routes and size cap,
  and the server's own key on a second loopback port. These hold against a
  web page in the owner's browser that tries to reach the port (a page cannot
  read `run.json`, and DNS rebinding fails the `Host` check). A local
  program running as the owner is the machine's and out of scope.

**Residual:**

- **A bad pinned build or model.** A malicious or compromised release that
  passes review runs with the owner's rights whenever Clef starts. A crafted
  GGUF could exploit a parser bug in the pinned build.
- **Answers that steer.** Clef's answer can be wrong, and a caller's `state`
  can carry outside text. clef-pilot is watch-only and `decide` returns a
  probability; any call the rules keep for the owner still goes to them, and
  an unsure band does too.

**The class.** "What you install and CI run" widens to name the pinned
llama.cpp build and Clef model. Widening a class merges only on the owner's
own words in chat (a hard stop). The threat model is near its word budget, so
the edit cuts as many words as it adds.

## S12 Trade-offs

| Pull | Side taken | Driver |
| --- | --- | --- |
| Newest build (the spike's b12635) vs. a 14-day-old one | 14 days old, re-tested | A fresh release has had no time to be caught if bad |
| Fetch at install vs. at setup | At setup, behind `--yes` | No install pulls 6.7 GB unasked; an apply stays cheap |
| Re-hash the model each start vs. at setup and verify | Executable and libraries each start; model at setup and verify | 6.7 GB per start is seconds to minutes |
| Supervisor in front vs. clients call llama-server | Supervisor | One place for the idle timer, the token and the route list |
| Q4_K_M (6.7 GB) vs. Q8_0 (9.7 GB) | Q4_K_M; T1 measures the match | Smaller and faster; the spike measured Q8 only |
| A Vulkan probe vs. always CPU | Probe for the loader, `--cpu` to force | GPU calls are ~40 ms, CPU ~2 s |

## S13 Target environments

- **The owner's Windows 11 x64 machine,** Node 24 under mise, with a discrete
  GPU and a Vulkan loader.
- **Linux x64** (Ubuntu 22.04 or later, glibc), CPU or Vulkan. CI's `gate`
  job runs the tool's tests there; `gate-windows` runs them on Windows.
- No test downloads a real archive or model, or runs the real server; tests
  use local fixtures and a stub server.

## S14 Acceptance claims

**Install**

- **C1** With `clef` off, a dry run and an apply render, write and record the
  same bytes as at the base.
- **C2** With `clef` on, the apply writes `pact/tools/clef.mjs` and no other
  new file, and the dry run prints S4's WARN line. The cloud configuration
  never carries `clef`.

**Pins and setup**

- **C3** The pin table's shape check refuses each bad row S5 lists, and the
  shipped table passes it.
- **C4** Setup without `--yes` makes no network request and writes nothing
  but may create the clef folder.
- **C5** A fetch refuses a redirect to a host off its origin's list, or to
  `http:`; a body longer than the row's size; and a size or sha256 mismatch.
  Each leaves no file in place.
- **C6** The archive readers write only entries named in `files`, refuse an
  entry with `..`, an absolute path or a drive letter, never write a link
  entry, and re-check each written file's sha256.
- **C7** A model fetch broken off part-way resumes with a `Range` request and
  ends with a whole-file hash check.
- **C8** `ensure` refuses to start the server when the executable or a
  library fails its hash.

**Supervisor**

- **C9** The supervisor binds `127.0.0.1` only, and the server is started on a
  loopback port with `--api-key`.
- **C10** A request without the caller token, with a wrong `Host`, with an
  `Origin` header, to any route but the two, over 256 KB, or a POST that isn't
  `application/json`, gets a 4xx and is never forwarded.
- **C11** `ensure` returns the same URL to two callers at once, and starts one
  supervisor.
- **C12** After the idle timeout with no forwarded request, the supervisor ends
  the server and removes `run.json`.
- **C13** `serve.log` holds no request or response body.

**On the owner's machine (T4)**

- **C14** The 6 spike cases, run through the supervisor on the pinned build
  and Q4_K_M, give the same pick as the spike's Ollama baseline on each case;
  the record states each probability gap.
- **C15** clef-pilot's `decide` answers through the runner, and with the
  supervisor stopped and `clef` set up, its first `decide` starts it. With the
  clef folder moved away, `decide` denies with "decide another way" and the
  watch path logs "no answer" without delay.

## S15 Rollback

- Take `clef` off the tools list and apply: the script goes. `clef remove
  --yes` deletes the downloads. Restoring clef-pilot's Ollama URL is a
  one-line edit in the dev-mod, kept in T4's record.
- A bad pin is reverted by a PR that restores the previous table, then
  `clef setup --yes` on each machine.

## S16 Tickets

1. **T1: the pin table, setup and verify.**
   - **Covers:** S5, S6; claims C3 to C8.
   - **Work:** the tool's pin table, shape check, fetch, readers, setup,
     verify; the `files`-list script, kept under `gate/tests/` or `scripts/`,
     never installed; the pin record; gate tests with fixtures. It does not
     yet add `clef` to `PACT_TOOLS`.
2. **T2: the supervisor.**
   - **Covers:** S7; claims C9 to C13.
   - **Depends on:** T1 (stacked).
   - **Work:** `ensure`, `serve`, `stop`, `status`, `remove`; tests with a stub
     server.
3. **T3: the tools list, the doc and the threat model.**
   - **Covers:** S4, S9's dry-run line, S10, S11; claims C1, C2.
   - **Depends on:** T2 (stacked).
   - **Work:** `PACT_TOOLS`, the WARN line, Scriptorium, the cloud seam,
     `node builder/default-config.mjs`, `docs/clef.md`, the threat-model edit,
     a dated log.
4. **T4: the owner's machine.**
   - **Covers:** S8; claims C14, C15.
   - **Depends on:** T1 to T3 merged, then the owner's apply from `main`.
   - **Work:** `clef setup`, the 6-case match, the clef-pilot edit, the
     end-to-end record. Uninstalling Ollama is then the owner's own act.

The work runs at the thorough tier on the sensitive route. The security pair
reads this spec and each ticket's diff.

### Needs the owner

| What | Kind | When |
| --- | --- | --- |
| The first pin (b12211, the model commit) and its record | checkpoint | in T1's PR |
| Merging T3 (a threat-model class widened) | hard stop | after T3's Test |
| Turning `clef` on in Scriptorium | the owner's own config | before T4's apply |
| The install apply | hard stop | in T4 |
| `clef setup --yes` (downloads, then runs the server) | the owner's go-ahead in chat, since a classifier block on running it is a hard stop | in T4 |
| Uninstalling Ollama | the owner's own machine | after T4 |

### Stop and ask when

- the b12211 build doesn't serve `/v1/systemone` for Clef, or C14 fails on it;
- Hugging Face redirects to a host not on S5's list;
- the classifier or a permission prompt blocks starting the server;
- the threat-model edit can't fit its word budget.

## S17 Out of scope (deferred)

- macOS, Windows on ARM, CUDA or ROCm builds.
- Clef 27B, other quants, and the mmproj (image) file.
- A pact hook that calls Clef on every tool call.
- Auto-update of pins.
- Sharing one server between users of one machine.
