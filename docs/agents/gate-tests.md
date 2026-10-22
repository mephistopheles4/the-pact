# Running and writing the gate's tests

Read this before you pick a tier beyond what `AGENTS.md` gives, or write, change or cut a gate test.

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
      Of the install files, that's the smoke set and nine others, 10 of 16.
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
  pick and runs nothing. `--skips <file>`, for `full` only, fails a passing
  run unless it skipped exactly the tests the file lists, by test file and
  name, and prints each difference after a `skip not in the list: ` or
  `skip in the list but not seen: ` prefix; the text after the prefix is the
  list's line. The Windows
  CI job runs it with `gate/tests/windows-skips.txt`, so a new Windows skip is
  a reviewed change to that list. A line added for a test that guards the
  installer's link, path or file handling is input validation: the change
  matches the sensitive-work list, and the skip goes to the owner. A line out
  of the list's shape refuses the run by its line number.
- **A run passes only when it exits 0 and its last line is the runner's
  result line ending in `pass`.** An exit 0 with no result line is not a pass.
- **Run the tests on the current Node LTS** (Node 24, "Krypton", as of
  2026-10-08); `mise use -g node@24` gets it (ADR 0087). The install needs
  it too.
  The Linux run in a container (#96) is in
  [`gate/tests/fixtures/linux/`](../../gate/tests/fixtures/linux/) and runs `full`
  on Node 24.
- **While building, run `changed`:**
  `$env:NODE_OPTIONS = $null; node gate/tests/run.mjs changed` in PowerShell, or
  `env -u NODE_OPTIONS node gate/tests/run.mjs changed` in a POSIX shell. Add
  `--base <ref>` when your branch starts from somewhere other than `main`. A
  base that starts with a dash, or one that isn't a commit, exits 2.
- **The full suite runs** at Test, by CI's two jobs on the reviewed head; and
  locally before an install, after a rebase or merge that brought in other
  work, and after a final change set. It doesn't run before and after each
  change.
- **Test evidence is CI's two jobs passing on the reviewed head:** `gate` on
  Linux and `gate-windows` on Windows, each running `full` (ADR 0095). CI runs
  only on a pull request or a push to `main`, so the session pushes its branch
  and opens a draft PR before Test. The Test record cites both jobs' run links
  and names each run's commit as GitHub shows it, which must be the head it
  cites. No local `full` at Test is kept as evidence.
- **Before any push,** the session reads every commit the push publishes,
  from the merge base, for a secret's value, a personal detail, or this
  machine's home or temp path, user name or host name, as the review
  procedure reads a post. If it finds one, it keeps the branch local and tells
  the owner in chat.
- **When the push waits.** The session pushes without asking, on the
  owner's standing go-ahead, unless one of these holds:
  - the change is on the sensitive route, matches the sensitive-work list, or
    is flagged sensitive, so the security pair is due or offered at Test: the
    push waits for the owner's answer to the offer and, when the pair runs,
    for its read of the local commit, which comes before the push and the
    rest of Test;
  - the diff touches `.github/` or `gate/tests/workflow.test.mjs`: a pull
    request runs the branch's own copy of every workflow, the CodeQL one with
    its write token, as soon as it opens (R27), so the push waits for the
    security pair's read or the owner's word.

  A push that waits is squashed to one commit first, so the security pair's
  read of the diff covers every commit the push publishes. When the owner
  declines the offer, the push goes on that answer; a decline that reached
  the session only by relay frees it too, but stays open, as the pact says. A
  decline frees only the wait for the offer: a
  diff that touches `.github/` or the lockdown test still waits for the
  pair's read or the owner's word on the push itself.
- **The pushed commit is the one the pair read.** The pair's report names
  the commit it read, and the push publishes exactly that commit. A later
  push on a branch that waited, one that changes what the pair read, waits
  for the pair's follow-up read or the owner's word, as the first push did.
- **A cancelled run on `main`** is re-run before an install or a rollback
  reads its result. No run of the gate workflow cancels another on `main`,
  but a run of another workflow that named the same concurrency group could.
- **When `gate-windows` fails on code a change doesn't touch, or never
  reports** (a flaky test, an outage, a retired image label), the session
  re-runs it once at most, then stops and brings the owner the choice:
  re-run, move the image label in a spec change, or drop the required check
  (#348, spec S7).
- **A changed-files run is never Test evidence.**
- **Test output is posted only from record mode.** `--record <file>` writes a
  copy of everything printed to a file outside the repo, with the repo, home
  and temp folders, the user name and the host name replaced by placeholders.
  If a local path or either name survives, it writes nothing and exits 3. Keep
  raw reporter output, such as a junit file, outside the repo.
- **Read a `changed` record before you post it.** Its `pick:` and `unmapped:`
  lines name your changed and untracked files. If one of them shouldn't be
  shared, post a `fast` or `full` record instead.

## Athanor

[athanor](https://github.com/mephistopheles4/athanor), the owner's Docker
test runner, runs the suite in a fresh, offline Linux container on any
Docker host, Windows included (ADR 0096). A run waits for one of athanor's
machine-wide slots (2 by default) before it starts. The slots count athanor
runs only, never a host run of `gate/tests/run.mjs`.

- **Run it** from the repo root: `athanor run` runs the `test` command,
  athanor's default name, which is `full`; `athanor run fast` runs `fast`.
  The repo's [`athanor.json`](../../athanor.json) names the image and the
  commands.
- **It needs athanor at commit `4121c28` or later,** the first to read
  `athanor.json`. Its version, `0.1.0`, doesn't tell the builds apart. An
  older copy stops with exit 125 and asks for an `athanor` key in a
  `package.json`: leave that file out, and ask the owner to update athanor,
  since an install is the owner's.
- **It passes when athanor exits 0 and the runner's result line ends in
  `pass`.** athanor prints one line of its own after the runner's result
  line, so the result line is the last but one.
- **What it counts for.** An athanor `full` meets the local `full` after a
  rebase or merge that brought in other work, and after a final change set.
  Before an install, run `full` on the host: the install runs on the host's
  system, and athanor's run skips the Windows-only cases. Running on the host
  stays the default way.
- **The image is the Linux run's** in
  [`gate/tests/fixtures/linux/`](../../gate/tests/fixtures/linux/): Node 24
  pinned by digest, git, no PowerShell, and a user that isn't root. athanor
  replaces its `CMD`, so the Linux run's own way in, which clones a git
  bundle of one commit, is unchanged.
- **What it tests:** the tracked working tree, staged or not, as one
  synthetic commit, so a run can pass on uncommitted work. Only the Linux
  run's bundle tests a real commit.
- **A new file needs `git add` first** (or `athanor run --untracked`).
  athanor leaves untracked files out and says how many it left, so a new ADR
  or test file is missing from the run, and the docs-index tests fail on it.
- **No `changed` tier:** the snapshot is its own `main`, so `changed` finds
  no changed paths and runs only `fast`, a pass that tests nothing of the
  change.
- **Never Test evidence.** Nothing comes back but the output and the exit
  code: no record file. So a run is never Test evidence, which stays CI's two
  jobs, and nothing from it is posted.
- **Not the container for outsiders' code.** athanor ships the working tree,
  not a clone checked against a PR's head commit, so it is not the container
  [the one exception](issue-tracker.md#whose-text-counts) for running a PR's
  code calls for. All five of that exception's conditions still hold.
- **Limits:** 4 CPUs, to match the runner's cap of four test files, 4 GB of
  memory and 10 minutes. `full` took under a minute on 2026-10-22. A run past
  the limit ends with 137 (memory) or 124 (time).

## Writing a gate test

- **A bad case for a gate module is a row.** A set of rows has a base input
  that passes; a row is one plant on the base and the exact rule ids it must
  fail with, written as `{ id, plant, fails, says?, why }` and nothing else:
  at least one rule id in `fails`, a `why` for the reader, and its id as a
  string literal, so a search for a failing test's name finds its row. Run the
  rows with a plain loop over node's `test()`, with one test of the base
  before them and one after, every test's name starting with the set's name:

  ```js
  {
    const base = () => ({ 'pact/config.json': '{"schema": 1}' });
    const run = (tree, t) => moduleResult(/* the module's exit code and output */);
    const rows = [{ id: 'unknown-mark', plant: tree => ({ ...tree, 'pact/config.json': '...' }), fails: ['edit-mark'], why: 'a mark the source lacks' }];
    test('<name>: base passes', async t => assertPasses(await run(base(), t)));
    for (const r of rows) test(`<name>: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
    test('<name>: base passes after the rows', async t => assertPasses(await run(base(), t)));
  }
  ```

  `assertPasses`, `assertFails` and `moduleResult` are in `text.mjs`.
  `run` returns `{ code, fails, last, out }`, which `moduleResult` builds
  from an exit code and the output. `base()` builds a new input on every
  call, since nothing copies it before a plant. For an assertion every row
  shares, such as "a refusal writes no file", define `everyRow(res, t)` in
  the block and await it after `assertFails`. The base passing, and each row
  differing from it only by its plant, proves a row fails because of its
  plant; the base after the rows catches a row that leaked state into the
  process. Keep the loop at the file's top level, never in a branch or a
  function, where it may run nothing; the bare `{ }` block only gives each
  set of rows its own `base`, `run` and `rows`. No guard checks the loop
  or the row shape since #272: the review reads each new loop and row.
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
  apply to a test a change adds or edits; they are not a sweep of
  the tests already there. Each such test names one of:
  - a claim of the issue it was built for, as `#<issue> C<n>`;
  - an invariant already written down: a gate rule id (a row's rule ids
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
  everything in silence. The rule in ["What every change here needs"](changing-rules.md#what-every-change-here-needs), that
  each check a change adds or tightens needs a bad case it is seen to catch,
  stands unchanged.
- **Minus-one.** A test whose caught broken versions another test already
  catches, on the same function and the same class of input, is a cut
  candidate. Cut one only in a file the change is already editing. List each
  cut, with the test that covers it, in an issue comment and in the PR body,
  and hand that list to `integrity-lens` at Test with the tests it cites. It
  probes each cover and notes the cut as covered, or reports that the cover
  does not catch. The repo has no mutation tool, so this is judged by
  reading.
- **Size the suite to review cost.** Every test is something the owner has to
  trust and maintain. The PR body carries one line, `Tests: +<added> −<cut>`,
  counting each `test(...)` that runs, as its second line, straight
  after the close-out checkbox line. A change adds no test beyond what its
  claims and the invariants it names need.
- **What is never a cut candidate.** The two bullets on silent failures and
  on minus-one never reach these:
  - the last bad case for a gate check;
  - an install case: ADR 0047 and "Cutting an install case" govern those cuts;
  - a test that guards the settings guard;
  - any test in `gate/tests/cloud-sessions.test.mjs`, which guards a
    published script that runs as root.

  When it is unclear whether a test falls under this list, it does. A cut
  finding from `integrity-lens` on a test in this list is dismissed, naming
  this list as the reason.
