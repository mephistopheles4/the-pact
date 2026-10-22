# The gate's tests run locally through athanor

**2026-10-22.** The owner asked whether the pact tests with athanor, their local Docker test runner, and said AGENTS.md should name it. It didn't: the repo had no athanor configuration. Tier: standard.

## What was built (#361)

- **`athanor.json`** at the root: the Linux run's image in `gate/tests/fixtures/linux/`, `full` as the default command and `fast` beside it, with 4 CPUs, 4 GB and 10 minutes.
- **The Dockerfile's header** says athanor runs the image too, and that only the bundle run tests a real commit. Comments only.
- **AGENTS.md** gains one bullet under "Running the gate's tests": the command, the minimum athanor commit, and that a run is a local check, never Test evidence, with nothing posted.
- **`docs/agents/gate-tests.md`** gains an Athanor section; `docs/reference.md` lists `athanor.json`.

## The test drive

- athanor at `4121c28`, built from its repo into a folder of its own, since the installed copy predates `athanor.json` and another session's run was using it.
- The first `fast` run failed the two docs-index tests: the new ADR was untracked, so athanor left it out. With it staged, `fast` passed (45 files, 20 seconds) and `full` passed (61 files, 52 seconds, 6 skips, all Windows-only). The limits were set from those runs, and the gate-tests doc names the `git add` step.

## Test

The QA pair, the standards pair and `unstated-lens` read head `6446f82`. Nothing was high. The fixes, all to the docs:
- The reason for no `changed` tier was wrong: the snapshot is its own `main`, so `changed` runs only `fast`.
- The docs now say:
  - how to tell the athanor is too old: its error asks for a `package.json`;
  - how to judge a pass, when the runner's result line is the last but one;
  - what the slots count;
  - that `test` is athanor's default command name.
- The README's prerequisites name athanor.
- Two decisions were the owner's, in chat:
  - An athanor `full` meets the local `full` after a rebase or merge and after a final change set, never before an install.
  - The docs say athanor is not the container for running outsiders' code.

## Decisions

- ADR 0096: `athanor.json` over a `package.json` key, one image, no `changed` tier, what a run counts for, and never Test evidence.

## Record

- [#361](https://github.com/mephistopheles4/the-pact/issues/361): the spec, revision 1.
- [The Test review](https://github.com/mephistopheles4/the-pact/issues/361#issuecomment-6334524923): five lenses on `6446f82`, crossed, with the Lens dispositions table.
