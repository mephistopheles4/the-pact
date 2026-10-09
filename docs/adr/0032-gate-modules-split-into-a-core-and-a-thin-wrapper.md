# Gate modules split into a core and a thin wrapper

Each of the four gate modules the install runs (the renderer, seam A, the project install and the review output) is two files: `gate/<m>-core.mjs`, which holds the check, and `gate/<m>.mjs`, a thin wrapper that runs it. The install still runs the wrapper, by the same name, with the same arguments, output and exit code.

- **The core** exports one function, `check(argv)`. It returns `{ lines, failed }`: the report's lines with the `RESULT:` line last, and whether it failed. It holds the check's code byte for byte as it was, and the old `main`'s try/catch, so any throw is still an `internal` failure, never a pass.
- **The wrapper** is four statements: import `check`, call it with `process.argv.slice(2)`, write the lines to stdout, and set the exit code. A test holds each wrapper to exactly those four.
- **A core does nothing when imported.** It touches no file, starts no process, and reads neither the environment nor the OS user details until `check()` is called. The import guard (`gate/tests/cores.test.mjs`) imports each core in a child under a preload, `gate/tests/fixtures/import-trap.mjs`. While armed, the preload makes those calls throw and records each one, so a core that catches the throw is still caught. A call counts only when module code made it, since Node's own loader reads `process.env` during an import.
- **A core never prints, exits or leaves work behind.** A source check bans `process.stdout`, `process.stderr`, `process.exit`, `process.exitCode`, `process.on(`, `console.`, the timers, `queueMicrotask` and `node:fs/promises` in a core's text. It is a backstop, not the control: an alias gets past a text search. The control is the install's own two-part check, the exit code and the last line, and the security route on every gate edit.
- **Missing cores fail closed.** If a core is missing or fails to load, node exits non-zero with no `RESULT:` line. The install checks the time limit, then the exit code, then the last line, so it refuses on the exit code. A test installs from a commit with seam A's core deleted and sees it refuse.
- **The install script didn't change.** It stages every gate file from HEAD except the tests, so the cores come with the wrappers, and its gate fingerprints list them.
- **Tests find a module's text in its own files.** A test that reads or plants a module's text looks in `<m>.mjs` and `<m>-core.mjs` and asserts its target occurs exactly once across the two (`moduleFiles`, `moduleMatch` and `plantModule` in `gate/tests/helpers.mjs`). A test that copies the gate copies every file in it outside the tests.
- **The tests call the cores in-process (#156).** `gate/tests/gate-run.mjs` runs a core's `check` in the test process and returns what a child run of its wrapper gives. `renderStage`, `runSeamA` and the render tables use it. A parity guard, `gate/tests/parity.test.mjs`, runs a pass, two failures and a usage error per module both ways, the child as the install starts it, and requires the same bytes and an exit code equal to `failed`. It refuses, as a failed test, when `NODE_OPTIONS` is set or the process was started with a preload option. It doesn't refuse any option at all, as control 2 below does, because node's test runner passes its own options to every test file. Control 2 binds an installer, not a test.

## What an in-process caller must keep

The cores are what a Node install script (#153) could call in-process. Run that way, a check loses five controls the install gives it today. An in-process caller must keep each one or rebuild it:

1. **Committed code only.** The install runs each check from a staged copy of HEAD's gate files, with the stage as the working folder, never from the clone's working tree.
2. **No inherited preloads.** The install removes `NODE_OPTIONS` before it starts each check, so nothing preloaded can patch file reads under it. An in-process caller can't remove a preload from its own process after start-up, so it must refuse to run a check when:
   - **`NODE_OPTIONS` is set at all** in its own environment, since options given there never appear in `process.execArgv`;
   - **`process.execArgv` holds any option at all**, not only the preload flags, so a short form, a `=value` form or a flag added in a later Node can't slip past a list.

   It also passes any child process a check starts an environment without `NODE_OPTIONS`, as seam A's pinned check already does.
3. **A time limit.** A hung check is stopped, and the install refuses.
4. **A two-part verdict.** The install refuses unless the exit code is 0 and the last line is `RESULT: pass`. An in-process caller must refuse unless `failed` is false and the last line is `RESULT: pass`.
5. **Only the check's own lines are shown, and not all of them.** The install never shows what a check writes to stderr, where a load error would name the module's full local path. It drops the project check's `ROOT` line, the project's real path, before it shows anything. An in-process caller must never print or relay a thrown error's text, and must drop `ROOT` lines before it shows `lines`.

## Why

- **Every gate-module test started a node process.** About 45 ms per case, 180 ms for a seam A case. At the owner's "5k of them", child runs alone would cost about a minute. A core lets #140's T10 call the check in-process, for under a millisecond per case without files.
- **A separate file, not an entry-point test in one file.** Deciding "am I the entry point" compares paths. On Windows those can differ by case, short names or links, and a wrong answer prints nothing. A separate core file has no such test.
- **No check changes what it accepts or refuses.** The split moves code; it doesn't edit it. Before and after, each wrapper gave the same stdout and exit code on fixed pass, fail, usage and crash cases, byte for byte, and the full suite matched the T1 baseline through the compare with no map line added.
- **A test that planted into a module could go hollow.** Several hook tests used a plain `replace`, which does nothing when the marker isn't there. After a split they would have planted nothing and passed for the wrong reason. Finding each target in the module's own files, exactly once, makes a moved or missing target fail the test instead.

## How this was decided

- **2026-10-08** in mephistopheles4/the-pact#140, spec revision 10, signed off by the owner. The owner chose "Cores now" (D2), after the session's estimate that in-process rows save about 10 s of `fast` today and need a security-route change to gate code. Built in #155 (T9), on the security route.
- **Rollback.** T9 reverts on its own, once T10 is reverted: T10's runners import the cores.
