# Fast test runs, no tests cut

**2026-10-08** — "The full suite" is one fail-closed command, `node gate/tests/run.mjs full`, and `fast` runs everything but the install tier (mephistopheles4/the-pact#140). The work is four tickets, #144 to #147, landing on one shared branch, `fast-tests-140`, and one PR, by the owner's word: "can you take care off getting all the tickets of 140 in one PR?"

## T1 (#144): the runner, with full and fast tiers

- **The tiers.** `full` is every top-level test file in `gate/tests/`. The install tier is every test file whose imports reach the install harness, or whose own text names the install script, written out or in pieces. The runner computes it from the sources on every run. `fast` is full minus the install tier. Today that is 36 files: 9 in the install tier and 27 in fast.
- **How it starts node.** It starts the Node running it with `--test`, `--test-concurrency=4` and an explicit file list, with `NODE_OPTIONS` and `NODE_TEST_CONTEXT` cleared. It needs no glob, so the Node 20 caveat and its PowerShell form are gone from AGENTS.md.
- **It fails closed.** An empty pick, an odd test-file name or a usage error exits 2 without starting node. A failed, killed or unstarted node exits 1. Its last line on stderr names the tier, the file count and the result.
- **Record mode.** `--record <file>` writes a scrubbed copy of the run outside the repo. The repo, home and temp folders and the user name become placeholders. If a local path survives, it writes nothing and exits 3.
- **The copy list** moved out of the install harness into `gate/tests/copy-list.mjs`, which the harness and the runner both import.
- **The smoke file.** The install's two happy-path cases moved, unchanged, from `install.test.mjs` into `install-smoke.test.mjs`.
- **Guards over the real tree.** Guard 1 checks the full tier against a listing the guard builds itself. Guard 3 checks that the smoke file exists and is in the install tier. Each has a planted bad case in the tests that it catches.
- **AGENTS.md** gains "Running the gate's tests": the two tiers and their commands, when the full suite runs, and that a changed-files run is never move-4 evidence. The probe floor names the runner and the copy list.
- **The Linux container** runs `run.mjs full --reporter tap`. See [ADR 0030](../adr/0030-the-gate-suite-runs-through-one-runner-in-named-tiers.md), linked from [ADR 0029](../adr/0029-the-gate-suite-runs-capped-on-the-current-node-lts.md).
- **No gate code changed.** No file in `gate/` outside its tests changed, and neither did the install script.

## T2 (#145): the everyday changed tier

- **The shape.** Re-timed quiet on the shared branch, `fast` took 50.1 s, under the spec's 60-second line. So `changed` is `fast` plus the tests the change can reach. It isn't the picks alone.
- **The changed set.** It's what differs from the merge-base of HEAD and `--base` (default `main`), staged or not, plus untracked files git doesn't ignore. A deletion or a rename counts by both paths.
  - **The base:** it's resolved to a commit before any other git call. A dash-led base exits 2.
  - **git's environment:** it runs without inherited `GIT_` variables, so a stray `GIT_DIR` can't point it at another repo.
- **The picks,** by the spec's rules:
  - **Tests and helpers:** a changed test runs itself, and a changed helper runs every test that reaches it through imports.
  - **Gate code** runs `full`.
  - **A payload path** runs the smoke file and every test that names the path.
  - **Any other path** runs the tests that name it.
  - **A path no rule maps** runs `fast` and is printed as unmapped.
  - **What "names" means:** a test names a path when its source, or a helper it imports, holds the path's file name or any run of two or more of its segments, written out or as string literals in a row.
- **The reasons print plainly.** T1's runner passed whole reasons through the odd-character filter, which turned `:` into `?`. Now only the names inside a reason are filtered.
- **AGENTS.md** says "while building, run `changed`", with the command in both shell forms. It replaces the interim rule's hand-picked file list.
- **Move 4's lenses found 17 things. 13 were fixed, 2 were documented, 1 was dismissed, and 1 went to the owner.** The fixes:
  - **The base and the repo:**
    - **The default base** is the branch `refs/heads/main`, so a tag named `main` can't stand in for it.
    - **The runner refuses with exit 2** unless it sits at the top of its own repo.
    - **A staged change counts** even when the working copy undoes it.
  - **The picks:**
    - **A tests-folder module** counts as named by a form holding its file name, so a test that starts it by path is picked.
    - **More than 2,000 changed paths** select every test.
  - **The tests:**
    - **The changed-set test** now moves `main` after branching, so it tells the merge-base from the base.
    - **The `unmapped:` filter** has a case that runs on Windows.
    - **A guard** checks AGENTS.md's while-building rule.
  - **The docs:** AGENTS.md and ADR 0030 say which changes still cost about a full suite, and point at #151. AGENTS.md says to read a `changed` record before posting it, since it names untracked files.
  - **Plants:** seven new plants each broke one fix and failed its test, and no other.
- **The final full suite (T2),** quiet, on aaaeb92: exit 0 in 381.8 s, 1,720 cases. Against the baseline: 0 gone, 0 changed, 2 moved (T1's) and 69 new.

## T5 (#154): tables, and the proof that no case is lost

Spec revision 10 on #140 redesigned the test architecture: cores, tables, one layer per file and a helper split, as tickets T5 to T10. T5 comes first, because every later ticket moves cases and needs the proof that none is lost. See [ADR 0031](../adr/0031-gate-bad-cases-are-table-rows-and-no-case-is-lost.md).

- **The baseline is committed.** `gate/tests/fixtures/baseline-140/baseline.tsv` is T1's canonical case list, sha256 `14af7916…`. The comment that posted it shows one name differently, the `cross-checks` NUL case, as `\^@` for `\u0000`. The file follows the test's real name, and its hash matches.
- **The lists beside it.**
  - **`moves.tsv`:** seeded with T1's two smoke moves, and T5's 51 table rows.
  - **`reporter-names.tsv`:** empty, not the 38 lines the ticket expected. Read the way T1 made the baseline, with each nested case's suite chain, every reported name matches.
  - **`env-cases.tsv`:** 17 cases: 8 that must pass on Linux and skip on Windows, and 9 the other way round.
- **The compare,** `gate/tests/baseline-compare.mjs <record>`, applies S4's rules to a record-mode junit run. It was first run on the branch tip before anything moved, under a quiet hold, and passed.
- **The table module,** `gate/tests/tables.mjs`, makes the base, row and base-after-rows tests, refuses a malformed table at load, and checks each row's rule ids against the module and the gate files it imports.
- **The first user.** `render-edits`' `EDIT_BAD` and `PATH_BAD` loops became the tables "render edit list" (20 rows) and "render block path" (31 rows). Each row's `why` is the old case's label, word for word. Every row trips exactly its one rule, which the old loops never checked: they asked only that the rule appear.
- **AGENTS.md** gains "Writing a gate test", and the probe floor names the table module, the compare, the baseline and its two lists.
- **The Linux container** now writes a junit record to a mounted `/out` folder, for the compare; the owner approved the change and the image rebuild. On Node 20, the four `node:sqlite` practice cases fail, and the junit report names no file. The owner chose "B, everything should be on LTS": no exception for the four, and the Linux compare waits on #149.
- **Found while building.**
  - **Repeated names.** Three `cross-checks` case names appear twice in the baseline, so the compare counts cases per name rather than treating names as unique.
  - **The row reader** first counted a regex literal as a closing bracket, so it lost track after three rows with `says` patterns. A test now covers that.
  - **The compare caught a real fault at move 4.** The first move-4 full run passed, but the compare failed all 51 rows: node's junit reporter names the file that called `test()`, and `table()` called it from inside `tables.mjs`. Now `table()` returns its tests and the test file registers them in a loop, a guard checks the loop, and the compare fails any case reported outside a top-level test file.
  - **Record mode's placeholders sit in failure text.** The Linux record's failure stacks hold `<repo>` and `<user>`, so the parser now skips a failure's body whole.
  - **Node 20's junit reporter names no file** for any case, so a Node 20 record can't be compared at all. That joins the four `node:sqlite` failures in waiting on #149.
- **Move 4's lenses found 19 things across five reports; the fixes:**
  - **The row reader** now counts only the `id` of an object directly in a table's `rows` array, in a call that heads a top-level registering loop. Before, an `id` in a base input or a plant counted, and so did a table inside a function that never runs.
  - **The record** must be one full-tier run that passed, with every case under `<repo>/gate/tests/`; a path that only ends like a test file no longer counts. Printed paths are filtered.
  - **The lists** are also checked for email addresses.
  - **The table module's tests** gained planted runners for a wrong rule in place of the right one, an `everyRow` check that fails, and exit codes and last lines that disagree.
  - **Two Claude-folder cases** in `env-cases.tsv` now must pass on Linux, where the image makes the folder; they passed there.
  - **Left as known limits:** a moved case is matched by name, not body, and the record holds no commit (ADR 0031).
- **The Linux-listed cases by name.** Until #149, a Linux run checks them by name in its record: all 10 passed at f713f00 and at efeab58.
- **The container's user is named `runner`.** At efeab58 one new compare test failed in the Linux image: the compare's own message "...the runner's full-tier pass" was withheld there, because the leak check treats the user's name as a word to hide. The compare still failed closed. Its fixed messages now avoid the word, and the test runs with `runner` among the names.
- **The final runs (T5),** quiet, at 749571f and b3abee6: the full suite passed in 386.3 s beside 381.8 s, with the compare passing (1,598 unchanged, 53 moved, 150 new, none gone); `fast` passed in 52.2 s beside 50.1 s.
- **No gate code changed.** No file in `gate/` outside its tests changed, and neither did the install script.

## T9 (#155): cores and thin wrappers

T9 is the one ticket in #140 that changes gate code, so it took the security route on its own. Each of the four gate modules the install runs became a core, `gate/<m>-core.mjs`, and a thin wrapper with the old name. See [ADR 0032](../adr/0032-gate-modules-split-into-a-core-and-a-thin-wrapper.md). The work went in three steps, never mixed.

- **Step 0, tests only (aa48666).** Every test that read or planted a module's text by file name now finds its target in the module's own files, `<m>.mjs` and `<m>-core.mjs`, and asserts it occurs exactly once. Gate copies take every file in `gate/` outside its tests, and the smoke test's list of the install's gate fingerprints comes from the committed gate folder.
  - **The reading.** The ticket said "in whichever `gate/*.mjs` file holds it". The helpers search the module's own two files instead, since some targets, such as the `RESULT:` line push, sit in all four modules.
  - **Four of the hook tests used a plain `replace`.** It plants nothing when the marker is gone, so after the split they would have passed for the wrong reason. All now assert exactly one.
  - **Seen to fail:** with every target removed from the four modules, 78 of the 83 changed reader and plant tests failed; the other 5 are absence checks. Temporary core files holding a moved piece, a second shared import and a dash failed those 5. The copy tests failed under the old fixed lists once a module imported a new sibling file. A git-ignored extra gate file failed the smoke list.
  - **The full suite,** quiet: passed in 386.5 s, and the compare matched T5's counts (1,598 unchanged, 53 moved, 150 new) with no map line added.
- **Step 1, the split (58d9505).** Each core is its old module byte for byte, apart from a header and `main`, which became `check()` and returns instead of printing. Each wrapper is four statements.
  - **Same output.** On 16 fixed cases, a pass, a fail, a usage error and an internal crash for each module, each wrapper's stdout, exit code and empty stderr matched the old module's byte for byte.
  - **The other readers moved with it.** `builder/build.mjs` reads the renderer's lists from `render-core.mjs`, and the builder page was rebuilt; its data didn't change. The two contracts, and scout's practice case for `DEFAULT_TOOLS`, cite `gate/seam-a-core.mjs`.
  - **scout was resealed.** Editing its contract broke the seal, which the pinned check reads, and seam A would have refused every install. The reseal changed only scout's `contract-digest` line.
  - **Left as they are:** the install script's comments that name `gate/seam-a.mjs` for `BANNED_SETTINGS` and the renderer for `CONFIGURABLE_AGENTS` (the install script may not change; noted on #153); AGENTS.md's install bullet, which names `gate/seam-a.mjs` as the check the install runs, still true of the wrapper; comments in other gate files that name a module; the usage strings, which name the command, the wrapper.
  - **Changed after move 4:** scout's practice case 3 asks about seam A's routing check in `gate/seam-a-core.mjs`, as case 5 already did for `DEFAULT_TOOLS`. The practice file isn't sealed.
  - **After the split,** a copy of the text scanner planted in the seam A core failed "seam-a.mjs holds no copy of a moved piece", under its unchanged name.
  - **The full suite,** quiet: passed in 416.3 s, with the same compare counts and no map line added.
- **Step 2, T9's own tests (5740d40).**
  - **The core import guard,** with eight planted cores, each caught: reading a file, reading one and catching the throw, reading one in a promise callback, starting a process, reading an environment variable, and reading the home folder, the OS user and the host name.
  - **Found while building:** Node's own module loader reads `process.env` during an import, so the first guard caught every real core. A call now counts only when a frame of module code is on the stack.
  - **The core source check,** with five planted bad cases: `console.log`, a stdout write, `process.exit`, `process.exitCode` and a timer.
  - **The wrapper cases.** Today's child-run cases cover seam A's four cells and most of the others; new cases fill the five empty cells: an internal crash in render, project and review, and project's pass and usage. A test holds each wrapper to its four statements.
  - **Fail closed:** an install from a commit with seam A's core deleted refuses on the check's exit code. With the old self-contained `seam-a.mjs` restored and the core still deleted, the install passed and the test failed.
- **No check changed what it accepts or refuses.**
- **Move 4's runs,** quiet, at d774b95: `full` passed in 438.6 s beside 381.8 s, and `fast` in 53.6 s beside 50.1 s. The compare passed: 1,598 unchanged, 53 moved, 183 new (T5's 150 and T9's 33), with no map line added. `full` gained an install case, about 10 s. The rest of the rise, from step 0's 386.5 s to step 1's 416.3 s and on, is not separated from machine load. The split adds one module load to each child run, which costs milliseconds. On Linux, Node 20, only the four #149 cases failed, and all 10 Linux-listed cases passed by name, as the owner chose until #149 lands.
- **Move 4's lenses found 13 things across five reports; the fixes:**
  - **ADR 0032's in-process controls.** An in-process caller now refuses when `NODE_OPTIONS` is set at all, or when `process.execArgv` holds any option: a preload set through the environment never shows in `execArgv`, and `-r` and `--import=<url>` slip past a list of four names. A fifth control says it never shows a check's stderr or error text, and drops the project check's `ROOT` line, as the install does.
  - **Deferred work at import.** A file read put off with `process.nextTick` got past the import guard, which lifted its trap as soon as the import finished. The driver now stays armed through an immediate and a 50 ms timer, and records a trap thrown in deferred work. Two more planted cores, a next tick and an immediate, are caught; the next-tick one passed before the fix.
  - **check(), called directly.** A test imports each core into the test process and checks the shape T10 will rely on: `lines` with the RESULT line last, `failed` to match, and the same answer on a second call. A core returning `failed: false` fails it.
  - **The smoke test's gate list is written out again,** now with the four cores, so a stray gate file fails it, as a planted one did. The step-0 version read the list from the folder, which a stray file would have grown with it.
  - **Recorded, not changed:** the existing child-run cases for each module's pass, fail, usage and crash cells are named on #155, and the stale install script comments are noted on #153.
- **The pick.** The owner picked "none" from the claim list alone. Against the QA pair's five findings, that was a mismatch (rule 1). After the walk-through, relayed by the lead session, the owner answered "confirmed and done". That confirmed both pre-filled answers (the review changed the decision; no crossings) and accepted scout's reseal, on the condition that the final run passed.
- **The final runs (T9),** quiet, at 47854d7: `full` passed in 446.1 s beside 381.8 s, and the compare passed (1,598 unchanged, 53 moved, 189 new, none gone, no map line added). On Linux, only the four #149 cases failed, and all 10 Linux-listed cases passed.

## T10 (#156): gate-module cases in-process

T10 changes tests only. The test helpers' gate-module runners call the T9 cores in the test process, and two guards hold that to what the install runs. See [ADR 0032](../adr/0032-gate-modules-split-into-a-core-and-a-thin-wrapper.md).

- **The runner.** `gate/tests/gate-run.mjs` runs a core's `check` and returns what a child run of its wrapper gives: stdout as the lines with a line feed after each, an empty stderr, and exit 1 when `failed`. A throw reaches the test; it is never turned into an exit code. `renderStage`, `runSeamA` and the render tables' runner call it.
- **The boundary.** The ticket names three runners, so test files that start a module through their own local runner were left as they are. That is 364 tests, with `render-edits` (93) and `render-config` (80) the largest; they are a follow-up option if `fast` needs more. The boundary was posted on #156 before the build.
- **379 tests changed how they run,** each with its name and assertions kept. 280 now run seam A in-process. The other 99 reach only the renderer in-process: the two render tables' 55 tests, and 44 that render their stage in-process but run seam A as a child. A temporary trap in the runner, never committed, counted them: every test that failed on it reached a core.
- **77 tests stay child runs,** each listed on #156 with its reason. A temporary preload outside the repo found them, and said how each child ran: T9's wrapper tests (16), a planted copy of a module (45, five of them also wrapper tests), a changed environment (3, one also a wrapper test), and a test preload (19, `render-edits`' six fault cases among them).
- **Seam A's wrapper pass cell stays a child run.** "seam A passes on the repo payload" used `runSeamA`, which would have moved it in-process. It now calls `childSeamA`, the helper's child runner, under its unchanged name and assertions.
- **The parity guard,** `gate/tests/parity.test.mjs`. For each module it runs a pass, two failures on different rules and a usage error, in-process and as the install runs the wrapper: from a staged copy of `gate/`, with the stage as the working folder and `NODE_OPTIONS` removed. Each input is built twice at the same path, so a check that writes meets the same empty target. The stdout must match byte for byte, and the exit code must equal `failed`.
  - **Seen to fail,** for each module, with a planted runner that drops a line and one that inverts `failed`.
  - **It refuses as a failure, never a skip,** when `NODE_OPTIONS` is set in any letter case, or the process was started with `--import`, `--require`, `-r`, `--loader` or `--experimental-loader`, in either form. `gate-run.test.mjs` starts it as a child with `NODE_OPTIONS` set, and directly with `--import`: every guarded test fails, and nothing skips. It doesn't refuse every option, as ADR 0032's control 2 does for an installer, because node's test runner hands each test file about thirty options of its own.
- **The fault-fixture guard,** `gate/tests/fault-fixtures.test.mjs`. No source file under `gate/tests/` outside `fixtures/` imports a fault fixture, the contained driver, or, as T9 suggested, the import trap and its driver. It reads static imports and exports, and the text inside `import( … )` and `require( … )`. A planted test file and a planted helper that import the render fault fixture each fail it, as do six other import forms. Handing a fixture to a child as `--import` passes it. A name built at run time and passed through a variable gets past it; like the core source check, it is a backstop.
- **The shared-state check.** T5's tables already rerun their base after the last row. A render table run in-process against a staged render core that keeps a count across calls, failing every passing render after the first, fails "base passes after the rows" and nothing else. The unplanted core passes all three tests.
- **AGENTS.md** says a case runs its module in-process through its core unless one of the four reasons holds, and that a test file never imports a fault fixture. The probe floor names `gate-run.mjs` with `gate-run.test.mjs`, the parity guard and the fault-fixture guard.
- **No gate code changed.** No file in `gate/` outside its tests changed, and neither did the install script.
- **Move 4's runs,** quiet, at 40550bf: `full` passed in 393.5 s beside 381.8 s. The compare passed with 1,598 unchanged, 53 moved and 257 new (T10's 68 on T9's 189), and no map line added. `fast` was timed alternately, twice each side: 40.9 s and 41.8 s after T10, against 53.0 s and 52.5 s at T9's tip. That is about 11.4 s saved, with T10's three new files included, beside S9's estimate of about 10 s. On Linux, Node 20, the parity guard passed, only the four #149 cases failed, and all 10 Linux-listed cases passed by name.
  - **The Linux stand-in for the compare.** The compare refuses a Node 20 record until #149 lands, so the Linux run is checked by name, as the owner chose at T5. Its record holds 1,908 cases, the same total as the Windows run the compare passed (1,598 + 53 + 257).
- **Move 4's lenses found 13 things across five reports; `data-lens` found none.** The fixes, each with a bad case seen to fail:
  - **Writes to stdout and stderr while a check runs.** The in-process runner reported an empty stderr, so three "never echoes" canaries read only stdout, where their child runs had read both. The runner now catches any stdout or stderr write made while a check runs, as a child run shows it: stdout writes ahead of the lines, and stderr as stderr, which `out` includes.
  - **The parity guard reads more.** It also compares the child's stdout with the in-process stdout the helpers read, not only with the lines, and fails when either side writes to stderr. New planted cases, per module: a runner that changes only that stdout, a runner that changes only its own exit code, and a wrapper that writes to stderr.
  - **The state check.** For each module, one process runs the pass, both failures, the usage error and the pass again, and requires the two passes to match. It covers the in-process cases outside tables, seam A's 280 above all. A staged seam A core that keeps a counter fails it.
  - **Config files can preload.** A probe on Node 24 showed that a preload set in a file named by `--experimental-config-file` loads, while `execArgv` shows only that option. The refusal now includes it and `--experimental-default-config-file`.
  - **The fault-fixture guard,** widened: it also flags any import of code under `fixtures/`, which could relay a fixture, and it reads `.ts`, `.mts` and `.cts` files, which Node 24 loads. It now counts only an import written in code. The relay rule first flagged an import written inside a planted file's text in `run.test.mjs`, which is a string, not an import.
  - **The 364 tests left on their own runners** have a home: #163, at triage. Both `behaviour-lens` and `unstated-lens` asked for the boundary to be confirmed; it stays as the ticket's wording sets it, for the owner to confirm at done.
  - **T10 is on the shared branch.** `unstated-lens` saw only local refs; draft PR #150 shows T10's commits.
- **The pick: skipped on the owner's word.** The lead session relayed the owner's words: "we can skip that for tonight".
- **The owner's done.** In the morning the owner answered "done", relayed word for word by the lead session. With it, the owner accepted the runner boundary, with #163 as the follow-up, and the Linux by-name stand-in until #149. The pre-filled disposition answers stay unconfirmed.
- **The final runs (T10),** quiet, at a0e8fc0: `full` passed in 397.8 s beside 381.8 s, and the compare passed with 1,598 unchanged, 53 moved and 287 new (the fixes added 30), no map line added. On Linux, Node 20, 1,938 cases ran, the same total; only the four #149 cases failed, and all 10 Linux-listed cases passed.

## T6 (#157): one layer per test file

T6 changes tests only. A test file holds install cases or cases that never install, and the install harness fails a test that breaks the rule. See [ADR 0033](../adr/0033-one-layer-per-test-file.md).

- **The split came from a run, not from titles.** Before moving anything, the guard ran on the four mixed files and failed exactly the cases that never install. In every file that part was the larger: 254 cases against 55. So `settings`, `builder-page`, `agent-settings` and `cross-install` kept their names and now run in `fast`. The install cases went to `settings-install` (20), `builder-install` (3, not the spec's estimated four), `agent-settings-install` (27) and `cross-script-install` (5). S1 had estimated about 266 cases; the spec's example name `settings-seam` didn't apply.
- **Two strays beyond the four files.** The guard, run on the other five install files, failed two more: a text check of the settings overlay in `config-install`, moved to `settings`, and a project check run with its own environment in `install-project`, moved to a new `fast` file, `project-home`. Without the moves the guard fails the suite, so the build moved them, as the spec's rule requires, and flagged the wider scope on #157.
- **Moved byte for byte.** Each move was cut as a line range by a script. Every range appears unchanged in its new file: 36 `test()` calls, registering 57 cases. `moves.tsv` gains 57 lines, each a file-only move with its old file and name taken from `baseline.tsv`.
- **A file that never installs can't name the install script,** since the runner puts any test file whose text names it in the install tier. So four tests that read its text call `installScriptText()`, a new helper, and the settings rule lists, which name it, moved verbatim to a shared `settings-rules.mjs`. The dash test, which named `settings.test.mjs`, now also reads the two files the escapes moved to.
- **The guard is a root-level hook.** The harness zeroes a count before each test and fails a test whose count is still zero, naming it. `install()` counts, and so does `spawnInstall`, which refuses unless an argument names the install script; two `config-install` tests that start the script directly use it. A skip is exempt because Node keeps a skipped test's status over the hook's throw, on Node 20.20 and 24.14 alike. A wrapper on `t.skip()` was built first, and a mutation run showed it changed nothing, so it went.
- **Seen to fail.** `purity-guard.test.mjs` runs planted install-tier files against the real harness in a child: one that neither installs nor skips fails, naming the test; one that skips passes; `install()` and `spawnInstall` count, per test; and `spawnInstall` refuses a run that names no install script. Each of four broken guards failed at least one of them. All seven cases passed on Node 24 (Windows) and Node 20 (Linux).
- **No gate code changed.** No file in `gate/` outside its tests changed, and neither did the install script.
- **Move 4's runs,** quiet, at 6027f5c: `full` passed in 415.2 s beside 381.8 s, and the compare passed with 1,541 unchanged, 110 moved (T6 added 57) and 294 new (the guard's 7). `fast` took 52.7 s and 50.8 s, about 10 s over T10's tip, for the 254 cases it gained. That is under S6's 60 s line, so T8 (#158) isn't needed; its close is the owner's. On Linux, Node 20, 1,945 cases ran, the same total; only the four #149 cases failed, and all 10 Linux-listed cases passed by name.
- **Move 4's lenses found 9 things across five reports; `data-lens` found none.** Every one but the scope question was auto-taken. The fixes:
  - **The guard counts per top-level test.** `behaviour-lens` found that a subtest reset the count, so a parent that installed and then ran a subtest that only read the result failed with it. A subtest's installs now count toward its test, and a subtest isn't checked on its own. No install file uses subtests yet.
  - **`makeRepo` and `git` are pinned as non-installs.** `integrity-lens` found no test for that rule. A planted test that calls only them now fails. The guard's broken versions grew to eight, and each fails at least one guard case.
  - **What `changed` picks.** `unstated-lens` asked whether the install halves are still picked for the paths they read. Every tracked path's picks were compared before and after the split. `builder-install` had lost the builder page, which its cases read through `PAGE_REL`, and `cross-script-install` had lost `cross/render-check.mjs`; their headers now name both. Fourteen paths that only the non-install half reads no longer pick the install half. The harness comment had named the guard's test file, which put every install test in that file's pick; it no longer does.
  - **Records:** the re-time and the guard design are now on #140 too; a claim covers the in-place edits; and the full suite's time is set against the chain's spread (386.3 s to 446.1 s).
  - **Dismissed:** `adversarial-lens` asked whether an install test without `-ClaudeHome` could reach the real Claude folder, if PowerShell ignored the redirected home on Windows. Checked: pwsh's `$HOME` follows it, and the script's default is built from `$HOME`.
  - **For the owner:** `unstated-lens` noted that the two strays widen the ticket from four files to six. That is the owner's call at done.
- **The pick: skipped on the owner's word.** The lead session relayed the owner's words: "we can skip that for tonight". The owner's done waits for the morning.
- **The final runs (T6),** quiet, at 577d74d: `full` passed in 423.2 s beside 381.8 s, and the compare passed with 1,541 unchanged, 110 moved and 296 new (the fixes added 2). `fast` took 53.1 s. On Linux, Node 20, 1,947 cases ran, the same total; only the four #149 cases failed, all 10 Linux-listed cases passed, and so did all 9 guard cases.

## What was measured

- **The baseline.** Main at 76c46c1, quiet, junit reporter: 1,651 cases (1,643 pass, 8 skip, 0 fail) in 33 files, in 714 s at cap 4 on Node 24.14.1.
- **Move 4's full suite.** On commit 2a62ce0, quiet: exit 0 in 646 s, against the baseline's 714 s. 1,680 cases: the baseline's 1,651 with 0 gone and 0 status changes, the 2 smoke cases moved, and 29 new runner cases. The speed-up here is small and comes from no change to the install tests; #146 and #147 are where the full suite gets cheaper.
- **The final full suite,** after move 4's fixes, on a65b10b, quiet: exit 0 in 393 s, 1,693 cases. That is the baseline with 0 gone, 0 changed, 2 moved and 42 new. The swing from 646 s to 393 s is machine load, not the change.
- **The plants.** Thirteen plants each broke one rule in the runner, in four batches. Each made the test that guards the rule fail, and no other test, except one side effect the plant explains. See the Record.

- **The everyday timings (T2),** quiet, on 969e788, with `--base HEAD` so the sample was the only change:
  - **A test-only change:** 27 files in 48.1 s (49.5 s on the first run). That's under a minute.
  - **A one-agent-file change:** 36 files in 412.4 s, far over it.
- **The T2 plants.** Seventeen plants each broke one of the changed tier's rules, in five batches and a sixth for a corrected plant. Each made the test that guards the rule fail. The few extra failures each have a stated cause in the record.

- **The Linux container.** The rebuilt image ran `full` on Node 20.20.2 with no network. The runner's own cases all passed there, including the control-character file-name case that Windows can't plant. Four practice payload cases failed, because the practice scorer's payload rule needs `node:sqlite`, which Node 20 lacks. Main fails the same four in the same image, so they predate this work.

## What was found

- **Node 20 refuses a test-name filter in `NODE_OPTIONS`.** The first container run failed the inherited-filter case with exit 9 before the runner started. That case now skips on such a Node. A preload planted in `NODE_OPTIONS` covers inherited options on every Node, and it fails with the clearing removed.
- **Move 4's lenses found 14 things, and 12 changed the runner or its docs.** The fixes:
  - **Paths and names:** printed helper names are replaced, a record path is checked as a real path, and the host name is scrubbed. Git Bash, WSL and network-share paths count as leaks.
  - **A pass the runner didn't earn:** the entry check compares real paths, so a start through a link no longer exits 0 having run nothing.
  - **The runner's own process:** AGENTS.md gives its command in two forms that clear `NODE_OPTIONS`, since clearing it only for the child left the runner open to a preload.
  - **The floor and the docs:** the floor names the runner's two test files, and AGENTS.md says a pass needs the result line.
  - **New tests and plants:** each fix has a bad case, and eight plants were each seen to fail.
  - **The other two:** the re-time and the everyday timings already sit in #145, and the one-PR rollback note went on #140.
- **A lens report quoted local paths.** `behaviour-lens` named its scratch and working folders. The first post of the QA pair's section carried them. It was deleted within minutes and reposted with placeholders, following #140's rule that posted records carry repo-relative paths only.
- **A payload change through a shared helper picks nearly everything.** `helpers.mjs` reads every agent file to build its stages, and almost every test imports it. So a one-agent-file change names itself in 35 of the 36 test files, and costs about a full suite. Move 4 found the same for a `cross/` file. It also found that a fixture edit, or a deleted or renamed test, picks every install test, because `copy-list.mjs` names the tests folder. The rule is right about those tests: they do read the file. The spec expected "the smoke set and a few", and the planted cases do show that. The owner chose to design the test architecture first, in a revision on #140, so the finer split waits for that. #151 tracks it.
- **A test file can put itself in the install tier.** The runner's own tests plant files that name the install script, so those plants live in fixture text files, and the runner applies its literal rule to a test file's own source only. A guard checks that the runner's test files stay in `fast`.

## Record

Issue comments on mephistopheles4/the-pact#140:

- `6064072969` — the spec, revision 4.
- `6064376515` — the tickets.
- `6064677579` — the one-PR plan.
- `6064685906`, `6064686449`, `6064686799` — the T1 baseline case list.
- `6065051673` — the T1 Linux container run.
- `6066623650` — rollback and close-out with one PR.

Issue comments on mephistopheles4/the-pact#144:

- `6064783590` — the plants' method and expected results, posted before any run.
- `6064874466` — the plant results.
- `6064976269`, `6064998338` — plant batch E, for the preload case: expected result and result.
- `6065301262` — move 4's full suite against the baseline.
- `6066456063`, `6066440658`, `6066441035` — move 4's lens reports, through the cross script: the QA pair, `unstated-lens` and the security pair.
- `6066560954`, `6066611913` — the plants for move 4's fixes: expected results and results.
- `6066636782` — move 4's Lens dispositions.
- `6066872845` — the final full suite against the baseline.
- `6067327558` — the owner's pick, the walk-through and the owner's done.

Issue comments on mephistopheles4/the-pact#145:

- `6067466126` — the S6 re-time of `fast`.
- `6067514386` — the finding on a one-agent-file change's picks.
- `6067597237`, `6067693012` — the plants' method and expected results, and their results.
- `6067865517` — the everyday timings.
- `6068002568` — move 4's full suite against the baseline.
- `6068158139`, `6068158459`, `6068362424` — move 4's lens reports, through the cross script: the security pair, `unstated-lens` and the QA pair.
- `6068432584`, `6068477630` — the plants for move 4's fixes: expected results and results.
- `6068490816` — move 4's Lens dispositions.
- `6068606936` — the final full suite against the baseline.

Issue comments on mephistopheles4/the-pact#140, for T5:

- `6070317670` — the spec, revision 10.
- `6070496991` — the sign-off.
- `6070546842` — the tickets and their order.
- `6070977881` — render's rule ids no table row names.

Issue comments on mephistopheles4/the-pact#154:

- `6070748326` — the owner's answer on the Linux compare, and two corrections to the ticket.
- `6070909284` — the first compare run, before anything moved.
- `6071141424` — move 4's first attempt: the compare caught the table module's fault.
- `6071246566` — move 4's full suite against the baseline, and the Linux run.
- `6071389567`, `6071389828`, `6071461843`, `6071462024` — move 4's lens reports, through the cross script: the security pair, `unstated-lens`, the QA pair's refused first input, and the QA pair.
- `6071502100` — move 4's Lens dispositions, and the owner's pick.
- `6071742506` — the final full suite against the baseline, and the Linux run.
- `6071768886` — the owner's answers on the pre-filled dispositions and on #149 before T9.
- `6071784657` — `fast` re-timed.
- `6071825523` — the owner's done, the walk-through's outcome, and the hand-off to T9.

Issue comments on mephistopheles4/the-pact#140, for T9:

- `6072055445` — step 0's list of the tests that read the four modules, and its seen-to-fail probes.

Issue comments on mephistopheles4/the-pact#155:

- `6072380926` — move 4's full suite, `fast` and the compare, and the Linux run.
- `6072450803`, `6072451001`, `6072504284` — move 4's lens reports, through the cross script: the security pair, `unstated-lens` and the QA pair.
- `6072625851` — move 4's Lens dispositions, the owner's pick and its walk-through, the owner's done, the final runs, and the existing child-run cases per module.

Issue comments on mephistopheles4/the-pact#153:

- `6072517335` — the install script comments T9 left for the new installer.

Issue comments on mephistopheles4/the-pact#156:

- `6072709521` — the runner boundary, set before the build.
- `6073099176` — move 4's runs, the count of tests that changed how they run, and the child-run list with reasons.
- `6073199700`, `6073199866`, `6073199995` — move 4's lens reports, through the cross script: the security pair, `unstated-lens` and the QA pair.
- `6073354640` — move 4's Lens dispositions, the skipped pick, and the final runs.
- `6073372004` — a correction to the dispositions' counts and to the boundary row, and the hand-off.
- `6078522102` — the owner's done, the decisions recorded with it, and the Time column.

Issue comments on mephistopheles4/the-pact#140, for T10:

- `6073100439` — the count and the child-run list, pointing to #156.

Issue comments on mephistopheles4/the-pact#157:

- `6078339364` — move 4's runs, the split, the moved bodies, the in-place edits and the purity guard.
- `6078497494`, `6078497732`, `6078497978` — move 4's lens reports, through the cross script: the security pair, `unstated-lens` and the QA pair.
- `6078715355` — move 4's Lens dispositions, the skipped pick, the scope question for the owner, the fixes' evidence and the final runs.

Issue comments on mephistopheles4/the-pact#140, for T6:

- `6078339692` — `run.mjs fast --list` after the split.
- `6078715057` — the `fast` re-time and the guard design used.

Issue comments on mephistopheles4/the-pact#158:

- `6078339997` — `fast` under S6's line after T6.
