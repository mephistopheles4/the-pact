# The install is a Node bootstrap and a staged runner, with the checks in-process

`node gate/install.mjs` replaced `scripts/install.ps1`. The install no longer needs PowerShell, keeps every check the old script ran, and makes each of its own decisions a pure function with table tests.

- **Two processes.**
  - **The bootstrap, `gate/install.mjs`,** is the only file that runs from the working tree. It imports only `node:` built-ins and stays under 250 lines, which a test pins.
    - It refuses `NODE_OPTIONS`, any exec option and any git variable that redirects the repository.
    - It reads HEAD once and stages that commit's files through one batched `git cat-file`, checking each blob's id.
    - It starts the runner from the stage, with an allow-listed environment and a time limit.
    - It never runs `git status`, because status can run a clean filter. It counts dirty paths itself.
    - It never reads a remote address.
    - It refuses unless it is the file at `gate/install.mjs` in its clone, by real path, so a copy elsewhere in the clone never runs.
  - **The runner, `gate/install-run.mjs`,** runs from the stage only, so every line of it is committed code. It does what the old script did after staging: pin, render, seam A, the copy set, the plan, settings, the review output, apply, record and verify.
- **The checks run in-process.** The runner calls the render, seam A, project and review cores through their `check()`, keeping ADR 0032's five controls:
  - committed code only;
  - no inherited preload;
  - one time limit over the checks, which stops at `CHECKS DONE` before the first write;
  - a verdict that needs both parts;
  - only each check's own cleaned lines shown.
- **The decisions are pure.** `gate/install-core.mjs` holds every refusal as a `Refusal` with one rule id, and `gate/install-io.mjs` holds the reads and writes. The tables in `install-core.test.mjs` test the decisions in-process.
- **The command line is strict.** It accepts `--apply --commit <id>`, `--rendered-hash`, `--claude-home`, `--review-folder` and `--project-folder`, spelled exactly, with no prefix matching and no `--name=value` form. Nothing is read from the environment to set an option.
  - Every `--apply` is bound to the commit its dry run printed.
  - A folder option accepts only a full path in safe characters, never a network or device path.
- **The dry run prints the apply command,** runnable as typed, with each path single-quoted.
- **The same record.** `.pact-install.json` keeps its shape, so either installer can follow the other.
- **The Node floor is the current LTS, 24** (#153, D4 as amended at move 3). Node 24 has `context.source` and `JSON.rawJSON`, which the settings merge uses to keep an owner's numbers exact.
- **The old tests run the new script.** Every old install-tier case keeps its file and name and runs `gate/install.mjs` end to end (#166, on the owner's word, with the prune, #189, to decide which stay). The cases built on the old script's Node lookup, wrapper processes or PowerShell parsing check what the spec put in their place. The PowerShell-only cases in fast files became table rows through `moves.tsv`.

## Why

- **No PowerShell dependency.** The installer was the last thing that needed PowerShell 7 on Linux and macOS.
- **Most of an install's time was git, not PowerShell.** The old script started one `git cat-file` per blob. The bootstrap's single batch brought a dry run from about 8.7 s to about 1.8 s, both measured under load on the owner's machine.
- **Two processes keep the controls.** A process can't drop a preload it was started with, and a script run from the working tree isn't committed code. Starting the runner from the stage meets both, at the cost of one Node start.
- **Pure decisions are cheap to test.** A refusal is a table row at under 1 ms, not a whole install.

## Known limits

- **Two installs at once** are not guarded.
- **Leftover work folders.** A hard stop leaves its `pact-install-*` work folder in the temp folder, holding the rendered rules. The dry run counts other such folders and never deletes them, since one could belong to a running install. `docs/install.md` tells the owner to delete them.
- **Windows access lists.**
  - The work folder takes the temp folder's access list, so it is owner-only only when the temp folder is the usual per-user one.
  - The settings file is written to a new file in its folder and renamed into place, so a stricter list set on the file alone is replaced by the folder's.
- **The settings file is rewritten unencrypted,** the form Claude Code reads. Its Unix mode is kept, so a file an older install widened stays as it is; the dry run warns when other accounts can read it or the record.
- **A hard stop mid-write** can leave a `.pact-tmp` file beside the file it was replacing, holding the new bytes. The next apply refuses before any write, naming it.
- **A mapped drive, or a link to a share,** passes the path checks. Only a path typed as a network or device path refuses.
- **A preload already inside the bootstrap's own process,** for example a Node built with one, could fake what it sees. That is the same class as a deliberately altered install script.
- **macOS:** not yet run. The owner runs the suite and one dry run on the work Mac, or marks it untested.

## How this was decided

- **2026-10-09:** #153's spec revision 6 (comment 6079188332), signed off "simplify and sign-off". Built in #166 (PR #201, then the PR that folded in #167's cutover), with the owner's decisions on #166: fold the cutover in (option B), two owner applies, and the test move in place.
