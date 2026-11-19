# Running and writing the gate's tests

Read this before you pick a tier beyond what `AGENTS.md` gives, or write, change or cut a gate test. `AGENTS.md`'s "Running the gate's tests" gives the commands, the athanor default and what counts as a pass; this adds the rest.

## Running the gate's tests

- **`changed` adds what your change can reach** to `fast`, and prints why it
  picked each file. Some changes still cost about a full suite, such as an
  edit to `claude/CLAUDE.md` or a fixture: check the pick with `--list`
  first, and run it once rather than after every edit.
- **Run only through the runner,** never a bare `node --test`: the runner caps
  the run at four test files at once, so it doesn't starve other sessions.
- **A new Windows skip is a reviewed line** in `gate/tests/windows-skips.txt`.
  A line for a test that guards the installer's link, path or file handling
  is input validation: the change matches the sensitive-work list, and the
  skip goes to the owner.
- **When `gate-windows` fails on code a change doesn't touch, or never
  reports,** re-run it once at most, then bring the owner the choice.
- **A `changed` record's `pick:` and `unmapped:` lines** name your changed and
  untracked files: if one of them shouldn't be shared, post a `fast` or
  `full` record instead.

## Athanor

[athanor](https://github.com/mephistopheles4/athanor), the owner's Docker
test runner, runs the suite in a fresh, offline Linux container. The repo's
[`athanor.json`](../../athanor.json) names the image and the commands.

- **athanor tests the tracked working tree,** staged or not, so a run can pass
  on uncommitted work. Stage a new file with `git add` first, or it is left
  out of the run.
- **Not the container for outsiders' code.** athanor ships the working tree,
  not a clone checked against a PR's head commit, so it is not the container
  [the one exception](issue-tracker.md#whose-text-counts) for running a PR's
  code calls for. All five of that exception's conditions still hold.

## Writing a gate test

- **A bad case for a gate module is a row** on a base input that passes,
  naming the exact rule ids it must fail with. Run the rows in a loop at the
  file's top level, with a test of the base before them and one after.
- **How a case runs the module.** In-process, through its core: call
  `runCore` from [`gate/tests/gate-run.mjs`](../../gate/tests/gate-run.mjs).
  A test file or helper never imports a fixture under `gate/tests/fixtures/`;
  hand a fixture to a child as its `--import` or main script.
- **A case runs the install** only when the install script itself decides it,
  or for a happy path.
- **Each test file holds one layer:** install cases, or cases that never
  install.
- **Import helpers by what they touch.** A test that imports `payload.mjs` is
  picked for every agent-file change, so import it only to read the payload.
- **Cutting an install case.** Cut an end-to-end install case only when an
  in-process row already checks its decision, and name that row on the issue.
  Keep at least one end-to-end case that drives each of the
  install runner's checks (in `gate/install-run.mjs`) to refuse. Never cut a
  case that checks a refused install wrote nothing.
- **A test names what it backs:** an issue's claim as `#<issue> C<n>`, a gate
  rule id, an ADR by number, a threat-model class, or a section heading of
  this repo's rules, in a comment above the `test(...)` call. A backing
  comment never writes a file path or a script name, since the runner reads
  comments when it picks.
- **Test what fails silently.** A path that already fails loudly needs no test
  of its own; a gate check's bad case always does.
- **Minus-one.** Cut a test that another test already covers, on the same
  function and class of input, only in a file the change already edits; list
  each cut with its cover for `integrity-lens` at Test.
- **Size the suite to review cost.** The PR body's `Tests: +<added> −<cut>`
  line counts each `test(...)` that runs. A change adds no test beyond what its
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
