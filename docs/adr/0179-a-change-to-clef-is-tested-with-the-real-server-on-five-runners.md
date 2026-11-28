# A change to Clef is tested with the real server on five runners

For a change that [`clef-e2e.yml`](../../.github/workflows/clef-e2e.yml)'s `paths` cover (the `clef` tool, its cases, the script, the installer's modules and the workflow), Test evidence is CI's three jobs and also the five `clef-e2e` jobs on the reviewed head. The design is [spec 0005](../spec/0005-clef-everywhere.md#u7-the-end-to-end-run-amends-0002-s13), U7.

The owner asked for Clef to work on every machine. The gate suite runs a stub server and downloads nothing, so it can't show that a pinned build loads the model, answers, or ends with its supervisor.

## The decision

- **A script, not a gate test.** [`gate/tests/clef-e2e.mjs`](../../gate/tests/clef-e2e.mjs) installs the tool into a throwaway home, sets it up, asks the six cases and removes it. The runner never runs it, and its checks are gate-tested.
- **Five jobs on the CPU:** Linux x64, Linux x64 with `setpriv` moved aside, Linux arm64, Windows x64 and Windows arm64.
- **Filtered by path,** since each run downloads gigabytes.
- **Not required by the ruleset:** a required check skipped by its path filter stays pending, so the rule is `AGENTS.md`'s, held at Test.
- **Locked down** as `gate.yml` is, with a concurrency group of its own, held to an exact allow-list by a gate test.

## What it costs

- **A change outside the filter can break the run unseen** until the next change inside it, or a manual run. A new module the installer loads has to be added to the filter and to its allow-list by hand.
- **The run leans on outside hosts.** A fetch from GitHub or Hugging Face can fail; one re-run is allowed.
- **Vulkan and Metal are not run:** the runners have no GPU the pinned builds use, and macOS has the gate's smoke run only.

## Not taken

- **A run on every pull request:** it downloads gigabytes five times for changes that can't affect Clef.
- **A cache of the model:** the lockdown every workflow keeps refuses a cache, and the run is meant to prove the fetch too.
