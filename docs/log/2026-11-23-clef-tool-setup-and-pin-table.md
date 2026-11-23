# The clef tool: the pin table, setup and verify

PACT-63, T1 of spec 0002 (a pinned llama-server runner for Clef). It puts `clef` on the pact tools list, off by default, and adds its script, `claude/tools/clef.mjs`, with the pin table, `setup` and `verify`. It runs no server: the supervisor is T2.

`PACT_TOOLS` gains `clef` in `gate/shared.mjs` and in the install's copy, in the order `poster`, `cleaner`, `clef`, `gh-app`. The dry run's tools block lists it and warns when it is on: a download of about 25 to 39 MB from GitHub and about 6.7 GB from Hugging Face at setup, then a server on `127.0.0.1`. Scriptorium's row says the same. The renderer adds no rules-file text for it, so a tool with no part in `TOOL_PARTS` is skipped, as `gh-app` is. The cloud copy never installs it.

The pin table names one llama.cpp build (b12211, published 2026-11-08) and one Clef-Flash model commit, with the size and sha256 of each archive, each kept file and the model. The shape check fixes both source repos, the tag shape, one plain segment for each asset and model file name, full commit and hash shapes, and a path check on every file name. URLs are built from the table and checked after building; redirects go only to the listed hosts, over `https:`, at most four times. A fetch stops at a byte past the pinned size, hashes the whole file from disk, and deletes it on any mismatch. The model fetch resumes with a `Range` request. The archive readers (zip, tar.gz) write only the entries the table names, never a link, and check each file again.

Three changes from the Test round. `CLAUDE_CONFIG_DIR` picks the Claude home folder only as an absolute path (a relative one is refused `clef-home`), and the clef folder is refused `clef-home` when, with links resolved, it lies inside the folder the command started from or its `runtime`, `models` or `partial` folder is a link; a cloned repo's own settings can set the variable, `prune` deletes in those folders, and later tickets run what lies under them. The plan names the clef folder, quoted. The start-folder check binds only a value from the environment (a session started in the home folder still works), runs on the nearest existing parent before anything is made, uses native real paths, refuses when the start folder does not resolve, and on Windows needs a drive letter, which also refuses a network path. The renderer's skip is a list, `TOOLS_WITHOUT_PART` (`gh-app`, `clef`), so any other tool with no part still fails the render. `setup --yes` hashes a file that is present at its pinned size before it skips it, and fetches it again on a mismatch; the dry run says only that the sizes match.

Two things the first real run of `gate/tests/clef-files-list.mjs` showed that the spec did not expect. The Windows archives hold no llama.cpp LICENSE, only `LICENSE-LLVM-OpenMP`, which is kept. The Linux archives hold five libraries under their sonames as links, which the build needs by those names and which are never written. A table row may therefore carry a fourth item: a copy name, under which the same bytes are kept as a regular file. The kept sets are large because the spec keeps every file in the executable's folder (52 to 53 files, 64 to 106 MB on Windows).

Why: the owner wants Ollama gone as Clef's runtime, with a small pinned runner the pact installs.

**Rolling back:** take `clef` off the tools list and apply, then revert the merge. The clef folder is left on disk; `clef remove --yes` (T2) or deleting it frees the space.

## Record

- The ticket: PACT-63 on Linear, and its parent PACT-61 (the spec, the design rounds and the checkpoint log).
- The pull request: see the ticket.
