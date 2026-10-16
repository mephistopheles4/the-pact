# Running and writing the gate's tests

Read this before you pick a tier beyond the loaded file's, or write, change or cut a gate test.

## Running the gate's tests

- **One runner, three tiers.** Run the gate's tests through
  [`gate/tests/run.mjs`](../../gate/tests/run.mjs), from the repo root, with
  `NODE_OPTIONS` cleared in the shell first, as for the install script. In
  PowerShell:
  `$env:NODE_OPTIONS = $null; node gate/tests/run.mjs <tier>`
  In a POSIX shell:
  `env -u NODE_OPTIONS node gate/tests/run.mjs <tier>`
  - **`full`** runs every top-level test file. This is "the full suite".
  - **`fast`** runs every test file that doesn't run the install script. The
    runner finds the install tier from each file's imports on every run.
  - **`changed`** runs `fast` plus the tests your change can reach, and
    prints why it picked each file. It's the only tier that reads git.
    - **The changed paths:** what differs from where your branch left
      `--base` (default: the branch `main`), committed, staged or not, plus
      untracked files git doesn't ignore.
    - **What they pick:** a changed test runs itself, and a changed helper
      runs every test that imports it. A test that names a changed path runs
      too. A payload path also runs the install smoke file. Any change to the
      gate's code runs `full`, and so do more than 2,000 changed paths.
    - **A path no rule maps** is printed as unmapped. `fast` covers it, plus
      the install smoke file for a payload path.
    - **What an agent-file change picks.** The test helpers are split by
      what they touch (ADR 0034), so an agent file picks only the tests that
      read agents: those that import `payload.mjs` or read them themselves.
      Of the install files, that's the smoke set and eight others, 9 of 15.
    - **Some changes still cost about a full suite.** The pact's rules file,
      `claude/CLAUDE.md`, is read by nearly every test. A fixture edit, or a
      deleted or renamed test file, is named by the copy list's entry for the
      tests folder, so every install test runs. So is an edit to
      `gate/tests/run.mjs`, which a comment in the copy list names. For such
      a change, check the pick with `--list` first, and run it once rather
      than after every edit.

  All three cap the run at four test files at once, which keeps it from
  starving other sessions (ADR 0029). Never run the suite without the cap.
- **It fails closed.** It hands the Node running it an explicit file list, so
  it needs no glob and works the same in any shell, on Node 24 or later, the
  floor below. An empty pick, an odd test-file name or a usage error
  exits 2 and runs nothing. A failed, killed or unstarted node exits 1. Its
  last line, on stderr, names the tier, the file count and the result.
  `--reporter` takes `spec`, `tap`, `dot` or `junit`, and `--list` prints the
  pick and runs nothing.
- **A run passes only when it exits 0 and its last line is the runner's
  result line ending in `pass`.** An exit 0 with no result line is not a pass.
- **Run the tests on the current Node LTS** (Node 24, "Krypton", as of
  2026-10-08); `volta install node@24` gets it. The install needs it too.
  The Linux run in a container (#96) is in
  [`gate/tests/fixtures/linux/`](../../gate/tests/fixtures/linux/) and runs `full`
  on Node 24.
- **While building, run `changed`:**
  `$env:NODE_OPTIONS = $null; node gate/tests/run.mjs changed` in PowerShell, or
  `env -u NODE_OPTIONS node gate/tests/run.mjs changed` in a POSIX shell. Add
  `--base <ref>` when your branch starts from somewhere other than `main`. A
  base that starts with a dash, or one that isn't a commit, exits 2.
- **The full suite runs** at Test; before an install; after a rebase or
  merge that brought in other work; and after a final change set. It doesn't
  run before and after each change.
- **A changed-files run is never Test evidence.** The Test verdict rests on
  `full`.
- **Test output is posted only from record mode.** `--record <file>` writes a
  copy of everything printed to a file outside the repo, with the repo, home
  and temp folders, the user name and the host name replaced by placeholders.
  If a local path or either name survives, it writes nothing and exits 3. Keep
  raw reporter output, such as a junit file, outside the repo.
- **Read a `changed` record before you post it.** Its `pick:` and `unmapped:`
  lines name your changed and untracked files. If one of them shouldn't be
  shared, post a `fast` or `full` record instead.

## Writing a gate test

- **A bad case for a gate module is a row in its table.** A table, from
  [`gate/tests/tables.mjs`](../../gate/tests/tables.mjs), has a base input that
  passes and rows; a row is one plant on the base and the exact rule ids it
  must fail with. Write the table's name and each row's id as string literals
  in the `table(...)` call, and register its tests in the test file itself,
  at its top level:
  `for (const c of table('<name>', { ... })) test(c.name, c.fn);`. node's
  reports name the file that calls `test()`, and a guard checks the loop. The
  first tables are `render-edits`' edit list and block paths. A file already
  in `fast` converts its loops when a session next changes its cases for
  another reason.
- **How a case runs the module.** In-process, through its core: call
  `runCore` from [`gate/tests/gate-run.mjs`](../../gate/tests/gate-run.mjs), or
  `renderStage` and `runSeamA`, which use it. Keep a case a child run when it
  varies the environment, plants a copy of the module, or runs under a test
  preload. A test file or helper never imports a fault fixture, the contained
  driver, the import trap, or any other code under `gate/tests/fixtures/`;
  hand a fixture to a child as its `--import` or main script.
- **A case runs the install** only when the install script itself decides it,
  or for a happy path.
- **Each test file holds one layer:** install cases, or cases that never
  install. The install harness fails a test in an install-tier file that
  neither runs the install script nor calls `t.skip()`, naming it (ADR 0033).
  A subtest's installs count toward the test it runs in.
  A test that runs the script without `install()` goes through the harness's
  `spawnNodeInstall`, so it counts. A test that only reads the script's code
  belongs in a file that never installs, and imports `install-core.mjs` or
  reads the file.
- **Import helpers by what they touch** (ADR 0034), and take only what the
  test uses. `text.mjs` touches nothing; `tree.mjs` touches the files a test
  names; `gate-files.mjs` reads the gate's own files; `payload.mjs` reads the
  payload, agents included; `gate-run.mjs` runs gate modules; and
  `install-harness.mjs` runs the install. A test that imports `payload.mjs`
  is picked for every agent-file change, so import it only to read the
  payload. A helper touches no file and starts no process when imported; the
  import guard checks every helper.
- **Cutting an install case.** Cut an end-to-end install case only when an
  in-process row already checks its decision, and name that row on the issue
  (ADR 0047). Keep at least one end-to-end case that drives each of the
  install runner's checks (in `gate/install-run.mjs`) to refuse. Never cut a
  case that checks a refused install wrote nothing.
- **A test names what it backs.** The rules in this bullet and the three below
  apply to a test or table row a change adds or edits; they are not a sweep of
  the tests already there. Each such test names one of:
  - a claim of the issue it was built for, as `#<issue> C<n>`;
  - an invariant already written down: a gate rule id (a table row's rule ids
    count), an ADR by number (`ADR 0047`), a threat-model risk (`R21`), or a
    rule of this repo by its section heading (`Writing a gate test`), whether
    the heading sits in `AGENTS.md` or in a doc under `docs/agents/`.

  Put the name in a comment on the line above the `test(...)` call, or once in
  the file header when every test in the file backs the same thing. A test
  that names nothing gets a one-line stated reason, or it is cut before Test.
  A backing comment never writes a file path or a script name. The test runner
  matches a changed path against each test file's text, comments included,
  so a path in a comment changes what runs. Quick work has no numbered claims
  while its tests are written first: such a test names the done-criterion in
  words, and the comment is not updated when Test numbers the claims.
- **Test what fails silently.** Outside the gate's checks, a path that already
  fails loudly, with an error the owner sees and can recover from, needs no
  test of its own. A gate check's bad case is not covered by this: a refusal
  test catches the check itself vanishing, and a vanished check passes
  everything in silence. The rule in "What every change here needs", that
  each check a change adds or tightens needs a bad case it is seen to catch,
  stands unchanged.
- **Minus-one.** A test whose assertions another test already makes, on the
  same function and the same class of input, is a cut candidate. Cut one only
  in a file the change is already editing. List each cut, with the test that
  covers it, in an issue comment and in the PR body, and hand that list to
  `integrity-lens` at Test with the tests it cites. The repo has no mutation
  tool, so this is judged by reading.
- **Size the suite to review cost.** Every test is something the owner has to
  trust and maintain. The PR body carries one line, `Tests: +<added> −<cut>`,
  counting `test(...)` calls and table rows, as its second line, straight
  after the close-out checkbox line. A change adds no test beyond what its
  claims and the invariants it names need.
- **What is never a cut candidate.** The two bullets on silent failures and
  on minus-one never reach these:
  - the last bad case for a gate check;
  - an install case: ADR 0047 and "Cutting an install case" govern those cuts;
  - a test that guards the settings guard;
  - any test in `gate/tests/cloud-sessions.test.mjs`, which guards a
    published script that runs as root.

  When it is unclear whether a test falls under this list, it does.
