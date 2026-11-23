# The clef supervisor: ensure, serve, stop, status and remove

PACT-64, T2 of spec 0002. `claude/tools/clef.mjs` gains the supervisor and five modes. It starts nothing on its own: only `ensure` starts it, and nothing runs at login or boot.

`ensure` takes `run.lock`, starts `clef serve` detached by `process.execPath` with no shell, and prints one JSON line (`ready`, `starting`, `not-set-up` with exit 3, `failed` with exit 4 inside ten minutes of a failed start). `serve` binds `127.0.0.1` on a port the OS picks, starts the server on another loopback port from `runtime/<tag>/` with a fixed argument list (the key in `run.key`, `--no-webui`, `--no-slots`) and a named environment, and answers only `GET /health` and `POST /v1/systemone` to a caller with the token, a `Host` of `127.0.0.1:<port>`, no `Origin`, a JSON content type and a body under 256 KB. It builds the reply itself from checked numbers and choices; the server's own text never reaches a caller (`502 no-answer` otherwise). It stops after 30 minutes with no forwarded request, when the server exits, and when its own script changes or goes (checked before each request and every minute). A live supervisor is one whose `run.json` pid is alive and whose `/health`, asked with the token, returns the same `run`, `pid` and `serverPid`.

The server is spawned non-detached, so on Windows the job object ends it with the supervisor. On Linux it starts through `/usr/bin/setpriv --pdeathsig KILL --`; `ensure`, `stop` and `setup` also end orphan servers under `<clef folder>/runtime/` found through `/proc`, only while holding `run.lock`. `setup` now refuses `clef-running` while a supervisor is live and `clef-setpriv` on Linux without `/usr/bin/setpriv`, and holds the lock while it works.

Builder picks. `remove` runs from the folder above the clef folder, since a working folder cannot be deleted on Windows; it retries the delete for a server that has just ended. A refused request's unread body is read and dropped for two seconds, so a caller sees the refusal and not a reset. Windows adds six variables (`HOMEDRIVE`, `HOMEPATH`, `LOGONSERVER`, `SYSTEMDRIVE`, `USERDOMAIN`, `USERNAME`) to every process it starts; none comes from the caller. The test seams are parameters of the exported functions: the server program, `pdeathsig`, the timings, the supervisor's script (`scriptUrl`), the supervisor command, the `/proc` root and the kill function.

Upstream facts, from the llama.cpp b12211 source (`common/arg.cpp`, `ggml/src/ggml-backend-reg.cpp`): `--api-key-file` reads one key per line; `--no-webui` is an alias of `--no-ui`; `--no-slots` turns the slots endpoint off; with no search path given, backends load only from the compile-time backend folder (if one is set), the executable's folder and the working folder, and `GGML_BACKEND_PATH` is the one environment name that adds a library, which the supervisor never passes.

**Rolling back:** take `clef` off the tools list and apply, then revert the merge. A running supervisor ends itself within a minute, because its script is gone. `clef stop` and `clef remove --yes` free the machine first.

## Record

- The ticket: PACT-64 on Linear, and its parent PACT-61.
- The pull request: see the ticket.
