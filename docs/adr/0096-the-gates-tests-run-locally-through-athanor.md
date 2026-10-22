# The gate's tests run locally through athanor

athanor, the owner's local Docker test runner in its own repo, runs the gate's tests in a fresh, offline Linux container on any Docker host, and holds athanor runs on the machine to its shared slots (#361). The repo's `athanor.json` names the Linux run's image, `gate/tests/fixtures/linux/`, and two commands: `test`, athanor's default name, which runs `full`, and `fast`. Running the suite on the host stays the default way; athanor is an option.

## Decisions

- **`athanor.json`, not a `package.json` key.** The pact has no `package.json`, and adding one would make it look like an npm project to every tool that reads one. athanor reads `athanor.json` from its commit `4121c28` on, and the rule names that commit, since athanor's version, `0.1.0`, doesn't change with it. An older copy asks for a `package.json`; the docs say to update athanor instead.
- **One image.** athanor builds the Linux run's Dockerfile and replaces its `CMD`, so one pin serves both runs and the bundle run is unchanged.
- **`full` and `fast` only.** athanor tests the tracked working tree as one synthetic commit, which is its own `main`, so `changed` would find no changed paths and run only `fast`. It leaves untracked files out, so a new file needs `git add` before a run.
- **What a run counts for** (the owner, in chat, 2026-10-22). An athanor `full` meets the local `full` after a rebase or merge that brought in other work and after a final change set, never before an install: the install runs on the host's system, and the container skips the Windows-only cases.
- **Never Test evidence.** The run tests the working tree, not a commit, and no record file comes back from the container. Test evidence stays CI's two jobs on the reviewed head (ADR 0095), and nothing from an athanor run is posted.
- **Not the container for outsiders' code.** athanor ships the working tree, not a clone checked against a PR's head commit, so it does not meet the tracker rule's one exception for running a PR's code; the docs say so (the owner, in chat, 2026-10-22).
- **4 CPUs, to match the runner's cap of four test files** (ADR 0029), with 4 GB of memory and a 10-minute limit. On the first runs, `full` took 52 seconds and `fast` 20, so the limit ends a hung run early, with room to spare.

## Not done

- No gate test of `athanor.json`: athanor refuses a configuration whose Dockerfile is missing or whose command is unknown, with exit 125, before it runs anything. A valid but wrong command, such as the tiers swapped, shows in the runner's first line, which names the tier.
