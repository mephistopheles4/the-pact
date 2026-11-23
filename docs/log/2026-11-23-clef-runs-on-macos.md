# Clef runs on macOS, and the gate gains `gate-macos`

PACT-82, [spec 0003](../spec/0003-clef-macos.md). `clef` was refused on macOS. It now sets up and serves on Apple Silicon, with Metal or with `--cpu`, from llama.cpp b12211's macOS arm64 build. Intel Macs are still refused.

macOS has no way to end a child when its parent dies. So on macOS the supervisor forks a keeper, which starts the server and ends it when the supervisor's channel closes. A record, `run.server`, lets the next `ensure`, `stop`, setup or `remove` end a server whose supervisor and keeper were both killed, but only once the server refuses a request with no key and with a wrong key and then takes the run's key. The tar reader passes the pax headers macOS's tar writes. The pin step checks each Mach-O file.

The gate workflow gains `gate-macos`, and Test evidence becomes three jobs ([ADR 0170](../adr/0170-test-evidence-and-installs-rely-on-three-ci-jobs.md)). `gate/tests/macos-skips.txt` lists the cases that can't run on macOS. `gate-macos` plants a real Claude folder for its dry run, as `gate-windows` does, and the spec's M7 now says so: it runs the install against a real folder, which makes the dry run stricter. A last step, `.github/scripts/clef-smoke.mjs`, runs the pinned macOS server once with `--device none --version`.

**Rolling back:** revert the PR. Setup on macOS refuses again, and the workflow goes back to two jobs.
