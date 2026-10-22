# The gate's tests run locally through athanor

athanor, the owner's local Docker test runner in its own repo, runs the gate's tests on Linux in a fresh, offline container, and holds every run on the machine to its shared slots (#361). The repo's `athanor.json` names the Linux run's image, `gate/tests/fixtures/linux/`, and two commands: `full` as the default and `fast`. Running the suite on the host stays the default way; athanor is an option.

## Decisions

- **`athanor.json`, not a `package.json` key.** The pact has no `package.json`, and adding one would make it look like an npm project to every tool that reads one. athanor reads `athanor.json` from its commit `4121c28` on, and the rule names that commit, since athanor's version, `0.1.0`, doesn't change with it.
- **One image.** athanor builds the Linux run's Dockerfile and replaces its `CMD`, so one pin serves both runs and the bundle run is unchanged.
- **`full` and `fast` only.** athanor tests the tracked working tree as one synthetic commit, which has no `main` for `changed` to diff against. It leaves untracked files out, so a new file needs `git add` before a run.
- **A local check, never Test evidence.** The run tests the working tree, not a commit, and no record file comes back from the container. Test evidence stays CI's two jobs on the reviewed head (ADR 0095), and nothing from an athanor run is posted.
- **4 CPUs, to match the runner's cap of four test files** (ADR 0029), with 4 GB of memory and a 10-minute limit. On the first runs, `full` took 52 seconds and `fast` 20, so the limit ends a hung run early, with room to spare.

## Not done

- No gate test of `athanor.json`: athanor refuses a configuration whose Dockerfile or command is wrong, with exit 125, before it runs anything.
