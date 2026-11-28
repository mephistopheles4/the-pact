# `clef`, the local decision model's runner

`clef` is an opt-in pact tool. It runs Clef, a small local decision model, with a pinned `llama-server` build and a pinned model file, on your machine, with no Ollama. It serves one of two models at a time: Clef-Flash (`flash`, the default) or full Clef (`full`, a larger model). It is off by default. [Turn it on](#turn-it-on) puts `clef` on your tools list; the install copies one script, `~/.pact/tools/clef.mjs`, and setup fetches the rest.

The design is [spec 0002](spec/0002-clef-runner.md); [spec 0003](spec/0003-clef-macos.md) and [spec 0005](spec/0005-clef-everywhere.md) add platforms, and [spec 0011](spec/0011-coverage-hint.md#s9-full-clef-in-clef) adds full Clef. This page is for anyone who turns it on. Every command is `node ~/.pact/tools/clef.mjs <mode>`; below, `clef <mode>` is short for it.

<!-- toc -->

- [Platforms](#platforms)
- [What your machine needs](#what-your-machine-needs)
  - [On Linux](#on-linux)
  - [On Windows](#on-windows)
  - [On macOS](#on-macos)
- [Turn it on](#turn-it-on)
- [What it fetches](#what-it-fetches)
- [Example machines](#example-machines)
  - [A Windows x64 machine with a GPU](#a-windows-x64-machine-with-a-gpu)
  - [CI's runners, on CPU](#cis-runners-on-cpu)
- [Commands](#commands)
- [How a caller uses it](#how-a-caller-uses-it)
- [Things to know](#things-to-know)
- [When the supervisor dies](#when-the-supervisor-dies)
- [macOS](#macos)
- [Field reports](#field-reports)
- [Turning it off and removing it](#turning-it-off-and-removing-it)

<!-- /toc -->

## Platforms

| Platform | Setup picks | Run end to end in CI | Not run end to end |
| --- | --- | --- | --- |
| Windows x64 | Vulkan when it finds the loader, else CPU | CPU | Vulkan in CI; it has run on one [example machine](#example-machines) |
| Windows arm64 | CPU | CPU | Vulkan is not offered yet |
| Linux x64 (glibc) | Vulkan when it finds the loader, else CPU | CPU, with and without `setpriv` | Vulkan |
| Linux arm64 (glibc) | CPU | CPU, with `setpriv` | Without `setpriv`; Vulkan is not offered yet |
| macOS arm64 (Apple Silicon) | Metal, or CPU with `--cpu` | None: CI runs the test suite on macOS 15, on CPU with a stub server | Metal and CPU |
| macOS x64 (Intel) | CPU | None | One trial of the pinned server alone, with earlier arguments, got the six test cases right ([spec 0005 U10](spec/0005-clef-everywhere.md#u10-the-experiment-and-what-it-found)) |

`setpriv` is a program from util-linux; `ls /usr/bin/setpriv` shows whether you have it. Without it Clef uses [the keeper](#when-the-supervisor-dies) to end the server, and setup needs nothing more from you.

End to end means [`clef-e2e.yml`](../.github/workflows/clef-e2e.yml), with the real pinned server and the `flash` model: install, setup, verify, start, six answers checked against recorded ones, stop and remove. `full` is not run there. Setup refuses any other system, and a Linux without glibc (Alpine and other musl systems), with `clef-platform`.

## What your machine needs

- **Disk:** about 7.6 GB free for `flash` and 22 GB for `full`, on the drive that holds your Claude home folder ([what it fetches](#what-it-fetches)).
- **Memory:** 16 GB of RAM for `flash`. On CI's 16 GB runners the server peaked at 5.2 to 6.8 GiB ([example machines](#example-machines)). `full` is unmeasured.
- **Node 24 or later, built for your CPU.** `node -p "process.version + ' ' + process.arch"` shows both. An x64 node on an arm64 Windows machine, or under Rosetta on Apple Silicon, picks an x64 CPU build, which runs emulated; use an arm64 node.
- **The system libraries** for your platform, below. No download holds them.

### On Linux

| Needs | x64 | arm64 | Does setup check it? |
| --- | --- | --- | --- |
| glibc | 2.34 or newer | 2.38 or newer: Ubuntu 24.04 or Debian 13 or later (Ubuntu 22.04 is refused) | Yes |
| `libstdc++.so.6` | `GLIBCXX_3.4.30` and `CXXABI_1.3.13` | `GLIBCXX_3.4.32` and `CXXABI_1.3.15` | No |
| `libgcc_s.so.1` | `GCC_3.4` | `GCC_3.0` | No |
| `libgomp.so.1` | `GOMP_4.5` | `GOMP_4.5` | No |
| OpenSSL 3: `libssl.so.3` and `libcrypto.so.3` | `OPENSSL_3.0.0` | `OPENSSL_3.0.0` | No |
| `libvulkan.so.1` | For the Vulkan build only | Not used | It picks Vulkan when it finds it |

Check glibc with `ldd --version`. Then find the libraries:

```sh
/sbin/ldconfig -p | grep -E 'libssl\.so\.3|libcrypto\.so\.3|libstdc\+\+\.so\.6|libgcc_s\.so\.1|libgomp\.so\.1'
```

All five should be listed, for your CPU. To check a version floor, search the file that command names. For `libstdc++`, with your path:

```sh
grep -ao 'GLIBCXX_3\.4\.[0-9]*' /path/to/libstdc++.so.6 | sort -Vu | tail -n 1
grep -ao 'CXXABI_1\.3\.[0-9]*' /path/to/libstdc++.so.6 | sort -Vu | tail -n 1
```

Do the same with `'GCC_[0-9][0-9.]*'` on `libgcc_s.so.1`, `'GOMP_[0-9][0-9.]*'` on `libgomp.so.1` and `'OPENSSL_[0-9][0-9.]*'` on `libssl.so.3`. The newest version printed must be the floor or newer.

### On Windows

The **Microsoft Visual C++ Redistributable** for your CPU. Setup refuses `clef-platform` without it. In PowerShell, each of these should print `True` (arm64 doesn't need the third):

```powershell
Test-Path "$env:SystemRoot\System32\MSVCP140.dll"
Test-Path "$env:SystemRoot\System32\VCRUNTIME140.dll"
Test-Path "$env:SystemRoot\System32\VCRUNTIME140_1.dll"
```

The Vulkan build also uses `vulkan-1.dll` from the same folder, which a GPU driver installs; without it setup picks CPU.

### On macOS

macOS 13.3 or later, the builds' floor. [macOS](#macos) says what differs there.

## Turn it on

In PowerShell, write the path in the commands below as `"$HOME/.pact/tools/clef.mjs"`.

1. **Get the pact.** Clef installs with it, and the install also changes every Claude Code session on your machine, so read [Install the pact](install.md) from the top first. If you have no clone yet, [clone it](install.md#2-clone-the-repo).
2. **Put `clef` on your tools list.** If you have no `~/.pact/config.json`, first copy `config.json` and `blocks/` from the clone's [`builder/default-config/`](../builder/default-config/) into `~/.pact/`. Your file replaces the pact's default configuration whole, and this copy keeps the default rules. Then add `"tools": ["clef"]` to `~/.pact/config.json`, beside any tool already listed. In Scriptorium, picking a Clef model under **Install a decision-one model** lists `clef` too.
3. **Apply the install:** read [the dry run](install.md#4-run-the-dry-run-and-read-it), then run [the apply command it prints](install.md#5-install-with---apply). `~/.pact/tools/clef.mjs` appears.
4. **Set it up.** The first command prints the plan and fetches nothing; check the platform and reason it names. The second downloads about 6.7 GB.

   ```sh
   node ~/.pact/tools/clef.mjs setup
   node ~/.pact/tools/clef.mjs setup --yes
   ```

5. **Start it**, and repeat until the line it prints holds `"state":"ready"`:

   ```sh
   node ~/.pact/tools/clef.mjs ensure --wait 60
   ```

   If the line says `not-set-up`, run step 4 again. If it says `failed`, run `clef status` and see [Field reports](#field-reports); `clef stop` clears the failure, so the next `ensure` tries again.

[How a caller uses it](#how-a-caller-uses-it) shows what to send it.

## What it fetches

Only `clef setup --yes` fetches anything, and only these, each checked by size and sha256 before it is kept:

- **A llama.cpp server build** (tag `b12211`, MIT license) from `github.com/ggml-org/llama.cpp`, 12 to 38 MB, one archive for your platform. The license files the pin table names are kept beside it: llama.cpp's `LICENSE` on Linux and macOS, and on Windows only `LICENSE-LLVM-OpenMP`, since the Windows archive holds no llama.cpp `LICENSE`. That license is the repository's own file at the pinned tag, [`LICENSE` at b12211](https://github.com/ggml-org/llama.cpp/blob/b12211/LICENSE) (MIT; byte for byte the file the Linux archive carries, sha256 `94f29bbe…`).
- **One model**, the variant you pick, at one pinned commit, Apache-2.0 per its model card:

| Variant | File | From | Size | Free disk to plan for |
| --- | --- | --- | --- | --- |
| `flash` (default) | `Clef-Flash-Q4_K_M.gguf` | `huggingface.co/ggml-org/Clef-Flash-GGUF` | 6.7 GB | about **7.6 GB** |
| `full` | `Clef-Q4_K_M.gguf` (the 27B) | `huggingface.co/ggml-org/Clef-GGUF` | 19.5 GB | about **22 GB** |

The free disk is on the drive that holds your Claude home folder: setup refuses when the model, the archive, the unpacked files and a 10% margin do not fit. Downloads redirect only to a fixed list of hosts, over `https:` only. Everything lands in the clef folder, `<Claude home>/pact-clef/`, which no install writes or deletes.

## Example machines

Each is one machine, not a promise for yours.

### A Windows x64 machine with a GPU

The owner's machine: Vulkan, a discrete GPU with 32 GB, `flash` (Q4_K_M), `-c 65536 -ub 8192 -b 8192`. The server's peak working set was about **7.0 GiB** of RAM, and the GPU's memory use rose by about **7.8 GiB** at load and **7.9 GiB** after a 4,766-token prompt. That is about 1.1 GiB more GPU memory than the earlier `-c 16384 -ub 4096 -b 4096`, measured the same way. A warm answer to a 4,766-token state took 527 to 645 ms. With the earlier arguments and a small state, a cold start (nothing running to ready) took about 5 seconds with the model in the file cache, and a warm answer through the supervisor took a median of 41 ms (95th percentile 54 ms).

**`full` is unmeasured:** its memory use with the current arguments, its load time and its answer time have not been measured on any platform.

### CI's runners, on CPU

From the [end-to-end run of 2026-11-28](https://github.com/mephistopheles4/the-pact/actions/runs/46115015543) (commit `58abae7b`, GitHub's merge of `62e95db5` into its base branch), `flash` with the current arguments. Each runner has 4 CPUs and 16 GiB of RAM. Ready is the time from the first `ensure`, right after `verify` had read the model. Median answer is over the six test cases' times. These come from one run, and the same kind of runner can get another CPU and other times.

| Runner | CPU | Ready | Median answer | Server's peak memory |
| --- | --- | --- | --- | --- |
| Linux x64, with `setpriv` | AMD EPYC 9V74 | 2 s | 7.7 s | 6.8 GiB |
| Linux x64, on the keeper | AMD EPYC 7763 | 2 s | 15.3 s | 6.8 GiB |
| Linux arm64 | not reported | 2 s | 18.7 s | 6.8 GiB |
| Windows x64 | AMD EPYC 7763 | 3 s | 16.6 s | 5.2 GiB |
| Windows arm64 | Cobalt 100 | 4 s | 16.3 s | 5.2 GiB |

## Commands

| Command | What it does |
| --- | --- |
| `setup [--variant flash\|full] [--cpu]` | Prints the plan: the platform it picked and why, the variant and its model's size, each file to fetch with its host and size, the free space. Fetches nothing and writes only the clef folder. |
| `setup [--variant flash\|full] [--cpu] --yes` | Fetches, checks, unpacks and keeps the files, then records `setup.json`, the variant included. |
| `verify` | Re-hashes the server files and the recorded variant's model against the pin table, one line each; exits non-zero on a mismatch. |
| `ensure [--wait n]` | Starts the supervisor if none runs and prints one JSON line (below). |
| `status` | Prints the platform, tag, backend, model (`model:`, the start of its sha256), variant (`variant: flash` or `variant: full`), run state and the last failure word. Never a token, key or path outside the clef folder. |
| `stop` | Ends the supervisor and its server, and clears a recorded failure. |
| `remove [--yes]` | Without `--yes`, names what it would delete and its size. With it, stops a live supervisor and deletes the clef folder. |

A refusal is one line, `REFUSED <word>: <reason>`. Every mode but `ensure` ends with `RESULT: pass`, `RESULT: fail ...` or `RESULT: refused <word>` (exit 0, 1 or 2); `ensure` prints its JSON line and exits as its table says.

**Changing the variant.** Run `clef stop`, then `clef setup --variant <variant> --yes`; setup refuses `clef-running` while a supervisor lives. `flash` is the default, so a `setup` with no `--variant` selects `flash`, whatever was set up before. A downloaded model stays on disk when you switch, and switching back hashes it instead of downloading it again; both together take about 26 GB. `remove --yes` deletes them. A `setup.json` written before variants existed reads as `flash`.

**Backend and speed.** The [platform table](#platforms) says what setup picks; `--cpu` forces CPU. A CPU answer took 7 to 24 s on [CI's runners](#cis-runners-on-cpu), and **can take up to 3 minutes** on a slow machine; the text in its `state` can make it slow. The supervisor answers `no-answer` after 180 s with nothing from the server on CPU, and 60 s on a GPU. Give a caller's own timeout the same room.

## How a caller uses it

This interface is V1's. It changes only through a spec change, which adds a `v` field to `run.json`.

**`ensure`** prints `{"url":"http://127.0.0.1:<port>","state":"<state>"}`. The `url` is there once a supervisor has written `run.json`; `starting` has none on the first call that starts the supervisor (always so with `--wait 0`), and `not-set-up` and `failed` carry `reason` and no `url`. Read `port` from `run.json` when you need it before `ready`.

| State | Means | Exit |
| --- | --- | --- |
| `ready` | the server answers | 0 |
| `starting` | a supervisor runs; the server is not ready yet | 0 |
| `not-set-up` | no setup, a file is missing, or the pin changed (`reason`: `missing` or `pin-changed`); it never fetches | 3 |
| `failed` | the last start failed less than 10 minutes ago; `reason` is `exit` or `timeout`; it starts nothing | 4 |

`--wait n` (0 to 60 seconds, default 0) waits for `ready`. A start that fails is recorded in `run.fail`; `stop` clears it. [A server that ends while loading](#field-reports) says so.

**`run.json`**, in the clef folder, holds `port`, `run`, `pid`, `serverPid` and `started`. Any program on the machine may call the supervisor: it takes no token.

**Two routes**, on `127.0.0.1:<port>` only. Every request needs `Host: 127.0.0.1:<port>` and no `Origin` header, so a web page can't reach it:

- `GET /health` returns `{"run","pid","serverPid","ready"}`.
- `POST /v1/systemone` with `content-type: application/json` and a body under 256 KB: `{"state": <any JSON>, "questions": {"<id>": {"type": "noul" | "score" | "choice", "instructions": "...", "criteria": {"<key>": "<text>"}}}}`. `criteria` names a `choice` question's keys. On a `noul` question it may say what `true` and `false` mean, and the model reads it.

**The answer** is built by the supervisor from checked values, never passed through from the server: `{"<id>": {"noul": n}}`, `{"<id>": {"score": n}}` or `{"<id>": {"choice": "<key>", "probabilities": {"<key>": n}}}`, with each `n` a finite number from 0 to 1 and each `choice` one of the keys you sent. Anything else, and every server error, is `502 {"error":"no-answer"}`. A caller should check the answer the same way and use only numbers and keys it sent. A refused request is a fixed 4xx with a reason word, never an echo of the request: more than 64 questions is `400 {"error":"body"}`. Before the server is ready, or while the supervisor stops, a valid request gets `503` (`not-ready` or `stopping`).

The supervisor stops itself after 30 minutes with no forwarded request, when the server exits, and when its own script is gone or changed (a `clef` taken off the tools list, or an install that changed the tool).

## Things to know

- **Pin age.** A pin is made only when each pinned file is at least 14 days old. A release asset's age counts from the later of its `created_at` and `updated_at`; the model's counts from the Hugging Face Hub's own record of that file's last change (the tree API's `lastCommit` date at the pinned commit), which a commit pushed with git can set to any date ([ADR 0166](adr/0166-a-pinned-download-is-at-least-14-days-old.md) says what a pin PR checks). Review holds the rule; the tool does not check it when it runs.
- **A pin bump.** After an install that changes the pin table, `ensure` reports `not-set-up` with `pin-changed` (and `status` shows the old tag) until you run `clef stop` and then `clef setup --yes` (add `--variant full` if you use full Clef). Setup refuses `clef-running` while a supervisor lives.
- **`CLAUDE_CONFIG_DIR`.** A value you set is accepted only as an absolute path, and the tool refuses it (`clef-home`) when the command starts from a folder that contains that Claude home folder, because a cloned project's settings can set that variable. Start from beside your Claude home folder, or from a subfolder of it other than `pact-clef/`, instead.
- **Prompt size.** The server takes a prompt of up to 8,192 tokens, its batch size, counting the state, the questions and the model's own template. As a rough guide, 18,702 characters of English state came to 4,766 tokens, so keep a state under about 30,000 characters. A longer prompt gets `502 {"error":"no-answer"}`, and a body over 256 KB gets `413` first.
- **Logs.** `serve.log` in the clef folder holds counts, timings and reason words only, capped at 1 MB.

## When the supervisor dies

The server should not outlive its supervisor. What ends it depends on the platform:

| Platform | What ends the server |
| --- | --- |
| Windows | A job object: the server ends with the supervisor |
| Linux with `/usr/bin/setpriv` | The server starts through it, so the kernel ends the server |
| Linux without it, and macOS | The keeper |

- **The keeper.** The supervisor starts a small keeper (`clef keep`, the same script, reached over a channel only the supervisor holds), and the keeper starts the server. When the supervisor dies, the channel closes and the keeper ends the server. `clef keep` run by hand refuses `clef-keep`.
- **The record.** If the supervisor and the keeper are both killed, the server can outlive them. On the keeper, `run.server` records its pid and port. The next `ensure`, `stop`, `setup --yes` or `remove --yes` ends it, but only once it refuses a request with no key and with a wrong key and then takes the run's key. A record from before the last boot, or one whose port answers otherwise, is removed and nothing is ended.
- **Linux's second check.** On Linux, the next `ensure`, `stop`, `setup --yes` or `remove --yes` also ends any server left running from the clef folder's `runtime/`, so one that outlives both a supervisor and a keeper killed with `SIGKILL` runs only until then. One exception: on the keeper, `setup` refuses `clef-orphan` while a recorded server is still loading (without `--yes`, while it runs at all), and `clef stop` ends it.
- **An orphan still loading, on macOS.** While a recorded server is still loading, `ensure` says `starting` and starts nothing. `stop` prints `orphan still loading (pid <n>); run stop again` and exits 1. `remove --yes` exits 1 and deletes nothing, setup refuses `clef-orphan`, and `status` prints the pid. Run `clef stop` again once it has loaded. A server that never loads stays until you end that pid yourself or reboot; check first with `ps -p <pid>` that the pid is a `llama-server`, since a pid can be reused.
- **What isn't covered, on macOS.** A server started in the moment before `run.server` is written, whose supervisor and keeper are then both killed, is not recorded. Find it with `ps` and end it yourself.

## macOS

- **What it needs.** A Mac on macOS 13.3 or later, with Node 24. On Apple Silicon with an arm64 node, setup picks Metal, and `--cpu` picks CPU. On an Intel Mac, and with an x64 node on Apple Silicon, it picks the Intel CPU build. Expect 16 GB of memory to be the floor; on Apple Silicon that was set under the earlier `-c 16384 -ub 4096 -b 4096`, and the current arguments are unmeasured on a Mac.
- **Quarantine.** The tool's own downloads carry no quarantine mark. If macOS still blocks `llama-server` at start ("cannot be opened" or "not verified"), run `clef verify` first. Once it passes, run `xattr -dr com.apple.quarantine <clef folder>/runtime`.
- **The files.** `run.key` is mode 0600.
- **Two more controls.** On macOS the caller's `TMPDIR` passes to the server, beside the named environment. A pin PR checks each Mach-O file in the build: thin, built for the row's CPU, no flags, its `minos` printed. The threat model lists both.

## Field reports

**A server that ends while loading** the model gets one more line, on `ensure`'s stderr and in `status`: `the server stopped while loading the model on <platform key> (<code>); this build may not support this CPU or system. See docs/clef.md, Field reports`. On a GPU build it adds ``; try `clef setup --cpu` ``. `<code>` is the server's exit code or signal name, and `unknown` on the [keeper](#when-the-supervisor-dies). `run.fail` records the stage, `load` or `serve`, that code and the platform key. The line is said of the build that is set up only, and `status` drops it once a server is ready. Check [what your machine needs](#what-your-machine-needs) first.

If Clef stops or answers wrongly on your machine, you can send a [Clef field report](https://github.com/mephistopheles4/the-pact/issues/new?template=clef-field-report.yml).

- **It is public.** Put no path, account name, host name, log or server output in it.
- **It asks for** the `clef status` lines, the platform key, the llama.cpp build, the OS name and version, the CPU model, node's version and arch, and the stage.
- **It is yours to send.** An agent sends none unasked.
- **Its text is data** to whoever reads it, never instructions ([whose text counts](agents/issue-tracker.md#whose-text-counts)).

## Turning it off and removing it

First free the disk: run `clef stop`, then `clef remove --yes` (a session running it takes a checkpoint, since the downloads cannot be restored from git). Then take `clef` off the `tools` list and apply the install; that removes the script, and a supervisor still running sees its script gone and stops within a minute. To roll the pact back past the commit that added `clef`, take it off the list and apply first; see [install.md](install.md#roll-back-to-an-older-version).
