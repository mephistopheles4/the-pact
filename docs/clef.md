# `clef`, the local decision model's runner

`clef` is an opt-in pact tool. It runs Clef, a small local decision model, with a pinned `llama-server` build and a pinned model file, on your machine, with no Ollama. It serves one of two models at a time: Clef-Flash (`flash`, the default) or full Clef (`full`, a larger model). Off by default: put `clef` on the `tools` list (in Scriptorium, pick a Clef model under **Install a decision-one model**) and apply the install, and `~/.pact/tools/clef.mjs` appears. The install copies that one script and nothing else; setup fetches the rest.

The design is [spec 0002](spec/0002-clef-runner.md), and [spec 0011](spec/0011-coverage-hint.md#s9-full-clef-in-clef) adds full Clef; this page is for the owner and for anyone who turns it on. Every command is `node ~/.pact/tools/clef.mjs <mode>`; below, `clef <mode>` is short for it.

## What it fetches, and how much room it needs

Only `clef setup --yes` fetches anything, and only these, each checked by size and sha256 before it is kept:

- **A llama.cpp server build** (tag `b12211`, MIT license) from `github.com/ggml-org/llama.cpp`, 23 to 38 MB, one archive for your platform. The license files the pin table names are kept beside it: llama.cpp's `LICENSE` on Linux, and on Windows only `LICENSE-LLVM-OpenMP`, since the Windows archive holds no llama.cpp `LICENSE`. That license is the repository's own file at the pinned tag, [`LICENSE` at b12211](https://github.com/ggml-org/llama.cpp/blob/b12211/LICENSE) (MIT; byte for byte the file the Linux archive carries, sha256 `94f29bbe…`).
- **One model**, the variant you pick, at one pinned commit, Apache-2.0 per its model card:

| Variant | File | From | Size | Free disk to plan for |
| --- | --- | --- | --- | --- |
| `flash` (default) | `Clef-Flash-Q4_K_M.gguf` | `huggingface.co/ggml-org/Clef-Flash-GGUF` | 6.7 GB | about **7.6 GB** |
| `full` | `Clef-Q4_K_M.gguf` (the 27B) | `huggingface.co/ggml-org/Clef-GGUF` | 19.5 GB | about **22 GB** |

The free disk is on the drive that holds your Claude home folder: setup refuses when the model, the archive, the unpacked files and a 10% margin do not fit. Downloads redirect only to a fixed list of hosts, over `https:` only. Everything lands in the clef folder, `<Claude home>/pact-clef/`, which no install writes or deletes.

RAM and VRAM for `flash`, measured on the owner's Windows machine (Vulkan, a discrete GPU with 32 GB, Q4_K_M, `-c 65536 -ub 8192 -b 8192`): the server's peak working set was about **7.0 GiB** of RAM, and the GPU's memory use rose by about **7.8 GiB** at load and **7.9 GiB** after a 4,766-token prompt. That is about 1.1 GiB more GPU memory than the earlier `-c 16384 -ub 4096 -b 4096`, measured the same way. CPU and Metal are not measured under these arguments. A warm answer to a 4,766-token state took 527 to 645 ms. With the earlier arguments and a small state, a cold start (nothing running to ready) took about 5 seconds with the model in the file cache, and a warm answer through the supervisor took a median of 41 ms (95th percentile 54 ms).

**`full` is unmeasured:** its memory use with the current arguments, its load time and its answer time have not been measured on any platform.

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

**Backend and speed.** Setup picks Vulkan when it finds the Vulkan loader (a file check; nothing runs), else CPU; `--cpu` forces CPU. On CPU a call takes about 2 seconds, so people without a GPU are expected to leave the tool off.

**Platforms.** Windows x64 is the target. Linux x64 is built and unit-tested in CI and has not been run end to end. macOS arm64 (Apple Silicon) is built and tested in CI on macOS 15, on CPU with a stub server, and has not been run end to end on Metal or on CPU; [macOS](#macos) says what differs there.

## How a caller uses it

This interface is V1's. It changes only through a spec change, which adds a `v` field to `run.json`.

**`ensure`** prints `{"url":"http://127.0.0.1:<port>","state":"<state>"}`. The `url` is there once a supervisor has written `run.json`; `starting` has none on the first call that starts the supervisor (always so with `--wait 0`), and `not-set-up` and `failed` carry `reason` and no `url`. Read `port` from `run.json` when you need it before `ready`.

| State | Means | Exit |
| --- | --- | --- |
| `ready` | the server answers | 0 |
| `starting` | a supervisor runs; the server is not ready yet | 0 |
| `not-set-up` | no setup, a file is missing, or the pin changed (`reason`: `missing` or `pin-changed`); it never fetches | 3 |
| `failed` | the last start failed less than 10 minutes ago; `reason` is `exit` or `timeout`; it starts nothing | 4 |

`--wait n` (0 to 60 seconds, default 0) waits for `ready`. A start that fails is recorded in `run.fail`; `stop` clears it.

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
- **Linux.** Setup refuses a machine without `/usr/bin/setpriv` (`clef-setpriv`); it keeps the server from outliving the supervisor.
- **Prompt size.** The server takes a prompt of up to 8,192 tokens, its batch size, counting the state, the questions and the model's own template. As a rough guide, 18,702 characters of English state came to 4,766 tokens, so keep a state under about 30,000 characters. A longer prompt gets `502 {"error":"no-answer"}`, and a body over 256 KB gets `413` first.
- **Logs.** `serve.log` in the clef folder holds counts, timings and reason words only, capped at 1 MB.

## macOS

- **What it needs.** An Apple Silicon Mac on macOS 13.3 or later (the build's floor), with an arm64 Node 24. Expect 16 GB of memory to be the floor; that was set under the earlier `-c 16384 -ub 4096 -b 4096`, and the current arguments are unmeasured on a Mac. Setup picks Metal, and `--cpu` picks CPU. Intel Macs, and an x64 node under Rosetta, are refused with `clef-platform`.
- **Quarantine.** The tool's own downloads carry no quarantine mark. If macOS still blocks `llama-server` at start ("cannot be opened" or "not verified"), run `clef verify` first. Once it passes, run `xattr -dr com.apple.quarantine <clef folder>/runtime`.
- **The files.** `run.key` is mode 0600.
- **The keeper.** macOS has no way to end a child when its parent dies. So the supervisor starts a small keeper (`clef keep`, the same script, reached over a channel only the supervisor holds), and the keeper starts the server. When the supervisor dies, the channel closes and the keeper ends the server. `clef keep` run by hand refuses `clef-keep`.
- **The record.** If the supervisor and the keeper are both killed, the server can outlive them. `run.server` records its pid and port. The next `ensure`, `stop`, `setup --yes` or `remove --yes` ends it, but only once it refuses a request with no key and with a wrong key and then takes the run's key. A record from before the last boot, or one whose port answers otherwise, is removed and nothing is ended.
- **An orphan still loading.** While a recorded server is still loading, `ensure` says `starting` and starts nothing. `stop` prints `orphan still loading (pid <n>); run stop again` and exits 1. `remove --yes` exits 1 and deletes nothing, setup refuses `clef-orphan`, and `status` prints the pid. Run `clef stop` again once it has loaded. A server that never loads stays until you end that pid yourself or reboot; check first with `ps -p <pid>` that the pid is a `llama-server`, since a pid can be reused.
- **Two more controls.** On macOS the caller's `TMPDIR` passes to the server, beside the named environment. A pin PR checks each Mach-O file in the build: thin arm64, no flags, its `minos` printed. The threat model lists both.
- **What isn't covered.** A server started in the moment before `run.server` is written, whose supervisor and keeper are then both killed, is not recorded. Find it with `ps` and end it yourself.

## Turning it off and removing it

First free the disk: run `clef stop`, then `clef remove --yes` (a session running it takes a checkpoint, since the downloads cannot be restored from git). Then take `clef` off the `tools` list and apply the install; that removes the script, and a supervisor still running sees its script gone and stops within a minute. To roll the pact back past the commit that added `clef`, take it off the list and apply first; see [install.md](install.md#roll-back-to-an-older-version).
