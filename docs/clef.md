# Clef, the local decision runner

`clef` is an opt-in pact tool. It runs Clef, a small local decision model, with a pinned `llama-server` build and a pinned model file, on your machine, with no Ollama. Off by default: put `clef` on the `tools` list and apply the install, and `~/.claude/pact/tools/clef.mjs` appears. The install copies that one script and nothing else; setup fetches the rest.

The design is [spec 0002](spec/0002-clef-runner.md); this page is for the owner and for anyone who turns it on. Every command is `node <Claude home>/pact/tools/clef.mjs <mode>`.

## What it fetches, and how much room it needs

Only `clef setup --yes` fetches anything, and only these, each checked by size and sha256 before it is kept:

- **A llama.cpp server build** (tag `b12211`, MIT license) from `github.com/ggml-org/llama.cpp`, 23 to 38 MB, one archive for your platform. The license files the pin table names are kept beside it: llama.cpp's `LICENSE` on Linux, and on Windows only `LICENSE-LLVM-OpenMP` (the Windows archive's own llama.cpp license is not yet pinned; the ticket that first runs setup checks it).
- **The Clef-Flash model** (`Clef-Flash-Q4_K_M.gguf`, Apache-2.0 per its model card) from `huggingface.co/ggml-org/Clef-Flash-GGUF`, 6.7 GB, at one pinned commit.

Plan for about **7.6 GB** of free disk on the drive that holds your Claude home folder: setup refuses when the model, the archive, the unpacked files and a 10% margin do not fit. Downloads redirect only to a fixed list of hosts, over `https:` only. Everything lands in `<Claude home>/pact-clef/`, which no install writes or deletes.

RAM and VRAM: not yet measured. The ticket that first runs it on the owner's machine records them.

## Commands

| Command | What it does |
| --- | --- |
| `setup [--cpu]` | Prints the plan: the platform it picked and why, each file with its host and size, the free space. Fetches nothing and writes only the clef folder. |
| `setup [--cpu] --yes` | Fetches, checks, unpacks and keeps the files, then records `setup.json`. |
| `verify` | Re-hashes every kept file against the pin table, one line each; exits non-zero on a mismatch. |
| `ensure [--wait n]` | Starts the supervisor if none runs and prints one JSON line (below). |
| `status` | Prints the platform, tag, backend, run state and the last failure word. Never a token, key or path outside the clef folder. |
| `stop` | Ends the supervisor and its server, and clears a recorded failure. |
| `remove [--yes]` | Without `--yes`, names what it would delete and its size. With it, stops a live supervisor and deletes the clef folder. |

A refusal is one line, `REFUSED <word>: <reason>`. Every mode but `ensure` ends with `RESULT: pass`, `RESULT: fail ...` or `RESULT: refused <word>` (exit 0, 1 or 2); `ensure` prints its JSON line and exits as its table says.

**Backend and speed.** Setup picks Vulkan when it finds the Vulkan loader (a file check; nothing runs), else CPU; `--cpu` forces CPU. On CPU a call takes about 2 seconds, so people without a GPU are expected to leave the tool off.

**Platforms.** Windows x64 is the target. Linux x64 is built and unit-tested in CI and has not been run end to end; macOS is not supported.

## How a caller uses it

This interface is V1's. It changes only through a spec change, which adds a `v` field to `run.json`.

**`ensure`** prints `{"url":"http://127.0.0.1:<port>","state":"<state>"}` and never a token. The `url` is there once a supervisor has written `run.json`; `starting` has none on the first call that starts the supervisor (always so with `--wait 0`), and `not-set-up` and `failed` carry `reason` and no `url`. Read `port` from `run.json` when you need it before `ready`.

| State | Means | Exit |
| --- | --- | --- |
| `ready` | the server answers | 0 |
| `starting` | a supervisor runs; the server is not ready yet | 0 |
| `not-set-up` | no setup, a file is missing, or the pin changed (`reason`: `missing` or `pin-changed`); it never fetches | 3 |
| `failed` | the last start failed less than 10 minutes ago; `reason` is `exit` or `timeout`; it starts nothing | 4 |

`--wait n` (0 to 60 seconds, default 0) waits for `ready`. A start that fails is recorded in `run.fail`; `stop` clears it.

**The token** is in `<clef folder>/run.json`, with `port`, `run`, `pid`, `serverPid` and `started`. Read it in the calling program when you need it; never print, log, post it or put it on a command line.

**Two routes**, on `127.0.0.1:<port>` only. Every request needs `Authorization: Bearer <token>` and `Host: 127.0.0.1:<port>`, and no `Origin` header:

- `GET /health` returns `{"run","pid","serverPid","ready"}`.
- `POST /v1/systemone` with `content-type: application/json` and a body under 256 KB: `{"state": <any JSON>, "questions": {"<id>": {"type": "noul" | "score" | "choice", "instructions": "...", "criteria": {"<key>": "<text>"}}}}`. `criteria` is for `choice` only.

**The answer** is built by the supervisor from checked values, never passed through from the server: `{"<id>": {"noul": n}}`, `{"<id>": {"score": n}}` or `{"<id>": {"choice": "<key>", "probabilities": {"<key>": n}}}`, with each `n` a finite number from 0 to 1 and each `choice` one of the keys you sent. Anything else, and every server error, is `502 {"error":"no-answer"}`. A caller should check the answer the same way and use only numbers and keys it sent. A refused request is a fixed 4xx with a reason word, never an echo of the request: more than 64 questions is `400 {"error":"body"}`. Before the server is ready, or while the supervisor stops, a valid request gets `503` (`not-ready` or `stopping`).

The supervisor stops itself after 30 minutes with no forwarded request, when the server exits, and when its own script is gone or changed (a `clef` taken off the tools list, or an install that changed the tool).

## Things to know

- **Pin age.** A pin is made only when each pinned file is at least 14 days old. A release asset's age counts from its `created_at` and `updated_at`; the model's counts from the Hugging Face Hub's own record of that file's last change (the tree API's `lastCommit` date at the pinned commit). Review holds the rule; the tool does not check it when it runs.
- **A pin bump.** After an install that changes the pin table, `ensure` reports `not-set-up` with `pin-changed` (and `status` shows the old tag) until you run `clef stop` and then `clef setup --yes`. Setup refuses `clef-running` while a supervisor lives.
- **`CLAUDE_CONFIG_DIR`.** A value you set is accepted only as an absolute path, and the tool refuses it (`clef-home`) when a session starts from a folder that contains it, because a cloned project's settings can set that variable. Start the session from beside it, or from a subfolder of it other than `pact-clef/`, instead.
- **Linux.** Setup refuses a machine without `/usr/bin/setpriv` (`clef-setpriv`); it keeps the server from outliving the supervisor.
- **Logs.** `serve.log` in the clef folder holds counts, timings and reason words only, capped at 1 MB.

## Turning it off and removing it

First free the disk: run `clef stop`, then `clef remove --yes` (a session running it takes a checkpoint, since the downloads cannot be restored from git). Then take `clef` off the `tools` list and apply the install; that removes the script, and a supervisor still running sees its script gone and stops within a minute. To roll the pact back past the commit that added `clef`, take it off the list and apply first; see [install.md](install.md#roll-back-to-an-older-version).
